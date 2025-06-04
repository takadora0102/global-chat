/**
 * index.js – Global Chat Bot  (2025-06-XX “channel-only Redis” fix)
 *
 * 主なポイント
 *  1. Redis に登録するのは global-chat の「channelId だけ」に統一
 *  2. 転送側はその channelId リストを直接使う
 *  3. bot-announcements は text チャンネルを作り、サポート側 Announcement を addFollower
 *  4. 古い "[object Object]" エントリ問題を完全解消（もう JSON.parse は不要）
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
  ButtonStyle,
  EmbedBuilder
} from 'discord.js';
import express from 'express';
import bodyParser from 'body-parser';
import { randomUUID } from 'crypto';
import { Redis } from '@upstash/redis';
import { FLAG_TO_LANG } from './constants.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* ────────── 0. env チェック ────────── */
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
    console.error(`❌ Missing env: ${key}`);
    process.exit(1);
  }
}
const NEWS_SOURCE = process.env.NEWS_SOURCE;

/* ────────── 1. Redis & Client ────────── */
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

/* ────────── 2. Key Helpers ────────── */
const kMsg  = (u) => `msg_cnt:${u}`;
const kLike = (u) => `like_cnt:${u}`;

/* ────────── 3. util: translate (google 無認証) ────────── */
async function translate(text, lang) {
  const url =
    'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&dt=t&tl=' +
    lang +
    '&q=' +
    encodeURIComponent(text);
  const r = await fetch(url);
  if (!r.ok) throw new Error('translate api fail');
  const json = await r.json();
  return json[0].map((v) => v[0]).join('');
}

/* ────────── 4. util: embed builder ────────── */
function buildRelayEmbed({ userTag, originGuild, tz, userAvatar, content, userId, auto }) {
  return new EmbedBuilder()
    .setAuthor({ name: `${userTag} [${originGuild} UTC${tz}]`, iconURL: userAvatar })
    .setDescription(content)
    .setFooter({ text: `UID:${userId} 🌐 global chat${auto ? ' • auto-translated' : ''}` })
    .setTimestamp(Date.now());
}

/* ────────── 5. /setup ────────── */
async function handleSetup(interaction) {
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.editReply('❌ You need Administrator permission to run this command.');
    }

    /* カテゴリ */
    const category = await interaction.guild.channels.create({
      name: 'Global Chat',
      type: ChannelType.GuildCategory
    });

    /* bot-announcements (TEXT) */
    const botAnnouncements = await interaction.guild.channels.create({
      name : 'bot-announcements',
      type : ChannelType.GuildText,
      parent: category.id,
      permissionOverwrites: [
        {
          id  : interaction.guild.roles.everyone.id,
          deny: [PermissionFlagsBits.SendMessages],
          type: OverwriteType.Role
        }
      ]
    });

    /* Announcement follow */
    try {
      const src = await client.channels.fetch(NEWS_SOURCE);
      if (src?.type === ChannelType.GuildAnnouncement && src.addFollower) {
        await src.addFollower(botAnnouncements.id, 'auto-follow');
        console.log('✓ followed support announcement');
      } else {
        console.warn('⚠ NEWS_SOURCE is not Announcement');
      }
    } catch (e) { console.error('follow failed:', e); }

    /* global-chat */
    const globalChat = await interaction.guild.channels.create({
      name  : 'global-chat',
      type  : ChannelType.GuildText,
      parent: category.id
    });

    /* settings (admin only) */
    const settings = await interaction.guild.channels.create({
      name  : 'settings',
      type  : ChannelType.GuildText,
      parent: category.id,
      permissionOverwrites: [
        {
          id  : interaction.guild.roles.everyone.id,
          deny: [PermissionFlagsBits.ViewChannel],
          type: OverwriteType.Role
        }
      ]
    });

    /* Redis 登録 (channelId のみ) */
    await redis.sadd('global:channels', globalChat.id);
    fetch(process.env.HUB_ENDPOINT + '/register', {
      method : 'POST',
      headers: { 'content-type': 'application/json' },
      body   : JSON.stringify({ guildId: interaction.guild.id, channelId: globalChat.id })
    }).catch(e => console.error('register error:', e));

    /* settings UI */
    const langOpts = [
      ['English (US)', 'en', '🇺🇸'],
      ['日本語',        'ja', '🇯🇵'],
      ['中文(简体)',    'zh', '🇨🇳'],
      ['Español',      'es', '🇪🇸'],
      ['Français',     'fr', '🇫🇷'],
      ['Deutsch',      'de', '🇩🇪']
    ].map(([l, v, e]) => ({ label: l, value: v, emoji: e }));

    const tzOpts = [];
    for (let o = -11; o <= 13; o++) tzOpts.push({ label: `UTC${o >= 0 ? '+' + o : o}`, value: String(o) });

    const rowLang = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('set_default_lang')
        .setPlaceholder('Select default language')
        .addOptions(langOpts)
    );
    const rowTZ = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('set_timezone')
        .setPlaceholder('Select timezone')
        .addOptions(tzOpts)
    );
    const rowAuto = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('autotrans_on').setLabel('Auto-Translate ON').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('autotrans_off').setLabel('OFF').setStyle(ButtonStyle.Danger)
    );
    const rowMisc = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('detect_timezone').setLabel('Detect TZ').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setURL(process.env.SUPPORT_SERVER_URL).setLabel('Support').setStyle(ButtonStyle.Link)
    );

    await settings.send({
      content:
        '**Global Chat Settings**\n' +
        '1️⃣ Default Language\n' +
        '2️⃣ Timezone\n' +
        '3️⃣ Auto-Translate ON / OFF\n' +
        '4️⃣ Detect Timezone',
      components: [rowLang, rowTZ, rowAuto, rowMisc]
    });

    await interaction.editReply('✅ Setup completed successfully!');
  } catch (err) {
    console.error('setup error:', err);
    if (interaction.deferred) {
      await interaction.editReply('❌ Setup failed. Check permissions & ENV.');
    }
  }
}

