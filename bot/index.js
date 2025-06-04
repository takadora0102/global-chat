/**
 * index.js – Global Chat Bot  (2025-06-XX multi-fix + auto-👍)
 *
 * 修正点
 *  1. duplicate 送信防止     … Redis Set「dup:<globalId>」で1回だけ配信
 *  2. reply support          … Message reference を転送、embed に reply_excerpt 表示
 *  3. 画像のみメッセージ対応 … files がある場合 content が空でも転送
 *  4. setting の言語 26種    … Google 翻訳対応言語に合わせてセレクトを拡充
 *  5. グローバルチャットのすべての転送メッセージに BOT が「👍」を自動で付与
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

/* ────────── duplicate guard & fallback prototype ────────── */
async function alreadySent(globalKey) {
  const key = `dup:${globalKey}`;
  if (await redis.get(key)) return true;
  await redis.set(key, '1', { ex: 60 });
  return false;
}

/* ────────── 5. /setup ────────── */
async function handleSetup(interaction) {
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.editReply('❌ Need Administrator permission.');
    }

    /* category */
    const category = await interaction.guild.channels.create({
      name: 'Global Chat',
      type: ChannelType.GuildCategory
    });

    /* bot-announcements (text) */
    const botAnnouncements = await interaction.guild.channels.create({
      name: 'bot-announcements',
      type: ChannelType.GuildText,
      parent: category.id,
      permissionOverwrites: [
        { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.SendMessages], type: OverwriteType.Role }
      ]
    });

    /* follow support ann */
    try {
      const src = await client.channels.fetch(NEWS_SOURCE);
      if (src?.type === ChannelType.GuildAnnouncement && src.addFollower) {
        await src.addFollower(botAnnouncements.id, 'auto-follow');
      }
    } catch (e) { console.error('follow failed:', e); }

    /* global-chat */
    const globalChat = await interaction.guild.channels.create({
      name: 'global-chat',
      type: ChannelType.GuildText,
      parent: category.id
    });

    /* settings */
    const settings = await interaction.guild.channels.create({
      name: 'settings',
      type: ChannelType.GuildText,
      parent: category.id,
      permissionOverwrites: [
        { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel], type: OverwriteType.Role }
      ]
    });

    /* Redis register (channelId only) */
    await redis.sadd('global:channels', globalChat.id);
    fetch(process.env.HUB_ENDPOINT + '/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ guildId: interaction.guild.id, channelId: globalChat.id })
    }).catch(() => {});

    /* 26 languages */
    const LANG_UI = [
      ['English', 'en', '🇺🇸'],
      ['English (UK)', 'en-GB', '🇬🇧'],
      ['日本語', 'ja', '🇯🇵'],
      ['中文(简体)', 'zh', '🇨🇳'],
      ['中文(繁體)', 'zh-TW', '🇹🇼'],
      ['한국어', 'ko', '🇰🇷'],
      ['Español', 'es', '🇪🇸'],
      ['Español (MX)', 'es-MX', '🇲🇽'],
      ['Español (CO)', 'es-CO', '🇨🇴'],
      ['Français', 'fr', '🇫🇷'],
      ['Deutsch', 'de', '🇩🇪'],
      ['Português', 'pt', '🇵🇹'],
      ['Português (BR)', 'pt-BR', '🇧🇷'],
      ['Русский', 'ru', '🇷🇺'],
      ['Українська', 'uk', '🇺🇦'],
      ['Ελληνικά', 'el', '🇬🇷'],
      ['עברית', 'he', '🇮🇱'],
      ['اردو', 'ur', '🇵🇰'],
      ['فارسی', 'fa', '🇮🇷'],
      ['Bahasa Indonesia', 'id', '🇮🇩'],
      ['Bahasa Melayu', 'ms', '🇲🇾'],
      ['हिन्दी', 'hi', '🇮🇳'],
      ['বাংলা', 'bn', '🇧🇩'],
      ['ไทย', 'th', '🇹🇭'],
      ['Tiếng Việt', 'vi', '🇻🇳'],
      ['العربية', 'ar', '🇸🇦']
    ].map(([l, v, e]) => ({ label: l, value: v, emoji: e }));

    /* timezone opts */
    const tzOpts = [];
    for (let o = -11; o <= 13; o++) tzOpts.push({ label: `UTC${o >= 0 ? '+' + o : o}`, value: String(o) });

    /* UI rows */
    const rowLang = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId('set_default_lang').setPlaceholder('Select language').addOptions(LANG_UI)
    );
    const rowTZ = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId('set_timezone').setPlaceholder('Select timezone').addOptions(tzOpts)
    );
    const rowAuto = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('autotrans_on').setLabel('Auto ON').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('autotrans_off').setLabel('OFF').setStyle(ButtonStyle.Danger)
    );
    const rowMisc = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('detect_timezone').setLabel('Detect TZ').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setURL(process.env.SUPPORT_SERVER_URL).setLabel('Support').setStyle(ButtonStyle.Link)
    );

    await settings.send({
      content: '**Global Chat Settings**',
      components: [rowLang, rowTZ, rowAuto, rowMisc]
    });

    await interaction.editReply('✅ Setup completed!');
  } catch (e) {
    console.error('setup error:', e);
    if (interaction.deferred) await interaction.editReply('❌ Setup failed.');
  }
}

