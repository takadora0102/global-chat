/**
 * Discord Bot – Global Chat
 * 2025-05-27  Cleanup & Logging Fix
 * ------------------------------------------------------------
 * • Owner-only /announce
 * • 自動翻訳＋時差タグ＋都市名＆国旗
 * • 🌏 自動判定ボタン
 * • Unknown Channel 自動削除ロジックを一時無効化
 * • /relay 周りに詳細ログ追加
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
  MessageFlags
} from 'discord.js';
import { randomUUID } from 'crypto';
import { Redis } from '@upstash/redis';

/* ------------------------------------------------------------------
 * タイムゾーン定義
 * ------------------------------------------------------------------ */
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
  return {
    label: `UTC${sign}${offset}  ${FLAG_BY_OFFSET[offset]}  ${CITY_BY_OFFSET[offset]}`,
    value: String(offset)
  };
});
function guessOffsetByLocale(locale = 'en-US') {
  const country = locale.split('-')[1] ?? (locale === 'ja' ? 'JP' : 'US');
  const MAP = {
    JP: 9, KR: 9, CN: 8, TW: 8, HK: 8, SG: 8, TH: 7, ID: 7, IN: 5,
    GB: 0, US: -5, CA: -5, DE: 1, FR: 1, IT: 1, ES: 1, NL: 1, PT: 0,
    RU: 3, BR: -3, AU: 10, NZ: 12
  };
  return MAP[country] ?? 0;
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
  const url =
    'https://translate.googleapis.com/translate_a/single?client=gtx' +
    `&sl=auto&tl=${target}&dt=t&q=${encodeURIComponent(text)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('translate ' + res.status);
  const data = await res.json();
  return data[0].map(v => v[0]).join('');
}
const FLAG_TO_LANG = {
  '🇯🇵':'ja','🇺🇸':'en','🇬🇧':'en','🇨🇳':'zh','🇹🇼':'zh','🇰🇷':'ko',
  '🇮🇳':'hi','🇹🇭':'th','🇻🇳':'vi','🇮🇩':'id','🇵🇭':'tl','🇹🇷':'tr',
  '🇸🇦':'ar','🇪🇸':'es','🇫🇷':'fr','🇵🇹':'pt','🇮🇹':'it','🇩🇪':'de',
  '🇷🇺':'ru','🇳🇱':'nl','🇵🇱':'pl','🇸🇪':'sv'
};

/* ------------------------------------------------------------------
 * Slash コマンド定義
 * ------------------------------------------------------------------ */
export const cmdSetup = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('グローバルチャット用カテゴリとチャンネルを自動作成')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export const cmdAnnounce = new SlashCommandBuilder()
  .setName('announce')
  .setDescription('全サーバーのお知らせチャンネルへ一斉送信')
  .addStringOption(o =>
    o.setName('text').setDescription('本文').setRequired(true)
  );

/* ------------------------------------------------------------------
 * /setup
 * ------------------------------------------------------------------ */
async function handleSetup(i) {
  const g        = i.guild;
  const everyone = g.roles.everyone;
  const cat = g.channels.cache.find(c => c.name === 'グローバルチャット' && c.type === 4)
           ?? await g.channels.create({ name: 'グローバルチャット', type: 4 });
  const botNotice = cat.children.cache.find(c => c.name === 'bot-お知らせ')
           ?? await g.channels.create({
                name: 'bot-お知らせ', type: 0, parent: cat.id,
                permissionOverwrites: [{ id: everyone.id, deny: [PermissionFlagsBits.SendMessages] }]
              });
  const setting = cat.children.cache.find(c => c.name === '設定変更')
           ?? await g.channels.create({
                name: '設定変更', type: 0, parent: cat.id,
                permissionOverwrites: [{ id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] }]
              });
  const glChat = cat.children.cache.find(c => c.name === 'グローバルチャット' && c.id !== cat.id)
           ?? await g.channels.create({ name: 'グローバルチャット', type: 0, parent: cat.id });
  await fetch(`${HUB}/global/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ guildId: g.id, channelId: glChat.id })
  })
  .then(r => console.log('join status', r.status))
  .catch(e => console.error('join fetch error', e));

  const rowLang = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('lang_select')
      .setPlaceholder('サーバー言語を選択')
      .addOptions([
        { label:'日本語', value:'ja' },
        { label:'English', value:'en' },
        { label:'한국어', value:'ko' },
        { label:'简体中文', value:'zh' },
        { label:'Español', value:'es' }
      ])
  );
  const rowTz = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('tz_select')
      .setPlaceholder('タイムゾーンを選択')
      .addOptions(TZ_CHOICES)
  );
  const rowTzAuto = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tz_auto').setLabel('🌏 自動判定').setStyle(ButtonStyle.Primary)
  );
  const rowTrans = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tr_on').setLabel('翻訳ON').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('tr_off').setLabel('翻訳OFF').setStyle(ButtonStyle.Danger)
  );
  await setting.send({
    content: '🌐 サーバー言語・タイムゾーン・自動翻訳を設定してください',
    components: [rowLang, rowTz, rowTzAuto, rowTrans]
  });
  await i.reply({ content: '✅ セットアップ完了！', flags: MessageFlags.Ephemeral });
}

