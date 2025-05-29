/**
 * index.js – Global Chat Bot
 * ------------------------------------------------------------------
 *  - Cross-server global chat with auto-translation
 *  - Time-zone tags & auto-detect
 *  - Points system (+1 per message w/ 2-min cooldown, +1 per 👍 up to 5 users)
 *  - /shop  /buy  /profile  /ranking
 *  - Dynamic shop items via /additem
 *  - Support-server invite after /setup
 *  - Broadcast /announce
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
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
  MessageFlags,
  ChannelType
} from 'discord.js';
import { randomUUID } from 'crypto';
import { Redis } from '@upstash/redis';
import { LANG_CHOICES, FLAG_TO_LANG } from './constants.js';

/* ------------------------------------------------------------------
 * Static shop items (code-defined)
 * ------------------------------------------------------------------ */
const ITEMS = {
  create_role: { name: 'Create New Role', cost: 10000, type: 'create' },
  veteran:     { name: 'Veteran',          cost: 1000,  type: 'veteran', color: '#FFA500' }
};

/* ------------------------------------------------------------------
 * Time-zone helpers
 * ------------------------------------------------------------------ */
const CITY_BY_OFFSET = {
  '-12':'Baker Island','-11':'American Samoa','-10':'Hawaii','-9':'Alaska',
  '-8':'Los Angeles','-7':'Denver','-6':'Chicago','-5':'New York / Toronto',
  '-4':'Santiago','-3':'Buenos Aires','-2':'South Georgia','-1':'Azores',
   '0':'London','1':'Berlin / Paris','2':'Athens / Cairo','3':'Moscow / Nairobi',
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
  const o = -12 + i, sign = o>=0?'+':'';
  return { label:`UTC${sign}${o} ${FLAG_BY_OFFSET[o]} ${CITY_BY_OFFSET[o]}`, value:String(o) };
});
function guessOffsetByLocale(locale='en-US') {
  const c = locale.split('-')[1] ?? 'US';
  const MAP = { JP:9, KR:9, CN:8, TW:8, SG:8, TH:7, ID:7, IN:5,
                GB:0, US:-5, CA:-5, DE:1, FR:1, IT:1, ES:1, PT:0,
                RU:3, BR:-3, AU:10, NZ:12 };
  return MAP[c] ?? 0;
}

/* ------------------------------------------------------------------
 * Discord & Redis
 * ------------------------------------------------------------------ */
const client = new Client({
  intents:[
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions
  ],
  partials:[Partials.Message, Partials.Reaction]
});
const HUB = process.env.HUB_ENDPOINT;
const rdb = new Redis({
  url:process.env.UPSTASH_REDIS_REST_URL,
  token:process.env.UPSTASH_REDIS_REST_TOKEN
});
const SUPPORT_INVITE = 'https://discord.gg/5jcg3kvWSm';

/* ------------------------------------------------------------------
 * Translation helper (Google unofficial)
 * ------------------------------------------------------------------ */
async function translate(text, target) {
  const url='https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&dt=t'
            +`&tl=${target}&q=${encodeURIComponent(text)}`;
  const res = await fetch(url); if(!res.ok) throw new Error('translate '+res.status);
  const data = await res.json(); return data[0].map(v=>v[0]).join('');
}

/* ------------------------------------------------------------------
 * Redis key helpers
 * ------------------------------------------------------------------ */
const keyPt   = u => `pt:${u}`;
const keyCD   = u => `cd:${u}`;
const keyMsg  = u => `msg_cnt:${u}`;
const keyLike = u => `like_cnt:${u}`;
const keySet  = m => `like_set:${m}`;

/* ------------------------------------------------------------------
 * Slash commands
 * ------------------------------------------------------------------ */
const cmdSetup = new SlashCommandBuilder()
 .setName('setup').setDescription('Create Global Chat channels')
 .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

const cmdAnnounce = new SlashCommandBuilder()
 .setName('announce').setDescription('Broadcast announcement')
 .addStringOption(o=>o.setName('text').setDescription('Text').setRequired(true));

