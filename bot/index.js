/**
 * index.js – Global Chat Bot (with dynamic /additem and support invite)
 * ------------------------------------------------------------------
 *  - Cross-server global chat
 *  - Auto-translation & reaction translation
 *  - Time-zone tags & auto-detect
 *  - Broadcast announcements
 *  - Dynamic shop items via /additem
 *  - After /setup, posts a support-server invite in #bot-announcements
 */

import 'dotenv/config';
import express from 'express';
import bodyParser from 'body-parser';
import fetch from 'node-fetch';
import {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  MessageFlags,
  ChannelType
} from 'discord.js';
import { randomUUID } from 'crypto';
import { Redis } from '@upstash/redis';
import { LANG_CHOICES, FLAG_TO_LANG } from './constants.js';

/* ------------------------------------------------------------------
 * Time-zone definitions (UTC-12 … UTC+12)
 * ------------------------------------------------------------------ */
const CITY_BY_OFFSET = {
  '-12':'Baker Island','-11':'American Samoa','-10':'Hawaii','-9':'Alaska',
  '-8':'Los Angeles','-7':'Denver','-6':'Chicago','-5':'New York / Toronto',
  '-4':'Santiago','-3':'Buenos Aires','-2':'South Georgia','-1':'Azores',
   '0':'London (GMT)','1':'Berlin / Paris','2':'Athens / Cairo','3':'Moscow / Nairobi',
   '4':'Dubai','5':'Pakistan','6':'Bangladesh','7':'Bangkok / Jakarta',
   '8':'Beijing / Singapore','9':'Tokyo / Seoul','10':'Sydney','11':'Solomon Is.','12':'Auckland'
};
const FLAG_BY_OFFSET = {
  '-12':'🇺🇸','-11':'🇺🇸','-10':'🇺🇸','-9':'🇺🇸','-8':'🇺🇸','-7':'🇺🇸',
  '-6':'🇺🇸','-5':'🇺🇸','-4':'🇨🇱','-3':'🇦🇷','-2':'🇬🇸','-1':'🇵🇹',
   '0':'🇬🇧','1':'🇪🇺','2':'🇪🇬','3':'🇰🇪','4':'🇦🇪','5':'🇵🇰',
   '6':'🇧🇩','7':'🇹🇭','8':'🇨🇳','9':'🇯🇵','10':'🇦🇺','11':'🇸🇧','12':'🇳🇿'
};
const TZ_CHOICES = Array.from({ length: 25 }, (_, i) => {
  const o = -12 + i, sign = o >= 0 ? '+' : '';
  return {
    label: `UTC${sign}${o}  ${FLAG_BY_OFFSET[o]}  ${CITY_BY_OFFSET[o]}`,
    value: String(o)
  };
});
function guessOffsetByLocale(locale = 'en-US') {
  const country = locale.split('-')[1] ?? (locale === 'ja' ? 'JP' : 'US');
  const MAP = { JP:9, KR:9, CN:8, TW:8, HK:8, SG:8, TH:7, ID:7, IN:5,
                GB:0, US:-5, CA:-5, DE:1, FR:1, IT:1, ES:1, NL:1, PT:0,
                RU:3, BR:-3, AU:10, NZ:12 };
  return MAP[country] ?? 0;
}

/* ------------------------------------------------------------------
 * Discord Client & Redis
 * ------------------------------------------------------------------ */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions
  ],
  partials: [Partials.Message, Partials.Reaction]
});
const HUB = process.env.HUB_ENDPOINT;
const rdb = new Redis({
  url:   process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN
});
const SUPPORT_INVITE = 'https://discord.gg/5jcg3kvWSm';

/* ------------------------------------------------------------------
 * Translation helper (Google unofficial)
 * ------------------------------------------------------------------ */
