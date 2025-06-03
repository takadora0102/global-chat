/**
 * index.js – Global Chat Bot
 * Patch-4 (2025-06-04)
 *
 * 変更点（Patch-4）
 *   • /setup を完全 try/catch 化
 *   • bot-announcements を News → fallback Text 生成
 *   • follow() は News 生成成功時のみ実行
 *   • 既存機能 (/help, Auto-Translate, Embed 翻訳, 自家エコー防止 等) は維持
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
  ButtonStyle
} from 'discord.js';
import express from 'express';
import bodyParser from 'body-parser';
import { randomUUID } from 'crypto';
import { Redis } from '@upstash/redis';
import { FLAG_TO_LANG } from './constants.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* ────────── env check ────────── */
for (const k of [
  'DISCORD_TOKEN',
  'HUB_ENDPOINT',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'SUPPORT_SERVER_URL'
]) {
  if (!process.env[k]) throw new Error(`❌ missing env ${k}`);
}
const NEWS_SOURCE = process.env.GLOBAL_NEWS_CHANNEL_ID ?? null;

/* ────────── Redis / Client ────────── */
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

/* ────────── helpers ────────── */
const kMsg = (uid) => `msg_cnt:${uid}`;   // global-chat 専用
const kLike = (uid) => `like_cnt:${uid}`;

async function translate(text, tl) {
  const url =
    'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&dt=t&tl=' +
    tl +
    '&q=' +
    encodeURIComponent(text);
  const r = await fetch(url);
  if (!r.ok) throw new Error('translate api');
  const d = await r.json();
  return d[0].map((v) => v[0]).join('');
}

/* ────────── /setup ────────── */
async function handleSetup(inter) {
  try {
    await inter.deferReply({ flags: MessageFlags.Ephemeral });

    if (!inter.member.permissions.has(PermissionFlagsBits.Administrator))
      return inter.editReply({ content: '❌ Administrator 権限が必要です。' });

    /* 1. カテゴリ */
    const cat = await inter.guild.channels.create({
      name: 'Global Chat',
      type: ChannelType.GuildCategory
    });

    /* 2. bot-announcements (News → fallback Text) */
    let botAnnouncements;
    try {
      botAnnouncements = await inter.guild.channels.create({
        name: 'bot-announcements',
        type: ChannelType.GuildAnnouncement,
        parent: cat.id,
        permissionOverwrites: [
          {
            id: inter.guild.roles.everyone.id,
            deny: [PermissionFlagsBits.SendMessages],
            type: OverwriteType.Role
          }
        ]
      });
      if (NEWS_SOURCE && typeof botAnnouncements.follow === 'function')
        await botAnnouncements.follow(NEWS_SOURCE);
    } catch {
      botAnnouncements = await inter.guild.channels.create({
        name: 'bot-announcements',
        type: ChannelType.GuildText,
        parent: cat.id,
        permissionOverwrites: [
          {
            id: inter.guild.roles.everyone.id,
            deny: [PermissionFlagsBits.SendMessages],
            type: OverwriteType.Role
          }
        ]
      });
    }

    /* 3. global-chat & settings */
    const globalChat = await inter.guild.channels.create({
      name: 'global-chat',
      type: ChannelType.GuildText,
      parent: cat.id
    });
    const settings = await inter.guild.channels.create({
      name: 'settings',
      type: ChannelType.GuildText,
      parent: cat.id,
      permissionOverwrites: [
        {
          id: inter.guild.roles.everyone.id,
          deny: [PermissionFlagsBits.ViewChannel],
          type: OverwriteType.Role
        }
      ]
    });

    /* 4. Redis & HUB */
    await redis.sadd(
      'global:channels',
      JSON.stringify({ guildId: inter.guild.id, channelId: globalChat.id })
    );
    fetch(process.env.HUB_ENDPOINT + '/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ guildId: inter.guild.id, channelId: globalChat.id })
    }).catch(() => {});

    /* 5. settings メッセージ */
    const langOpts = [
      ['日本語', 'ja', '🇯🇵'], ['English (US)', 'en', '🇺🇸'],
      ['中文(简体)', 'zh', '🇨🇳'], ['中文(繁體)', 'zh-TW', '🇹🇼'],
      ['한국어', 'ko', '🇰🇷'], ['Español', 'es', '🇪🇸'],
      ['Français', 'fr', '🇫🇷'], ['Deutsch', 'de', '🇩🇪'],
      ['Português (BR)', 'pt-BR', '🇧🇷'], ['Русский', 'ru', '🇷🇺'],
      ['Українська', 'uk', '🇺🇦'], ['فارسی', 'fa', '🇮🇷'],
      ['العربية', 'ar', '🇸🇦'], ['Bahasa Indonesia', 'id', '🇮🇩'],
      ['ไทย', 'th', '🇹🇭'], ['Tiếng Việt', 'vi', '🇻🇳'],
      ['हिन्दी', 'hi', '🇮🇳'], ['বাংলা', 'bn', '🇧🇩'],
      ['Bahasa Melayu', 'ms', '🇲🇾'], ['Türkçe', 'tr', '🇹🇷']
    ].map(([l, v, e]) => ({ label: l, value: v, emoji: e }));

    const tzOpts = [];
    for (let o = -11; o <= 13; o++)
      tzOpts.push({ label: `UTC${o >= 0 ? '+' : ''}${o}`, value: `${o}` });

    const onBtn  = new ButtonBuilder().setCustomId('autotrans_on').setLabel('Auto-Translate ON').setStyle(ButtonStyle.Success);
    const offBtn = new ButtonBuilder().setCustomId('autotrans_off').setLabel('Auto-Translate OFF').setStyle(ButtonStyle.Danger);
    const supBtn = new ButtonBuilder().setURL(process.env.SUPPORT_SERVER_URL).setLabel('サポートサーバー').setStyle(ButtonStyle.Link);

    await settings.send({
      content:
        '**Global Chat 設定**\n1️⃣ デフォルト言語\n2️⃣ タイムゾーン\n3️⃣ Auto-Translate の ON / OFF',
      components: [
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('set_default_lang')
            .setPlaceholder('デフォルト言語を選択')
            .addOptions(langOpts)
        ),
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('set_timezone')
            .setPlaceholder('タイムゾーンを選択')
            .addOptions(tzOpts)
        ),
        new ActionRowBuilder().addComponents(onBtn),
        new ActionRowBuilder().addComponents(offBtn),
        new ActionRowBuilder().addComponents(supBtn)
      ]
    });

    await inter.editReply({ content: '✅ Setup complete!' });
  } catch (err) {
    console.error('setup error', err);
    if (!inter.replied)
      await inter.editReply({
        content: '❌ Setup failed: 権限または設定を確認してください。',
        components: []
      });
  }
}

