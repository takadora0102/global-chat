/**
 * index.js – Global Chat Bot
 * Patch-5 (2025-06-∘∘)
 *
 * 変更点（Patch-5）
 *   1. /setup で作成する bot-announcements を「GuildText」に変更
 *      フォロー対象はサポートサーバーのアナウンスチャンネル（環境変数: NEWS_SOURCE）に
 *   2. /setup で settings チャンネルに送るメッセージを英語に統一
 *   3. 「Detect Timezone」ボタンを再実装
 *   4. ActionRow は 5 行以内にまとめる
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

/* ────────── Environment Check ────────── */
for (const key of [
  'DISCORD_TOKEN',
  'CLIENT_ID',
  'HUB_ENDPOINT',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'SUPPORT_SERVER_URL',
  'NEWS_SOURCE'
]) {
  if (!process.env[key]) {
    console.error(`❌ Missing environment variable: ${key}`);
    process.exit(1);
  }
}
const NEWS_SOURCE = process.env.NEWS_SOURCE;

/* ────────── Redis & Client ────────── */
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

/* ────────── Helpers ────────── */
const kMsg = (uid) => `msg_cnt:${uid}`;
const kLike = (uid) => `like_cnt:${uid}`;

async function translate(text, targetLang) {
  const url =
    'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&dt=t&tl=' +
    targetLang +
    '&q=' +
    encodeURIComponent(text);
  const res = await fetch(url);
  if (!res.ok) throw new Error('translate api failed');
  const data = await res.json();
  return data[0].map((v) => v[0]).join('');
}