const cmdAddItem = new SlashCommandBuilder()
 .setName('additem').setDescription('Add shop item')
 .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
 .addStringOption(o=>o.setName('name').setDescription('Role name').setRequired(true))
 .addStringOption(o=>o.setName('color').setDescription('#RRGGBB').setRequired(true));

const cmdShop     = new SlashCommandBuilder().setName('shop').setDescription('Show shop items');
const cmdBuy      = new SlashCommandBuilder().setName('buy').setDescription('Buy an item');
const cmdProfile  = new SlashCommandBuilder().setName('profile').setDescription('Show your stats');
const cmdRanking  = new SlashCommandBuilder()
 .setName('ranking').setDescription('Leaderboards')
 .addSubcommand(s=>s.setName('messages').setDescription('By messages'))
 .addSubcommand(s=>s.setName('likes').setDescription('By likes'));

client.once(Events.ClientReady, async()=>{
  await client.application.commands.set([
    cmdSetup,cmdAnnounce,cmdAddItem,cmdShop,cmdBuy,cmdProfile,cmdRanking
  ]);
  console.log(`✅ Ready as ${client.user.tag}`);
});

/* ------------------------------------------------------------------
 * /setup handler  (creates channels & posts support invite)
 * ------------------------------------------------------------------ */
async function handleSetup(inter) {
  const g=inter.guild, everyone=g.roles.everyone;
  const cat = g.channels.cache.find(c=>c.name==='Global Chat'&&c.type===ChannelType.GuildCategory)
          || await g.channels.create({name:'Global Chat',type:ChannelType.GuildCategory});
  const notice = cat.children.cache.find(c=>c.name==='bot-announcements')
          || await g.channels.create({
              name:'bot-announcements',type:ChannelType.GuildText,parent:cat.id,
              permissionOverwrites:[{id:everyone.id,deny:[PermissionFlagsBits.SendMessages]}]
            });
  await notice.send(`🌟 Thanks for installing! Join support: ${SUPPORT_INVITE}`);

  if(process.env.SOURCE_ANNOUNCE_CHANNEL_ID){
    await fetch(`https://discord.com/api/v10/channels/${process.env.SOURCE_ANNOUNCE_CHANNEL_ID}/followers`,{
      method:'POST',
      headers:{'Authorization':`Bot ${process.env.DISCORD_TOKEN}`,'Content-Type':'application/json'},
      body:JSON.stringify({ webhook_channel_id:notice.id })
    }).catch(e=>console.error('follow',e.status));
  }
  const settings = cat.children.cache.find(c=>c.name==='settings')
          || await g.channels.create({name:'settings',type:ChannelType.GuildText,parent:cat.id,
              permissionOverwrites:[{id:everyone.id,deny:[PermissionFlagsBits.ViewChannel]}]});
  const global = cat.children.cache.find(c=>c.name==='global-chat')
          || await g.channels.create({name:'global-chat',type:ChannelType.GuildText,parent:cat.id});

  // register with hub
  fetch(`${HUB}/global/join`,{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({guildId:g.id,channelId:global.id})
  }).then(r=>console.log('join',r.status));

  // send settings ui
  const rowLang1=new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId('lang1').setPlaceholder('Language 1/2')
        .addOptions(LANG_CHOICES.slice(0,25).map(l=>({label:l.label,value:l.value,emoji:l.emoji})))
  );
  const rowLang2=new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId('lang2').setPlaceholder('Language 2/2')
        .addOptions(LANG_CHOICES.slice(25).map(l=>({label:l.label,value:l.value,emoji:l.emoji})))
  );
  const rowTz =new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId('tz').setPlaceholder('Time zone').addOptions(TZ_CHOICES)
  );
  const rowAuto=new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('tz_auto').setLabel('🌏 Auto Detect').setStyle(ButtonStyle.Primary)
  );
  const rowTr=new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('tr_on').setLabel('Translation ON').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('tr_off').setLabel('Translation OFF').setStyle(ButtonStyle.Danger)
  );
  await settings.send({content:'Configure language / TZ / translation',components:[rowLang1,rowLang2,rowTz,rowAuto,rowTr]});
  await inter.reply({content:'✅ Setup done',flags:MessageFlags.Ephemeral});
}