/* ────────── /profile ────────── */
async function handleProfile(i) {
  await i.deferReply({ flags: MessageFlags.Ephemeral });
  const msgs  = (await redis.get(kMsg(i.user.id)))  || '0';
  const likes = (await redis.get(kLike(i.user.id))) || '0';
  i.editReply(`📊 **${i.user.tag}**\n• Global-Chat Messages: ${msgs}\n• Likes Received: ${likes}`);
}

/* ────────── /ranking ────────── */
async function handleRanking(i) {
  await i.deferReply({ flags: MessageFlags.Ephemeral });
  const sub = i.options.getSubcommand();
  const pattern = sub === 'messages' ? 'msg_cnt:*' : 'like_cnt:*';
  const list = [];
  for (const k of await redis.keys(pattern))
    list.push({ id: k.split(':')[1], v: parseInt(await redis.get(k), 10) || 0 });
  list.sort((a, b) => b.v - a.v).splice(10);
  let txt = `🏆 **Top 10 by ${sub}**\n\n`;
  for (let n = 0; n < list.length; n++) {
    try {
      const u = await client.users.fetch(list[n].id);
      txt += `#${n + 1} – ${u.tag} (${list[n].v})\n`;
    } catch {
      txt += `#${n + 1} – (unknown) (${list[n].v})\n`;
    }
  }
  if (!list.length) txt += 'No data';
  i.editReply(txt);
}

