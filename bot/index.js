/**
 * Discord Bot – Global Chat (2025-05-27)
 * -------------------------------------
 * • インライン翻訳
 * • 時差タグ + 都市名＆国旗付きラベル  ✅ new
 * • 🌏 自動タイムゾーン判定ボタン     ✅ new
 */

import 'dotenv/config';
import express from 'express';
import bodyParser from 'body-parser';
import fetch from 'node-fetch';
import {
  Client, GatewayIntentBits, Partials, Events,
  SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder,
  ButtonBuilder, ButtonStyle, PermissionFlagsBits
} from 'discord.js';
import { randomUUID } from 'crypto';
import { Redis } from '@upstash/redis';

/* ---------- タイムゾーン選択肢（UTC-12〜+12） ---------- */
const CITY_BY_OFFSET = {
  '-12': 'Baker Island',      '-11': 'American Samoa', '-10': 'Hawaii',
   '-9': 'Alaska',             '-8': 'Los Angeles',     '-7': 'Denver',
   '-6': 'Chicago',            '-5': 'New York / Toronto',
   '-4': 'Santiago',           '-3': 'Buenos Aires',    '-2': 'South Georgia',
   '-1': 'Azores',              '0': 'London (GMT)',
    '1': 'Berlin / Paris',      '2': 'Athens / Cairo',   '3': 'Moscow / Nairobi',
    '4': 'Dubai',               '5': 'Pakistan',         '6': 'Bangladesh',
    '7': 'Bangkok / Jakarta',   '8': 'Beijing / Singapore',
    '9': 'Tokyo / Seoul',      '10': 'Sydney',          '11': 'Solomon Is.',
   '12': 'Auckland'
};

const FLAG_BY_OFFSET = {
  '-12':'🇺🇸','-11':'🇺🇸','-10':'🇺🇸','-9':'🇺🇸','-8':'🇺🇸','-7':'🇺🇸',
  '-6':'🇺🇸','-5':'🇺🇸','-4':'🇨🇱','-3':'🇦🇷','-2':'🇬🇸','-1':'🇵🇹',
   '0':'🇬🇧','1':'🇪🇺','2':'🇪🇬','3':'🇰🇪','4':'🇦🇪','5':'🇵🇰',
   '6':'🇧🇩','7':'🇹🇭','8':'🇨🇳','9':'🇯🇵','10':'🇦🇺','11':'🇸🇧','12':'🇳🇿'
};

const TZ_CHOICES = Array.from({ length: 25 }, (_, i) => {
  const offset = -12 + i;
  const sign   = offset >= 0 ? '+' : '';
  const label  = `UTC${sign}${offset}  ${FLAG_BY_OFFSET[offset]}  ${CITY_BY_OFFSET[offset]}`;
  return { label, value: String(offset) };
});

/* ---------- 時差自動判定ヘルパ ---------- */
function guessOffsetByLocale(locale = 'en-US') {
  const country = locale.split('-')[1] ?? (locale === 'ja' ? 'JP' : 'US');
  const MAP = { JP:9, KR:9, CN:8, TW:8, HK:8, SG:8, TH:7, ID:7, IN:5,
                GB:0, US:-5, CA:-5, DE:1, FR:1, IT:1, ES:1, NL:1, PT:0,
                RU:3, BR:-3, AU:10, NZ:12 };
  return MAP[country] ?? 0;
}

/* ---------- 基本 ---------- */
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

