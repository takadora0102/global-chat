/**
 * index.js – Global Chat Bot
 *  (2025-06-XX “地域→言語選択で Default Language” 実装版)
 *
 * ＜変更ポイント＞  
 *  ・/setup の settings チャンネル内で、
 *    “Default Language” の部分を「2段階で選ぶ（地域→言語）」UI に変更  
 *  ・InteractionCreate 内に、customId=`setting_region` → `setting_lang` の処理を追加  
 *  ・Region/Language の定義は /help と同じく REGIONS / REGION_LANGS を利用
 */

import 'dotenv/config';
import {
  Client,
  IntentsBitField,
  Events,
  PermissionFlagsBits,
  OverwriteType,
  ChannelType,
  MessageFlags,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} from 'discord.js';
import express from 'express';
import bodyParser from 'body-parser';
import { randomUUID } from 'crypto';
import { Redis } from '@upstash/redis';
import { FLAG_TO_LANG } from './constants.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* ────────── 0. env check ────────── */
for (const k of [
  'DISCORD_TOKEN',
  'HUB_ENDPOINT',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'SUPPORT_SERVER_URL',
  'NEWS_SOURCE'
]) {
  if (!process.env[k]) {
    console.error(`❌ Missing env: ${k}`);
    process.exit(1);
  }
}
const NEWS_SOURCE = process.env.NEWS_SOURCE;

/* ────────── 1. Redis & Client ────────── */
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN
});
const client = new Client({
  intents: [
    IntentsBitField.Flags.Guilds,
    IntentsBitField.Flags.GuildMessages,
    IntentsBitField.Flags.MessageContent,
    IntentsBitField.Flags.GuildMessageReactions
  ]
});

/* ────────── 2. helpers ────────── */
const kMsg = (u) => `msg_cnt:${u}`;
const kLike = (u) => `like_cnt:${u}`;

/* Google translate (unauth) */
async function translate(text, lang) {
  const url =
    'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&dt=t&tl=' +
    lang +
    '&q=' +
    encodeURIComponent(text);
  const r = await fetch(url);
  if (!r.ok) throw new Error('translate api fail');
  const j = await r.json();
  return j[0].map((v) => v[0]).join('');
}

/* embed builder */
function buildRelayEmbed({ userTag, originGuild, tz, userAvatar, content, userId, auto, reply }) {
  const eb = new EmbedBuilder()
    .setAuthor({ name: `${userTag} [${originGuild} UTC${tz}]`, iconURL: userAvatar })
    .setFooter({ text: `UID:${userId} 🌐 global chat${auto ? ' • auto-translated' : ''}` })
    .setTimestamp(Date.now());

  if (reply) eb.addFields({ name: '↪️ reply to', value: reply.slice(0, 256) });
  if (content) eb.setDescription(content);
  return eb;
}

/* duplicate guard */
async function alreadySent(globalKey) {
  const key = `dup:${globalKey}`;
  if (await redis.get(key)) return true;
  await redis.set(key, '1', { ex: 60 });
  return false;
}

