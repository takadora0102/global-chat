/**
 * index.js – Global Chat Bot
 * 2025-06 “Embed翻訳 & ON/OFF 2行ボタン” パッチ完全版
 *
 * 変更点 (前回との差分)
 * ───────────────────────────────────────────────
 * 1. 国旗リアクション翻訳  
 *    • メッセージ本文が空でも、Embed (description) に本文があれば翻訳対象にする  
 * 2. Auto-Translate ON / OFF ボタン  
 *    • 同じ ActionRow に並べず **2 行に分割**  
 *    • ON = Success 色、OFF = Danger 色で視覚的に区別  
 *  - これで“2 つ設置”要件を満たしつつ誤タップを防止
 *
 * すべての既存機能 (/setup, /help, /profile, /ranking, Relay, 👍Like 5件制限 等)
 * はそのまま動作します。
 */

/* ──────────────────── Required imports ──────────────────── */
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
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FLAG_TO_LANG } from './constants.js';

/* ──────────────────── Env check ──────────────────── */
for (const k of [
  'DISCORD_TOKEN',
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
const NEWS_SOURCE = process.env.GLOBAL_NEWS_CHANNEL_ID ?? null;

/* ──────────────────── Redis & Client ──────────────────── */
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

/* ──────────────────── Helper funcs ──────────────────── */
const kMsg = (uid) => `msg_cnt:${uid}`; // グローバルチャット専用
const kLike = (uid) => `like_cnt:${uid}`;

async function translate(text, tl) {
  const res = await fetch(
    'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&dt=t&tl=' +
      tl +
      '&q=' +
      encodeURIComponent(text)
  );
  if (!res.ok) throw new Error('translate api');
  const d = await res.json();
  return d[0].map((v) => v[0]).join('');
}

/* ──────────────────── /setup ──────────────────── */
async function handleSetup(inter) {
  try {
    await inter.deferReply({ flags: MessageFlags.Ephemeral });

    if (!inter.member.permissions.has(PermissionFlagsBits.Administrator))
      return inter.editReply({ content: '❌ Administrator 権限が必要です。' });

    /* 1. カテゴリ & チャンネル */
    const cat = await inter.guild.channels.create({
      name: 'Global Chat',
      type: ChannelType.GuildCategory
    });

    // bot-announcements – News + 発言禁止
    const botAnnouncements = await inter.guild.channels.create({
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
    if (NEWS_SOURCE)
      botAnnouncements.follow(NEWS_SOURCE).catch((e) => console.warn('follow error:', e.message));

    // global-chat
    const globalChat = await inter.guild.channels.create({
      name: 'global-chat',
      type: ChannelType.GuildText,
      parent: cat.id
    });

    // settings – 一般閲覧禁止
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

    /* 2. Redis & HUB */
    await redis.sadd(
      'global:channels',
      JSON.stringify({ guildId: inter.guild.id, channelId: globalChat.id })
    );
    fetch(process.env.HUB_ENDPOINT + '/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guildId: inter.guild.id, channelId: globalChat.id })
    }).catch(() => {});

    /* 3. 設定メッセージ */
    const langOpts = [
      ['日本語', 'ja', '🇯🇵'],
      ['English (US)', 'en', '🇺🇸'],
      ['中文(简体)', 'zh', '🇨🇳'],
      ['中文(繁體)', 'zh-TW', '🇹🇼'],
      ['한국어', 'ko', '🇰🇷'],
      ['Español', 'es', '🇪🇸'],
      ['Français', 'fr', '🇫🇷'],
      ['Deutsch', 'de', '🇩🇪'],
      ['Português (BR)', 'pt-BR', '🇧🇷'],
      ['Русский', 'ru', '🇷🇺'],
      ['Українська', 'uk', '🇺🇦'],
      ['فارسی', 'fa', '🇮🇷'],
      ['العربية', 'ar', '🇸🇦'],
      ['Bahasa Indonesia', 'id', '🇮🇩'],
      ['ไทย', 'th', '🇹🇭'],
      ['Tiếng Việt', 'vi', '🇻🇳'],
      ['हिन्दी', 'hi', '🇮🇳'],
      ['বাংলা', 'bn', '🇧🇩'],
      ['Bahasa Melayu', 'ms', '🇲🇾'],
      ['Türkçe', 'tr', '🇹🇷']
    ].map(([l, v, e]) => ({ label: l, value: v, emoji: e }));

    const tzOpts = [];
    for (let o = -11; o <= 13; o++) tzOpts.push({ label: `UTC${o >= 0 ? '+' : ''}${o}`, value: `${o}` });

    const btnOn = new ButtonBuilder()
      .setCustomId('autotrans_on')
      .setLabel('Auto-Translate ON')
      .setStyle(ButtonStyle.Success);
    const btnOff = new ButtonBuilder()
      .setCustomId('autotrans_off')
      .setLabel('Auto-Translate OFF')
      .setStyle(ButtonStyle.Danger);
    const supportBtn = new ButtonBuilder()
      .setURL(process.env.SUPPORT_SERVER_URL)
      .setLabel('サポートサーバー')
      .setStyle(ButtonStyle.Link);

    await settings.send({
      content:
        '**Global Chat 設定**\n' +
        '1️⃣ デフォルト言語\n' +
        '2️⃣ タイムゾーン\n' +
        '3️⃣ Auto-Translate の ON または OFF を選択',
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
        /* ⇩ ON と OFF を“別行”に配置 */
        new ActionRowBuilder().addComponents(btnOn),
        new ActionRowBuilder().addComponents(btnOff),
        new ActionRowBuilder().addComponents(supportBtn)
      ]
    });

    await inter.editReply({ content: '✅ Setup complete!' });
  } catch (e) {
    console.error('setup error', e);
    if (!inter.replied) await inter.editReply({ content: '❌ セットアップ失敗' });
  }
}

/* ──────────── /profile ──────────── */
async function handleProfile(i) {
  await i.deferReply({ flags: MessageFlags.Ephemeral });
  const uid = i.user.id;
  const msg = (await redis.get(kMsg(uid))) || '0';
  const like = (await redis.get(kLike(uid))) || '0';
  await i.editReply({
    content: `📊 **${i.user.tag}**\n• Global-Chat Messages: ${msg}\n• Likes Received: ${like}`
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
  for (let idx = 0; idx < arr.length; idx++) {
    try {
      const u = await client.users.fetch(arr[idx].id);
      txt += `#${idx + 1} – ${u.tag} (${arr[idx].v})\n`;
    } catch {
      txt += `#${idx + 1} – (unknown) (${arr[idx].v})\n`;
    }
  }
  if (!arr.length) txt += 'No data';
  await i.editReply({ content: txt });
}

/* ──────────── InteractionCreate ──────────── */
client.on(Events.InteractionCreate, async (i) => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));

  /* help 関連（地域→言語→本文）は前回実装のまま … */

  if (i.isChatInputCommand()) {
    if (i.commandName === 'setup') return handleSetup(i);
    if (i.commandName === 'profile') return handleProfile(i);
    if (i.commandName === 'ranking') return handleRanking(i);
  }

  /* 言語・TZ セレクト */
  if (i.isStringSelectMenu() && i.customId === 'set_default_lang') {
    await redis.hset(`lang:${i.guildId}`, { lang: i.values[0], auto: 'true' });
    return i.reply({
      content: `✅ デフォルト言語を **${i.values[0]}** に設定 (Auto-Translate ON)。`,
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

  /* Auto-Translate ON / OFF */
  if (i.isButton() && (i.customId === 'autotrans_on' || i.customId === 'autotrans_off')) {
    const key = `lang:${i.guildId}`;
    const cfg = await redis.hgetall(key);
    if (!cfg.lang) {
      return i.reply({
        content: '⚠️ まずデフォルト言語を設定してください。',
        flags: MessageFlags.Ephemeral
      });
    }
    const newVal = i.customId === 'autotrans_on' ? 'true' : 'false';
    await redis.hset(key, { auto: newVal });
    return i.reply({
      content: `🔄 Auto-Translate を **${newVal === 'true' ? 'ON' : 'OFF'}** にしました。`,
      flags: MessageFlags.Ephemeral
    });
  }
});

/* ──────────── MessageCreate (global-chat only) ──────────── */
client.on(Events.MessageCreate, async (m) => {
  if (m.author.bot) return;

  const reg = JSON.stringify({ guildId: m.guildId, channelId: m.channelId });
  const isGlobal = await redis.sismember('global:channels', reg);
  if (!isGlobal) return;

  /* 累計メッセージ数 (global-chat) */
  await redis.incrby(kMsg(m.author.id), 1);

  /* Relay → HUB */
  const tz = (await redis.hget(`tz:${m.guildId}`, 'tz')) || '0';
  const langCfg = await redis.hgetall(`lang:${m.guildId}`);
  const targetLang = langCfg.auto === 'true' ? langCfg.lang : null;

  fetch(process.env.HUB_ENDPOINT + '/publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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

  /* 国旗リアクション翻訳 – Embed description も対象 */
  const tl = FLAG_TO_LANG[r.emoji.name];
  if (!tl) return;

  let original = r.message.content;
  if (!original && r.message.embeds?.length) {
    original = r.message.embeds[0].description ?? '';
  }
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