/* ────────── 6. /profile ────────── */
async function handleProfile(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const m = (await redis.get(kMsg(interaction.user.id))) || '0';
  const l = (await redis.get(kLike(interaction.user.id))) || '0';
  await interaction.editReply(`📊 **${interaction.user.tag}**\n• Messages: ${m}\n• 👍: ${l}`);
}

/* ────────── 7. /ranking ────────── */
async function handleRanking(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const sub = interaction.options.getSubcommand(); // messages / likes
  const pattern = sub === 'messages' ? 'msg_cnt:*' : 'like_cnt:*';
  const list = [];
  for (const key of await redis.keys(pattern)) {
    const uid = key.split(':')[1];
    list.push({ id: uid, v: Number(await redis.get(key) || 0) });
  }
  list.sort((a, b) => b.v - a.v).splice(10);

  const lines = await Promise.all(
    list.map(async (u, i) => {
      try {
        const user = await client.users.fetch(u.id);
        return `#${i + 1} – ${user.tag} (${u.v})`;
      } catch {
        return `#${i + 1} – (unknown) (${u.v})`;
      }
    })
  );
  await interaction.editReply(`🏆 **Top 10 by ${sub}**\n\n${lines.join('\n') || 'No data'}`);
}

/* ────────── 8. Help メニュー用リスト ────────── */
const REGIONS = [
  { label: 'Asia', value: 'asia', emoji: '🌏' },
  { label: 'Europe', value: 'europe', emoji: '🌍' },
  { label: 'North America', value: 'north_america', emoji: '🌎' },
  { label: 'South America', value: 'south_america', emoji: '🌎' },
  { label: 'Middle East & Africa', value: 'mea', emoji: '🌍' },
  { label: 'Oceania', value: 'oceania', emoji: '🌏' }
];
const REGION_LANGS = {
  asia: [
    ['English', 'en', '🇺🇸'],
    ['日本語', 'ja', '🇯🇵'],
    ['中文(简体)', 'zh', '🇨🇳'],
    ['한국어', 'ko', '🇰🇷'],
    ['Tiếng Việt', 'vi', '🇻🇳']
  ],
  europe: [
    ['English', 'en', '🇺🇸'],
    ['Español', 'es', '🇪🇸'],
    ['Français', 'fr', '🇫🇷'],
    ['Deutsch', 'de', '🇩🇪'],
    ['Русский', 'ru', '🇷🇺']
  ],
  north_america: [
    ['English', 'en', '🇺🇸'],
    ['Español', 'es', '🇪🇸'],
    ['Français', 'fr', '🇫🇷']
  ],
  south_america: [
    ['Español', 'es', '🇪🇸'],
    ['Português (BR)', 'pt-BR', '🇧🇷']
  ],
  mea: [
    ['العربية', 'ar', '🇸🇦'],
    ['فارسی', 'fa', '🇮🇷'],
    ['Türkçe', 'tr', '🇹🇷']
  ],
  oceania: [
    ['English (AU)', 'en-AU', '🇦🇺'],
    ['English (NZ)', 'en-NZ', '🇳🇿']
  ]
};

