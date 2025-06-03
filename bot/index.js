/**
 * index.js – Global Chat Bot (2025-06 修正版)
 *
 * 変更点
 * ────────────────────────────────────────────────────────────
 * • /help は「地域 → 言語」の 2 段階セレクトメニュー（テキスト分割で送信）
 * • /setup 実行時に settings チャンネルへ「自動翻訳／タイムゾーン設定用メッセージ」を送信
 * • 自動翻訳 → セレクトで言語を選ぶと Redis に { lang, auto: 'true' } を保存
 * • タイムゾーン → セレクトでオフセットを選ぶと Redis に { tz } を保存
 * • サポートサーバーの URL をボタンで表示（環境変数 SUPPORT_SERVER_URL）
 * • /setup, /profile, /ranking は deferReply → editReply で実装
 * • 25 件上限を超えないよう言語を 25 個以下に、タイムゾーンを 25 個以下に削減
 * • interaction.reply には flags: MessageFlags.Ephemeral を使用
 * • コンポーネント応答は update / deferUpdate / followUp 後に editReply で統一
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

/* ───────────────────────────────────────────────
   環境変数チェック
─────────────────────────────────────────────── */
for (const key of [
  'DISCORD_TOKEN',
  'OWNER_ID',
  'HUB_ENDPOINT',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'SUPPORT_SERVER_URL'
]) {
  if (!process.env[key]) {
    console.error(`❌ missing ${key}`);
    process.exit(1);
  }
}