/* ────────── 6. /profile ────────── */
async function handleProfile(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const m = (await redis.get(kMsg(interaction.user.id))) || '0';
  const l = (await redis.get(kLike(interaction.user.id))) || '0';
  await interaction.editReply(`📊 **${interaction.user.tag}**\n• Messages: ${m}\n• 👍: ${l}`);
}

/* ────────── 7. /ranking ────────── */
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

/* ────────── 8. Help UI (region/lang) ────────── */
const REGIONS = [
  { label: 'Asia', value: 'asia', emoji: '🌏' },
  { label: 'Europe', value: 'europe', emoji: '🌍' },
  { label: 'Americas', value: 'americas', emoji: '🌎' },
  { label: 'MEA', value: 'mea', emoji: '🌍' },
  { label: 'Oceania', value: 'oceania', emoji: '🌏' }
];
const REGION_LANGS = {
  asia:    ['ja', 'zh', 'zh-TW', 'ko', 'vi', 'en'],
  europe:  ['en', 'es', 'fr', 'de', 'ru', 'uk', 'el'],
  americas:['en', 'es', 'pt-BR', 'es-MX', 'es-CO'],
  mea:     ['ar', 'fa', 'he', 'tr', 'ur'],
  oceania: ['en', 'en-AU', 'en-NZ']
};