/* ────────── /help (地域→言語→本文) ────────── */
const REGIONS = [
  { label: 'アジア', value: 'asia', emoji: '🌏' },
  { label: 'ヨーロッパ', value: 'europe', emoji: '🌍' },
  { label: '北アメリカ', value: 'north_america', emoji: '🌎' },
  { label: '中東・アフリカ', value: 'middle_east_africa', emoji: '🕊️' },
  { label: '南アメリカ', value: 'south_america', emoji: '🌎' },
  { label: 'オセアニア', value: 'oceania', emoji: '🌏' }
];
const REGION_LANG = {
  asia: [
    ['日本語', 'ja', '🇯🇵'], ['中文(简体)', 'zh', '🇨🇳'],
    ['中文(繁體)', 'zh-TW', '🇹🇼'], ['한국어', 'ko', '🇰🇷'],
    ['हिन्दी', 'hi', '🇮🇳'], ['বাংলা', 'bn', '🇧🇩'],
    ['ไทย', 'th', '🇹🇭'], ['Tiếng Việt', 'vi', '🇻🇳'],
    ['Bahasa Melayu', 'ms', '🇲🇾'], ['Bahasa Indonesia', 'id', '🇮🇩']
  ],
  europe: [
    ['English', 'en', '🇺🇸'], ['Español', 'es', '🇪🇸'],
    ['Français', 'fr', '🇫🇷'], ['Deutsch', 'de', '🇩🇪'],
    ['Русский', 'ru', '🇷🇺'], ['Українська', 'uk', '🇺🇦'],
    ['ελληνικά', 'el', '🇬🇷'], ['فارسی', 'fa', '🇮🇷'],
    ['العربية', 'ar', '🇸🇦'], ['עברית', 'he', '🇮🇱']
  ],
  north_america: [
    ['English', 'en', '🇺🇸'], ['Español', 'es', '🇪🇸'], ['Français', 'fr', '🇨🇦']
  ],
  middle_east_africa: [
    ['العربية', 'ar', '🇸🇦'], ['فارسی', 'fa', '🇮🇷'], ['Türkçe', 'tr', '🇹🇷']
  ],
  south_america: [
    ['Español', 'es', '🇪🇸'], ['Português (BR)', 'pt-BR', '🇧🇷']
  ],
  oceania: [
    ['English (AU)', 'en-AU', '🇦🇺'], ['English (NZ)', 'en-NZ', '🇳🇿']
  ]
};

/* ────────── InteractionCreate ────────── */
client.on(Events.InteractionCreate, async (i) => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));

  /* /help – 地域選択 */
  if (i.isChatInputCommand() && i.commandName === 'help') {
    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('help_region')
        .setPlaceholder('地域を選択')
        .addOptions(REGIONS)
    );
    return i.reply({
      content: '🔎 ヘルプを表示したい「地域」を選択してください。',
      components: [row],
      flags: MessageFlags.Ephemeral
    });
  }
  /* /help – 言語選択 */
  if (i.isStringSelectMenu() && i.customId === 'help_region') {
    const opts = (REGION_LANG[i.values[0]] || []).map(([l, v, e]) => ({
      label: l, value: v, emoji: e
    }));
    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('help_lang')
        .setPlaceholder('言語を選択してください')
        .addOptions(opts)
    );
    return i.update({ content: '📖 言語を選択してください。', components: [row] });
  }
  /* /help – 本文送信 */
  if (i.isStringSelectMenu() && i.customId === 'help_lang') {
    const { HELP_TEXTS } = await import(path.join(__dirname, 'commands', 'help.js'));
    const text = HELP_TEXTS[i.values[0]] || HELP_TEXTS.en;
    const parts = text.match(/[\s\S]{1,2000}/g);
    await i.update({ content: parts[0], components: [] });
    for (let p = 1; p < parts.length; p++)
      await i.followUp({ content: parts[p], flags: MessageFlags.Ephemeral });
    return;
  }

  /* 他スラッシュ */
  if (i.isChatInputCommand()) {
    if (i.commandName === 'setup')   return handleSetup(i);
    if (i.commandName === 'profile') return handleProfile(i);
    if (i.commandName === 'ranking') return handleRanking(i);
  }

  /* 言語/TZ セレクト ＆ Auto-Translate ボタン */
  if (i.isStringSelectMenu() && i.customId === 'set_default_lang') {
    await redis.hset(`lang:${i.guildId}`, { lang: i.values[0], auto: 'true' });
    return i.reply({ content: '✅ 言語を設定しました (ON)', flags: MessageFlags.Ephemeral });
  }
  if (i.isStringSelectMenu() && i.customId === 'set_timezone') {
    await redis.hset(`tz:${i.guildId}`, { tz: i.values[0] });
    const s = i.values[0] >= 0 ? '+' : '';
    return i.reply({ content: `✅ UTC${s}${i.values[0]} に設定`, flags: MessageFlags.Ephemeral });
  }
  if (i.isButton() && (i.customId === 'autotrans_on' || i.customId === 'autotrans_off')) {
    const val = i.customId === 'autotrans_on' ? 'true' : 'false';
    await redis.hset(`lang:${i.guildId}`, { auto: val });
    return i.reply({
      content: `🔄 Auto-Translate を **${val === 'true' ? 'ON' : 'OFF'}** にしました。`,
      flags: MessageFlags.Ephemeral
    });
  }
});