/* ───────────────────────────────────────────────
   Redis 初期化 (Upstash)
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
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.editReply({
      content: '❌ You need Administrator permission to run `/setup`.',
      components: []
    });
  }

  const guild = interaction.guild;

  // 1) Global Chat カテゴリを作成
  const category = await guild.channels.create({
    name: 'Global Chat',
    type: ChannelType.GuildCategory
  });

  // 2) bot-announcements, global-chat, settings チャンネルを作成
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

  // 3) global-chat を Redis セットに登録
  const regKey = JSON.stringify({ guildId: guild.id, channelId: globalChat.id });
  await redis.sadd('global:channels', regKey);

  // 4) 中央 HUB に登録リクエスト
  try {
    await fetch(`${process.env.HUB_ENDPOINT}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guildId: guild.id, channelId: globalChat.id })
    });
  } catch (e) {
    console.error('HUB register failed:', e);
  }

  // 5) settings チャンネルに「自動翻訳／タイムゾーン設定用メッセージ」を送信

  // ── 言語オプション一覧 (25 言語に削減)
  const languageOptions = [
    { label: '日本語',            value: 'ja',     emoji: '🇯🇵' },
    { label: 'English (US)',      value: 'en',     emoji: '🇺🇸' },
    { label: 'English (UK)',      value: 'en-GB',  emoji: '🇬🇧' },
    { label: '中文 (简体)',         value: 'zh',     emoji: '🇨🇳' },
    { label: '中文 (繁體)',        value: 'zh-TW',  emoji: '🇹🇼' },
    { label: '한국어',           value: 'ko',     emoji: '🇰🇷' },
    { label: 'Español',          value: 'es',     emoji: '🇪🇸' },
    { label: 'Français',         value: 'fr',     emoji: '🇫🇷' },
    { label: 'Deutsch',          value: 'de',     emoji: '🇩🇪' },
    { label: 'Português',        value: 'pt',     emoji: '🇵🇹' },
    { label: 'Português (BR)',    value: 'pt-BR', emoji: '🇧🇷' },
    { label: 'Русский',           value: 'ru',     emoji: '🇷🇺' },
    { label: 'Українська',        value: 'uk',     emoji: '🇺🇦' },
    { label: 'ελληνικά',          value: 'el',     emoji: '🇬🇷' },
    { label: 'עברית',            value: 'he',     emoji: '🇮🇱' },
    { label: 'اردو',             value: 'ur',     emoji: '🇵🇰' },
    { label: 'فارسی',            value: 'fa',     emoji: '🇮🇷' },
    { label: 'Bahasa Melayu',     value: 'ms',     emoji: '🇲🇾' },
    { label: 'বাংলা',            value: 'bn',     emoji: '🇧🇩' },
    { label: 'ไทย',              value: 'th',     emoji: '🇹🇭' },
    { label: 'Tiếng Việt',        value: 'vi',     emoji: '🇻🇳' },
    { label: 'हिन्दी',           value: 'hi',     emoji: '🇮🇳' },
    { label: 'Bahasa Indonesia',  value: 'id',     emoji: '🇮🇩' },
    { label: 'العربية',          value: 'ar',     emoji: '🇸🇦' }
  ];

  // ── タイムゾーンオプション一覧 (UTC-11 〜 UTC+13, 計25個)
  const tzOptions = [];
  for (let offset = -11; offset <= 13; offset++) {
    const sign = offset >= 0 ? '+' : '';
    tzOptions.push({
      label: `UTC${sign}${offset}`,
      value: `${offset}`
    });
  }

  // ── サポートサーバーへ飛ぶボタン
  const supportButton = new ButtonBuilder()
    .setLabel('サポートサーバー')
    .setStyle(ButtonStyle.Link)
    .setURL(process.env.SUPPORT_SERVER_URL);

  await settings.send({
    content:
      '**Global Chat 設定メニュー**\n\n' +
      '1️⃣ **自動翻訳設定**：以下のメニューからサーバー全体のデフォルト言語を選択してください。\n' +
      '　→ 選択後は、以降のグローバルチャットメッセージが自動翻訳されます。\n\n' +
      '2️⃣ **タイムゾーン設定**：以下のメニューからサーバーのタイムゾーンを選択してください。\n' +
      '　→ 選択後は、リレーされるメッセージに UTC オフセットが表示されます。\n\n' +
      '❔ **サポートサーバー**：何かあればこちらからお問い合わせください。',
    components: [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('set_default_lang')
          .setPlaceholder('デフォルト言語を選択')
          .addOptions(languageOptions)
      ),
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('set_timezone')
          .setPlaceholder('タイムゾーンを選択')
          .addOptions(tzOptions)
      ),
      new ActionRowBuilder().addComponents(supportButton)
    ]
  });

  // 6) /setup 完了メッセージを返す
  return interaction.editReply({
    content: '✅ Global Chat setup complete!',
    components: []
  });
}

/* ───────────────────────────────────────────────
   /profile ハンドラ
─────────────────────────────────────────────── */
async function handleProfile(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const userId = interaction.user.id;
  const msgCount = (await redis.get(kMsg(userId))) || '0';
  const likeCount = (await redis.get(kLike(userId))) || '0';

  return interaction.editReply({
    content:
      `📊 **${interaction.user.tag}**\n\n` +
      `• Messages Sent: ${msgCount}\n` +
      `• Likes Received: ${likeCount}`,
    components: []
  });
}

/* ───────────────────────────────────────────────
   /ranking ハンドラ
─────────────────────────────────────────────── */
async function handleRanking(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const mode = interaction.options.getSubcommand(); // 'messages' or 'likes'
  const pattern = mode === 'messages' ? 'msg_cnt:*' : 'like_cnt:*';

  const keys = await redis.keys(pattern);
  const arr = [];
  for (const k of keys) {
    const uid = k.split(':')[1];
    const val = parseInt(await redis.get(k), 10) || 0;
    arr.push({ id: uid, v: val });
  }
  arr.sort((a, b) => b.v - a.v).splice(10);

  let response = `🏆 **Top 10 by ${mode}**\n\n`;
  for (let i = 0; i < arr.length; i++) {
    try {
      const u = await client.users.fetch(arr[i].id);
      response += `#${i + 1} – ${u.tag} (${arr[i].v})\n`;
    } catch {
      response += `#${i + 1} – (unknown) (${arr[i].v})\n`;
    }
  }
  if (arr.length === 0) response += 'No data';

  return interaction.editReply({
    content: response,
    components: []
  });
}