async function translate(text, target) {
  const url =
    'https://translate.googleapis.com/translate_a/single?client=gtx' +
    `&sl=auto&tl=${target}&dt=t&q=${encodeURIComponent(text)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('translate ' + res.status);
  const data = await res.json();
  return data[0].map(v => v[0]).join('');
}

/* ------------------------------------------------------------------
 * Slash command definitions
 * ------------------------------------------------------------------ */
const cmdSetup = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('Automatically create the Global Chat category and channels')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

const cmdAnnounce = new SlashCommandBuilder()
  .setName('announce')
  .setDescription('Broadcast an announcement to #bot-announcements on all servers')
  .addStringOption(o =>
    o.setName('text').setDescription('Message text').setRequired(true)
  );

const cmdAddItem = new SlashCommandBuilder()
  .setName('additem')
  .setDescription('Add a new shop item (role) dynamically')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption(o =>
    o.setName('name').setDescription('Role name').setRequired(true)
  )
  .addStringOption(o =>
    o.setName('color').setDescription('HEX color code, e.g. #FFA500').setRequired(true)
  );

client.once(Events.ClientReady, async () => {
  await client.application.commands.set([
    cmdSetup, cmdAnnounce, cmdAddItem
  ]);
  console.log(`✅ Logged in as ${client.user.tag}`);
});

/* ------------------------------------------------------------------
 * /setup handler
 * ------------------------------------------------------------------ */
async function handleSetup(interaction) {
  const guild = interaction.guild;
  const everyone = guild.roles.everyone;

  // 1) Global Chat category
  const category = guild.channels.cache.find(c =>
    c.name === 'Global Chat' && c.type === ChannelType.GuildCategory
  ) || await guild.channels.create({
    name: 'Global Chat',
    type: ChannelType.GuildCategory
  });

  // 2) bot-announcements channel
  const botNotice = category.children.cache.find(c =>
    c.name === 'bot-announcements' && c.type === ChannelType.GuildText
  ) || await guild.channels.create({
    name: 'bot-announcements',
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites: [
      { id: everyone.id, deny: [PermissionFlagsBits.SendMessages] }
    ]
  });

  // Send support invite
  try {
    await botNotice.send(
      `🌟 **Thanks for setting up Global Chat Bot!**\n` +
      `Need help or want the latest updates?\n` +
      `Join our support server: ${SUPPORT_INVITE}`
    );
  } catch (err) {
    console.error('Failed to post support invite:', err);
  }

  // 3) Follow source announce channel if configured
  if (process.env.SOURCE_ANNOUNCE_CHANNEL_ID) {
    try {
      const res = await fetch(
        `https://discord.com/api/v10/channels/${process.env.SOURCE_ANNOUNCE_CHANNEL_ID}/followers`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bot ${process.env.DISCORD_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ webhook_channel_id: botNotice.id })
        }
      );
      if (res.ok) console.log('✅ Follow registered for', botNotice.id);
      else console.error('❌ Follow failed', await res.text());
    } catch (err) {
      console.error('❌ Follow error', err);
    }
  }

  // 4) settings channel
  const settingsCh = category.children.cache.find(c =>
    c.name === 'settings' && c.type === ChannelType.GuildText
  ) || await guild.channels.create({
    name: 'settings',
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites: [
      { id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] }
    ]
  });

  // 5) global-chat channel
  const globalCh = category.children.cache.find(c =>
    c.name === 'global-chat' && c.type === ChannelType.GuildText
  ) || await guild.channels.create({
    name: 'global-chat',
    type: ChannelType.GuildText,
    parent: category.id
  });

  // 6) Register with Hub
  await fetch(`${HUB}/global/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ guildId: guild.id, channelId: globalCh.id })
  })
    .then(r => console.log('join status', r.status))
    .catch(e => console.error('join fetch error', e));

  // 7) Language & timezone menus
  const rowLang1 = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('lang1')
      .setPlaceholder('Select language (1/2)')
      .addOptions(LANG_CHOICES.slice(0,25).map(l => ({
        label: l.label, value: l.value, emoji: l.emoji
      })))
  );
  const rowLang2 = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('lang2')
      .setPlaceholder('Select language (2/2)')
      .addOptions(LANG_CHOICES.slice(25).map(l => ({
        label: l.label, value: l.value, emoji: l.emoji
      })))
  );
  const rowTz = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('tz')
      .setPlaceholder('Select time zone')
      .addOptions(TZ_CHOICES)
  );
  const rowAuto = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tz_auto').setLabel('🌏 Auto Detect').setStyle(ButtonStyle.Primary)
  );
  const rowTr = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tr_on').setLabel('Translation ON').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('tr_off').setLabel('Translation OFF').setStyle(ButtonStyle.Danger)
  );

  await settingsCh.send({
    content: '🌐 Configure server language, time zone, and auto-translation',
    components: [rowLang1, rowLang2, rowTz, rowAuto, rowTr]
  });

  await interaction.reply({
    content: '✅ Setup complete!',
    flags: MessageFlags.Ephemeral
  });
}

/* ------------------------------------------------------------------
 * /announce handler
 * ------------------------------------------------------------------ */
async function handleAnnounce(interaction) {
  if (interaction.user.id !== process.env.OWNER_ID) {
    return interaction.reply({
      content: '❌ Only the bot owner can use this command.',
      flags: MessageFlags.Ephemeral
    });
  }
  await interaction.deferReply({ ephemeral: true });
  const text = interaction.options.getString('text');
  const list = await rdb.smembers('global:channels');
  for (const entry of list) {
    const { guildId } = JSON.parse(entry);
    try {
      const g = await client.guilds.fetch(guildId);
      const ch = g.channels.cache.find(c =>
        c.name === 'bot-announcements' && c.isTextBased()
      );
      if (ch) await ch.send(`📢 Announcement\n${text}`);
    } catch {}
  }
  await interaction.editReply({
    content: `✅ Announcement sent to ${list.length} servers.`,
  });
}

/* ------------------------------------------------------------------
 * /additem handler
 * ------------------------------------------------------------------ */
async function handleAddItem(interaction) {
  const name = interaction.options.getString('name').trim();
  let color = interaction.options.getString('color').trim();
  if (!/^#?[0-9A-Fa-f]{6}$/.test(color)) {
    return interaction.reply({
      content: '❌ Invalid HEX color format. Use e.g. #FFA500.',
      flags: MessageFlags.Ephemeral
    });
  }
  if (!color.startsWith('#')) color = '#' + color;

  const id = name.toLowerCase().replace(/\s+/g, '_').replace(/[^0-9a-z_]/g, '');
  const key = 'shop:items';
  const exists = await rdb.hget(key, id);
  if (exists) {
    return interaction.reply({
      content: `❌ An item with ID \`${id}\` already exists.`,
      flags: MessageFlags.Ephemeral
    });
  }

  await rdb.hset(key, { [id]: JSON.stringify({ name, color }) });
  await interaction.reply({
    content: `✅ Added new shop item:\n• ID: \`${id}\`\n• Name: **${name}**\n• Color: **${color}**`,
    flags: MessageFlags.Ephemeral
  });
}

