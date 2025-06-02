/**
 * index.js – Global Chat Bot (2025-06 修正版)
 *
 * 変更点
 * ────────────────────────────────────────────────────────────
 * • /help は「地域 → 言語」の 2 段階セレクトメニュー
 * • 25 件上限を超えないよう言語を地域ごとに分割
 * • すべてのコンポーネント応答は reply → update で統一
 * • interaction.reply には flags: MessageFlags.Ephemeral を使用
 * • interaction.editReply を用いていた箇所を interaction.update に置換
 * • 3 秒ルールを満たすよう処理を軽量化（必要なら deferReply を挟む）
 * ────────────────────────────────────────────────────────────
 */

import 'dotenv/config';
import {
  Client,
  IntentsBitField,
  Events,
  PermissionFlagsBits,
  MessageFlags,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder
} from 'discord.js';
import express from 'express';
import bodyParser from 'body-parser';
import { randomUUID } from 'crypto';
import { Redis } from '@upstash/redis';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FLAG_TO_LANG } from './constants.js';

/* ───────────────────────────────────────────────
   環境変数チェック
─────────────────────────────────────────────── */
for (const k of [
  'DISCORD_TOKEN',
  'OWNER_ID',
  'HUB_ENDPOINT',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN'
]) {
  if (!process.env[k]) {
    console.error(`❌ missing ${k}`);
    process.exit(1);
  }
}

/* ───────────────────────────────────────────────
   Redis 初期化
─────────────────────────────────────────────── */
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN
});

/* ───────────────────────────────────────────────
   Discord Client 初期化
─────────────────────────────────────────────── */
const client = new Client({
  intents: [
    IntentsBitField.Flags.Guilds,
    IntentsBitField.Flags.GuildMessages,
    IntentsBitField.Flags.MessageContent,
    IntentsBitField.Flags.GuildMessageReactions
  ]
});

/* ───────────────────────────────────────────────
   ヘルパー
─────────────────────────────────────────────── */
const kMsg = (id) => `msg_cnt:${id}`;
const kLike = (id) => `like_cnt:${id}`;

async function translate(text, tl) {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${tl}&dt=t&q=${encodeURIComponent(
    text
  )}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Translation API ${res.status}`);
  const data = await res.json();
  return data[0].map((v) => v[0]).join('');
}

/* ───────────────────────────────────────────────
   /setup
─────────────────────────────────────────────── */
async function handleSetup(inter) {
  if (!inter.member.permissions.has(PermissionFlagsBits.Administrator))
    return inter.reply({
      content: '❌ You need Administrator permission.',
      flags: MessageFlags.Ephemeral
    });

  const guild = inter.guild;
  const category = await guild.channels.create({
    name: 'Global Chat',
    type: ChannelType.GuildCategory
  });

  const botAnnouncements = await guild.channels.create({
    name: 'bot-announcements',
    type: ChannelType.GuildText,
    parent: category.id
  });
  const globalChat = await guild.channels.create({
    name: 'global-chat',
    type: ChannelType.GuildText,
    parent: category.id
  });
  const settings = await guild.channels.create({
    name: 'settings',
    type: ChannelType.GuildText,
    parent: category.id
  });

  const regKey = JSON.stringify({ guildId: guild.id, channelId: globalChat.id });
  await redis.sadd('global:channels', regKey);

  try {
    await fetch(`${process.env.HUB_ENDPOINT}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guildId: guild.id, channelId: globalChat.id })
    });
  } catch (e) {
    console.error('HUB register', e);
  }

  return inter.reply({
    content: '✅ Global Chat setup complete!',
    flags: MessageFlags.Ephemeral
  });
}

/* ───────────────────────────────────────────────
   /profile
─────────────────────────────────────────────── */
async function handleProfile(inter) {
  const uid = inter.user.id;
  const msgCount = (await redis.get(kMsg(uid))) || '0';
  const likeCount = (await redis.get(kLike(uid))) || '0';

  return inter.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle(`📊 ${inter.user.tag}`)
        .addFields(
          { name: 'Messages Sent', value: `${msgCount}`, inline: true },
          { name: 'Likes Received', value: `${likeCount}`, inline: true }
        )
    ],
    flags: MessageFlags.Ephemeral
  });
}

