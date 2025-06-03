/**
 * index.js – Global Chat Bot (Auto-Translate ON/OFF 対応・25 option制限版)
 *
 * 機能一覧
 *  ├─ /setup … カテゴリ＋3ch自動生成・HUB登録・設定UI送信
 *  ├─ /help  … 地域→言語2段階セレクト・2000字分割送信
 *  ├─ /profile … 累計メッセージ数／👍数を表示
 *  ├─ /ranking messages / likes … 上位10表示
 *  ├─ Auto-Translate / TZ … settings のセレクト＋トグルボタン
 *  ├─ Global Relay … HUB経由で cross-server 連携
 *  ├─ 👍5件制限 Like-Count … ReactionAdd
 *  └─ 国旗リアクション翻訳
 */

import 'dotenv/config';
import {
  Client,
  IntentsBitField,
  Events,
  PermissionFlagsBits,
  MessageFlags,
  ChannelType,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle
} from 'discord.js';
import express from 'express';
import bodyParser from 'body-parser';
import { randomUUID } from 'crypto';
import { Redis } from '@upstash/redis';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FLAG_TO_LANG } from './constants.js';

/* ──────────── 環境変数チェック ──────────── */
for (const k of [
  'DISCORD_TOKEN',
  'OWNER_ID',
  'HUB_ENDPOINT',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'SUPPORT_SERVER_URL'
]) {
  if (!process.env[k]) {
    console.error(`❌ missing ${k}`);
    process.exit(1);
  }
}

/* ──────────── Redis / Client ──────────── */
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

/* ──────────── Helper ──────────── */
const kMsg = (id) => `msg_cnt:${id}`;
const kLike = (id) => `like_cnt:${id}`;

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

/* ──────────── /setup ──────────── */
async function handleSetup(inter) {
  try {
    await inter.deferReply({ flags: MessageFlags.Ephemeral });

    if (!inter.member.permissions.has(PermissionFlagsBits.Administrator))
      return inter.editReply({
        content: '❌ Administrator 権限が必要です。',
        components: []
      });

    /* 1. カテゴリ＋チャンネル */
    const cat = await inter.guild.channels.create({
      name: 'Global Chat',
      type: ChannelType.GuildCategory
    });
    const globalChat = await inter.guild.channels.create({
      name: 'global-chat',
      type: ChannelType.GuildText,
      parent: cat.id
    });
    const settings = await inter.guild.channels.create({
      name: 'settings',
      type: ChannelType.GuildText,
      parent: cat.id
    });
    await inter.guild.channels.create({
      name: 'bot-announcements',
      type: ChannelType.GuildText,
      parent: cat.id
    });

    /* 2. Redis & HUB */
    const reg = JSON.stringify({ guildId: inter.guild.id, channelId: globalChat.id });
    await redis.sadd('global:channels', reg);
    fetch(process.env.HUB_ENDPOINT + '/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ guildId: inter.guild.id, channelId: globalChat.id })
    }).catch(() => {});

    /* 3. 言語 (20) / TZ (25) / トグルボタン / サポートボタン */
    const langOpts = [
      { label: '日本語', value: 'ja', emoji: '🇯🇵' },
      { label: 'English (US)', value: 'en', emoji: '🇺🇸' },
      { label: '中文(简体)', value: 'zh', emoji: '🇨🇳' },
      { label: '中文(繁體)', value: 'zh-TW', emoji: '🇹🇼' },
      { label: '한국어', value: 'ko', emoji: '🇰🇷' },
      { label: 'Español', value: 'es', emoji: '🇪🇸' },
      { label: 'Français', value: 'fr', emoji: '🇫🇷' },
      { label: 'Deutsch', value: 'de', emoji: '🇩🇪' },
      { label: 'Português (BR)', value: 'pt-BR', emoji: '🇧🇷' },
      { label: 'Русский', value: 'ru', emoji: '🇷🇺' },
      { label: 'Українська', value: 'uk', emoji: '🇺🇦' },
      { label: 'فارسی', value: 'fa', emoji: '🇮🇷' },
      { label: 'العربية', value: 'ar', emoji: '🇸🇦' },
      { label: 'Bahasa Indonesia', value: 'id', emoji: '🇮🇩' },
      { label: 'ไทย', value: 'th', emoji: '🇹🇭' },
      { label: 'Tiếng Việt', value: 'vi', emoji: '🇻🇳' },
      { label: 'हिन्दी', value: 'hi', emoji: '🇮🇳' },
      { label: 'বাংলা', value: 'bn', emoji: '🇧🇩' },
      { label: 'Bahasa Melayu', value: 'ms', emoji: '🇲🇾' },
      { label: 'Türkçe', value: 'tr', emoji: '🇹🇷' }
    ];

    const tzOpts = [];
    for (let o = -11; o <= 13; o++) tzOpts.push({ label: `UTC${o >= 0 ? '+' : ''}${o}`, value: `${o}` });

    const toggleBtn = new ButtonBuilder()
      .setCustomId('toggle_autotrans')
      .setStyle(ButtonStyle.Primary)
      .setLabel('Auto-Translate ON/OFF');

    const supportBtn = new ButtonBuilder()
      .setURL(process.env.SUPPORT_SERVER_URL)
      .setStyle(ButtonStyle.Link)
      .setLabel('サポートサーバー');

    await settings.send({
      content:
        '**Global Chat 設定**\n' +
        '1️⃣ デフォルト言語を選択\n' +
        '2️⃣ タイムゾーンを選択\n' +
        '3️⃣ Auto-Translate を ON/OFF\n',
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
        new ActionRowBuilder().addComponents(toggleBtn),
        new ActionRowBuilder().addComponents(supportBtn)
      ]
    });

    await inter.editReply({ content: '✅ Setup complete!' });
  } catch (e) {
    console.error('setup error', e);
    if (!inter.replied)
      await inter.editReply({
        content: '❌ セットアップ中にエラーが発生しました。',
        components: []
      });
  }
}