/* ------------------------------------------------------------------
 * Interaction dispatcher
 * ------------------------------------------------------------------ */
client.on(Events.InteractionCreate, async i => {
  if (!i.isChatInputCommand()) return;
  switch (i.commandName) {
    case 'setup':
      return handleSetup(i);
    case 'announce':
      return handleAnnounce(i);
    case 'additem':
      return handleAddItem(i);
  }

  if (i.isStringSelectMenu()) {
    if (['lang1', 'lang2'].includes(i.customId)) {
      const lang = i.values[0];
      await rdb.hset(`lang:${i.guildId}`, { lang, autoTranslate: 'true' });
      return i.update({
        content: `📌 Server language set to **${lang}**`,
        components: i.message.components,
        flags: MessageFlags.Ephemeral
      });
    }
    if (i.customId === 'tz') {
      const tz = i.values[0];
      await rdb.hset(`tz:${i.guildId}`, { tz });
      return i.update({
        content: `🕒 Time zone set to UTC${tz >= 0 ? '+' : ''}${tz}`,
        components: i.message.components,
        flags: MessageFlags.Ephemeral
      });
    }
  }

  if (i.isButton()) {
    if (i.customId === 'tz_auto') {
      const guessed = guessOffsetByLocale(i.locale);
      const sign = guessed >= 0 ? '+' : '';
      return i.reply({
        content: `🌏 Detected UTC${sign}${guessed}`,
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`tz_yes_${guessed}`).setLabel('Yes').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('tz_no').setLabel('No').setStyle(ButtonStyle.Danger)
          )
        ],
        flags: MessageFlags.Ephemeral
      });
    }
    if (i.customId.startsWith('tz_yes_')) {
      const tz = i.customId.split('_')[2];
      await rdb.hset(`tz:${i.guildId}`, { tz });
      return i.update({ content: `🕒 Time zone set to UTC${tz}`, components: [], flags: MessageFlags.Ephemeral });
    }
    if (i.customId === 'tz_no') {
      return i.update({ content: '⏹️ Cancelled.', components: [], flags: MessageFlags.Ephemeral });
    }
    if (['tr_on', 'tr_off'].includes(i.customId)) {
      const flag = i.customId === 'tr_on' ? 'true' : 'false';
      await rdb.hset(`lang:${i.guildId}`, { autoTranslate: flag });
      return i.reply({
        content: `🔄 Auto-translation turned **${flag === 'true' ? 'ON' : 'OFF'}**`,
        flags: MessageFlags.Ephemeral
      });
    }
  }
});