/* ───────────────────────────────────────────────
   /ranking
─────────────────────────────────────────────── */
async function handleRanking(inter) {
  const mode = inter.options.getSubcommand(); // messages | likes
  const pattern = mode === 'messages' ? 'msg_cnt:*' : 'like_cnt:*';

  const keys = await redis.keys(pattern);
  const arr = [];
  for (const k of keys) {
    const id = k.split(':')[1];
    const v = parseInt(await redis.get(k), 10) || 0;
    arr.push({ id, v });
  }
  arr.sort((a, b) => b.v - a.v).splice(10);

  const lines = await Promise.all(
    arr.map(async (r, i) => {
      try {
        const u = await client.users.fetch(r.id);
        return `**#${i + 1}** ${u.tag} – ${r.v}`;
      } catch {
        return `**#${i + 1}** (unknown) – ${r.v}`;
      }
    })
  );

  return inter.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle(`🏆 Top 10 by ${mode}`)
        .setDescription(lines.join('\n') || 'No data')
    ],
    flags: MessageFlags.Ephemeral
  });
}

/* ───────────────────────────────────────────────
   InteractionCreate
─────────────────────────────────────────────── */
client.on(Events.InteractionCreate, async (i) => {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  /* ----- A) /help 1st step: region select ------------------- */
  if (i.isChatInputCommand() && i.commandName === 'help') {
    const regions = [
      { label: 'アジア', value: 'asia', emoji: '🌏' },
      { label: 'ヨーロッパ', value: 'europe', emoji: '🌍' },
      { label: '北アメリカ', value: 'north_america', emoji: '🌎' },
      { label: '中東・アフリカ', value: 'middle_east_africa', emoji: '🕊️' },
      { label: '南アメリカ', value: 'south_america', emoji: '🌎' },
      { label: 'オセアニア', value: 'oceania', emoji: '🌏' }
    ];
    const selectRegion = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('help_region')
        .setPlaceholder('まずは地域を選択')
        .addOptions(regions)
    );
    await i.reply({
      content: '🔎 ヘルプを表示する「地域」を選択してください。',
      components: [selectRegion],
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  /* ----- B) /help 2nd step: language select ----------------- */
  if (i.isStringSelectMenu() && i.customId === 'help_region') {
    const region = i.values[0];
    let langs = [];
    switch (region) {
      case 'asia':
        langs = [
          { label: '日本語', value: 'ja', emoji: '🇯🇵' },
          { label: '中文 (简体)', value: 'zh', emoji: '🇨🇳' },
          { label: '中文 (繁體)', value: 'zh-TW', emoji: '🇹🇼' },
          { label: '한국어', value: 'ko', emoji: '🇰🇷' },
          { label: 'हिन्दी', value: 'hi', emoji: '🇮🇳' },
          { label: 'বাংলা', value: 'bn', emoji: '🇧🇩' },
          { label: 'ไทย', value: 'th', emoji: '🇹🇭' },
          { label: 'Tiếng Việt', value: 'vi', emoji: '🇻🇳' },
          { label: 'Bahasa Melayu', value: 'ms', emoji: '🇲🇾' },
          { label: 'Bahasa Indonesia', value: 'id', emoji: '🇮🇩' }
        ];
        break;
      case 'europe':
        langs = [
          { label: 'English (US)', value: 'en', emoji: '🇺🇸' },
          { label: 'English (UK)', value: 'en-GB', emoji: '🇬🇧' },
          { label: 'Español (ES)', value: 'es', emoji: '🇪🇸' },
          { label: 'Español (CO)', value: 'es-CO', emoji: '🇨🇴' },
          { label: 'Español (MX)', value: 'es-MX', emoji: '🇲🇽' },
          { label: 'Français', value: 'fr', emoji: '🇫🇷' },
          { label: 'Deutsch', value: 'de', emoji: '🇩🇪' },
          { label: 'Русский', value: 'ru', emoji: '🇷🇺' },
          { label: 'Українська', value: 'uk', emoji: '🇺🇦' },
          { label: 'ελληνικά', value: 'el', emoji: '🇬🇷' },
          { label: 'العربية', value: 'ar', emoji: '🇸🇦' }
        ];
        break;
      case 'north_america':
        langs = [
          { label: 'English (US)', value: 'en', emoji: '🇺🇸' },
          { label: 'Español (MX)', value: 'es-MX', emoji: '🇲🇽' },
          { label: 'Français', value: 'fr', emoji: '🇨🇦' }
        ];
        break;
      case 'middle_east_africa':
        langs = [
          { label: 'العربية', value: 'ar', emoji: '🇸🇦' },
          { label: 'فارسی', value: 'fa', emoji: '🇮🇷' },
          { label: 'Türkçe', value: 'tr', emoji: '🇹🇷' }
        ];
        break;
      case 'south_america':
        langs = [
          { label: 'Español (CO)', value: 'es-CO', emoji: '🇨🇴' },
          { label: 'Español (AR)', value: 'es-AR', emoji: '🇦🇷' },
          { label: 'Português (BR)', value: 'pt-BR', emoji: '🇧🇷' }
        ];
        break;
      case 'oceania':
        langs = [
          { label: 'English (AU)', value: 'en-AU', emoji: '🇦🇺' },
          { label: 'English (NZ)', value: 'en-NZ', emoji: '🇳🇿' }
        ];
        break;
      default:
        langs = [
          { label: 'English', value: 'en', emoji: '🇺🇸' },
          { label: '日本語', value: 'ja', emoji: '🇯🇵' }
        ];
    }

    const selectLang = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('help_lang')
        .setPlaceholder('言語を選択')
        .addOptions(langs)
    );

    await i.update({
      content: '📖 続いて、ヘルプを表示する言語を選択してください。',
      components: [selectLang]
    });
    return;
  }

  /* ----- C) /help final: show help text --------------------- */
  if (i.isStringSelectMenu() && i.customId === 'help_lang') {
    const { HELP_TEXTS } = await import(path.join(path.dirname(fileURLToPath(import.meta.url)), 'commands', 'help.js'));
    const lang = i.values[0];
    const help = HELP_TEXTS[lang] || HELP_TEXTS['en'];

    const embed = new EmbedBuilder()
      .setTitle('Global Chat Bot Help')
      .setDescription(help)
      .setColor('#00AAFF');

    await i.update({
      content: null,
      embeds: [embed],
      components: []
    });
    return;
  }

  /* ----- D) 他コマンド処理 --------------------------------- */
  if (i.isChatInputCommand()) {
    switch (i.commandName) {
      case 'setup':
        return handleSetup(i);
      case 'profile':
        return handleProfile(i);
      case 'ranking':
        return handleRanking(i);
    }
  }
});

/* ───────────────────────────────────────────────
   MessageCreate: メッセージ数 + HUB リレー
─────────────────────────────────────────────── */
client.on(Events.MessageCreate, async (m) => {
  if (m.author.bot) return;
  await redis.incrby(kMsg(m.author.id), 1);

  const regKey = JSON.stringify({ guildId: m.guildId, channelId: m.channelId });
  if (!(await redis.sismember('global:channels', regKey))) return;

  const tz = (await redis.hget(`tz:${m.guildId}`, 'tz')) || '0';
  const langCfg = await redis.hgetall(`lang:${m.guildId}`);
  const targetLang = langCfg?.auto === 'true' ? langCfg.lang : null;

  try {
    await fetch(`${process.env.HUB_ENDPOINT}/publish`, {
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
    });
  } catch (e) {
    console.error('publish', e);
  }
});

/* ───────────────────────────────────────────────
   MessageReactionAdd: 👍 & 国旗翻訳
─────────────────────────────────────────────── */
client.on(Events.MessageReactionAdd, async (r, user) => {
  if (user.bot) return;

  /* 👍 like カウント */
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
  if (!r.message.content) return;

  try {
    const translated = await translate(r.message.content, tl);
    await r.message.reply({
      embeds: [
        {
          description: `> ${r.message.content}\n\n**${translated}**`,
          footer: { text: `🌐 translated to ${tl}` }
        }
      ]
    });
  } catch {/* ignore */}
});

/* ───────────────────────────────────────────────
   Express: HUB /relay
─────────────────────────────────────────────── */
const app = express();
app.use(bodyParser.json());

app.post('/relay', async (req, res) => {
  try {
    const m = req.body;
    const guild = client.guilds.cache.get(m.guildId);
    if (!guild) return res.sendStatus(404);
    const ch = guild.channels.cache.get(m.channelId);
    if (!ch) return res.sendStatus(404);

    const tz = (await redis.hget(`tz:${m.guildId}`, 'tz')) || '0';
    const embed = {
      author: { name: `${m.userTag} [${m.originGuild} UTC${tz}]`, icon_url: m.userAvatar },
      description: m.content,
      footer: { text: `UID:${m.userId} 🌐 global chat${m.targetLang ? ' • auto-translated' : ''}` },
      timestamp: new Date(m.sentAt).toISOString()
    };
    const files = m.files?.map((f) => f.attachment) || [];
    const sent = await ch.send({ embeds: [embed], files });
    await sent.react('👍');
    res.send({ status: 'ok' });
  } catch (e) {
    console.error('relay', e);
    res.sendStatus(500);
  }
});

app.get('/healthz', (_, res) => res.send('OK'));
app.listen(process.env.PORT || 3000, () => console.log('🚦 relay on', process.env.PORT || 3000));

/* ───────────────────────────────────────────────
   Discord login
─────────────────────────────────────────────── */
client.login(process.env.DISCORD_TOKEN).then(() => console.log('✅ Logged in'));