/* ---------- 翻訳ヘルパ（Google 非公式） ---------- */
async function translate(text, target) {
  const url =
    'https://translate.googleapis.com/translate_a/single?client=gtx' +
    `&sl=auto&tl=${target}&dt=t&q=${encodeURIComponent(text)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('translate ' + res.status);
  const data = await res.json();
  return data[0].map(v => v[0]).join('');
}

/* ---------- 国旗リアクション → 言語 ---------- */
const FLAG_TO_LANG = {
  '🇯🇵':'ja','🇺🇸':'en','🇬🇧':'en','🇨🇳':'zh','🇹🇼':'zh','🇰🇷':'ko',
  '🇮🇳':'hi','🇹🇭':'th','🇻🇳':'vi','🇮🇩':'id','🇵🇭':'tl','🇹🇷':'tr',
  '🇸🇦':'ar','🇪🇸':'es','🇫🇷':'fr','🇵🇹':'pt','🇮🇹':'it','🇩🇪':'de',
  '🇷🇺':'ru','🇳🇱':'nl','🇵🇱':'pl','🇸🇪':'sv'
};

/* ---------- Slash Commands ---------- */
export const cmdSetup = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('グローバルチャット用カテゴリとチャンネルを自動作成')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export const cmdAnnounce = new SlashCommandBuilder()
  .setName('announce')
  .setDescription('全サーバーの #bot-お知らせ へ一斉送信 (運営)')
  .addStringOption(o =>
    o.setName('text').setDescription('本文').setRequired(true)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

/* ---------- /setup ---------- */
async function handleSetup(i) {
  const g        = i.guild;
  const everyone = g.roles.everyone;

  /* カテゴリ / チャンネル作成 or 取得 */
  const cat = g.channels.cache.find(c => c.name === 'グローバルチャット' && c.type === 4)
           || await g.channels.create({ name: 'グローバルチャット', type: 4 });

  const botNotice = cat.children.cache.find(c => c.name === 'bot-お知らせ')
           || await g.channels.create({
                name: 'bot-お知らせ', type: 0, parent: cat.id,
                permissionOverwrites: [
                  { id: everyone.id, deny: [PermissionFlagsBits.SendMessages] }
                ]
              });

  const setting = cat.children.cache.find(c => c.name === '設定変更')
           || await g.channels.create({
                name: '設定変更', type: 0, parent: cat.id,
                permissionOverwrites: [
                  { id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] }
                ]
              });

  const glChat = cat.children.cache.find(c => c.name === 'グローバルチャット' && c.id !== cat.id)
           || await g.channels.create({ name: 'グローバルチャット', type: 0, parent: cat.id });

  /* Hub 登録 */
  await fetch(`${HUB}/global/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ guildId: g.id, channelId: glChat.id })
  });

  /* コンポーネント */
  const menuLang = new StringSelectMenuBuilder()
    .setCustomId('lang_select')
    .setPlaceholder('サーバー言語を選択')
    .addOptions([
      { label:'日本語', value:'ja' }, { label:'English', value:'en' },
      { label:'한국어', value:'ko' }, { label:'简体中文', value:'zh' },
      { label:'Español', value:'es' }
    ]);

  const menuTz = new StringSelectMenuBuilder()
    .setCustomId('tz_select')
    .setPlaceholder('サーバーの標準タイムゾーンを選択')
    .addOptions(TZ_CHOICES);

  const rowLang = new ActionRowBuilder().addComponents(menuLang);
  const rowTz   = new ActionRowBuilder().addComponents(menuTz);

  const rowTzAuto = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tz_auto').setLabel('🌏 自動判定').setStyle(ButtonStyle.Primary)
  );

  const rowBtn = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tr_on').setLabel('翻訳ON').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('tr_off').setLabel('翻訳OFF').setStyle(ButtonStyle.Danger)
  );

  await setting.send({
    content: '🌐 サーバー言語・タイムゾーン・自動翻訳を設定してください',
    components: [rowLang, rowTz, rowTzAuto, rowBtn]
  });
  await i.reply({ content: '✅ セットアップ完了！', ephemeral: true });
}

/* ---------- /announce ---------- */
async function handleAnnounce(i) {
  if (i.user.id !== process.env.OWNER_ID)
    return i.reply({ content: '権限がありません', ephemeral: true });

  const text = i.options.getString('text');
  const list = await rdb.smembers('global:channels');
  for (const entry of list) {
    const { guildId } = JSON.parse(entry);
    try {
      const g  = await client.guilds.fetch(guildId);
      const ch = g.channels.cache.find(c => c.name === 'bot-お知らせ' && c.isTextBased());
      if (ch) await ch.send(`📢 **運営からのお知らせ**\n${text}`);
    } catch {/* ignore */}
  }
  await i.reply({ content: '送信しました', ephemeral: true });
}

/* ---------- Interaction Dispatcher ---------- */
client.on(Events.InteractionCreate, async i => {
  /* ----- Command ----- */
  if (i.isChatInputCommand()) {
    if (i.commandName === 'setup')    return handleSetup(i);
    if (i.commandName === 'announce') return handleAnnounce(i);
  }

  /* ----- 言語選択 ----- */
  if (i.isStringSelectMenu() && i.customId === 'lang_select') {
    const lang = i.values[0];
    await rdb.hset(`lang:${i.guildId}`, { lang });
    return i.reply({ content: `📌 言語を **${lang}** に設定しました`, ephemeral: true });
  }

  /* ----- タイムゾーン選択 ----- */
  if (i.isStringSelectMenu() && i.customId === 'tz_select') {
    const tz = i.values[0];
    await rdb.hset(`tz:${i.guildId}`, { tz });
    return i.reply({ content: `🕒 タイムゾーンを **UTC${tz >= 0 ? '+' : ''}${tz}** に設定しました`, ephemeral: true });
  }

  /* ----- 自動判定 (Step 1) ----- */
  if (i.isButton() && i.customId === 'tz_auto') {
    const guessed = guessOffsetByLocale(i.locale);
    const sign    = guessed >= 0 ? '+' : '';
    const label   = `UTC${sign}${guessed}`;
    await i.reply({
      content: `🌏 あなたのロケールから **${label} (${CITY_BY_OFFSET[guessed]})** を検出しました。このタイムゾーンで設定してよろしいですか？`,
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`tz_yes_${guessed}`).setLabel('はい').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('tz_no').setLabel('いいえ').setStyle(ButtonStyle.Danger)
        )
      ],
      ephemeral: true
    });
  }

  /* ----- 自動判定 (Step 2) 確定 ----- */
  if (i.isButton() && i.customId.startsWith('tz_yes_')) {
    const tz = i.customId.replace('tz_yes_', '');
    await rdb.hset(`tz:${i.guildId}`, { tz });
    return i.update({ content: `🕒 タイムゾーンを **UTC${tz >= 0 ? '+' : ''}${tz}** に設定しました`, components: [] });
  }

  /* ----- 自動判定 キャンセル ----- */
  if (i.isButton() && i.customId === 'tz_no') {
    return i.update({ content: '⏹️ 設定をキャンセルしました。手動で選択してください。', components: [] });
  }

  /* ----- 翻訳 ON/OFF ----- */
  if (i.isButton() && (i.customId === 'tr_on' || i.customId === 'tr_off')) {
    const flag = i.customId === 'tr_on';
    await rdb.hset(`lang:${i.guildId}`, { autoTranslate: flag });
    return i.reply({ content: `🔄 自動翻訳を **${flag ? 'ON' : 'OFF'}**`, ephemeral: true });
  }
});