/* ────────── 9. Interaction ルーティング ────────── */
client.on(Events.InteractionCreate, async (i) => {
  /* ChatInput Commands */
  if (i.isChatInputCommand()) {
    console.log(`▶ cmd: ${i.commandName} by ${i.user.tag}`);

    if (i.commandName === 'setup')   return handleSetup(i);
    if (i.commandName === 'profile') return handleProfile(i);
    if (i.commandName === 'ranking') return handleRanking(i);
    if (i.commandName === 'help') {
      return i.reply({
        content: '🔎 Choose a region.',
        components: [
          new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId('help_region')
              .setPlaceholder('Select region')
              .addOptions(REGIONS)
          )
        ],
        flags: MessageFlags.Ephemeral
      });
    }
  }

  /* Help flow – region → language → text */
  if (i.isStringSelectMenu() && i.customId === 'help_region') {
    const langs = REGION_LANGS[i.values[0]] ?? [];
    return i.update({
      content: '📖 Choose a language.',
      components: [
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('help_lang')
            .setPlaceholder('Select language')
            .addOptions(langs.map(([l, v, e]) => ({ label: l, value: v, emoji: e })))
        )
      ]
    });
  }
  if (i.isStringSelectMenu() && i.customId === 'help_lang') {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const { HELP_TEXTS } = await import(path.join(__dirname, 'commands', 'help.js'));
    const txt = HELP_TEXTS[i.values[0]] || HELP_TEXTS.en;
    const parts = txt.match(/[\s\S]{1,2000}/g);
    await i.update({ content: parts[0], components: [] });
    for (let p = 1; p < parts.length; p++) {
      await i.followUp({ content: parts[p], flags: MessageFlags.Ephemeral });
    }
    return;
  }

  /* settings UI */
  if (i.isStringSelectMenu() && i.customId === 'set_default_lang') {
    await redis.hset(`lang:${i.guildId}`, { lang: i.values[0], auto: 'true' });
    return i.reply({ content: `✅ Default language set to **${i.values[0]}** (Auto ON).`, flags: MessageFlags.Ephemeral });
  }
  if (i.isStringSelectMenu() && i.customId === 'set_timezone') {
    await redis.hset(`tz:${i.guildId}`, { tz: i.values[0] });
    const s = i.values[0] >= 0 ? '+' : '';
    return i.reply({ content: `✅ Timezone set to UTC${s}${i.values[0]}.`, flags: MessageFlags.Ephemeral });
  }
  if (i.isButton() && ['autotrans_on', 'autotrans_off'].includes(i.customId)) {
    const v = i.customId === 'autotrans_on' ? 'true' : 'false';
    await redis.hset(`lang:${i.guildId}`, { auto: v });
    return i.reply({ content: `🔄 Auto-Translate is now **${v === 'true' ? 'ON' : 'OFF'}**.`, flags: MessageFlags.Ephemeral });
  }
  if (i.isButton() && i.customId === 'detect_timezone') {
    await redis.hset(`tz:${i.guildId}`, { tz: '0' });
    return i.reply({ content: '🌐 Detected timezone set to UTC+0.', flags: MessageFlags.Ephemeral });
  }
});

