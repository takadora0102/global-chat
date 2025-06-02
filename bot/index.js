/**
 * index.js – Global Chat Bot (2025-06 修正版)
 *
 * 変更点
 * ────────────────────────────────────────────────────────────
 * • /help は「地域 → 言語」の 2 段階セレクトメニュー（返信は即時 reply）
 * • /setup, /profile, /ranking は最初に deferReply() を行い、重い処理後に editReply()
 * • 25 件上限を超えないよう言語を地域ごとに分割
 * • interaction.reply には flags: MessageFlags.Ephemeral を使用
 * • コンポーネント応答は update() を使用
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
   ヘルパー関数
─────────────────────────────────────────────── */
const kMsg = (id) => `msg_cnt:${id}`;
const kLike = (id) => `like_cnt:${id}`;

async function translate(text, tl) {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${tl}&dt=t&q=${encodeURIComponent(
    text
  )}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Translation API error: ${res.status}`);
  const data = await res.json();
  return data[0].map((v) => v[0]).join('');
}

/* ───────────────────────────────────────────────
   /setup ハンドラ
─────────────────────────────────────────────── */
async function handleSetup(interaction) {
  // 3秒以内に最初の応答を返す
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.editReply({
      content: '❌ You need Administrator permission.',
      embeds: [],
      components: []
    });
  }

  const guild = interaction.guild;
  // 1. Global Chat カテゴリを作成
  const category = await guild.channels.create({
    name: 'Global Chat',
    type: ChannelType.GuildCategory
  });

  // 2. テキストチャンネル 3 つを作成
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

  // 3. Redis セットに追加
  const regKey = JSON.stringify({ guildId: guild.id, channelId: globalChat.id });
  await redis.sadd('global:channels', regKey);

  // 4. 中央 HUB に登録リクエスト
  try {
    await fetch(`${process.env.HUB_ENDPOINT}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guildId: guild.id, channelId: globalChat.id })
    });
  } catch (e) {
    console.error('HUB register failed:', e);
  }

  // 完了メッセージを editReply で送信
  return interaction.editReply({
    content: '✅ Global Chat setup complete!',
    embeds: [],
    components: []
  });
}

/* ───────────────────────────────────────────────
   /profile ハンドラ
─────────────────────────────────────────────── */
async function handleProfile(interaction) {
  // 3秒以内に最初の応答を返す
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const userId = interaction.user.id;
  const msgCount = (await redis.get(kMsg(userId))) || '0';
  const likeCount = (await redis.get(kLike(userId))) || '0';

  return interaction.editReply({
    content: null,
    embeds: [
      new EmbedBuilder()
        .setTitle(`📊 ${interaction.user.tag}`)
        .addFields(
          { name: 'Messages Sent', value: `${msgCount}`, inline: true },
          { name: 'Likes Received', value: `${likeCount}`, inline: true }
        )
    ],
    components: []
  });
}

/* ───────────────────────────────────────────────
   /ranking ハンドラ
─────────────────────────────────────────────── */
async function handleRanking(interaction) {
  // 3秒以内に最初の応答を返す
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const mode = interaction.options.getSubcommand(); // 'messages' or 'likes'
  const pattern = mode === 'messages' ? 'msg_cnt:*' : 'like_cnt:*';

  // Redis のキー一覧を取得し、ユーザーごとの値を集計
  const keys = await redis.keys(pattern);
  const arr = [];
  for (const k of keys) {
    const uid = k.split(':')[1];
    const val = parseInt(await redis.get(k), 10) || 0;
    arr.push({ id: uid, v: val });
  }
  arr.sort((a, b) => b.v - a.v).splice(10);

  const lines = await Promise.all(
    arr.map(async (r, idx) => {
      try {
        const u = await client.users.fetch(r.id);
        return `**#${idx + 1}** ${u.tag} – ${r.v}`;
      } catch {
        return `**#${idx + 1}** (unknown) – ${r.v}`;
      }
    })
  );

  return interaction.editReply({
    content: null,
    embeds: [
      new EmbedBuilder()
        .setTitle(`🏆 Top 10 by ${mode}`)
        .setDescription(lines.join('\n') || 'No data')
    ],
    components: []
  });
}

/* ───────────────────────────────────────────────
   InteractionCreate
─────────────────────────────────────────────── */
client.on(Events.InteractionCreate, async (i) => {
  // このファイルの __dirname を取得
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  /* ----- A) /help 1st step: region select --------------------- */
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
        .setPlaceholder('まずは地域を選択してください')
        .addOptions(
          regions.map((r) => ({
            label: r.label,
            value: r.value,
            emoji: r.emoji
          }))
        )
    );

    // 軽量処理なので直接 reply()
    await i.reply({
      content: '🔎 ヘルプを表示したい「地域」を選択してください。',
      components: [selectRegion],
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  /* ----- B) /help 2nd step: language select ------------------- */
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
        break;
    }

    const selectLang = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('help_lang')
        .setPlaceholder('言語を選択してください')
        .addOptions(langs)
    );

    // 「言語選択」に差し替え
    await i.update({
      content: '📖 続いて、ヘルプを表示する言語を選択してください。',
      components: [selectLang]
    });
    return;
  }

  /* ----- C) /help final: show help text ---------------------- */
  if (i.isStringSelectMenu() && i.customId === 'help_lang') {
    const { HELP_TEXTS } = await import(
      path.join(path.dirname(fileURLToPath(import.meta.url)), 'commands', 'help.js')
    );
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

  /* ----- D) /setup, /profile, /ranking など他コマンド処理 ------- */
  if (i.isChatInputCommand()) {
    switch (i.commandName) {
      case 'setup':
        return handleSetup(i);
      case 'profile':
        return handleProfile(i);
      case 'ranking':
        return handleRanking(i);
      // もし later add another command, handle here
    }
  }
});

/* ───────────────────────────────────────────────
   MessageCreate: メッセージ数＋HUB リレー
─────────────────────────────────────────────── */
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  // 累計メッセージ数をインクリメント
  await redis.incrby(kMsg(message.author.id), 1);

  // グローバルチャット登録済みかチェック
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
    console.error('relay publish error:', e);
  }
});

/* ───────────────────────────────────────────────
   MessageReactionAdd: 👍 カウント＆国旗翻訳
─────────────────────────────────────────────── */
client.on(Events.MessageReactionAdd, async (reaction, user) => {
  if (user.bot) return;

  // 👍 like カウント
  if (reaction.emoji.name === '👍' && reaction.message.author?.id === client.user.id) {
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
      await redis.incrby(kLike(match[1]), 1);
    }
    return;
  }

  // 国旗リアクション翻訳
  const targetLang = FLAG_TO_LANG[reaction.emoji.name];
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

/* ───────────────────────────────────────────────
   Express: HUB /relay エンドポイント
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
    console.error('relay endpoint error:', e);
    res.sendStatus(500);
  }
});

app.get('/healthz', (_, res) => res.send('OK'));
app.listen(process.env.PORT || 3000, () =>
  console.log('🚦 relay on', process.env.PORT || 3000)
);

/* ───────────────────────────────────────────────
   Discord ログイン
─────────────────────────────────────────────── */
client
  .login(process.env.DISCORD_TOKEN)
  .then(() => console.log('✅ Logged in'))
  .catch((e) => console.error('login error:', e));