/* ---------- メッセージ → Hub ---------- */
client.on(Events.MessageCreate, async msg => {
  if (msg.author.bot) return;
  const key = JSON.stringify({ guildId: msg.guildId, channelId: msg.channelId });
  if (!(await rdb.sismember('global:channels', key))) return;

  const tzInfo = await rdb.hgetall(`tz:${msg.guildId}`);
  const originTz = tzInfo?.tz ?? '0';

  let replyContent = null;
  if (msg.reference?.messageId) {
    try {
      const parent = await msg.channel.messages.fetch(msg.reference.messageId);
      replyContent = parent.content || parent.embeds?.[0]?.description || '(embed)';
    } catch {/* ignore */}
  }

  await fetch(`${HUB}/publish`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      globalId:   randomUUID(),
      guildId:    msg.guildId,
      channelId:  msg.channelId,
      userTag:    msg.author.tag,
      userAvatar: msg.author.displayAvatarURL(),
      originGuild: msg.guild.name,
      originTz,
      content:   msg.content,
      replyTo:   msg.reference?.messageId ?? null,
      replyContent,
      sentAt:    Date.now(),
      files:     msg.attachments.map(a => ({ url: a.url, name: a.name }))
    })
  });
});

/* ---------- Relay 受信 (インライン翻訳 + TZ 表示) ---------- */
const api = express();
api.use(bodyParser.json());

api.post('/relay', async (req, res) => {
  const {
    toGuild, toChannel,
    userTag, userAvatar, originGuild,
    originTz = '0',
    content, replyTo, replyContent,
    files, targetLang, sentAt
  } = req.body;

  try {
    const g  = await client.guilds.fetch(toGuild);
    const ch = await g.channels.fetch(toChannel);
    if (!ch.isTextBased()) return res.sendStatus(404);

    /* 翻訳 */
    let translated = null, wasTranslated = false;
    if (targetLang) {
      try {
        translated    = await translate(content, targetLang);
        wasTranslated = true;
      } catch (err) { console.error('Translate API err:', err.message); }
    }

    /* Embed */
    const desc = wasTranslated
      ? `> ${content}\n\n**${translated}**`
      : content;

    const authorName = `${userTag} [UTC${originTz >= 0 ? '+' : ''}${originTz}] @ ${originGuild}`;

    const embed = {
      author: { name: authorName, icon_url: userAvatar },
      description: desc,
      footer: { text: `🌐 global chat${wasTranslated ? ' • auto-translated' : ''}` },
      timestamp: sentAt ? new Date(sentAt).toISOString() : undefined
    };

    const opts = { embeds:[embed] };
    if (files?.length) opts.files = files;

    if (replyTo) {
      try {
        await ch.messages.fetch(replyTo, { cache: false });
        opts.reply = { messageReference: replyTo };
      } catch {
        const quote = replyContent ? `> ${replyContent.slice(0,180)}` : '(元メッセージが別サーバー)';
        embed.fields = [{ name:'Reply', value: quote }];
      }
    }

    const sent = await ch.send(opts);
    res.send({ status:'relayed', messageId: sent.id });
  } catch (err) {
    console.error('Relay error:', err.message);
    res.sendStatus(500);
  }
});

/* ---------- 国旗リアクション翻訳 ---------- */
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
  } catch (err) {
    console.error('Translate error:', err.message);
  }
});

/* ---------- 起動 ---------- */
client.once(Events.ClientReady, () => console.log(`✅ Logged in as ${client.user.tag}`));
client.login(process.env.DISCORD_TOKEN);

api.get('/healthz', (_q, r) => r.send('OK'));
api.listen(process.env.PORT || 3000);