/* ────────── 3. /setup ────────── */
async function handleSetup(interaction) {
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.editReply('❌ Need Administrator permission.');
    }

    /* 3-1) 「Global Chat」カテゴリ */
    const category = await interaction.guild.channels.create({
      name: 'Global Chat',
      type: ChannelType.GuildCategory
    });

    /* 3-2) bot-announcements (TEXT) */
    const botAnnouncements = await interaction.guild.channels.create({
      name: 'bot-announcements',
      type: ChannelType.GuildText,
      parent: category.id,
      permissionOverwrites: [
        { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.SendMessages], type: OverwriteType.Role }
      ]
    });

    /* 3-3) サポートサーバー Announcement をフォロー */
    try {
      const src = await client.channels.fetch(NEWS_SOURCE);
      if (src?.type === ChannelType.GuildAnnouncement && src.addFollower) {
        await src.addFollower(botAnnouncements.id, 'auto-follow');
      }
    } catch (e) { console.error('follow failed:', e); }

    /* 3-4) global-chat (TEXT) */
    const globalChat = await interaction.guild.channels.create({
      name: 'global-chat',
      type: ChannelType.GuildText,
      parent: category.id
    });

    /* 3-5) settings (管理者のみ閲覧) */
    const settings = await interaction.guild.channels.create({
      name: 'settings',
      type: ChannelType.GuildText,
      parent: category.id,
      permissionOverwrites: [
        { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel], type: OverwriteType.Role }
      ]
    });

    /* 3-6) Redis 登録 & HUB 通知 */
    await redis.sadd('global:channels', globalChat.id);
    fetch(process.env.HUB_ENDPOINT + '/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ guildId: interaction.guild.id, channelId: globalChat.id })
    }).catch(() => {});

    /* ────────── Settings に送る UI メッセージ ────────── */

    // (A) 地域選択用リスト
    const REGIONS = [
      { label: 'Asia',          value: 'asia',          emoji: '🌏' },
      { label: 'Europe',        value: 'europe',        emoji: '🌍' },
      { label: 'North America', value: 'north_america', emoji: '🌎' },
      { label: 'South America', value: 'south_america', emoji: '🌎' },
      { label: 'Middle East & Africa', value: 'mea',    emoji: '🌍' },
      { label: 'Oceania',       value: 'oceania',       emoji: '🌏' }
    ];

    // (B) 各地域ごとに対応する言語コードの配列
    const REGION_LANGS = {
      asia:         ['en', 'ja', 'zh', 'zh-TW', 'ko', 'vi'],
      europe:       ['en', 'es', 'fr', 'de', 'ru', 'uk', 'el'],
      north_america:['en', 'es', 'fr'],
      south_america:['es', 'pt-BR'],
      mea:          ['ar', 'fa', 'he', 'tr', 'ur'],
      oceania:      ['en', 'en-AU', 'en-NZ']
    };

    // (C) タイムゾーン選択用リスト
    const tzOpts = [];
    for (let o = -11; o <= 13; o++) tzOpts.push({ label: `UTC${o >= 0 ? '+' + o : o}`, value: String(o) });

    // (D) UI の行をそれぞれ作成
    // 地域選択メニュー（後から言語選択に置き換える）
    const rowRegion = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('setting_region')
        .setPlaceholder('Select your region')
        .addOptions(REGIONS.map(r => ({
          label: r.label,
          value: r.value,
          emoji: r.emoji
        })))
    );

    // タイムゾーン選択メニュー
    const rowTZ = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('set_timezone')
        .setPlaceholder('Select timezone')
        .addOptions(tzOpts)
    );

    // Auto-Translate ON/OFF ボタン
    const rowAuto = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('autotrans_on').setLabel('Auto ON').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('autotrans_off').setLabel('OFF').setStyle(ButtonStyle.Danger)
    );

    // Detect TZ ボタン & Support サーバーリンク
    const rowMisc = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('detect_timezone').setLabel('Detect TZ').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setURL(process.env.SUPPORT_SERVER_URL).setLabel('Support').setStyle(ButtonStyle.Link)
    );

    // settings チャンネルへ初回メッセージを送信
    await settings.send({
      content:
        '**Global Chat Settings**\n\n' +
        '1️⃣ Default Language (Select Region ▶ Language)\n' +
        '2️⃣ Timezone\n' +
        '3️⃣ Auto-Translate ON / OFF\n' +
        '4️⃣ Detect Timezone\n',
      components: [rowRegion, rowTZ, rowAuto, rowMisc]
    });

    /* 3-7) 完了メッセージを編集 */
    await interaction.editReply('✅ Setup completed!');
  } catch (e) {
    console.error('setup error:', e);
    if (interaction.deferred) await interaction.editReply('❌ Setup failed. Check permissions & ENV.');
  }
}

/* ────────── 4. /profile ────────── */
async function handleProfile(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const m = await redis.get(kMsg(interaction.user.id)) || '0';
  const l = await redis.get(kLike(interaction.user.id)) || '0';
  await interaction.editReply(`📊 **${interaction.user.tag}**\n• Messages: ${m}\n• 👍: ${l}`);
}

