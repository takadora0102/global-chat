// index.js – Global Chat Bot (2025-05-30 Existing Announcement Follow Only)
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
 * UTC±12 の都市名＋国旗定義
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
  const o = -12 + i, s = o >= 0 ? '+' : '';
  return {
    label: `UTC${s}${o}  ${FLAG_BY_OFFSET[o]}  ${CITY_BY_OFFSET[o]}`,
    value: String(o)
  };
});
function guessOffsetByLocale(locale = 'en-US') {
  const country = locale.split('-')[1] ?? (locale === 'ja' ? 'JP' : 'US');
  const M = { JP:9, KR:9, CN:8, TW:8, HK:8, SG:8, TH:7, ID:7, IN:5,
              GB:0, US:-5, CA:-5, DE:1, FR:1, IT:1, ES:1, NL:1, PT:0,
              RU:3, BR:-3, AU:10, NZ:12 };
  return M[country] ?? 0;
}

/* ------------------------------------------------------------------
 * Discord クライアント & Redis
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

/* ------------------------------------------------------------------
 * 翻訳ヘルパ（Google 非公式）
 * ------------------------------------------------------------------ */
async function translate(text, target) {
  const url = 'https://translate.googleapis.com/translate_a/single?client=gtx'
            + `&sl=auto&tl=${target}&dt=t&q=${encodeURIComponent(text)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('translate ' + res.status);
  const data = await res.json();
  return data[0].map(v => v[0]).join('');
}

/* ------------------------------------------------------------------
 * スラッシュコマンド定義
 * ------------------------------------------------------------------ */
export const cmdSetup = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('グローバルチャット用カテゴリとチャンネルを自動作成')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export const cmdAnnounce = new SlashCommandBuilder()
  .setName('announce')
  .setDescription('全サーバーへの一斉通知（BOTオーナー限定）')
  .addStringOption(o => o.setName('text').setDescription('本文').setRequired(true));

/* ------------------------------------------------------------------
 * /setup ハンドラ
 * ------------------------------------------------------------------ */
async function handleSetup(interaction) {
  const guild = interaction.guild;
  const everyone = guild.roles.everyone;

  // 1) カテゴリ
  const category = guild.channels.cache.find(c =>
    c.name === 'グローバルチャット' && c.type === ChannelType.GuildCategory
  ) || await guild.channels.create({
    name: 'グローバルチャット',
    type: ChannelType.GuildCategory
  });

  // 2) bot-お知らせ をテキストチャンネルで作成
  const botNotice = category.children.cache.find(c =>
    c.name === 'bot-お知らせ' && c.type === ChannelType.GuildText
  ) || await guild.channels.create({
    name: 'bot-お知らせ',
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites: [
      { id: everyone.id, deny: [ PermissionFlagsBits.SendMessages ] }
    ]
  });

  // 3) 既存アナウンスチャンネルのフォロー登録 (手動作成済みのニュースチャンネルを指定)
  if (process.env.SOURCE_ANNOUNCE_CHANNEL_ID) {
    try {
      // フォロー先は手動で用意済みのニュースチャンネル ID
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

  // 4) 設定変更チャンネル
  const settingCh = category.children.cache.find(c =>
    c.name === '設定変更' && c.type === ChannelType.GuildText
  ) || await guild.channels.create({
    name: '設定変更',
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites: [
      { id: everyone.id, deny: [ PermissionFlagsBits.ViewChannel ] }
    ]
  });

  // 5) グローバルチャット用チャンネル
  const globalCh = category.children.cache.find(c =>
    c.name === 'グローバルチャット' &&
    c.type === ChannelType.GuildText &&
    c.id !== category.id
  ) || await guild.channels.create({
    name: 'グローバルチャット',
    type: ChannelType.GuildText,
    parent: category.id
  });

  // 6) Hub へ登録
  await fetch(`${HUB}/global/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ guildId: guild.id, channelId: globalCh.id })
  })
    .then(r => console.log('join status', r.status))
    .catch(e => console.error('join fetch error', e));

  // 7) 言語選択メニュー（二分割）
  const rowLang1 = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('lang_select_1')
      .setPlaceholder('言語選択 (1/2)')
      .addOptions(LANG_CHOICES.slice(0, 25).map(l => ({
        label: l.label,
        value: l.value,
        emoji: l.emoji
      })))
  );
  const rowLang2 = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('lang_select_2')
      .setPlaceholder('言語選択 (2/2)')
      .addOptions(LANG_CHOICES.slice(25).map(l => ({
        label: l.label,
        value: l.value,
        emoji: l.emoji
      })))
  );

  // 8) タイムゾーン＋自動判定＋翻訳 ON/OFF
  const rowTz     = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('tz_select')
      .setPlaceholder('タイムゾーンを選択')
      .addOptions(TZ_CHOICES)
  );
  const rowTzAuto = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tz_auto').setLabel('🌏 自動判定').setStyle(ButtonStyle.Primary)
  );
  const rowTrans  = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tr_on').setLabel('翻訳ON').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('tr_off').setLabel('翻訳OFF').setStyle(ButtonStyle.Danger)
  );

  // 9) 設定メッセージ送信
  await settingCh.send({
    content: '🌐 サーバー言語・タイムゾーン・自動翻訳を設定してください',
    components: [rowLang1, rowLang2, rowTz, rowTzAuto, rowTrans]
  });
  await interaction.reply({
    content: '✅ セットアップ完了！',
    flags: MessageFlags.Ephemeral
  });
}