/* ------------------------------------------------------------------
 * /announce
 * ------------------------------------------------------------------ */
async function handleAnnounce(i) {
  if (i.user.id !== process.env.OWNER_ID)
    return i.reply({ content: '❌ BOTオーナーのみ実行可', flags: MessageFlags.Ephemeral });
  const text = i.options.getString('text');
  const list = await rdb.smembers('global:channels');
  for (const entry of list) {
    const { guildId } = JSON.parse(entry);
    try {
      const g  = await client.guilds.fetch(guildId);
      const ch = g.channels.cache.find(c => c.name==='bot-お知らせ'&&c.isTextBased());
      if(ch) await ch.send(`📢 **運営からのお知らせ**\n${text}`);
    } catch {/* ignore */}
  }
  await i.reply({ content: '✅ 送信しました', flags: MessageFlags.Ephemeral });
}

/* ------------------------------------------------------------------
 * InteractionCreate
 * ------------------------------------------------------------------ */
client.on(Events.InteractionCreate, async i => {
  if (i.isChatInputCommand()) {
    if (i.commandName==='setup')    return handleSetup(i);
    if (i.commandName==='announce') return handleAnnounce(i);
  }
  if (i.isStringSelectMenu()) {
    if (i.customId==='lang_select') {
      const lang=i.values[0];
      await rdb.hset(`lang:${i.guildId}`,{lang,autoTranslate:'true'});
      return i.reply({content:`📌 言語を**${lang}**に設定（ON）`,flags:MessageFlags.Ephemeral});
    }
    if (i.customId==='tz_select') {
      const tz=i.values[0];
      await rdb.hset(`tz:${i.guildId}`,{tz});
      return i.reply({content:`🕒 タイムゾーンを**UTC${tz>=0?'+':''}${tz}**に設定`,flags:MessageFlags.Ephemeral});
    }
  }
  if (i.isButton()) {
    if(i.customId==='tz_auto'){
      const guessed=guessOffsetByLocale(i.locale);
      const sign=guessed>=0?'+':'';
      return i.reply({
        content:`🌏 推定: UTC${sign}${guessed} (${CITY_BY_OFFSET[guessed]}) で設定？`,
        components:[
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`tz_yes_${guessed}`).setLabel('はい').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('tz_no').setLabel('いいえ').setStyle(ButtonStyle.Danger)
          )
        ],
        flags:MessageFlags.Ephemeral
      });
    }
    if(i.customId.startsWith('tz_yes_')){
      const tz=i.customId.replace('tz_yes_','');
      await rdb.hset(`tz:${i.guildId}`,{tz});
      return i.update({content:`🕒 タイムゾーン**UTC${tz>=0?'+':''}${tz}**に設定`,components:[],flags:MessageFlags.Ephemeral});
    }
    if(i.customId==='tz_no'){
      return i.update({content:'⏹️ 設定キャンセル',components:[],flags:MessageFlags.Ephemeral});
    }
    if(i.customId==='tr_on'||i.customId==='tr_off'){
      const flag=i.customId==='tr_on'?'true':'false';
      await rdb.hset(`lang:${i.guildId}`,{autoTranslate:flag});
      return i.reply({content:`🔄 翻訳**${flag==='true'?'ON':'OFF'}**`,flags:MessageFlags.Ephemeral});
    }
  }
});