/* ───────────────────────────────────────────────
   InteractionCreate イベントハンドラ
─────────────────────────────────────────────── */
client.on(Events.InteractionCreate, async (interaction) => {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  //
  // A) /help コマンド：リージョン選択メニューを返す
  //
  if (interaction.isChatInputCommand() && interaction.commandName === 'help') {
    const regions = [
      { label: 'アジア',         value: 'asia',               emoji: '🌏' },
      { label: 'ヨーロッパ',       value: 'europe',             emoji: '🌍' },
      { label: '北アメリカ',       value: 'north_america',      emoji: '🌎' },
      { label: '中東・アフリカ',    value: 'middle_east_africa', emoji: '🕊️' },
      { label: '南アメリカ',       value: 'south_america',      emoji: '🌎' },
      { label: 'オセアニア',       value: 'oceania',            emoji: '🌏' }
    ];

    const selectRegion = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('help_region')
        .setPlaceholder('まずは地域を選択してください')
        .addOptions(regions)
    );

    await interaction.reply({
      content: '🔎 ヘルプを表示したい「地域」を選択してください。',
      components: [selectRegion],
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  //
  // B) リージョン選択後：言語選択メニューを返す
  //
  if (
    interaction.isStringSelectMenu() &&
    interaction.customId === 'help_region'
  ) {
    const chosenRegion = interaction.values[0];
    let languages = [];

    switch (chosenRegion) {
      case 'asia':
        languages = [
          { label: '日本語',         value: 'ja',         emoji: '🇯🇵' },
          { label: '中文 (简体)',      value: 'zh',         emoji: '🇨🇳' },
          { label: '中文 (繁體)',     value: 'zh-TW',      emoji: '🇹🇼' },
          { label: '한국어',        value: 'ko',         emoji: '🇰🇷' },
          { label: 'हिन्दी',       value: 'hi',         emoji: '🇮🇳' },
          { label: 'বাংলা',        value: 'bn',         emoji: '🇧🇩' },
          { label: 'ไทย',          value: 'th',         emoji: '🇹🇭' },
          { label: 'Tiếng Việt',    value: 'vi',         emoji: '🇻🇳' },
          { label: 'Bahasa Melayu',  value: 'ms',         emoji: '🇲🇾' },
          { label: 'Bahasa Indonesia', value: 'id',       emoji: '🇮🇩' }
        ];
        break;

      case 'europe':
        languages = [
          { label: 'English (US)',   value: 'en',        emoji: '🇺🇸' },
          { label: 'English (UK)',   value: 'en-GB',     emoji: '🇬🇧' },
          { label: 'Español',       value: 'es',        emoji: '🇪🇸' },
          { label: 'Français',       value: 'fr',        emoji: '🇫🇷' },
          { label: 'Deutsch',        value: 'de',        emoji: '🇩🇪' },
          { label: 'Русский',        value: 'ru',        emoji: '🇷🇺' },
          { label: 'Українська',     value: 'uk',        emoji: '🇺🇦' },
          { label: 'ελληνικά',        value: 'el',        emoji: '🇬🇷' },
          { label: 'עברית',         value: 'he',        emoji: '🇮🇱' },
          { label: 'العربية',       value: 'ar',        emoji: '🇸🇦' }
        ];
        break;

      case 'north_america':
        languages = [
          { label: 'English (US)',   value: 'en',        emoji: '🇺🇸' },
          { label: 'Español',       value: 'es',        emoji: '🇪🇸' },
          { label: 'Français',       value: 'fr',        emoji: '🇨🇦' }
        ];
        break;

      case 'middle_east_africa':
        languages = [
          { label: 'العربية',       value: 'ar',        emoji: '🇸🇦' },
          { label: 'فارسی',         value: 'fa',        emoji: '🇮🇷' },
          { label: 'Türkçe',        value: 'tr',        emoji: '🇹🇷' }
        ];
        break;

      case 'south_america':
        languages = [
          { label: 'Español',       value: 'es',        emoji: '🇪🇸' },
          { label: 'Português (BR)', value: 'pt-BR',    emoji: '🇧🇷' }
        ];
        break;

      case 'oceania':
        languages = [
          { label: 'English (AU)',  value: 'en-AU',     emoji: '🇦🇺' },
          { label: 'English (NZ)',  value: 'en-NZ',     emoji: '🇳🇿' }
        ];
        break;

      default:
        languages = [
          { label: 'English (US)',   value: 'en',        emoji: '🇺🇸' },
          { label: '日本語',         value: 'ja',        emoji: '🇯🇵' }
        ];
        break;
    }

    const selectLanguages = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('help_lang')
        .setPlaceholder('言語を選択してください')
        .addOptions(languages)
    );

    await interaction.update({
      content: '📖 続いて、言語を選択してください。',
      components: [selectLanguages]
    });
    return;
  }

  //
  // C) 言語選択後：HELP_TEXTS から該当言語の本文を返す（テキスト分割で送信）
  //
  if (
    interaction.isStringSelectMenu() &&
    interaction.customId === 'help_lang'
  ) {
    const { HELP_TEXTS } = await import(
      path.join(__dirname, 'commands', 'help.js')
    );
    const selectedLang = interaction.values[0];
    const fullText = HELP_TEXTS[selectedLang] || HELP_TEXTS['en'];

    // Discord の通常メッセージは最大 2000 文字。分割して送信
    const MAX_TEXT = 2000;
    const parts = [];
    for (let pos = 0; pos < fullText.length; pos += MAX_TEXT) {
      parts.push(fullText.slice(pos, pos + MAX_TEXT));
    }

    // １つ目は update() で差し替え
    await interaction.update({
      content: parts[0],
      components: []
    });

    // 残りは followUp() で順に送信
    for (let i = 1; i < parts.length; i++) {
      await interaction.followUp({
        content: parts[i],
        flags: MessageFlags.Ephemeral
      });
    }
    return;
  }

  //
  // D) /setup, /profile, /ranking などの既存コマンド
  //
  if (interaction.isChatInputCommand()) {
    switch (interaction.commandName) {
      case 'setup':
        return handleSetup(interaction);
      case 'profile':
        return handleProfile(interaction);
      case 'ranking':
        return handleRanking(interaction);
    }
  }

  //
  // E) 自動翻訳設定（サーバー全体のデフォルト言語）
  //
  if (
    interaction.isStringSelectMenu() &&
    interaction.customId === 'set_default_lang'
  ) {
    const guildId = interaction.guildId;
    const chosenLang = interaction.values[0];

    await redis.hset(`lang:${guildId}`, { lang: chosenLang, auto: 'true' });

    return interaction.reply({
      content: `✅ デフォルト言語を **${chosenLang}** に設定しました。以降、自動翻訳が有効になります。`,
      flags: MessageFlags.Ephemeral
    });
  }

  //
  // F) タイムゾーン設定
  //
  if (
    interaction.isStringSelectMenu() &&
    interaction.customId === 'set_timezone'
  ) {
    const guildId = interaction.guildId;
    const chosenTz = interaction.values[0]; // 例: '-5' や '9'

    await redis.hset(`tz:${guildId}`, { tz: chosenTz });

    return interaction.reply({
      content: `✅ タイムゾーンを **UTC${chosenTz >= 0 ? '+' + chosenTz : chosenTz}** に設定しました。`,
      flags: MessageFlags.Ephemeral
    });
  }
});

/* ───────────────────────────────────────────────
   MessageCreate: メッセージ数カウント ＆ HUB へリレー
─────────────────────────────────────────────── */
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  // 1) 累計メッセージ数をインクリメント
  await redis.incrby(kMsg(message.author.id), 1);

  // 2) グローバルチャット対象チャンネルかチェック
  const regKey = JSON.stringify({
    guildId: message.guildId,
    channelId: message.channelId
  });
  if (!(await redis.sismember('global:channels', regKey))) return;

  // 3) タイムゾーン & 自動翻訳設定を取得
  const tz = (await redis.hget(`tz:${message.guildId}`, 'tz')) || '0';
  const langCfg = await redis.hgetall(`lang:${message.guildId}`);
  const targetLang = langCfg?.auto === 'true' ? langCfg.lang : null;

  // 4) 中央 HUB へリレー
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
   MessageReactionAdd: 👍 カウント ＆ 国旗翻訳
─────────────────────────────────────────────── */
client.on(Events.MessageReactionAdd, async (reaction, user) => {
  if (user.bot) return;

  // 👍 Like カウント
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
   Express: HUB /relay エンドポイント ＆ ヘルスチェック
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
    const files = m.files?.length ? m.files.map((f) => f.attachment) : [];

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