/* ------------------------------------------------------------------
 * /announce ハンドラ
 * ------------------------------------------------------------------ */
async function handleAnnounce(interaction) {
  if (interaction.user.id !== process.env.OWNER_ID) {
    return interaction.reply({
      content: '❌ BOTオーナーのみ実行可',
      flags: MessageFlags.Ephemeral
    });
  }
  await interaction.deferReply({ ephemeral: true });
  const text = interaction.options.getString('text');
  const list = await rdb.smembers('global:channels');
  for (const entry of list) {
    const { guildId } = JSON.parse(entry);
    try {
      const g  = await client.guilds.fetch(guildId);
      const ch = g.channels.cache.find(c =>
        c.name === 'bot-お知らせ' && c.isTextBased()
      );
      if (ch) await ch.send(`📢 **運営からのお知らせ**\n${text}`);
    } catch {/* ignore */}
  }
  await interaction.editReply({
    content: `✅ ${list.length} サーバーに送信しました`
  });
}

/* ------------------------------------------------------------------
 * InteractionCreate Dispatcher
 * ------------------------------------------------------------------ */
client.on(Events.InteractionCreate, async i => {
  if (i.isChatInputCommand()) {
    if (i.commandName === 'setup')    return handleSetup(i);
    if (i.commandName === 'announce') return handleAnnounce(i);
  }
  if (i.isStringSelectMenu()) {
    if (['lang_select_1','lang_select_2'].includes(i.customId)) {
      const lang = i.values[0];
      await rdb.hset(`lang:${i.guildId}`, { lang, autoTranslate: 'true' });
      return i.reply({
        content: `📌 言語を **${lang}** に設定しました`,
        flags: MessageFlags.Ephemeral
      });
    }
    if (i.customId === 'tz_select') {
      const tz = i.values[0];
      await rdb.hset(`tz:${i.guildId}`, { tz });
      return i.reply({
        content: `🕒 タイムゾーンを **UTC${tz>=0?'+':''}${tz}** に設定しました`,
        flags: MessageFlags.Ephemeral
      });
    }
  }
  if (i.isButton()) {
    // ── tz_auto, tz_yes_*, tz_no, tr_on/off handlers ──
  }
});

/* ------------------------------------------------------------------
 * MessageCreate → Hub /publish（画像対応）
 * ------------------------------------------------------------------ */