/* ──────────── /profile ──────────── */
async function handleProfile(i) {
  await i.deferReply({ flags: MessageFlags.Ephemeral });
  const uid = i.user.id;
  const msg = (await redis.get(kMsg(uid))) || '0';
  const like = (await redis.get(kLike(uid))) || '0';
  await i.editReply({
    content: `📊 **${i.user.tag}**\n• Messages Sent: ${msg}\n• Likes Received: ${like}`,
    components: []
  });
}

/* ──────────── /ranking ──────────── */
async function handleRanking(i) {
  await i.deferReply({ flags: MessageFlags.Ephemeral });
  const sub = i.options.getSubcommand(); // messages / likes
  const pattern = sub === 'messages' ? 'msg_cnt:*' : 'like_cnt:*';
  const keys = await redis.keys(pattern);
  const arr = [];
  for (const k of keys) {
    const uid = k.split(':')[1];
    arr.push({ id: uid, v: parseInt(await redis.get(k), 10) || 0 });
  }
  arr.sort((a, b) => b.v - a.v).splice(10);
  let txt = `🏆 **Top 10 by ${sub}**\n\n`;
  for (let i2 = 0; i2 < arr.length; i2++) {
    try {
      const u = await client.users.fetch(arr[i2].id);
      txt += `#${i2 + 1} – ${u.tag} (${arr[i2].v})\n`;
    } catch {
      txt += `#${i2 + 1} – (unknown) (${arr[i2].v})\n`;
    }
  }
  if (!arr.length) txt += 'No data';
  await i.editReply({ content: txt, components: [] });
}