/* ────────── 5. /ranking ────────── */
async function handleRanking(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const sub = interaction.options.getSubcommand();
  const pattern = sub === 'messages' ? 'msg_cnt:*' : 'like_cnt:*';
  const list = [];
  for (const key of await redis.keys(pattern)) {
    const id = key.split(':')[1];
    list.push({ id, v: Number(await redis.get(key) || 0) });
  }
  list.sort((a, b) => b.v - a.v).splice(10);
  const lines = await Promise.all(
    list.map(async (u, i) => {
      try { const user = await client.users.fetch(u.id); return `#${i + 1} – ${user.tag} (${u.v})`; }
      catch { return `#${i + 1} – (unknown) (${u.v})`; }
    })
  );
  await interaction.editReply(`🏆 Top 10 by ${sub}\n\n${lines.join('\n') || 'No data'}`);
}

/* ────────── 6. Help UI (region→language) ────────── */
const HELP_REGIONS = [
  { label: 'Asia',          value: 'asia',          emoji: '🌏' },
  { label: 'Europe',        value: 'europe',        emoji: '🌍' },
  { label: 'North America', value: 'north_america', emoji: '🌎' },
  { label: 'South America', value: 'south_america', emoji: '🌎' },
  { label: 'Middle East & Africa', value: 'mea',   emoji: '🌍' },
  { label: 'Oceania',       value: 'oceania',       emoji: '🌏' }
];
const HELP_REGION_LANGS = {
  asia:         ['en','ja','zh','zh-TW','ko','vi'],
  europe:       ['en','es','fr','de','ru','uk','el'],
  north_america:['en','es','fr'],
  south_america:['es','pt-BR'],
  mea:          ['ar','fa','he','tr','ur'],
  oceania:      ['en','en-AU','en-NZ']
};