/* ────────── 10. MessageCreate ────────── */
client.on(Events.MessageCreate, async (msg) => {
  if (msg.author.bot) return;
  if (!(await redis.sismember('global:channels', msg.channelId))) return;

  /* stats */
  await redis.incrby(kMsg(msg.author.id), 1);

  const tz   = (await redis.hget(`tz:${msg.guildId}`,   'tz'))   ?? '0';
  const lang = (await redis.hget(`lang:${msg.guildId}`, 'lang')) ?? 'en';
  const auto = (await redis.hget(`lang:${msg.guildId}`, 'auto')) === 'true';

  const payload = {
    globalId   : randomUUID(),
    guildId    : msg.guildId,
    channelId  : msg.channelId,
    userTag    : msg.author.tag,
    userAvatar : msg.author.displayAvatarURL(),
    originGuild: msg.guild.name,
    tz,
    content    : msg.content,
    sentAt     : Date.now(),
    files      : msg.attachments.map(a => ({ attachment: a.url, name: a.name })),
    targetLang : auto ? lang : null,
    userId     : msg.author.id
  };

  fetch(process.env.HUB_ENDPOINT + '/publish', {
    method : 'POST',
    headers: { 'content-type': 'application/json' },
    body   : JSON.stringify(payload)
  })
    .then(r => { if (!r.ok) throw new Error('hub status ' + r.status); })
    .catch(async (e) => {
      console.error('publish error:', e);

      const embed = buildRelayEmbed({
        userTag: msg.author.tag,
        originGuild: msg.guild.name,
        tz,
        userAvatar: msg.author.displayAvatarURL(),
        content: msg.content,
        userId: msg.author.id,
        auto
      });

      for (const channelId of await redis.smembers('global:channels')) {
        if (channelId === msg.channelId) continue;
        try {
          const ch = await client.channels.fetch(channelId);
          await ch.send({ embeds: [embed], files: msg.attachments.map(a => a.url) });
        } catch {/* ignore */}
      }
    });
});

/* ────────── 11. ReactionAdd ────────── */
client.on(Events.MessageReactionAdd, async (reaction, user) => {
  if (user.bot) return;

  /* 👍 Like */
  if (reaction.emoji.name === '👍' && reaction.message.author?.id === client.user.id) {
    const likeKey = `like_set:${reaction.message.id}`;
    if (await redis.sismember(likeKey, user.id)) return;
    if ((await redis.scard(likeKey)) >= 5) {
      reaction.users.remove(user.id).catch(() => {});
      return;
    }
    await redis.sadd(likeKey, user.id);
    await redis.expire(likeKey, 60 * 60 * 24 * 7);
    const m = reaction.message.embeds[0]?.footer?.text.match(/UID:(\d+)/);
    if (m) await redis.incrby(kLike(m[1]), 1);
    return;
  }

  /* Flag Translation */
  const langCode = FLAG_TO_LANG[reaction.emoji.name];
  if (!langCode) return;
  const original = reaction.message.content || reaction.message.embeds[0]?.description || '';
  if (!original) return;

  try {
    const translated = await translate(original, langCode);
    await reaction.message.reply({
      embeds: [
        new EmbedBuilder()
          .setDescription(`> ${original}\n\n**${translated}**`)
          .setFooter({ text: `🌐 translated to ${langCode}` })
      ]
    });
  } catch (err) { console.error('translate error:', err); }
});

/* ────────── 12. Express Relay ────────── */
const app = express();
app.use(bodyParser.json());

app.post('/relay', async (req, res) => {
  try {
    const m = req.body;
    const embed = buildRelayEmbed({
      userTag    : m.userTag,
      originGuild: m.originGuild,
      tz         : m.tz,
      userAvatar : m.userAvatar,
      content    : m.content,
      userId     : m.userId,
      auto       : !!m.targetLang
    });

    for (const channelId of await redis.smembers('global:channels')) {
      if (channelId === m.channelId) continue;
      try {
        const ch = await client.channels.fetch(channelId);
        await ch.send({ embeds: [embed], files: m.files?.map(f => f.attachment) || [] });
      } catch (err) { console.error(`relay to ${channelId} failed:`, err); }
    }
    res.send({ status: 'ok' });
  } catch (err) {
    console.error('relay endpoint error:', err);
    res.sendStatus(500);
  }
});

app.get('/healthz', (_, res) => res.send('OK'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('🚦 relay on', PORT));

/* ────────── 13. Bot 起動 ────────── */
client
  .login(process.env.DISCORD_TOKEN)
  .then(() => console.log('✅ Logged in & ready (channel-only Redis)'))
  .catch((e) => console.error('login error:', e));