/* ------------------------------------------------------------------
 * Message relay to Hub
 * ------------------------------------------------------------------ */
client.on(Events.MessageCreate, async msg => {
  if (msg.author.bot) return;
  const key = JSON.stringify({ guildId: msg.guildId, channelId: msg.channelId });
  if (!(await rdb.sismember('global:channels', key))) return;

  const tzInfo = await rdb.hgetall(`tz:${msg.guildId}`);
  const originTz = tzInfo?.tz || '0';
  let replyContent = null;
  if (msg.reference?.messageId) {
    try {
      const ref = await msg.channel.messages.fetch(msg.reference.messageId);
      replyContent = ref.content || ref.embeds?.[0]?.description || '(embed)';
    } catch {}
  }

  await fetch(`${HUB}/publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      globalId:    randomUUID(),
      guildId:     msg.guildId,
      channelId:   msg.channelId,
      userTag:     msg.author.tag,
      userAvatar:  msg.author.displayAvatarURL(),
      originGuild: msg.guild.name,
      originTz,
      content:     msg.content,
      replyTo:     msg.reference?.messageId || null,
      replyContent,
      sentAt:      Date.now(),
      files:       msg.attachments.map(a => ({ attachment: a.url, name: a.name }))
    })
  }).catch(e => console.error('publish ERR', e));
});

/* ------------------------------------------------------------------
 * Relay endpoint
 * ------------------------------------------------------------------ */
const api = express();
api.use(bodyParser.json());

api.post('/relay', async (req, res) => {
  console.log('relay req →', req.body);
  const {
    toGuild, toChannel, userTag, userAvatar, originGuild,
    originTz = '0', content, replyTo, replyContent,
    files, targetLang, sentAt
  } = req.body;

  try {
    const g = await client.guilds.fetch(toGuild);
    const ch = await g.channels.fetch(toChannel);
    if (!ch.isTextBased()) return res.sendStatus(404);

    let translated = null;
    let wasTranslated = false;
    if (targetLang) {
      try {
        translated = await translate(content, targetLang);
        wasTranslated = true;
      } catch {}
    }

    const description = wasTranslated
      ? `> ${content}\n\n**${translated}**`
      : content;
    const authorName = `${userTag} [UTC${originTz >= 0 ? '+' : ''}${originTz}] @ ${originGuild}`;
    const embed = {
      author:      { name: authorName, icon_url: userAvatar },
      description,
      footer:      { text: `🌐 global chat${wasTranslated ? ' • auto-translated' : ''}` },
      timestamp:   sentAt ? new Date(sentAt).toISOString() : undefined
    };

    const opts = { embeds: [embed] };
    if (files?.length) opts.files = files;

    if (replyTo) {
      try {
        await ch.messages.fetch(replyTo);
        opts.reply = { messageReference: replyTo };
      } catch {
        embed.fields = [{
          name: 'Reply',
          value: replyContent ? `> ${replyContent.slice(0, 180)}` : '(original message)'
        }];
      }
    }

    const sent = await ch.send(opts);
    res.send({ status: 'relayed', messageId: sent.id });
  } catch (err) {
    console.error('Relay error:', err);
    res.sendStatus(500);
  }
});

api.get('/healthz', (_q, r) => r.send('OK'));
api.listen(process.env.PORT || 3000, () => console.log('🚦 Relay server listening on port', process.env.PORT || 3000));

/* ------------------------------------------------------------------
 * Reaction translation
 * ------------------------------------------------------------------ */
client.on(Events.MessageReactionAdd, async (reaction, user) => {
  if (user.bot) return;
  if (reaction.partial) await reaction.fetch();
  if (reaction.message.partial) await reaction.message.fetch();

  const lang = FLAG_TO_LANG[reaction.emoji.name];
  if (!lang) return;

  const original = reaction.message.content;
  if (!original) return;
  try {
    const translated = await translate(original, lang);
    await reaction.message.reply({
      embeds: [{
        description: `> ${original}\n\n**${translated}**`,
        footer: { text: `🌐 translated to ${lang}` }
      }]
    });
  } catch (e) {
    console.error('Translate reaction error:', e);
  }
});