/* ──────────── InteractionCreate ──────────── */
client.on(Events.InteractionCreate, async (i) => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));

  /* /help (地域選択) */
  if (i.isChatInputCommand() && i.commandName === 'help') {
    const regions = [
      { label: 'アジア', value: 'asia', emoji: '🌏' },
      { label: 'ヨーロッパ', value: 'europe', emoji: '🌍' },
      { label: '北アメリカ', value: 'north_america', emoji: '🌎' },
      { label: '中東・アフリカ', value: 'middle_east_africa', emoji: '🕊️' },
      { label: '南アメリカ', value: 'south_america', emoji: '🌎' },
      { label: 'オセアニア', value: 'oceania', emoji: '🌏' }
    ];
    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('help_region')
        .setPlaceholder('まずは地域を選択してください')
        .addOptions(regions)
    );
    return i.reply({
      content: '🔎 ヘルプを表示したい「地域」を選択してください。',
      components: [row],
      flags: MessageFlags.Ephemeral
    });
  }

  /* /help (言語メニュー) */
  if (i.isStringSelectMenu() && i.customId === 'help_region') {
    const mapping = {
      asia: [
        ['日本語', 'ja', '🇯🇵'],
        ['中文(简体)', 'zh', '🇨🇳'],
        ['中文(繁體)', 'zh-TW', '🇹🇼'],
        ['한국어', 'ko', '🇰🇷'],
        ['हिन्दी', 'hi', '🇮🇳'],
        ['বাংলা', 'bn', '🇧🇩'],
        ['ไทย', 'th', '🇹🇭'],
        ['Tiếng Việt', 'vi', '🇻🇳'],
        ['Bahasa Melayu', 'ms', '🇲🇾'],
        ['Bahasa Indonesia', 'id', '🇮🇩']
      ],
      europe: [
        ['English', 'en', '🇺🇸'],
        ['Español', 'es', '🇪🇸'],
        ['Français', 'fr', '🇫🇷'],
        ['Deutsch', 'de', '🇩🇪'],
        ['Русский', 'ru', '🇷🇺'],
        ['Українська', 'uk', '🇺🇦'],
        ['ελληνικά', 'el', '🇬🇷'],
        ['فارسی', 'fa', '🇮🇷'],
        ['العربية', 'ar', '🇸🇦'],
        ['עברית', 'he', '🇮🇱']
      ],
      north_america: [
        ['English', 'en', '🇺🇸'],
        ['Español', 'es', '🇪🇸'],
        ['Français', 'fr', '🇨🇦']
      ],
      middle_east_africa: [
        ['العربية', 'ar', '🇸🇦'],
        ['فارسی', 'fa', '🇮🇷'],
        ['Türkçe', 'tr', '🇹🇷']
      ],
      south_america: [
        ['Español', 'es', '🇪🇸'],
        ['Português (BR)', 'pt-BR', '🇧🇷']
      ],
      oceania: [
        ['English (AU)', 'en-AU', '🇦🇺'],
        ['English (NZ)', 'en-NZ', '🇳🇿']
      ]
    };
    const opts = (mapping[i.values[0]] || []).map(([l, v, e]) => ({
      label: l,
      value: v,
      emoji: e
    }));
    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('help_lang')
        .setPlaceholder('言語を選択してください')
        .addOptions(opts)
    );
    return i.update({
      content: '📖 続いて、言語を選択してください。',
      components: [row]
    });
  }

  /* /help (本文送信) */
  if (i.isStringSelectMenu() && i.customId === 'help_lang') {
    const { HELP_TEXTS } = await import(path.join(__dirname, 'commands', 'help.js'));
    const full = HELP_TEXTS[i.values[0]] || HELP_TEXTS.en;
    const MAX = 2000;
    const parts = [];
    for (let p = 0; p < full.length; p += MAX) parts.push(full.slice(p, p + MAX));
    await i.update({ content: parts[0], components: [] });
    for (let j = 1; j < parts.length; j++)
      await i.followUp({ content: parts[j], flags: MessageFlags.Ephemeral });
    return;
  }

  /* ── 既存 3 コマンド ── */
  if (i.isChatInputCommand()) {
    if (i.commandName === 'setup') return handleSetup(i);
    if (i.commandName === 'profile') return handleProfile(i);
    if (i.commandName === 'ranking') return handleRanking(i);
  }

  /* ── 言語／TZ／Auto-Translate トグル ── */
  if (i.isStringSelectMenu() && i.customId === 'set_default_lang') {
    await redis.hset(`lang:${i.guildId}`, { lang: i.values[0], auto: 'true' });
    return i.reply({
      content: `✅ デフォルト言語を **${i.values[0]}** に設定しました。（Auto-Translate ON）`,
      flags: MessageFlags.Ephemeral
    });
  }
  if (i.isStringSelectMenu() && i.customId === 'set_timezone') {
    await redis.hset(`tz:${i.guildId}`, { tz: i.values[0] });
    const s = i.values[0] >= 0 ? '+' : '';
    return i.reply({
      content: `✅ タイムゾーンを **UTC${s}${i.values[0]}** に設定しました。`,
      flags: MessageFlags.Ephemeral
    });
  }
  if (i.isButton() && i.customId === 'toggle_autotrans') {
    const key = `lang:${i.guildId}`;
    const cfg = await redis.hgetall(key);
    if (!cfg.lang)
      return i.reply({
        content: '⚠️ 先にデフォルト言語を設定してください。',
        flags: MessageFlags.Ephemeral
      });
    const newVal = cfg.auto === 'true' ? 'false' : 'true';
    await redis.hset(key, { auto: newVal });
    return i.reply({
      content: `🔄 Auto-Translate を **${newVal === 'true' ? 'ON' : 'OFF'}** にしました。`,
      flags: MessageFlags.Ephemeral
    });
  }
});

/* ──────────── MessageCreate (Relay & Count) ──────────── */
client.on(Events.MessageCreate, async (m) => {
  if (m.author.bot) return;
  await redis.incrby(kMsg(m.author.id), 1);

  const reg = JSON.stringify({ guildId: m.guildId, channelId: m.channelId });
  if (!(await redis.sismember('global:channels', reg))) return;

  const tz = (await redis.hget(`tz:${m.guildId}`, 'tz')) || '0';
  const langCfg = await redis.hgetall(`lang:${m.guildId}`);
  const targetLang = langCfg.auto === 'true' ? langCfg.lang : null;

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
      targetLang,
      userId: m.author.id
    })
  }).catch(() => {});
});

/* ──────────── MessageReactionAdd ──────────── */
client.on(Events.MessageReactionAdd, async (r, user) => {
  if (user.bot) return;

  /* 👍 Like */
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
  if (!tl || !r.message.content) return;
  try {
    const tr = await translate(r.message.content, tl);
    await r.message.reply({
      embeds: [
        {
          description: `> ${r.message.content}\n\n**${tr}**`,
          footer: { text: `🌐 translated to ${tl}` }
        }
      ]
    });
  } catch {}
});

/* ──────────── Express /relay ──────────── */
const app = express();
app.use(bodyParser.json());

app.post('/relay', async (req, res) => {
  try {
    const m = req.body;
    const g = client.guilds.cache.get(m.guildId);
    if (!g) return res.sendStatus(404);
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

/* ──────────── Login ──────────── */
client
  .login(process.env.DISCORD_TOKEN)
  .then(() => console.log('✅ Logged in'))
  .catch((e) => console.error('login error', e));