/* ────────── 7. InteractionCreate ────────── */
client.on(Events.InteractionCreate, async (i) => {
  // --- コマンド系 ---
  if (i.isChatInputCommand()) {
    if (i.commandName === 'setup')   return handleSetup(i);
    if (i.commandName === 'profile') return handleProfile(i);
    if (i.commandName === 'ranking') return handleRanking(i);
    if (i.commandName === 'help') {
      // /help 実行時：地域選択メニューを返す
      return i.reply({
        content: '🔎 Select your region:',
        components: [
          new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId('help_region')
              .setPlaceholder('Pick region')
              .addOptions(
                HELP_REGIONS.map(r => ({ label: r.label, value: r.value, emoji: r.emoji }))
              )
          )
        ],
        flags: MessageFlags.Ephemeral
      });
    }
  }

  // --- /help の 地域選択 → 言語選択 フロー ---
  if (i.isStringSelectMenu() && i.customId === 'help_region') {
    const chosenRegion = i.values[0]; // 'asia' など
    const langs = HELP_REGION_LANGS[chosenRegion] || ['en'];
    return i.update({
      content: '📖 Select a language:',
      components: [
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('help_lang')
            .setPlaceholder('Pick language')
            .addOptions(
              langs.map(code => ({ label: code, value: code }))
            )
        )
      ]
    });
  }
  if (i.isStringSelectMenu() && i.customId === 'help_lang') {
    const chosenLang = i.values[0];
    // commands/help.js から対応テキストを取り込む
    const __dir = path.dirname(fileURLToPath(import.meta.url));
    const { HELP_TEXTS } = await import(path.join(__dir, 'commands', 'help.js'));
    const text = HELP_TEXTS[chosenLang] || HELP_TEXTS.en;
    const chunks = text.match(/[\s\S]{1,2000}/g) || [text];

    await i.update({ content: chunks[0], components: [] });
    for (let idx = 1; idx < chunks.length; idx++) {
      await i.followUp({ content: chunks[idx], flags: MessageFlags.Ephemeral });
    }
    return;
  }

  // --- settings チャンネルの Default Language: 地域→言語 フロー ---
  if (i.isStringSelectMenu() && i.customId === 'setting_region') {
    // ユーザーが地域を選択
    const chosenRegion = i.values[0];
    // 先ほどと同じ REGION_LANGS をそのまま流用（A～C で定義済み）
    const REGION_LANGS = {
      asia:         ['en','ja','zh','zh-TW','ko','vi'],
      europe:       ['en','es','fr','de','ru','uk','el'],
      north_america:['en','es','fr'],
      south_america:['es','pt-BR'],
      mea:          ['ar','fa','he','tr','ur'],
      oceania:      ['en','en-AU','en-NZ']
    };
    const langs = REGION_LANGS[chosenRegion] || ['en'];

    // 「設定用言語選択UI」を返す
    return i.update({
      content: '📑 Default Language: Select your language',
      components: [
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('setting_lang')
            .setPlaceholder('Pick language')
            .addOptions(
              langs.map(code => ({ label: code, value: code }))
            )
        )
      ]
    });
  }

  if (i.isStringSelectMenu() && i.customId === 'setting_lang') {
    // 地域→言語で最終的にユーザーが選んだ言語コードを i.values[0] で受け取る
    const chosenLang = i.values[0];
    // Redis に { lang: chosenLang, auto: 'true' } をセット
    await redis.hset(`lang:${i.guildId}`, { lang: chosenLang, auto: 'true' });
    return i.reply({ content: `✅ Default Language set to **${chosenLang}** (Auto ON).`, flags: MessageFlags.Ephemeral });
  }

  // --- (既存) settings の他の UI 処理（timezone, auto, detect） ---
  if (i.isStringSelectMenu() && i.customId === 'set_timezone') {
    const tzValue = i.values[0];
    await redis.hset(`tz:${i.guildId}`, { tz: tzValue });
    const sign = tzValue >= 0 ? '+' : '';
    return i.reply({ content: `✅ Timezone set to UTC${sign}${tzValue}`, flags: MessageFlags.Ephemeral });
  }
  if (i.isButton() && ['autotrans_on', 'autotrans_off'].includes(i.customId)) {
    const val = i.customId === 'autotrans_on' ? 'true' : 'false';
    await redis.hset(`lang:${i.guildId}`, { auto: val });
    return i.reply({ content: `🔄 Auto-Translate is now **${val === 'true' ? 'ON' : 'OFF'}**.`, flags: MessageFlags.Ephemeral });
  }
  if (i.isButton() && i.customId === 'detect_timezone') {
    // デモとして UTC+0 を設定
    await redis.hset(`tz:${i.guildId}`, { tz: '0' });
    return i.reply({ content: '🌐 Detected Timezone set to UTC+0.', flags: MessageFlags.Ephemeral });
  }
});