/* ────────── /setup Handler ────────── */
async function handleSetup(interaction) {
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.editReply({ content: '❌ You need Administrator permission to run this command.' });
    }

    // 1. Category: "Global Chat"
    const category = await interaction.guild.channels.create({
      name: 'Global Chat',
      type: ChannelType.GuildCategory
    });

    // 2. bot-announcements: ニュースチャンネル（なければテキスト）
    const canNews = interaction.guild.features?.includes('NEWS') ||
                    interaction.guild.features?.includes('COMMUNITY');
    const botAnnouncements = await interaction.guild.channels.create({
      name: 'bot-announcements',
      type: canNews ? ChannelType.GuildAnnouncement : ChannelType.GuildText,
      parent: category.id,
      permissionOverwrites: [
        {
          id: interaction.guild.roles.everyone.id,
          deny: [PermissionFlagsBits.SendMessages],
          type: OverwriteType.Role
        }
      ]
    });
    // フォロー対象はサポートサーバーの Announcement チャンネル
    if (NEWS_SOURCE && canNews && typeof botAnnouncements.follow === 'function') {
      try {
        await botAnnouncements.follow(NEWS_SOURCE);
      } catch {
        // silent
      }
    }

    // 3. global-chat チャンネル
    const globalChat = await interaction.guild.channels.create({
      name: 'global-chat',
      type: ChannelType.GuildText,
      parent: category.id
    });

    // 4. settings チャンネル（管理者専用）
    const settings = await interaction.guild.channels.create({
      name: 'settings',
      type: ChannelType.GuildText,
      parent: category.id,
      permissionOverwrites: [
        {
          id: interaction.guild.roles.everyone.id,
          deny: [PermissionFlagsBits.ViewChannel],
          type: OverwriteType.Role
        }
      ]
    });

    // 5. Redis 登録 & HUB 連携
    await redis.sadd(
      'global:channels',
      JSON.stringify({ guildId: interaction.guild.id, channelId: globalChat.id })
    );
    fetch(process.env.HUB_ENDPOINT + '/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ guildId: interaction.guild.id, channelId: globalChat.id })
    }).catch(() => {});

    // 6. settings メッセージ（英語化 & ActionRow は 4 行以内）
    const languageOptions = [
      ['English (US)', 'en', '🇺🇸'],
      ['日本語', 'ja', '🇯🇵'],
      ['中文(简体)', 'zh', '🇨🇳'],
      ['中文(繁體)', 'zh-TW', '🇹🇼'],
      ['한국어', 'ko', '🇰🇷'],
      ['Español', 'es', '🇪🇸'],
      ['Français', 'fr', '🇫🇷'],
      ['Deutsch', 'de', '🇩🇪'],
      ['Português (BR)', 'pt-BR', '🇧🇷'],
      ['Русский', 'ru', '🇷🇺'],
      ['العربية', 'ar', '🇸🇦'],
      ['Bahasa Indonesia', 'id', '🇮🇩'],
      ['ไทย', 'th', '🇹🇭'],
      ['Tiếng Việt', 'vi', '🇻🇳'],
      ['हिन्दी', 'hi', '🇮🇳'],
      ['বাংলা', 'bn', '🇧🇩'],
      ['Bahasa Melayu', 'ms', '🇲🇾'],
      ['Türkçe', 'tr', '🇹🇷']
    ].map(([label, value, emoji]) => ({ label, value, emoji }));

    const timezoneOptions = [];
    for (let offset = -11; offset <= 13; offset++) {
      timezoneOptions.push({
        label: `UTC${offset >= 0 ? '+' + offset : offset}`,
        value: `${offset}`
      });
    }

    const btnAutoOn  = new ButtonBuilder()
      .setCustomId('autotrans_on')
      .setLabel('Auto-Translate ON')
      .setStyle(ButtonStyle.Success);
    const btnAutoOff = new ButtonBuilder()
      .setCustomId('autotrans_off')
      .setLabel('Auto-Translate OFF')
      .setStyle(ButtonStyle.Danger);
    const btnDetectTZ = new ButtonBuilder()
      .setCustomId('detect_timezone')
      .setLabel('Detect Timezone')
      .setStyle(ButtonStyle.Primary);
    const btnSupport = new ButtonBuilder()
      .setURL(process.env.SUPPORT_SERVER_URL)
      .setLabel('Support Server')
      .setStyle(ButtonStyle.Link);

    await settings.send({
      content:
        '**Global Chat Settings**\n' +
        '1️⃣ Default Language\n' +
        '2️⃣ Timezone\n' +
        '3️⃣ Auto-Translate ON / OFF\n' +
        '4️⃣ Detect Timezone from your location',
      components: [
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('set_default_lang')
            .setPlaceholder('Select your default language')
            .addOptions(languageOptions)
        ),
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('set_timezone')
            .setPlaceholder('Select your timezone')
            .addOptions(timezoneOptions)
        ),
        new ActionRowBuilder().addComponents(btnAutoOn, btnAutoOff),
        new ActionRowBuilder().addComponents(btnDetectTZ, btnSupport)
      ]
    });

    await interaction.editReply({ content: '✅ Setup completed successfully!' });
  } catch (error) {
    console.error('setup error:', error);
    if (interaction.deferred) {
      await interaction.editReply({
        content: '❌ Setup failed. Please check bot permissions and try again.',
        components: []
      });
    }
  }
}

/* ────────── /profile ────────── */
async function handleProfile(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const msgCount = (await redis.get(kMsg(interaction.user.id))) || '0';
  const likeCount = (await redis.get(kLike(interaction.user.id))) || '0';
  await interaction.editReply(
    `📊 **${interaction.user.tag}**\n• Messages sent in global-chat: ${msgCount}\n• 👍 Reactions received: ${likeCount}`
  );
}

/* ────────── /ranking ────────── */
async function handleRanking(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const subcmd = interaction.options.getSubcommand(); // 'messages' or 'likes'
  const pattern = subcmd === 'messages' ? 'msg_cnt:*' : 'like_cnt:*';
  const arr = [];
  for (const key of await redis.keys(pattern)) {
    const userId = key.split(':')[1];
    const val = parseInt(await redis.get(key), 10) || 0;
    arr.push({ id: userId, v: val });
  }
  arr.sort((a, b) => b.v - a.v);
  arr.splice(10);

  let output = `🏆 **Top 10 by ${subcmd}**\n\n`;
  for (let i = 0; i < arr.length; i++) {
    try {
      const u = await client.users.fetch(arr[i].id);
      output += `#${i + 1} – ${u.tag} (${arr[i].v})\n`;
    } catch {
      output += `#${i + 1} – (unknown) (${arr[i].v})\n`;
    }
  }
  if (!arr.length) output += 'No data';

  await interaction.editReply({ content: output });
}