/* ------------------------------------------------------------------
 * MessageCreate → Hub /publish
 * ------------------------------------------------------------------ */
client.on(Events.MessageCreate, async msg=>{
  if(msg.author.bot)return;
  const key=JSON.stringify({guildId:msg.guildId,channelId:msg.channelId});
  if(!(await rdb.sismember('global:channels',key)))return;
  const tzInfo=await rdb.hgetall(`tz:${msg.guildId}`),originTz=tzInfo?.tz||'0';
  let replyContent=null;
  if(msg.reference?.messageId){
    try{
      const p=await msg.channel.messages.fetch(msg.reference.messageId);
      replyContent=p.content||p.embeds?.[0]?.description||'(embed)';
    }catch{}
  }
  fetch(`${HUB}/publish`,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      globalId:randomUUID(),
      guildId:msg.guildId,channelId:msg.channelId,
      userTag:msg.author.tag,userAvatar:msg.author.displayAvatarURL(),
      originGuild:msg.guild.name,originTz,content:msg.content,
      replyTo:msg.reference?.messageId||null,replyContent,
      sentAt:Date.now(),files:msg.attachments.map(a=>({url:a.url,name:a.name}))
    })
  })
  .then(r=>r.text().then(t=>console.log('publish',r.status,t)))
  .catch(e=>console.error('publish ERR',e));
});

/* ------------------------------------------------------------------
 * /relay 受信 → Relay→Bot
 * ------------------------------------------------------------------ */
const api=express();api.use(bodyParser.json());
api.post('/relay',async(req,res)=>{
  console.log('relay req →',req.body);
  const{toGuild,toChannel,userTag,userAvatar,originGuild,originTz='0',
        content,replyTo,replyContent,files,targetLang,sentAt}=req.body;
  try{
    const g=await client.guilds.fetch(toGuild);
    let ch;
    try{
      ch=await g.channels.fetch(toChannel);
    }catch(err){
      console.error('Relay fetch channel error:',err.code,err.message);
      if(err.code===10003){
        console.warn('🗑️ Unknown Channel detected for',toGuild,toChannel);
        // await rdb.srem('global:channels',JSON.stringify({guildId:toGuild,channelId:toChannel}));
        return res.status(410).send({status:'unknown_channel'});
      }
      return res.status(500).send({status:'fetch_channel_error'});
    }
    if(!ch.isTextBased()){
      console.error('Relay: Channel is not text-based',toGuild,toChannel);
      return res.sendStatus(404);
    }
    let translated=null,wasTranslated=false;
    if(targetLang){
      try{translated=await translate(content,targetLang);wasTranslated=true;}
      catch(e){console.error('Translate API error:',e.message);}
    }
    const desc=wasTranslated?`> ${content}\n\n**${translated}**`:content;
    const authorName=`${userTag} [UTC${originTz>=0?'+':''}${originTz}] @ ${originGuild}`;
    const embed={author:{name:authorName,icon_url:userAvatar},
                 description:desc,
                 footer:{text:`🌐 global chat${wasTranslated?' • auto-translated':''}`},
                 timestamp:sentAt?new Date(sentAt).toISOString():undefined};
    const opts={embeds:[embed]};if(files?.length)opts.files=files;
    if(replyTo){
      try{await ch.messages.fetch(replyTo,{cache:false});opts.reply={messageReference:replyTo};}
      catch{const quote=replyContent?`> ${replyContent.slice(0,180)}`:'(元メッセージが他サーバー)';embed.fields=[{name:'Reply',value:quote}];}
    }
    const sent=await ch.send(opts);
    return res.send({status:'relayed',messageId:sent.id});
  }catch(err){
    console.error('Relay error:',err.message);
    return res.sendStatus(500);
  }
});
client.once(Events.ClientReady,()=>console.log(`✅ Logged in as ${client.user.tag}`));
client.login(process.env.DISCORD_TOKEN);
api.get('/healthz',(_q,r)=>r.send('OK'));
api.listen(process.env.PORT||3000,()=>{});