client.on(Events.MessageCreate, async msg => {
  if (msg.author.bot) return;
  const key = JSON.stringify({ guildId:msg.guildId, channelId:msg.channelId });
  if (!(await rdb.sismember('global:channels',key))) return;

  const tzInfo = await rdb.hgetall(`tz:${msg.guildId}`);
  const originTz = tzInfo?.tz ?? '0';
  let replyContent = null;
  if (msg.reference?.messageId) {
    try {
      const p = await msg.channel.messages.fetch(msg.reference.messageId);
      replyContent = p.content || p.embeds?.[0]?.description || '(embed)';
    } catch {}
  }

  await fetch(`${HUB}/publish`, {
    method: 'POST',
    headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify({
      globalId:    randomUUID(),
      guildId:     msg.guildId,
      channelId:   msg.channelId,
      userTag:     msg.author.tag,
      userAvatar:  msg.author.displayAvatarURL(),
      originGuild: msg.guild.name,
      originTz,
      content:     msg.content,
      replyTo:     msg.reference?.messageId||null,
      replyContent,
      sentAt:      Date.now(),
      // ← a.url を attachment にすることで画像が送れます
      files:       msg.attachments.map(a=>({ attachment:a.url, name:a.name }))
    })
  })
    .then(r=>r.text().then(t=>console.log('publish',r.status,t)))
    .catch(e=>console.error('publish ERR',e));
});

/* ------------------------------------------------------------------
 * /relay → Bot
 * ------------------------------------------------------------------ */
const api = express();
api.use(bodyParser.json());

api.post('/relay', async (req, res) => {
  console.log('relay req →', req.body);
  const {
    toGuild, toChannel, userTag, userAvatar, originGuild, originTz='0',
    content, replyTo, replyContent, files, targetLang, sentAt
  } = req.body;
  try {
    const g = await client.guilds.fetch(toGuild);
    let ch;
    try { ch = await g.channels.fetch(toChannel); }
    catch(err) {
      console.error('Relay fetch channel error:', err.code, err.message);
      if (err.code===10003) return res.status(410).send({status:'unknown_channel'});
      return res.status(500).send({status:'fetch_channel_error'});
    }
    if (!ch.isTextBased()) return res.sendStatus(404);

    let translated=null, wasTranslated=false;
    if (targetLang) {
      try { translated=await translate(content,targetLang); wasTranslated=true; }
      catch(e){ console.error('Translate error:',e.message); }
    }
    const desc = wasTranslated
      ? `> ${content}\n\n**${translated}**`
      : content;
    const authorName = `${userTag} [UTC${originTz>=0?'+':''}${originTz}] @ ${originGuild}`;
    const embed = {
      author:{ name:authorName, icon_url:userAvatar },
      description:desc,
      footer:{ text:`🌐 global chat${wasTranslated?' • auto-translated':''}` },
      timestamp: sentAt?new Date(sentAt).toISOString():undefined
    };

    const opts = { embeds:[embed] };
    if (files?.length) opts.files = files;

    if (replyTo) {
      try {
        await ch.messages.fetch(replyTo,{ cache:false });
        opts.reply={ messageReference:replyTo };
      } catch {
        const q = replyContent?`> ${replyContent.slice(0,180)}`:'(元メッセージ他サーバー)';
        embed.fields=[ { name:'Reply', value:q } ];
      }
    }

    const sent = await ch.send(opts);
    return res.send({ status:'relayed', messageId:sent.id });
  } catch(err) {
    console.error('Relay error:', err.message);
    return res.sendStatus(500);
  }
});

/* ------------------------------------------------------------------
 * 国旗リアクション翻訳
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
      embeds:[ {
        description:`> ${original}\n\n**${translated}**`,
        footer:{ text:`🌐 translated to ${lang}` }
      } ]
    });
  } catch(e){ console.error('Translate reaction error:', e.message); }
});

/* ------------------------------------------------------------------
 * 起動 & Relay サーバー起動
 * ------------------------------------------------------------------ */
client.once(Events.ClientReady,() => console.log(`✅ Logged in as ${client.user.tag}`));
client.login(process.env.DISCORD_TOKEN);
api.get('/healthz',(_q,r)=>r.send('OK'));
api.listen(process.env.PORT||3000,()=>console.log('🚦 Relay server listening on port',process.env.PORT||3000));