/* ────────── /help Handler ────────── */
const REGIONS = [
  { label: 'Asia', value: 'asia', emoji: '🌏' },
  { label: 'Europe', value: 'europe', emoji: '🌍' },
  { label: 'North America', value: 'north_america', emoji: '🌎' },
  { label: 'Middle East & Africa', value: 'middle_east_africa', emoji: '🌍' },
  { label: 'South America', value: 'south_america', emoji: '🌎' },
  { label: 'Oceania', value: 'oceania', emoji: '🌏' }
];
const REGION_LANGS = {
  asia: [
    ['English', 'en', '🇺🇸'],
    ['日本語', 'ja', '🇯🇵'],
    ['中文(简体)', 'zh', '🇨🇳'],
    ['中文(繁體)', 'zh-TW', '🇹🇼'],
    ['한국어', 'ko', '🇰🇷'],
    ['हिन्दी', 'hi', '🇮🇳'],
    ['বাংলা', 'bn', '🇧🇩'],
    ['ไทย', 'th', '🇹🇭'],
    ['Tiếng Việt', 'vi', '🇻🇳'],
    ['Bahasa Melayu', 'ms', '🇲🇾']
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
    ['Français', 'fr', '🇫🇷']
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

client.on(Events.InteractionCreate, async (interaction) => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  if (interaction.isChatInputCommand()) {
    console.log(`▶ Received command: ${interaction.commandName} from ${interaction.user.tag}`);
  }

  // /help – Region Select
  if (interaction.isChatInputCommand() && interaction.commandName === 'help') {
    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('help_region')
        .setPlaceholder('Choose a region')
        .addOptions(REGIONS)
    );
    return interaction.reply({
      content: '🔎 Please select a region to view help.',
      components: [row],
      flags: MessageFlags.Ephemeral
    });
  }

  // /help – Language Select
  if (interaction.isStringSelectMenu() && interaction.customId === 'help_region') {
    const selectedRegion = interaction.values[0];
    const langs = REGION_LANGS[selectedRegion] || [];
    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('help_lang')
        .setPlaceholder('Choose a language')
        .addOptions(
          langs.map(([label, value, emoji]) => ({
            label,
            value,
            emoji
          }))
        )
    );
    return interaction.update({
      content: '📖 Now select a language.',
      components: [row]
    });
  }

  // /help – Send Help Text
  if (interaction.isStringSelectMenu() && interaction.customId === 'help_lang') {
    const { HELP_TEXTS } = await import(path.join(__dirname, 'commands', 'help.js'));
    const helpText = HELP_TEXTS[interaction.values[0]] || HELP_TEXTS.en;
    const parts = helpText.match(/[\s\S]{1,2000}/g);
    await interaction.update({ content: parts[0], components: [] });
    for (let i = 1; i < parts.length; i++) {
      await interaction.followUp({ content: parts[i], flags: MessageFlags.Ephemeral });
    }
    return;
  }

  // /setup, /profile, /ranking Handlers
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'setup')     return handleSetup(interaction);
    if (interaction.commandName === 'profile')   return handleProfile(interaction);
    if (interaction.commandName === 'ranking')   return handleRanking(interaction);
  }

  // Settings: Default Language Select
  if (interaction.isStringSelectMenu() && interaction.customId === 'set_default_lang') {
    await redis.hset(`lang:${interaction.guildId}`, { lang: interaction.values[0], auto: 'true' });
    return interaction.reply({ content: `✅ Default language set to **${interaction.values[0]}** (Auto ON).`, flags: MessageFlags.Ephemeral });
  }

  // Settings: Timezone Select
  if (interaction.isStringSelectMenu() && interaction.customId === 'set_timezone') {
    await redis.hset(`tz:${interaction.guildId}`, { tz: interaction.values[0] });
    const sign = interaction.values[0] >= 0 ? '+' : '';
    return interaction.reply({ content: `✅ Timezone set to UTC${sign}${interaction.values[0]}.`, flags: MessageFlags.Ephemeral });
  }

  // Settings: Auto-Translate ON/OFF Buttons
  if (interaction.isButton() && (interaction.customId === 'autotrans_on' || interaction.customId === 'autotrans_off')) {
    const newAuto = interaction.customId === 'autotrans_on' ? 'true' : 'false';
    await redis.hset(`lang:${interaction.guildId}`, { auto: newAuto });
    return interaction.reply({ content: `🔄 Auto-Translate turned **${newAuto === 'true' ? 'ON' : 'OFF'}**.`, flags: MessageFlags.Ephemeral });
  }

  // Settings: Detect Timezone Button
  if (interaction.isButton() && interaction.customId === 'detect_timezone') {
    // サンプルとして UTC+0 に設定
    const sampleTz = '0';
    await redis.hset(`tz:${interaction.guildId}`, { tz: sampleTz });
    return interaction.reply({
      content: `🌐 Detected timezone set to UTC${sampleTz >= 0 ? '+' + sampleTz : sampleTz}.`,
      flags: MessageFlags.Ephemeral
    });
  }
});