/* ------------------------------------------------------------------
 * /announce handler
 * ------------------------------------------------------------------ */
async function handleAnnounce(inter){
  if(inter.user.id!==process.env.OWNER_ID)
    return inter.reply({content:'❌ Owner only',flags:MessageFlags.Ephemeral});
  const text=inter.options.getString('text'); await inter.deferReply({ephemeral:true});
  const list=await rdb.smembers('global:channels');
  for(const entry of list){
    const {guildId}=JSON.parse(entry);
    try{
      const g=await client.guilds.fetch(guildId);
      const ch=g.channels.cache.find(c=>c.name==='bot-announcements'&&c.isTextBased());
      if(ch) await ch.send(`📢 ${text}`);
    }catch{}
  }
  await inter.editReply({content:`✅ Sent to ${list.length} servers`});
}

/* ------------------------------------------------------------------
 * /additem handler
 * ------------------------------------------------------------------ */
async function handleAddItem(inter){
  const name=inter.options.getString('name').trim(); let color=inter.options.getString('color').trim();
  if(!/^#?[0-9A-Fa-f]{6}$/.test(color))return inter.reply({content:'❌ Bad HEX',flags:MessageFlags.Ephemeral});
  if(!color.startsWith('#'))color='#'+color;
  const id=name.toLowerCase().replace(/\s+/g,'_').replace(/[^0-9a-z_]/g,'');
  if(ITEMS[id])return inter.reply({content:'❌ Already exists',flags:MessageFlags.Ephemeral});
  ITEMS[id]={name,cost:1000,type:'veteran',color}; // default cost
  await inter.reply({content:`✅ Added item **${name}** (\`${id}\`)`,flags:MessageFlags.Ephemeral});
}

/* ------------------------------------------------------------------
 * /shop handler
 * ------------------------------------------------------------------ */
async function handleShop(inter){
  const desc=Object.entries(ITEMS).map(([id,it])=>`• **${it.name}** — ${it.cost.toLocaleString()}p (\`${id}\`)`).join('\n');
  await inter.reply({embeds:[{title:'🛒 Shop',description:desc||'No items'}],flags:MessageFlags.Ephemeral});
}

/* ------------------------------------------------------------------
 * /buy handler (select menu)
 * ------------------------------------------------------------------ */
async function handleBuy(inter){
  const opts=Object.entries(ITEMS).map(([id,it])=>({label:it.name,description:`${it.cost}p`,value:id}));
  const menu=new StringSelectMenuBuilder().setCustomId('buy_select').setPlaceholder('Select item').addOptions(opts);
  await inter.reply({content:'Pick an item:',components:[new ActionRowBuilder().addComponents(menu)],flags:MessageFlags.Ephemeral});
}

/* ------------------------------------------------------------------
 * Buy select
 * ------------------------------------------------------------------ */
client.on(Events.InteractionCreate,async sel=>{
  if(!sel.isStringSelectMenu()||sel.customId!=='buy_select')return;
  const id=sel.values[0]; const item=ITEMS[id];
  const bal=parseInt(await rdb.get(keyPt(sel.user.id))||'0',10);
  if(bal<item.cost)return sel.reply({content:`❌ Not enough points (${bal}p)`,flags:MessageFlags.Ephemeral});
  await rdb.decrby(keyPt(sel.user.id),item.cost);
  if(item.type==='veteran'){
    const role= sel.guild.roles.cache.find(r=>r.name===item.name)
          || await sel.guild.roles.create({name:item.name,color:item.color,permissions:[]});
    await sel.member.roles.add(role);
    return sel.reply({content:'✅ Veteran role granted!',flags:MessageFlags.Ephemeral});
  }
  if(item.type==='create'){
    const modal=new ModalBuilder().setCustomId(`createRole_${sel.user.id}`).setTitle('Create Role')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('role_name').setLabel('Role Name').setStyle(TextInputStyle.Short).setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('role_color').setLabel('#RRGGBB').setStyle(TextInputStyle.Short).setRequired(true)
        )
      );
    await sel.showModal(modal);
  }
});