/* ────────── 8. MessageCreate ────────── */
client.on(Events.MessageCreate, async (msg) => {
  if (msg.author.bot) return;
  if (!(await redis.sismember('global:channels', msg.channelId))) return;

  /* stats */
  await redis.incrby(kMsg(msg.author.id), 1);

  /* reply excerpt */
  let replyExcerpt = null;
  if (msg.reference?.messageId) {
    try {
      const ref = await msg.channel.messages.fetch(msg.reference.messageId);
      replyExcerpt = (ref.content || ref.embeds[0]?.description || '').slice(0, 250);
    } catch {/* ignore */ }
  }

  /* meta */
  const tz   = (await redis.hget(`tz:${msg.guildId}`, 'tz')) ?? '0';
  const lang = (await redis.hget(`lang:${msg.guildId}`, 'lang')) ?? 'en';
  const auto = (await redis.hget(`lang:${msg.guildId}`, 'auto')) === 'true';

  const payload = {
    globalId   : randomUUID(),
    guildId    : msg.guildId,
    channelId  : msg.channelId,
    userTag    : msg.author.tag,
    userAvatar : msg.author.displayAvatarURL(),
    originGuild: msg.guild.name,
    tz,
    content    : msg.content,
    replyExcerpt,
    sentAt     : Date.now(),
    files      : msg.attachments.map(a => ({ attachment: a.url, name: a.name })),
    targetLang : auto ? lang : null,
    userId     : msg.author.id
  };

  /* publish to HUB */
  const ok = await fetch(process.env.HUB_ENDPOINT + '/publish', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  }).then(r => r.ok).catch(() => false);

  if (!ok) {
    // フォールバック go
    const embed = buildRelayEmbed({
      userTag: payload.userTag,
      originGuild: payload.originGuild,
      tz: payload.tz,
      userAvatar: payload.userAvatar,
      content: payload.content,
      userId: payload.userId,
      auto: !!payload.targetLang,
      reply: payload.replyExcerpt
    });
    for (const channelId of await redis.smembers('global:channels')) {
      if (channelId === msg.channelId) continue;
      const dupKey = `${payload.globalId}:${channelId}`;
      if (await alreadySent(dupKey)) continue;
      try {
        const ch = await client.channels.fetch(channelId);
        const sent = await ch.send({ embeds: [embed], files: payload.files.map(f => f.attachment) });
        await sent.react('👍');
      } catch {/* ignore */ }
    }
  }
});

/* ────────── 9. ReactionAdd (👍 & 翻訳) ────────── */
client.on(Events.MessageReactionAdd, async (r, user) => {
  if (user.bot) return;

  // Like カウント
  if (r.emoji.name === '👍' && r.message.author?.id === client.user.id) {
    const setKey = `like_set:${r.message.id}`;
    if (await redis.sismember(setKey, user.id)) return;
    if ((await redis.scard(setKey)) >= 5) return r.users.remove(user.id).catch(() => { });
    await redis.sadd(setKey, user.id);
    await redis.expire(setKey, 60 * 60 * 24 * 7);
    const m = r.message.embeds[0]?.footer?.text.match(/UID:(\d+)/);
    if (m) await redis.incrby(kLike(m[1]), 1);
    return;
  }

  // 国旗リアクション翻訳
  const langCode = FLAG_TO_LANG[r.emoji.name];
  if (!langCode) return;
  const original = r.message.content || r.message.embeds[0]?.description || '';
  if (!original) return;
  try {
    const translated = await translate(original, langCode);
    await r.message.reply({
      embeds: [
        new EmbedBuilder()
          .setDescription(`> ${original}\n\n**${translated}**`)
          .setFooter({ text: `🌐 translated to ${langCode}` })
      ]
    });
  } catch (e) { console.error('translate error:', e); }
});

/* ────────── 10. Express relay ────────── */
const app = express();
app.use(bodyParser.json());

app.post('/relay', async (req, res) => {
  try {
    const p = req.body;
    for (const channelId of await redis.smembers('global:channels')) {
      if (channelId === p.channelId) continue;
      const dupKey = `${p.globalId}:${channelId}`;
      if (await alreadySent(dupKey)) continue;
      try {
        const ch = await client.channels.fetch(channelId);
        const embed = buildRelayEmbed({
          userTag: p.userTag,
          originGuild: p.originGuild,
          tz: p.tz,
          userAvatar: p.userAvatar,
          content: p.content,
          userId: p.userId,
          auto: !!p.targetLang,
          reply: p.replyExcerpt
        });
        const sent = await ch.send({ embeds: [embed], files: p.files?.map(f => f.attachment) || [] });
        await sent.react('👍');
      } catch (e) {
        console.error(`relay to ${channelId} failed:`, e);
      }
    }
    return res.send({ ok: true });
  } catch (e) {
    console.error('relay error:', e);
    return res.sendStatus(500);
  }
});

app.get('/healthz', (_, res) => res.send('OK'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('🚦 relay on', PORT));

/* ────────── 11. login ────────── */
client.login(process.env.DISCORD_TOKEN)
  .then(() => console.log('✅ Logged in & ready'))
  .catch((e) => console.error('login error', e));
