/**
 * Discord Bot – Global Chat (省略なしフル版)
 * -----------------------------------------
 * - /setup : カテゴリ＆3チャンネル自動生成＋Hub登録＋言語UI
 * - /announce : 運営向け全サーバーBroadcast
 * - /global join|leave : 手動追加/解除
 * - 登録チャンネルのみを中継・画像対応
 * - 国旗リアクション翻訳
 * - クロスギルド reply は存在確認して無ければ Embed フィールドにフォールバック
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
  PermissionFlagsBits
} from 'discord.js';
import { randomUUID } from 'crypto';
import { Redis } from '@upstash/redis';
import { LANG_CHOICES } from './constants.js';
import { data as cmdGlobal } from './commands/global.js'; // /global join|leave

/* ---------- Discord Client ---------- */
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
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN
});

/* ---------- 翻訳ヘルパ ---------- */
async function translate(text, target) {
  const url =
    'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto' +
    `&tl=${target}&dt=t&q=${encodeURIComponent(text)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('translate ' + res.status);
  const data = await res.json();
  return data[0].map(v => v[0]).join('');
}

/* ---------- FLAG → LANG ---------- */
const FLAG_TO_LANG = {
  '🇯🇵': 'ja', '🇺🇸': 'en', '🇬🇧': 'en',
  '🇨🇳': 'zh', '🇹🇼': 'zh', '🇰🇷': 'ko',
  '🇮🇳': 'hi', '🇹🇭': 'th', '🇻🇳': 'vi',
  '🇮🇩': 'id', '🇵🇭': 'tl', '🇹🇷': 'tr', '🇸🇦': 'ar',
  '🇪🇸': 'es', '🇫🇷': 'fr', '🇵🇹': 'pt',
  '🇮🇹': 'it', '🇩🇪': 'de', '🇷🇺': 'ru',
  '🇳🇱': 'nl', '🇵🇱': 'pl', '🇸🇪': 'sv'
};

/* ---------- Slash Commands ---------- */
export const cmdSetup = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('グローバルチャット用カテゴリとチャンネルを自動作成')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export const cmdAnnounce = new SlashCommandBuilder()
  .setName('announce')
  .setDescription('全サーバーの #bot-お知らせ に一斉送信（運営専用）')
  .addStringOption(o =>
    o.setName('text').setDescription('本文').setRequired(true)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

/* ---------- /setup ---------- */
async function handleSetup(i) {
  const g = i.guild;

  // カテゴリ作成 or 取得
  const cat =
    g.channels.cache.find(c => c.name === 'グローバルチャット' && c.type === 4) ||
    await g.channels.create({ name: 'グローバルチャット', type: 4 });

  // サブチャンネル作成 or 取得
  const botNotice =
    cat.children.cache.find(c => c.name === 'bot-お知らせ') ||
    await g.channels.create({ name: 'bot-お知らせ', type: 0, parent: cat.id });

  const setting =
    cat.children.cache.find(c => c.name === '設定変更') ||
    await g.channels.create({ name: '設定変更', type: 0, parent: cat.id });

  const glChat =
    cat.children.cache.find(
      c => c.name === 'グローバルチャット' && c.id !== cat.id
    ) ||
    await g.channels.create({ name: 'グローバルチャット', type: 0, parent: cat.id });

  // Hub に登録
  await fetch(`${HUB}/global/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ guildId: g.id, channelId: glChat.id })
  });

  // 言語設定 UI メッセージ
  const select = new StringSelectMenuBuilder()
    .setCustomId('lang_select')
    .setPlaceholder('言語を選択')
    .addOptions(LANG_CHOICES);

  const rowSel = new ActionRowBuilder().addComponents(select);
  const rowBtn = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tr_on').setLabel('翻訳ON').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('tr_off').setLabel('翻訳OFF').setStyle(ButtonStyle.Danger)
  );

  await setting.send({
    content: '🌐 サーバー言語と翻訳設定を選択してください',
    components: [rowSel, rowBtn]
  });

  await i.reply({ content: '✅ セットアップ完了！', flags: 64 });
}