/* ────────── MessageCreate (global-chat のみ) ────────── */
client.on(Events.MessageCreate, async (m) => {
  if (m.author.bot) return;
  const reg = JSON.stringify({ guildId: m.guildId, channelId: m.channelId });
  if (!(await redis.sismember('global:channels', reg))) return;

  await redis.incrby(kMsg(m.author.id), 1);

  const tz  = (await redis.hget(`tz:${m.guildId}`, 'tz')) || '0';
  const cfg = await redis.hgetall(`lang:${m.guildId}`);
  const lang = cfg.auto === 'true' ? cfg.lang : null;

  fetch(process.env.HUB_ENDPOINT + '/publish', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      globalId: randomUUID(),
      guildId: m.guildId,
      channelId: m.channelId,
      userTag: m.author.tag,
      userAvatar: m.author.displayAvatarURL(),
      originGuild: m.guild.name,
      originTz: tz,
      content: m.content,
      sentAt: Date.now(),
      files: m.attachments.map((a) => ({ attachment: a.url, name: a.name })),
      targetLang: lang,
      userId: m.author.id
    })
  }).catch(() => {});
});

/* ────────── ReactionAdd (👍 & 翻訳) ────────── */
client.on(Events.MessageReactionAdd, async (r, user) => {
  if (user.bot) return;

  /* Like */
  if (r.emoji.name === '👍' && r.message.author?.id === client.user.id) {
    const setKey = `like_set:${r.message.id}`;
    if (await redis.sismember(setKey, user.id)) return;
    if ((await redis.scard(setKey)) >= 5) {
      r.users.remove(user.id).catch(() => {});
      return;
    }
    await redis.sadd(setKey, user.id);
    await redis.expire(setKey, 604800);
    const m = r.message.embeds[0]?.footer?.text.match(/UID:(\d+)/);
    if (m) await redis.incrby(kLike(m[1]), 1);
    return;
  }

  /* 国旗翻訳 */
  const tl = FLAG_TO_LANG[r.emoji.name];
  if (!tl) return;

  let original = r.message.content;
  if (!original && r.message.embeds?.length)
    original = r.message.embeds[0].description ?? '';
  if (!original) return;

  try {
    const translated = await translate(original, tl);
    await r.message.reply({
      embeds: [
        {
          description: `> ${original}\n\n**${translated}**`,
          footer: { text: `🌐 translated to ${tl}` }
        }
      ]
    });
  } catch {}
});

/* ────────── Express /relay ────────── */
const app = express();
app.use(bodyParser.json());

app.post('/relay', async (req, res) => {
  try {
    const m = req.body;
    const g = client.guilds.cache.get(m.guildId);
    if (!g) return res.sendStatus(404);
    if (m.guildId === g.id) return res.send({ status: 'skip_origin' });
    const ch = g.channels.cache.get(m.channelId);
    if (!ch) return res.sendStatus(404);

    const tz = (await redis.hget(`tz:${m.guildId}`, 'tz')) || '0';
    const embed = {
      author: {
        name: `${m.userTag} [${m.originGuild} UTC${tz}]`,
        icon_url: m.userAvatar
      },
      description: m.content,
      footer: {
        text: `UID:${m.userId} 🌐 global chat${m.targetLang ? ' • auto-translated' : ''}`
      },
      timestamp: new Date(m.sentAt).toISOString()
    };
    const files = m.files?.map((f) => f.attachment) || [];
    const sent = await ch.send({ embeds: [embed], files });
    await sent.react('👍');
    res.send({ status: 'ok' });
  } catch (e) {
    console.error('relay error', e);
    res.sendStatus(500);
  }
});

app.get('/healthz', (_, res) => res.send('OK'));
app.listen(process.env.PORT || 3000, () =>
  console.log('🚦 relay on', process.env.PORT || 3000)
);

/* ────────── login ────────── */
client
  .login(process.env.DISCORD_TOKEN)
  .then(() => console.log('✅ Logged in'))
  .catch((e) => console.error('login error', e));