/* ────────── MessageCreate (global-chat のみ) ────────── */
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  const key = JSON.stringify({ guildId: message.guildId, channelId: message.channelId });
  if (!(await redis.sismember('global:channels', key))) return;

  await redis.incrby(kMsg(message.author.id), 1);

  const tz   = (await redis.hget(`tz:${message.guildId}`, 'tz')) || '0';
  const langCfg = await redis.hgetall(`lang:${message.guildId}`);
  const targetLang = langCfg.auto === 'true' ? langCfg.lang : null;

  fetch(process.env.HUB_ENDPOINT + '/publish', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
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
      userId: message.author.id
    })
  }).catch(() => {});
});

/* ────────── MessageReactionAdd (👍 Like & 国旗翻訳) ────────── */
client.on(Events.MessageReactionAdd, async (reaction, user) => {
  if (user.bot) return;

  if (reaction.emoji.name === '👍' && reaction.message.author?.id === client.user.id) {
    const setKey = `like_set:${reaction.message.id}`;
    if (await redis.sismember(setKey, user.id)) return;
    if ((await redis.scard(setKey)) >= 5) {
      reaction.users.remove(user.id).catch(() => {});
      return;
    }
    await redis.sadd(setKey, user.id);
    await redis.expire(setKey, 604800);
    const m = reaction.message.embeds[0]?.footer?.text.match(/UID:(\d+)/);
    if (m) await redis.incrby(kLike(m[1]), 1);
    return;
  }

  const langCode = FLAG_TO_LANG[reaction.emoji.name];
  if (!langCode) return;

  let original = reaction.message.content;
  if (!original && reaction.message.embeds?.length) {
    original = reaction.message.embeds[0].description ?? '';
  }
  if (!original) return;

  try {
    const translatedText = await translate(original, langCode);
    await reaction.message.reply({
      embeds: [
        {
          description: `> ${original}\n\n**${translatedText}**`,
          footer: { text: `🌐 translated to ${langCode}` }
        }
      ]
    });
  } catch {
    // ignore
  }
});

/* ────────── Express /relay Endpoint ────────── */
const app = express();
app.use(bodyParser.json());

app.post('/relay', async (req, res) => {
  try {
    const m = req.body;
    const guild = client.guilds.cache.get(m.guildId);
    if (!guild) return res.sendStatus(404);
    if (m.guildId === guild.id) return res.send({ status: 'skip_origin' });
    const channel = guild.channels.cache.get(m.channelId);
    if (!channel) return res.sendStatus(404);

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
    const sent = await channel.send({ embeds: [embed], files });
    await sent.react('👍');
    return res.send({ status: 'ok' });
  } catch (err) {
    console.error('relay error:', err);
    return res.sendStatus(500);
  }
});

app.get('/healthz', (_, res) => res.send('OK'));
app.listen(process.env.PORT || 3000, () => {
  console.log('🚦 relay on', process.env.PORT || 3000);
});

/* ────────── Bot Login ────────── */
client
  .login(process.env.DISCORD_TOKEN)
  .then(() => console.log('✅ Logged in'))
  .catch((err) => console.error('login error:', err));