/* ---------- /announce ---------- */
async function handleAnnounce(i) {
  if (i.user.id !== process.env.OWNER_ID)
    return i.reply({ content: '権限がありません', flags: 64 });

  const text = i.options.getString('text');
  const list = await rdb.smembers('global:channels');

  for (const entry of list) {
    const { guildId } = JSON.parse(entry);
    try {
      const g = await client.guilds.fetch(guildId);
      const ch = g.channels.cache.find(c => c.name === 'bot-お知らせ' && c.isTextBased());
      if (ch) await ch.send(`📢 **運営からのお知らせ**\n${text}`);
    } catch {/* ignore */}
  }
  await i.reply({ content: '送信しました', flags: 64 });
}

/* ---------- Interaction Dispatcher ---------- */
client.on(Events.InteractionCreate, async i => {
  if (i.isChatInputCommand()) {
    if (i.commandName === 'setup')    return handleSetup(i);
    if (i.commandName === 'announce') return handleAnnounce(i);
  }

  // 言語セレクト
  if (i.isStringSelectMenu() && i.customId === 'lang_select') {
    const lang = i.values[0];
    await rdb.hset(`lang:${i.guildId}`, { lang });
    await i.reply({ content: `📌 言語を **${lang}** に設定しました`, flags: 64 });
  }

  // 翻訳 ON/OFF
  if (i.isButton() && (i.customId === 'tr_on' || i.customId === 'tr_off')) {
    const flag = i.customId === 'tr_on';
    await rdb.hset(`lang:${i.guildId}`, { autoTranslate: flag });
    await i.reply({ content: `🔄 自動翻訳を **${flag ? 'ON' : 'OFF'}**`, flags: 64 });
  }
});

/* ---------- Message → Hub (登録チャンネルのみ) ---------- */
client.on(Events.MessageCreate, async msg => {
  if (msg.author.bot) return;

  const key = JSON.stringify({ guildId: msg.guildId, channelId: msg.channelId });
  if (!(await rdb.sismember('global:channels', key))) return;

  await fetch(`${HUB}/publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      globalId: randomUUID(),
      guildId: msg.guildId,
      channelId: msg.channelId,
      userTag: msg.author.tag,
      userAvatar: msg.author.displayAvatarURL(),
      originGuild: msg.guild.name,
      content: msg.content,
      replyTo: msg.reference?.messageId ?? null,
      files: msg.attachments.map(a => ({ url: a.url, name: a.name }))
    })
  });
});

/* ---------- Relay 受信 (安全な reply) ---------- */
const api = express(); api.use(bodyParser.json());

api.post('/relay', async (req, res) => {
  const { toGuild, toChannel, userTag, userAvatar, originGuild,
          content, replyTo, files } = req.body;
  try {
    const g  = await client.guilds.fetch(toGuild);
    const ch = await g.channels.fetch(toChannel);
    if (!ch.isTextBased()) return res.sendStatus(404);

    const embed = {
      author: { name: `${userTag} @ ${originGuild}`, icon_url: userAvatar },
      description: content,
      footer: { text: '🌐 global chat' }
    };

    const opts = { embeds: [embed] };
    if (files?.length) opts.files = files;

    // --- reply 試行 ---
    if (replyTo) {
      try {
        await ch.messages.fetch(replyTo, { cache: false });
        opts.reply = { messageReference: replyTo };
      } catch {
        embed.fields = [{ name: 'Reply', value: '(元メッセージは別サーバー)' }];
      }
    }

    const sent = await ch.send(opts);
    res.send({ status: 'relayed', messageId: sent.id });
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
client.once(Events.ClientReady, () =>
  console.log(`✅ Logged in as ${client.user.tag}`)
);
client.login(process.env.DISCORD_TOKEN);
api.get('/healthz', (_q, r) => r.send('OK'));
api.listen(process.env.PORT || 3000);