/* ────────── 9. Interaction ルーティング ────────── */
client.on(Events.InteractionCreate, async (i) => {
  if (i.isChatInputCommand()) {
    if (i.commandName === 'setup')   return handleSetup(i);
    if (i.commandName === 'profile') return handleProfile(i);
    if (i.commandName === 'ranking') return handleRanking(i);
    if (i.commandName === 'help') {
      return i.reply({
        content: '🔎 Pick a region',
        components: [
          new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder().setCustomId('help_region').addOptions(
              REGIONS.map(o => ({ label: o.label, value: o.value, emoji: o.emoji }))
            )
          )
        ],
        flags: MessageFlags.Ephemeral
      });
    }
  }

  /* help flow */
  if (i.isStringSelectMenu() && i.customId === 'help_region') {
    const langs = REGION_LANGS[i.values[0]] || ['en'];
    return i.update({
      content: '📖 Pick a language',
      components: [
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder().setCustomId('help_lang').addOptions(
            langs.map(code => ({ label: code, value: code }))
          )
        )
      ]
    });
  }
  if (i.isStringSelectMenu() && i.customId === 'help_lang') {
    const __dir = path.dirname(fileURLToPath(import.meta.url));
    const { HELP_TEXTS } = await import(path.join(__dir, 'commands', 'help.js'));
    const text = HELP_TEXTS[i.values[0]] || HELP_TEXTS.en;
    const chunk = text.match(/[\s\S]{1,2000}/g);
    await i.update({ content: chunk[0], components: [] });
    for (let idx = 1; idx < chunk.length; idx++) {
      await i.followUp({ content: chunk[idx], flags: MessageFlags.Ephemeral });
    }
    return;
  }

  /* settings UI */
  if (i.isStringSelectMenu() && i.customId === 'set_default_lang') {
    await redis.hset(`lang:${i.guildId}`, { lang: i.values[0], auto: 'true' });
    return i.reply({ content: `✔️ Default lang: ${i.values[0]}`, flags: MessageFlags.Ephemeral });
  }
  if (i.isStringSelectMenu() && i.customId === 'set_timezone') {
    await redis.hset(`tz:${i.guildId}`, { tz: i.values[0] });
    const s = i.values[0] >= 0 ? '+' : '';
    return i.reply({ content: `✔️ Timezone set to UTC${s}${i.values[0]}`, flags: MessageFlags.Ephemeral });
  }
  if (i.isButton() && ['autotrans_on', 'autotrans_off'].includes(i.customId)) {
    const v = i.customId === 'autotrans_on' ? 'true' : 'false';
    await redis.hset(`lang:${i.guildId}`, { auto: v });
    return i.reply({ content: `🔄 Auto-Translate **${v === 'true' ? 'ON' : 'OFF'}**`, flags: MessageFlags.Ephemeral });
  }
  if (i.isButton() && i.customId === 'detect_timezone') {
    await redis.hset(`tz:${i.guildId}`, { tz: '0' });
    return i.reply({ content: '🌐 TZ auto-set to UTC+0 (demo)', flags: MessageFlags.Ephemeral });
  }
});

/* ────────── 10. MessageCreate ────────── */
client.on(Events.MessageCreate, async (msg) => {
  if (msg.author.bot) return;
  if (!(await redis.sismember('global:channels', msg.channelId))) return;

  /* message stats */
  await redis.incrby(kMsg(msg.author.id), 1);

  /* reply excerpt */
  let replyExcerpt = null;
  if (msg.reference?.messageId) {
    try {
      const ref = await msg.channel.messages.fetch(msg.reference.messageId);
      replyExcerpt = (ref.content || ref.embeds[0]?.description || '').slice(0, 250);
    } catch {/* ignore */}
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

  /* HUB publish */
  const ok = await fetch(process.env.HUB_ENDPOINT + '/publish', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  }).then(r => r.ok).catch(() => false);

  if (!ok) {
    // フォールバック
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
      } catch {/* ignore */}
    }
  }
});

/* ────────── 11. ReactionAdd (👍 & 翻訳) ────────── */
client.on(Events.MessageReactionAdd, async (r, user) => {
  if (user.bot) return;

  /* Like */
  if (r.emoji.name === '👍' && r.message.author?.id === client.user.id) {
    const setKey = `like_set:${r.message.id}`;
    if (await redis.sismember(setKey, user.id)) return;
    if ((await redis.scard(setKey)) >= 5) {
      return r.users.remove(user.id).catch(() => {});
    }
    await redis.sadd(setKey, user.id);
    await redis.expire(setKey, 60 * 60 * 24 * 7);
    const m = r.message.embeds[0]?.footer?.text.match(/UID:(\d+)/);
    if (m) await redis.incrby(kLike(m[1]), 1);
    return;
  }

  /* Translate */
  const lang = FLAG_TO_LANG[r.emoji.name];
  if (!lang) return;
  const original = r.message.content || r.message.embeds[0]?.description || '';
  if (!original) return;
  try {
    const translated = await translate(original, lang);
    await r.message.reply({
      embeds: [new EmbedBuilder()
        .setDescription(`> ${original}\n\n**${translated}**`)
        .setFooter({ text: `🌐 translated to ${lang}` })]
    });
  } catch (e) { console.error('translate error:', e); }
});

/* ────────── 12. Express relay ────────── */
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

/* ────────── 13. login ────────── */
client.login(process.env.DISCORD_TOKEN)
  .then(() => console.log('✅ Logged in & ready'))
  .catch((e) => console.error('login error', e));