/* ------------------------------------------------------------------
 * Modal submit for create_role
 * ------------------------------------------------------------------ */
client.on(Events.InteractionCreate,async modal=>{
  if(!modal.isModalSubmit()||!modal.customId.startsWith('createRole_'))return;
  const uid=modal.customId.split('_')[1];
  const name=modal.fields.getTextInputValue('role_name').trim();
  let color=modal.fields.getTextInputValue('role_color').trim();
  if(!/^#?[0-9A-Fa-f]{6}$/.test(color))return modal.reply({content:'❌ Bad HEX',flags:MessageFlags.Ephemeral});
  if(!color.startsWith('#'))color='#'+color;
  const key=`req:${randomUUID()}`;
  await rdb.hset(`global:role:${key}`,{name,color,owner:uid,status:'pending'});
  try{
    const admin=await client.users.fetch(process.env.OWNER_ID);
    await admin.send(`🆕 Role request ${key}\nName:${name}\nColor:${color}\nBy:<@${uid}>`);
  }catch{}
  modal.reply({content:'⏳ Your role request is pending admin approval',flags:MessageFlags.Ephemeral});
});

/* ------------------------------------------------------------------
 * /profile handler
 * ------------------------------------------------------------------ */
async function handleProfile(inter){
  const [pt,mc,lc]=await rdb.mget(keyPt(inter.user.id),keyMsg(inter.user.id),keyLike(inter.user.id));
  const em={title:`📊 ${inter.user.tag}`,fields:[
    {name:'Points',value:`${pt||0}`,inline:true},
    {name:'Messages',value:`${mc||0}`,inline:true},
    {name:'Likes',value:`${lc||0}`,inline:true}
  ]};
  inter.reply({embeds:[em],flags:MessageFlags.Ephemeral});
}

/* ------------------------------------------------------------------
 * /ranking handler
 * ------------------------------------------------------------------ */
async function handleRanking(inter){
  const sub=inter.options.getSubcommand();
  const pattern=sub==='messages'?'msg_cnt:*':'like_cnt:*';
  const title=sub==='messages'?'Messages':'Likes';
  const keys=await rdb.keys(pattern); const arr=[];
  for(const k of keys){ arr.push({id:k.split(':')[1],v:parseInt(await rdb.get(k),10)}); }
  arr.sort((a,b)=>b.v-a.v).splice(10);
  const lines=await Promise.all(arr.map(async(r,i)=>{
    try{const u=await client.users.fetch(r.id);return`**#${i+1}** ${u.tag} — ${r.v}`;}
    catch{return`#${i+1} Unknown — ${r.v}`;}
  }));
  inter.reply({embeds:[{title:`🏆 Top 10 ${title}`,description:lines.join('\n')||'No data'}],flags:MessageFlags.Ephemeral});
}

/* ------------------------------------------------------------------
 * Points: +1 per message (2-min CD) & relay to hub
 * ------------------------------------------------------------------ */
client.on(Events.MessageCreate,async msg=>{ // points + relay
  if(msg.author.bot)return;
  const cool=await rdb.get(keyCD(msg.author.id)); const now=Date.now();
  if(!cool||now-parseInt(cool,10)>=120000){
    await rdb.incrby(keyPt(msg.author.id),1);
    await rdb.set(keyCD(msg.author.id),String(now));
  }
  await rdb.incrby(keyMsg(msg.author.id),1);

  // Only relay messages in registered global channels
  const regKey=JSON.stringify({guildId:msg.guildId,channelId:msg.channelId});
  if(!(await rdb.sismember('global:channels',regKey)))return;

  const tz=await rdb.hget(`tz:${msg.guildId}`,'tz')||'0';
  let replyText=null;
  if(msg.reference?.messageId){
    try{const ref=await msg.channel.messages.fetch(msg.reference.messageId);
        replyText=ref.content||ref.embeds?.[0]?.description||'';}catch{}
  }
  fetch(`${HUB}/publish`,{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      globalId:randomUUID(),guildId:msg.guildId,channelId:msg.channelId,
      userTag:msg.author.tag,userAvatar:msg.author.displayAvatarURL(),
      originGuild:msg.guild.name,originTz:tz,content:msg.content,
      replyTo:msg.reference?.messageId||null,replyContent:replyText,
      sentAt:Date.now(),files:msg.attachments.map(a=>({attachment:a.url,name:a.name}))
    })
  }).catch(console.error);
});

