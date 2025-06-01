/**
 * index.js – Global Chat Bot (Jun-2025 完全版)
 * ・ポイント機能を廃止し、残すコマンドは /setup, /profile, /ranking のみ
 * ・global-chat のリレー、翻訳、いいねカウントはそのまま動作
 */

import 'dotenv/config';
import {
  Client,
  IntentsBitField,
  Events,
  PermissionFlagsBits,
  MessageFlags,
  ChannelType
} from 'discord.js';
import express from 'express';
import bodyParser from 'body-parser';
import { randomUUID } from 'crypto';
import { Redis } from '@upstash/redis';
import { FLAG_TO_LANG } from './constants.js';
import { translate } from './translate.js'; // 翻訳関数の実装を別ファイルに置いている前提

/* ---------- 必須環境変数チェック ---------- */
[
  'DISCORD_TOKEN',
  'OWNER_ID',
  'HUB_ENDPOINT',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN'
].forEach((k) => {
  if (!process.env[k]) {
    console.error(`❌ missing ${k}`);
    process.exit(1);
  }
});

/* ---------- Redis クライアント初期化 ---------- */
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN
});

/* ---------- Discord クライアント初期化 ---------- */
const client = new Client({
  intents: [
    IntentsBitField.Flags.Guilds,
    IntentsBitField.Flags.GuildMessages,
    IntentsBitField.Flags.MessageContent,
    IntentsBitField.Flags.GuildMessageReactions
  ]
});

/* ---------- キー作成ヘルパー ---------- */
const kMsg = (id) => `msg_cnt:${id}`;
const kLike = (id) => `like_cnt:${id}`;

/* ---------------- /setup ハンドラ ------------------------------------------- */
async function handleSetup(interaction) {
  // 管理者権限チェック
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({
      content: '❌ You need Administrator permission to run this command.',
      flags: MessageFlags.Ephemeral
    });
  }

  const guild = interaction.guild;
  // 1. Global Chat カテゴリを作成
  const category = await guild.channels.create({
    name: 'Global Chat',
    type: ChannelType.GuildCategory
  });

  // 2. テキストチャンネル３つを作成し、カテゴリ配下に配置
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

  // 3. global-chat を Redis の 'global:channels' セットに登録（HUB に転送するため）
  const regKey = JSON.stringify({ guildId: guild.id, channelId: globalChat.id });
  await redis.sadd('global:channels', regKey);

  // 4. 中央 HUB に登録リクエスト送信
  try {
    await fetch(`${process.env.HUB_ENDPOINT}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        guildId: guild.id,
        channelId: globalChat.id
      })
    });
  } catch (e) {
    console.error('HUB registration failed:', e);
  }

  return interaction.reply({
    content: '✅ Global Chat setup complete!',
    flags: MessageFlags.Ephemeral
  });
}

/* ---------------- /profile ハンドラ ----------------------------------------- */
async function handleProfile(interaction) {
  const userId = interaction.user.id;
  const msgCount = (await redis.get(kMsg(userId))) || '0';
  const likeCount = (await redis.get(kLike(userId))) || '0';

  return interaction.reply({
    embeds: [
      {
        title: `📊 ${interaction.user.tag}`,
        fields: [
          { name: 'Messages Sent', value: `${msgCount}`, inline: true },
          { name: 'Likes Received', value: `${likeCount}`, inline: true }
        ]
      }
    ],
    flags: MessageFlags.Ephemeral
  });
}

/* ---------------- /ranking ハンドラ ---------------------------------------- */
async function handleRanking(interaction) {
  const mode = interaction.options.getSubcommand(); // 'messages' か 'likes'
  const pattern = mode === 'messages' ? 'msg_cnt:*' : 'like_cnt:*';

  // Redis のキー一覧を取得し、ユーザーごとの値を収集
  const keys = await redis.keys(pattern);
  const arr = [];
  for (const key of keys) {
    const userId = key.split(':')[1];
    const value = parseInt(await redis.get(key), 10) || 0;
    arr.push({ id: userId, v: value });
  }
  // 降順ソートしてトップ10を抽出
  arr.sort((a, b) => b.v - a.v);
  arr.splice(10);

  // Discord ユーザー情報を取得して表示用に整形
  const lines = await Promise.all(
    arr.map(async (r, idx) => {
      try {
        const u = await client.users.fetch(r.id);
        return `**#${idx + 1}** ${u.tag} – ${r.v}`;
      } catch {
        return `**#${idx + 1}** Unknown – ${r.v}`;
      }
    })
  );

  return interaction.reply({
    embeds: [
      {
        title: `🏆 Top 10 by ${mode}`,
        description: lines.join('\n') || 'No data'
      }
    ],
    flags: MessageFlags.Ephemeral
  });
}

