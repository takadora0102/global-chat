/**
 * index.js – Global Chat Bot (2025-06 修正版：ヘルプをテキスト分割で送信)
 *
 * 変更点
 * ────────────────────────────────────────────────────────────
 * • /help は「地域 → 言語」の 2 段階セレクトメニュー（返信は即時 reply）
 * • /help 最終段階ではヘルプ本文を 2,000 文字ごとに分割してテキスト送信
 * • /setup, /profile, /ranking は deferReply() → editReply() で実装
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
  // 3秒以内に応答を deferred
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.editReply({
      content: '❌ You need Administrator permission.',
      components: []
    });
  }

  const guild = interaction.guild;
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
    console.error('HUB register failed:', e);
  }

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
    content: `📊 **${interaction.user.tag}**\n\n` +
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
   InteractionCreate
─────────────────────────────────────────────── */
client.on(Events.InteractionCreate, async (i) => {
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
        .addOptions(regions)
    );

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

    await i.update({
      content: '📖 続いて、ヘルプを表示する言語を選択してください。',
      components: [selectLang]
    });
    return;
  }

  /* ----- C) /help final: テキストを 2000 文字ごとに分割して送信 ----- */
  if (i.isStringSelectMenu() && i.customId === 'help_lang') {
    const { HELP_TEXTS } = await import(
      path.join(path.dirname(fileURLToPath(import.meta.url)), 'commands', 'help.js')
    );
    const lang = i.values[0];
    const fullText = HELP_TEXTS[lang] || HELP_TEXTS['en'];

    // Discord の通常メッセージは最大 2000 文字 → それを超えたら分割
    const MAX_TEXT = 2000;
    const parts = [];
    for (let idx = 0; idx < fullText.length; idx += MAX_TEXT) {
      parts.push(fullText.slice(idx, idx + MAX_TEXT));
    }

    // 最初のパートは update() で差し替え（元のセレクト付きメッセージを消す）
    await i.update({
      content: parts[0],
      components: []
    });

    // 残りのパートは followUp() で順に送信（ephemeral のまま）
    for (let j = 1; j < parts.length; j++) {
      await i.followUp({
        content: parts[j],
        flags: MessageFlags.Ephemeral
      });
    }
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
      // 他のコマンドがあればここに追加…
    }
  }
});

/* ───────────────────────────────────────────────
   MessageCreate: メッセージ数＋HUB リレー
─────────────────────────────────────────────── */
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  await redis.incrby(kMsg(message.author.id), 1);

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