/* ------------------------------------------------------------------
 * Reaction translation & 👍 points handled earlier
 * ------------------------------------------------------------------ */
client.on(Events.MessageReactionAdd,async (reaction,user)=>{
  if(user.bot)return;
  if(reaction.emoji.name!=='👍'){
    if(reaction.partial)await reaction.fetch();
    const lang=FLAG_TO_LANG[reaction.emoji.name]; if(!lang)return;
    const orig=reaction.message.content; if(!orig)return;
    try{
      const tr=await translate(orig,lang);
      await reaction.message.reply({embeds:[{description:`> ${orig}\n\n**${tr}**`,footer:{text:`🌐 translated to ${lang}`}}]});
    }catch{}
    return;
  }
});

/* ------------------------------------------------------------------
 * Command dispatcher
 * ------------------------------------------------------------------ */
client.on(Events.InteractionCreate, async inter=>{
  if(!inter.isChatInputCommand())return;
  const cmd=inter.commandName;
  if(cmd==='setup')return handleSetup(inter);
  if(cmd==='announce')return handleAnnounce(inter);
  if(cmd==='additem')return handleAddItem(inter);
  if(cmd==='shop')return handleShop(inter);
  if(cmd==='buy')return handleBuy(inter);
  if(cmd==='profile')return handleProfile(inter);
  if(cmd==='ranking')return handleRanking(inter);
});

/* ------------------------------------------------------------------
 * Express relay endpoint
 * ------------------------------------------------------------------ */
const api=express(); api.use(bodyParser.json());
api.post('/relay',async(req,res)=>{
  const {toGuild,toChannel,userTag,userAvatar,originGuild,originTz='0',
         content,replyTo,replyContent,files,targetLang,sentAt}=req.body;
  try{
    const g=await client.guilds.fetch(toGuild); const ch=await g.channels.fetch(toChannel);
    if(!ch.isTextBased())return res.sendStatus(404);
    let trans=null,was=false;
    if(targetLang){try{trans=await translate(content,targetLang);was=true;}catch{}}
    const desc=was?`> ${content}\n\n**${trans}**`:content;
    const embed={author:{name:`${userTag} [UTC${originTz>=0?'+':''}${originTz}] @ ${originGuild}`,icon_url:userAvatar},
                 description:desc,footer:{text:`🌐 global chat${was?' • auto-translated':''}`},
                 timestamp:new Date(sentAt).toISOString()};
    const opts={embeds:[embed]}; if(files?.length)opts.files=files;
    if(replyTo){try{await ch.messages.fetch(replyTo);opts.reply={messageReference:replyTo};}
      catch{embed.fields=[{name:'Reply',value:replyContent?`> ${replyContent.slice(0,180)}`:'(original)'}];}}
    const sent=await ch.send(opts); return res.send({status:'ok',id:sent.id});
  }catch(e){console.error(e);return res.sendStatus(500);}
});
api.get('/healthz',(_,r)=>r.send('OK'));
api.listen(process.env.PORT||3000,()=>console.log('🚦 Relay server on',process.env.PORT||3000));

/* ------------------------------------------------------------------
 * Start bot
 * ------------------------------------------------------------------ */
client.login(process.env.DISCORD_TOKEN)
  .then(()=>console.log('✅ Logged in to Discord'))
  .catch(e=>console.error('❌ Discord login failed',e));