/* ---------------- InteractionCreate: コマンド振り分け ------------------------ */
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  switch (interaction.commandName) {
    case 'setup':
      return handleSetup(interaction);

    case 'profile':
      return handleProfile(interaction);

    case 'ranking':
      return handleRanking(interaction);

    // ポイント機能関連の /announce, /additem, /approve, /reject, /shop, /buy はすべて廃止済
  }
});

/* ---------------- MessageCreate: メッセージ数カウント & HUB publish --------- */
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  // ─── 累計メッセージ数をインクリメント ───
  await redis.incrby(kMsg(message.author.id), 1);

  // HUB に登録済みチャンネルのみリレー処理
  const regKey = JSON.stringify({ guildId: message.guildId, channelId: message.channelId });
  if (!(await redis.sismember('global:channels', regKey))) return;

  const tz = (await redis.hget(`tz:${message.guildId}`, 'tz')) || '0';
  const langCfg = await redis.hgetall(`lang:${message.guildId}`);
  const targetLang = langCfg?.auto === 'true' ? langCfg.lang : null;

  try {
    await fetch(`${process.env.HUB_ENDPOINT}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        globalId: randomUUID(),
        guildId: message.guildId,
        channelId: message.channelId,
        userTag: message.author.tag,
        userAvatar: message.author.displayAvatarURL(),
        originGuild: message.guild.name,
        originTz: tz,
        content: message.content,
        sentAt: Date.now(),
        files: message.attachments.map((a) => ({ attachment: a.url, name: a.name })),
        targetLang,
        userId: message.author.id // 埋め込みに利用するため、元ユーザーIDを渡す
      })
    });
  } catch (e) {
    console.error('relay', e);
  }
});

/* ---------------- MessageReactionAdd: 👍 カウント & 翻訳機能 -------------------- */
client.on(Events.MessageReactionAdd, async (reaction, user) => {
  if (user.bot) return;

  const emoji = reaction.emoji.name;

  // ─── 👍 をカウント ───
  if (emoji === '👍' && reaction.message.author?.id === client.user.id) {
    const setKey = `like_set:${reaction.message.id}`;
    if (await redis.sismember(setKey, user.id)) return;
    if ((await redis.scard(setKey)) >= 5) {
      reaction.users.remove(user.id).catch(() => {});
      return;
    }
    await redis.sadd(setKey, user.id);
    await redis.expire(setKey, 604800);

    // Embed の footer に埋め込んだ「UID:<元ユーザーID>」を正規表現で抽出してカウント
    const footerText = reaction.message.embeds[0]?.footer?.text || '';
    const match = footerText.match(/UID:([0-9]+)/);
    if (match) {
      const originalId = match[1];
      await redis.incrby(kLike(originalId), 1);
    }
    return;
  }

  // ─── 国旗リアクション翻訳 ───
  const targetLang = FLAG_TO_LANG[emoji];
  if (!targetLang) return;
  const originalText = reaction.message.content;
  if (!originalText) return;

  try {
    const translated = await translate(originalText, targetLang);
    await reaction.message.reply({
      embeds: [
        {
          description: `> ${originalText}\n\n**${translated}**`,
          footer: { text: `🌐 translated to ${targetLang}` }
        }
      ]
    });
  } catch {
    // 翻訳エラーは黙って無視
  }
});

/* ---------- express：外部 HUB との通信 (そのまま変更不要) ---------- */
const app = express();
app.use(bodyParser.json());
app.post('/relay', async (req, res) => {
  try {
    const m = req.body;
    const ch = await client.guilds.cache
      .get(m.guildId)
      .channels.cache.get(m.channelId);
    if (!ch) {
      return res.sendStatus(404);
    }

    // Relay されたメッセージを埋め込みで送信
    const tz = (await redis.hget(`tz:${m.guildId}`, 'tz')) || '0';
    const embed = {
      author: {
        name: `${m.userTag} [${m.originGuild} UTC${tz}]`,
        icon_url: m.userAvatar
      },
      description: m.content,
      footer: { text: `UID:${m.userId} 🌐 global chat${m.targetLang ? ' • auto-translated' : ''}` },
      timestamp: new Date(m.sentAt).toISOString()
    };
    const files = m.files?.length ? m.files.map((f) => f.attachment) : [];

    const sent = await ch.send({ embeds: [embed], files });
    await sent.react('👍');
    res.send({ status: 'ok' });
  } catch (e) {
    console.error('relay', e);
    res.sendStatus(500);
  }
});
app.get('/healthz', (_, res) => res.send('OK'));
app.listen(process.env.PORT || 3000, () =>
  console.log('🚦 relay on', process.env.PORT || 3000)
);

/* ---------------- Discord ログイン ------------------------------------------------ */
client
  .login(process.env.DISCORD_TOKEN)
  .then(() => console.log('✅ Logged in'))
  .catch((e) => console.error('login', e));
