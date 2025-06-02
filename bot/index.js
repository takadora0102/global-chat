/**
 * index.js – Global Chat Bot (Jun-2025 完全版)
 *
 * ・ポイント機能を廃止し、/help は地域別の 2 段階セレクトメニューで実装
 * ・/setup, /profile, /ranking など既存コマンドの処理もそのまま保持
 * ・メッセージリレー、翻訳、いいねカウント機能を含む
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

//
// ────────────────────────────────────────────────────────────────
//  環境変数チェック
// ────────────────────────────────────────────────────────────────
const requiredEnv = [
  'DISCORD_TOKEN',
  'OWNER_ID',
  'HUB_ENDPOINT',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN'
];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.error(`❌ missing ${key}`);
    process.exit(1);
  }
}

//
// ────────────────────────────────────────────────────────────────
//  Redis 初期化 (Upstash Redis)
// ────────────────────────────────────────────────────────────────
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN
});

//
// ────────────────────────────────────────────────────────────────
//  Discord Client 初期化
// ────────────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    IntentsBitField.Flags.Guilds,
    IntentsBitField.Flags.GuildMessages,
    IntentsBitField.Flags.MessageContent,
    IntentsBitField.Flags.GuildMessageReactions
  ]
});

//
// ────────────────────────────────────────────────────────────────
//  キー作成ヘルパー
// ────────────────────────────────────────────────────────────────
const kMsg = (id) => `msg_cnt:${id}`;
const kLike = (id) => `like_cnt:${id}`;

//
// ────────────────────────────────────────────────────────────────
//  翻訳ヘルパー
// ────────────────────────────────────────────────────────────────
async function translate(text, tl) {
  // Google 翻訳の非公式 API を利用
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${tl}&dt=t&q=${encodeURIComponent(
    text
  )}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Translation API error: ${res.status}`);
  const data = await res.json();
  return data[0].map((v) => v[0]).join('');
}

//
// ────────────────────────────────────────────────────────────────
//  /setup ハンドラ
// ────────────────────────────────────────────────────────────────
async function handleSetup(interaction) {
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

  // 2. テキストチャンネル 3つを作成し、カテゴリ配下に配置
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

  // 3. global-chat を Redis のセットに登録
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

//
// ────────────────────────────────────────────────────────────────
//  /profile ハンドラ
// ────────────────────────────────────────────────────────────────
async function handleProfile(interaction) {
  const userId = interaction.user.id;
  const msgCount = (await redis.get(kMsg(userId))) || '0';
  const likeCount = (await redis.get(kLike(userId))) || '0';

  return interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle(`📊 ${interaction.user.tag}`)
        .addFields(
          { name: 'Messages Sent', value: `${msgCount}`, inline: true },
          { name: 'Likes Received', value: `${likeCount}`, inline: true }
        )
    ],
    flags: MessageFlags.Ephemeral
  });
}

//
// ────────────────────────────────────────────────────────────────
//  /ranking ハンドラ
// ────────────────────────────────────────────────────────────────
async function handleRanking(interaction) {
  const mode = interaction.options.getSubcommand(); // 'messages' or 'likes'
  const pattern = mode === 'messages' ? 'msg_cnt:*' : 'like_cnt:*';

  // Redis のキー一覧を取得し、ユーザーごとの値を集計
  const keys = await redis.keys(pattern);
  const arr = [];
  for (const key of keys) {
    const userId = key.split(':')[1];
    const value = parseInt(await redis.get(key), 10) || 0;
    arr.push({ id: userId, v: value });
  }
  arr.sort((a, b) => b.v - a.v);
  arr.splice(10);

  // Discord ユーザー情報を取得して表示文を作成
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
      new EmbedBuilder()
        .setTitle(`🏆 Top 10 by ${mode}`)
        .setDescription(lines.join('\n') || 'No data')
    ],
    flags: MessageFlags.Ephemeral
  });
}

//
// ────────────────────────────────────────────────────────────────
//  InteractionCreate イベントハンドラ
// ────────────────────────────────────────────────────────────────
client.on(Events.InteractionCreate, async (interaction) => {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  // A) /help コマンド：リージョン選択メニューを返す
  if (interaction.isChatInputCommand() && interaction.commandName === 'help') {
    const regions = [
      { label: 'アジア',           value: 'asia',              emoji: '🌏' },
      { label: 'ヨーロッパ',       value: 'europe',            emoji: '🌍' },
      { label: '北アメリカ',       value: 'north_america',     emoji: '🌎' },
      { label: '中東・アフリカ',    value: 'middle_east_africa',emoji: '🕊️' },
      { label: '南アメリカ',       value: 'south_america',     emoji: '🌎' },
      { label: 'オセアニア',       value: 'oceania',           emoji: '🌏' }
    ];

    const selectRegion = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('select_help_region')
        .setPlaceholder('まずは地域を選択してください')
        .addOptions(
          regions.map((r) => ({
            label: r.label,
            value: r.value,
            emoji: r.emoji
          }))
        )
    );

    await interaction.reply({
      content: '🔎 ヘルプを表示したい言語の「地域」を選択してください。',
      components: [selectRegion],
      ephemeral: true
    });
    return;
  }

  // B) リージョン選択後：その地域に属する言語選択メニューを返す
  if (
    interaction.isStringSelectMenu() &&
    interaction.customId === 'select_help_region'
  ) {
    const chosenRegion = interaction.values[0];
    let languages = [];

    switch (chosenRegion) {
      case 'asia':
        languages = [
          { label: '日本語',            value: 'ja',     emoji: '🇯🇵' },
          { label: '中文 (简体)',         value: 'zh',     emoji: '🇨🇳' },
          { label: '中文 (繁體)',        value: 'zh-TW',  emoji: '🇹🇼' },
          { label: '한국어',           value: 'ko',     emoji: '🇰🇷' },
          { label: 'हिन्दी',          value: 'hi',     emoji: '🇮🇳' },
          { label: 'বাংলা',          value: 'bn',     emoji: '🇧🇩' },
          { label: 'ไทย',            value: 'th',     emoji: '🇹🇭' },
          { label: 'Tiếng Việt',      value: 'vi',     emoji: '🇻🇳' },
          { label: 'Bahasa Melayu',    value: 'ms',     emoji: '🇲🇾' },
          { label: 'Bahasa Indonesia', value: 'id',     emoji: '🇮🇩' }
        ];
        break;

      case 'europe':
        languages = [
          { label: 'English (US)',     value: 'en',    emoji: '🇺🇸' },
          { label: 'English (UK)',     value: 'en-GB', emoji: '🇬🇧' },
          { label: 'Español (ES)',    value: 'es',    emoji: '🇪🇸' },
          { label: 'Español (CO)',    value: 'es-CO', emoji: '🇨🇴' },
          { label: 'Español (MX)',    value: 'es-MX', emoji: '🇲🇽' },
          { label: 'Français',        value: 'fr',    emoji: '🇫🇷' },
          { label: 'Deutsch',         value: 'de',    emoji: '🇩🇪' },
          { label: 'Русский',          value: 'ru',    emoji: '🇷🇺' },
          { label: 'Українська',       value: 'uk',    emoji: '🇺🇦' },
          { label: 'ελληνικά',         value: 'el',    emoji: '🇬🇷' },
          { label: 'العربية',         value: 'ar',    emoji: '🇸🇦' }
        ];
        break;

      case 'north_america':
        languages = [
          { label: 'English (US)',     value: 'en',     emoji: '🇺🇸' },
          { label: 'Español (MX)',    value: 'es-MX',  emoji: '🇲🇽' },
          { label: 'Français',        value: 'fr',     emoji: '🇨🇦' }
        ];
        break;

      case 'middle_east_africa':
        languages = [
          { label: 'العربية',         value: 'ar',     emoji: '🇸🇦' },
          { label: 'فارسی',           value: 'fa',     emoji: '🇮🇷' },
          { label: 'Türkçe',          value: 'tr',     emoji: '🇹🇷' }
          // 必要に応じて他の言語を追加（合計 25 個以下に）
        ];
        break;

      case 'south_america':
        languages = [
          { label: 'Español (CO)',    value: 'es-CO', emoji: '🇨🇴' },
          { label: 'Español (AR)',    value: 'es-AR', emoji: '🇦🇷' },
          { label: 'Português (BR)',  value: 'pt-BR', emoji: '🇧🇷' }
        ];
        break;

      case 'oceania':
        languages = [
          { label: 'English (AU)',    value: 'en-AU', emoji: '🇦🇺' },
          { label: 'English (NZ)',    value: 'en-NZ', emoji: '🇳🇿' }
        ];
        break;

      default:
        languages = [
          { label: 'English (US)',    value: 'en',    emoji: '🇺🇸' },
          { label: '日本語',           value: 'ja',    emoji: '🇯🇵' }
        ];
        break;
    }

    const selectLanguages = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('select_help_language')
        .setPlaceholder('言語を選択してください')
        .addOptions(
          languages.map((l) => ({
            label: l.label,
            value: l.value,
            emoji: l.emoji
          }))
        )
    );

    await interaction.update({
      content: '📖 続いて、言語を選択してください。',
      components: [selectLanguages]
    });
    return;
  }

  // C) 言語選択後：HELP_TEXTS から該当言語の本文を返す
  if (
    interaction.isStringSelectMenu() &&
    interaction.customId === 'select_help_language'
  ) {
    const { HELP_TEXTS } = await import(
      path.join(__dirname, 'commands', 'help.js')
    );
    const selectedLang = interaction.values[0];
    const helpText = HELP_TEXTS[selectedLang] || HELP_TEXTS['en'];

    const embed = new EmbedBuilder()
      .setTitle('Global Chat Bot Help')
      .setDescription(helpText)
      .setColor('#00AAFF');

    await interaction.editReply({
      content: null,
      embeds: [embed],
      components: []
    });
    return;
  }

  // D) /setup, /profile, /ranking などの既存コマンド処理
  if (interaction.isChatInputCommand()) {
    switch (interaction.commandName) {
      case 'setup':
        return handleSetup(interaction);
      case 'profile':
        return handleProfile(interaction);
      case 'ranking':
        return handleRanking(interaction);
      // 他のコマンドがあればここに追加
    }
  }
});

//
// ────────────────────────────────────────────────────────────────
//  MessageCreate イベント：メッセージ数カウント & HUB へリレー
// ────────────────────────────────────────────────────────────────
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  // 累計メッセージ数をインクリメント
  await redis.incrby(kMsg(message.author.id), 1);

  // HUB 経由でリレーすべきチャンネルかチェック
  const regKey = JSON.stringify({
    guildId: message.guildId,
    channelId: message.channelId
  });
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
        files: message.attachments.map((a) => ({
          attachment: a.url,
          name: a.name
        })),
        targetLang,
        userId: message.author.id
      })
    });
  } catch (e) {
    console.error('relay', e);
  }
});

//
// ────────────────────────────────────────────────────────────────
//  MessageReactionAdd イベント：👍 カウント & 国旗翻訳
// ────────────────────────────────────────────────────────────────
client.on(Events.MessageReactionAdd, async (reaction, user) => {
  if (user.bot) return;

  const emoji = reaction.emoji.name;

  // ── 👍 をカウント
  if (emoji === '👍' && reaction.message.author?.id === client.user.id) {
    const setKey = `like_set:${reaction.message.id}`;
    if (await redis.sismember(setKey, user.id)) return;
    if ((await redis.scard(setKey)) >= 5) {
      reaction.users.remove(user.id).catch(() => {});
      return;
    }
    await redis.sadd(setKey, user.id);
    await redis.expire(setKey, 604800);

    const footerText = reaction.message.embeds[0]?.footer?.text || '';
    const match = footerText.match(/UID:([0-9]+)/);
    if (match) {
      const originalId = match[1];
      await redis.incrby(kLike(originalId), 1);
    }
    return;
  }

  // ── 国旗リアクション翻訳
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
    // 翻訳エラーは無視
  }
});

//
// ────────────────────────────────────────────────────────────────
//  Express: /relay エンドポイント & ヘルスチェック
// ────────────────────────────────────────────────────────────────
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

//
// ────────────────────────────────────────────────────────────────
//  Discord ログイン
// ────────────────────────────────────────────────────────────────
client
  .login(process.env.DISCORD_TOKEN)
  .then(() => console.log('✅ Logged in'))
  .catch((e) => console.error('login', e));
