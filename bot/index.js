/**
 * index.js – Global Chat Bot (May-2025 full release)
 * -------------------------------------------------
 * ✅ 全機能入り・省略なし
 *
 * 機能概要
 *  - グローバルチャット転送 + 自動翻訳 + タイムゾーンタグ
 *  - ポイント (+1/2min msg, +1 per 👍 up to 5)
 *  - /setup  /announce  /additem  /shop  /buy
 *  - /profile  /ranking <messages|likes>
 *  - /approve  /reject  (ロール申請承認)
 *  - 動的アイテム永続化・起動時復元
 *  - Veteran ロールのグローバル重複防止
 *  - HUB リレー + 自動 👍 付与
 */

import 'dotenv/config';
import express          from 'express';
import bodyParser       from 'body-parser';
import fetch            from 'node-fetch';
import {
  Client, GatewayIntentBits, Partials, Events,
  SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder,
  ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle,
  PermissionFlagsBits, MessageFlags, ChannelType
} from 'discord.js';
import { randomUUID }   from 'crypto';
import { Redis }        from '@upstash/redis';
import { LANG_CHOICES, FLAG_TO_LANG } from './constants.js';

/* ---------- 必須 ENV ---------- */
['DISCORD_TOKEN','OWNER_ID','HUB_ENDPOINT',
 'UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN'
].forEach(k=>{ if(!process.env[k]){ console.error(`❌ missing ${k}`); process.exit(1);} });

/* ---------- 固定 + 動的ショップ ---------- */
const ITEMS = {
  create_role:{name:'Create New Role',cost:10000,type:'create'},
  veteran:{name:'Veteran',cost:1000,type:'veteran',color:'#FFA500'}
};

/* ---------- TZ ヘルパ ---------- */
const CITY_BY_OFFSET={
  '-12':'Baker','-11':'AmSamoa','-10':'Hawaii','-9':'Alaska',
  '-8':'LA','-7':'Denver','-6':'Chicago','-5':'NY','-4':'Santiago','-3':'BA','-2':'SG','-1':'Azores',
   '0':'London','1':'Berlin','2':'Athens','3':'Moscow','4':'Dubai','5':'Pakistan','6':'Bangladesh',
   '7':'Bangkok','8':'Beijing','9':'Tokyo','10':'Sydney','11':'Solomon','12':'Auckland'
};
const FLAG_BY_OFFSET={'-12':'🇺🇸','-11':'🇺🇸','-10':'🇺🇸','-9':'🇺🇸','-8':'🇺🇸','-7':'🇺🇸',
  '-6':'🇺🇸','-5':'🇺🇸','-4':'🇨🇱','-3':'🇦🇷','-2':'🇬🇸','-1':'🇵🇹',
  '0':'🇬🇧','1':'🇪🇺','2':'🇪🇬','3':'🇷🇺','4':'🇦🇪','5':'🇵🇰',
  '6':'🇧🇩','7':'🇹🇭','8':'🇨🇳','9':'🇯🇵','10':'🇦🇺','11':'🇸🇧','12':'🇳🇿'};
const TZ_CHOICES=Array.from({length:25},(_,i)=>{const o=-12+i,s=o>=0?'+':'';return{label:`UTC${s}${o} ${FLAG_BY_OFFSET[o]} ${CITY_BY_OFFSET[o]}`,value:String(o)}});
const guessOffset=l=>({JP:9,KR:9,CN:8,TW:8,SG:8,ID:7,TH:7,IN:5,US:-5,CA:-5,GB:0,DE:1,FR:1,BR:-3,AU:10,NZ:12}[l.split('-')[1]]??0);

/* ---------- Discord & Redis ---------- */
const client=new Client({
  intents:[
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions
  ],
  partials:[Partials.Message,Partials.Reaction]
});
const redis=new Redis({url:process.env.UPSTASH_REDIS_REST_URL,token:process.env.UPSTASH_REDIS_REST_TOKEN});
const HUB=process.env.HUB_ENDPOINT, SUPPORT='https://discord.gg/5jcg3kvWSm';

/* ---------- 翻訳 helper ---------- */
async function translate(t,tl){
  const r=await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${tl}&dt=t&q=${encodeURIComponent(t)}`);
  if(!r.ok)throw new Error(r.status);const d=await r.json();return d[0].map(v=>v[0]).join('');
}

/* ---------- Redis keys ---------- */
const kPt=u=>`pt:${u}`, kCD=u=>`cd:${u}`, kMsg=u=>`msg_cnt:${u}`, kLike=u=>`like_cnt:${u}`, kSet=m=>`like_set:${m}`;

/* ---------- 動的アイテム復元 ---------- */
async function loadDynItems(){
  const dyn=await redis.hgetall('shop:dyn'); if(!dyn) return;
  for(const id in dyn){ try{ ITEMS[id]=JSON.parse(dyn[id]); }catch{} }
}

/* ---------- SlashCommands ---------- */
const cmdSetup   =new SlashCommandBuilder().setName('setup').setDescription('Create Global Chat').setDefaultMemberPermissions(PermissionFlagsBits.Administrator);
const cmdAnnounce=new SlashCommandBuilder().setName('announce').setDescription('Broadcast').addStringOption(o=>o.setName('text').setDescription('msg').setRequired(true));
const cmdAddItem =new SlashCommandBuilder().setName('additem').setDescription('Add shop item').setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
                      .addStringOption(o=>o.setName('name').setDescription('Role').setRequired(true))
                      .addStringOption(o=>o.setName('color').setDescription('#RRGGBB').setRequired(true));
const cmdApprove =new SlashCommandBuilder().setName('approve').setDescription('Approve role request')
                      .addStringOption(o=>o.setName('id').setDescription('Request ID').setRequired(true));
const cmdReject  =new SlashCommandBuilder().setName('reject').setDescription('Reject role request')
                      .addStringOption(o=>o.setName('id').setDescription('Request ID').setRequired(true));
const cmdShop    =new SlashCommandBuilder().setName('shop').setDescription('Show shop');
const cmdBuy     =new SlashCommandBuilder().setName('buy').setDescription('Buy item');
const cmdProfile =new SlashCommandBuilder().setName('profile').setDescription('Your stats');
const cmdRanking =new SlashCommandBuilder().setName('ranking').setDescription('Leaderboards')
                      .addSubcommand(s=>s.setName('messages').setDescription('By messages'))
                      .addSubcommand(s=>s.setName('likes').setDescription('By likes'));

/* ---------- Ready: load items & register commands ---------- */
client.once(Events.ClientReady, async()=>{
  await loadDynItems();
  await client.application.commands.set([
    cmdSetup,cmdAnnounce,cmdAddItem,cmdApprove,cmdReject,cmdShop,cmdBuy,cmdProfile,cmdRanking
  ]);
  console.log(`✅ Ready as ${client.user.tag}`);
});
/* ---------------- handleSetup ------------------------------------------------ */
async function handleSetup(i){
  const g=i.guild, everyone=g.roles.everyone;
  const cat=g.channels.cache.find(c=>c.name==='Global Chat'&&c.type===ChannelType.GuildCategory)
            ?? await g.channels.create({name:'Global Chat',type:ChannelType.GuildCategory});

  const notice=cat.children.cache.find(c=>c.name==='bot-announcements')
            ?? await g.channels.create({
                 name:'bot-announcements',type:ChannelType.GuildText,parent:cat.id,
                 permissionOverwrites:[{id:everyone.id,deny:[PermissionFlagsBits.SendMessages]}]
               });
  await notice.send(`🌟 Thanks for installing Global Chat Bot!\nJoin support: ${SUPPORT}`);

  const settings=cat.children.cache.find(c=>c.name==='settings')
            ?? await g.channels.create({
                 name:'settings',type:ChannelType.GuildText,parent:cat.id,
                 permissionOverwrites:[{id:everyone.id,deny:[PermissionFlagsBits.ViewChannel]}]
               });
  const globalCh=cat.children.cache.find(c=>c.name==='global-chat')
            ?? await g.channels.create({name:'global-chat',type:ChannelType.GuildText,parent:cat.id});

  await fetch(`${HUB}/global/join`,{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({guildId:g.id,channelId:globalCh.id})}).then(r=>console.log('hub join',r.status));

  const lang1=new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId('lang1').setPlaceholder('Language (1/2)')
        .addOptions(LANG_CHOICES.slice(0,25).map(l=>({label:l.label,value:l.value,emoji:l.emoji}))));
  const lang2=new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId('lang2').setPlaceholder('Language (2/2)')
        .addOptions(LANG_CHOICES.slice(25).map(l=>({label:l.label,value:l.value,emoji:l.emoji}))));
  const tzSel=new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId('tz').setPlaceholder('Time-zone').addOptions(TZ_CHOICES));
  const tzBtn=new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('tz_auto').setLabel('🌏 Auto Detect').setStyle(ButtonStyle.Primary));
  const trBtn=new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('tr_on').setLabel('Translation ON').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('tr_off').setLabel('Translation OFF').setStyle(ButtonStyle.Danger));
  await settings.send({content:'Configure language / TZ / translation',components:[lang1,lang2,tzSel,tzBtn,trBtn]});
  i.reply({content:'✅ Setup complete',flags:MessageFlags.Ephemeral});
}

/* ---------------- handleAnnounce / handleAddItem ----------------------------- */
async function handleAnnounce(i){
  if(i.user.id!==process.env.OWNER_ID) return i.reply({content:'Owner only',flags:MessageFlags.Ephemeral});
  const txt=i.options.getString('text'); await i.deferReply({ephemeral:true});
  const list=await redis.smembers('global:channels');
  for(const e of list){
    const {guildId}=JSON.parse(e);
    try{const g=await client.guilds.fetch(guildId);
        const ch=g.channels.cache.find(c=>c.name==='bot-announcements'&&c.isTextBased());
        if(ch) await ch.send(`📢 ${txt}`);}catch{}
  }
  i.editReply({content:`Sent to ${list.length} servers`});
}
async function handleAddItem(i){
  const name=i.options.getString('name').trim(); let color=i.options.getString('color').trim();
  if(!/^#?[0-9A-Fa-f]{6}$/.test(color)) return i.reply({content:'Invalid HEX',flags:MessageFlags.Ephemeral});
  if(!color.startsWith('#')) color='#'+color;
  const id=name.toLowerCase().replace(/\s+/g,'_').replace(/[^0-9a-z_]/g,'');
  if(ITEMS[id]) return i.reply({content:'Item exists',flags:MessageFlags.Ephemeral});
  const item={name,cost:1000,type:'veteran',color};
  ITEMS[id]=item;
  await redis.hset('shop:dyn',{[id]:JSON.stringify(item)});
  i.reply({content:`Added item ${name} (id:${id})`,flags:MessageFlags.Ephemeral});
}

/* ---------------- Shop / Buy / Profile / Ranking ----------------------------- */
async function handleShop(i){
  const desc=Object.entries(ITEMS).map(([id,it])=>`• **${it.name}** – ${it.cost}p (\`${id}\`)`).join('\n');
  i.reply({embeds:[{title:'🛒 Shop',description:desc||'No items'}],flags:MessageFlags.Ephemeral});
}
async function handleBuy(i){
  const opts=Object.entries(ITEMS).map(([id,it])=>({label:it.name,description:`${it.cost}p`,value:id}));
  const menu=new StringSelectMenuBuilder().setCustomId('buy_select').setPlaceholder('Select item').addOptions(opts);
  i.reply({content:'Select item to purchase:',components:[new ActionRowBuilder().addComponents(menu)],flags:MessageFlags.Ephemeral});
}
async function handleProfile(i){
  const [pt,mc,lc]=await redis.mget(kPt(i.user.id),kMsg(i.user.id),kLike(i.user.id));
  i.reply({embeds:[{title:`📊 ${i.user.tag}`,fields:[
    {name:'Points',value:`${pt||0}`,inline:true},
    {name:'Messages',value:`${mc||0}`,inline:true},
    {name:'Likes',value:`${lc||0}`,inline:true}
  ]}],flags:MessageFlags.Ephemeral});
}
async function handleRanking(i){
  const mode=i.options.getSubcommand(); const pattern=mode==='messages'?'msg_cnt:*':'like_cnt:*';
  const keys=await redis.keys(pattern); const arr=[];
  for(const k of keys) arr.push({id:k.split(':')[1],v:parseInt(await redis.get(k),10)});
  arr.sort((a,b)=>b.v-a.v).splice(10);
  const lines=await Promise.all(arr.map(async(r,idx)=>{
    try{const u=await client.users.fetch(r.id);return`**#${idx+1}** ${u.tag} – ${r.v}`;}
    catch{return`#${idx+1} Unknown – ${r.v}`;}
  }));
  i.reply({embeds:[{title:`🏆 Top 10 by ${mode}`,description:lines.join('\n')||'No data'}],flags:MessageFlags.Ephemeral});
}

/* ---------------- ロール承認フロー ------------------------------------------- */
async function handleApprove(i,approve=true){
  if(i.user.id!==process.env.OWNER_ID) return i.reply({content:'Owner only',flags:MessageFlags.Ephemeral});
  const rid=i.options.getString('id'); const key=`global:role:${rid}`;
  const data=await redis.hgetall(key); if(!data||data.status!=='pending')
    return i.reply({content:'Invalid request',flags:MessageFlags.Ephemeral});
  const ownerId=data.owner, name=data.name, color=data.color;
  if(!approve){
    await redis.hset(key,{status:'rejected'});
    await redis.incrby(kPt(ownerId),ITEMS.create_role.cost);
    try{(await client.users.fetch(ownerId)).send(`❌ Role "${name}" rejected. Points refunded.`);}catch{}
    return i.reply({content:'Rejected & refunded',flags:MessageFlags.Ephemeral});
  }
  for(const [gid] of client.guilds.cache){
    try{
      const g=await client.guilds.fetch(gid);
      let role=g.roles.cache.find(r=>r.name===name)??await g.roles.create({name,color,permissions:[]});
      const mem=await g.members.fetch(ownerId).catch(()=>null);
      if(mem&&!mem.roles.cache.has(role.id)) await mem.roles.add(role);
    }catch{}
  }
  await redis.hset(key,{status:'approved'});
  try{(await client.users.fetch(ownerId)).send(`✅ Role "${name}" approved & delivered!`);}catch{}
  i.reply({content:'Approved & delivered',flags:MessageFlags.Ephemeral});
}

/* ---------------- grantVeteran helper --------------------------------------- */
async function grantVeteran(member,item){
  if(await redis.sismember('global:veterans',member.id)) return false;
  let role=member.guild.roles.cache.find(r=>r.name===item.name)
        ?? await member.guild.roles.create({name:item.name,color:item.color,permissions:[]});
  await member.roles.add(role); await redis.sadd('global:veterans',member.id);
  return true;
}

/* ---------------- Interaction dispatcher ------------------------------------ */
client.on(Events.InteractionCreate,async it=>{
  /* ---- select & modal & buttons ---- */
  if(it.isStringSelectMenu()){
    if(['lang1','lang2'].includes(it.customId)){
      const lang=it.values[0];
      await redis.hset(`lang:${it.guildId}`,{lang,auto:'true'});
      return it.update({content:`📌 Language set to **${lang}**`,components:it.message.components,flags:MessageFlags.Ephemeral});
    }
    if(it.customId==='tz'){
      const tz=it.values[0];
      await redis.hset(`tz:${it.guildId}`,{tz});
      return it.update({content:`🕒 TZ set to UTC${tz>=0?'+':''}${tz}`,components:it.message.components,flags:MessageFlags.Ephemeral});
    }
    if(it.customId==='buy_select'){
      const id=it.values[0], item=ITEMS[id];
      const bal=parseInt(await redis.get(kPt(it.user.id))||'0',10);
      if(bal<item.cost) return it.reply({content:`Not enough points (${bal})`,flags:MessageFlags.Ephemeral});
      await redis.decrby(kPt(it.user.id),item.cost);
      if(item.type==='veteran'){
        const ok=await grantVeteran(it.member,item);
        return it.reply({content: ok?'Veteran role granted!':'You already own veteran',flags:MessageFlags.Ephemeral});
      }
      if(item.type==='create'){
        const md=new ModalBuilder().setCustomId(`createRole_${it.user.id}`).setTitle('Create Role')
          .addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('rname').setLabel('Role Name').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('rcolor').setLabel('#RRGGBB').setStyle(TextInputStyle.Short).setRequired(true))
          );
        return it.showModal(md);
      }
    }
  }
  if(it.isButton()){
    if(it.customId==='tz_auto'){
      const off=guessOffset(it.locale); const sign=off>=0?'+':'';
      return it.reply({
        content:`🌏 Detected UTC${sign}${off}`,
        components:[new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`tz_yes_${off}`).setLabel('Yes').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('tz_no').setLabel('No').setStyle(ButtonStyle.Danger)
        )],flags:MessageFlags.Ephemeral});
    }
    if(it.customId.startsWith('tz_yes_')){
      const tz=it.customId.split('_')[2];
      await redis.hset(`tz:${it.guildId}`,{tz});
      return it.update({content:`🕒 TZ set to UTC${tz}`,components:[],flags:MessageFlags.Ephemeral});
    }
    if(it.customId==='tz_no') return it.update({content:'Cancelled',components:[],flags:MessageFlags.Ephemeral});
    if(['tr_on','tr_off'].includes(it.customId)){
      const auto=it.customId==='tr_on'?'true':'false';
      await redis.hset(`lang:${it.guildId}`,{auto});
      return it.reply({content:`🔄 Auto-translation ${auto==='true'?'ON':'OFF'}`,flags:MessageFlags.Ephemeral});
    }
  }
  if(it.isModalSubmit()&&it.customId.startsWith('createRole_')){
    const owner=it.customId.split('_')[1];
    const name=it.fields.getTextInputValue('rname').trim();
    let color=it.fields.getTextInputValue('rcolor').trim();
    if(!/^#?[0-9A-Fa-f]{6}$/.test(color)) return it.reply({content:'Invalid HEX',flags:MessageFlags.Ephemeral});
    if(!color.startsWith('#')) color='#'+color;
    const reqId=randomUUID();
    await redis.hset(`global:role:${reqId}`,{name,color,owner,status:'pending'});
    try{(await client.users.fetch(process.env.OWNER_ID)).send(`🆕 Role request ${reqId}\nName:${name}\nColor:${color}\nUser:<@${owner}>`);}catch{}
    it.reply({content:'Role request pending approval',flags:MessageFlags.Ephemeral});
  }
  /* ---- slash commands ---- */
  if(it.isChatInputCommand()){
    switch(it.commandName){
      case 'setup':   return handleSetup(it);
      case 'announce':return handleAnnounce(it);
      case 'additem': return handleAddItem(it);
      case 'approve': return handleApprove(it,true);
      case 'reject':  return handleApprove(it,false);
      case 'shop':    return handleShop(it);
      case 'buy':     return handleBuy(it);
      case 'profile': return handleProfile(it);
      case 'ranking': return handleRanking(it);
    }
  }
});

/* ---------------- MessageCreate: points + HUB publish ------------------------ */
client.on(Events.MessageCreate,async m=>{
  if(m.author.bot||m.interaction) return;
  const now=Date.now(), last=parseInt(await redis.get(kCD(m.author.id))||'0',10);
  if(now-last>=120000){ await redis.incrby(kPt(m.author.id),1); await redis.set(kCD(m.author.id),String(now)); }
  await redis.incrby(kMsg(m.author.id),1);

  const regKey=JSON.stringify({guildId:m.guildId,channelId:m.channelId});
  if(!(await redis.sismember('global:channels',regKey))) return;

  const tz=await redis.hget(`tz:${m.guildId}`,'tz')||'0';
  const langCfg=await redis.hgetall(`lang:${m.guildId}`);
  const targetLang=langCfg?.auto==='true'?langCfg.lang:null;

  await fetch(`${HUB}/publish`,{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      globalId:randomUUID(),guildId:m.guildId,channelId:m.channelId,
      userTag:m.author.tag,userAvatar:m.author.displayAvatarURL(),
      originGuild:m.guild.name,originTz:tz,content:m.content,sentAt:Date.now(),
      files:m.attachments.map(a=>({attachment:a.url,name:a.name})),targetLang
    })
  }).catch(console.error);
});

/* ---------------- ReactionAdd: 👍 & translation ------------------------------ */
client.on(Events.MessageReactionAdd,async (r,u)=>{
  if(u.bot) return;
  const emoji=r.emoji.name;
  if(emoji==='👍' && r.message.author?.id===client.user.id){
    const set=kSet(r.message.id);
    if(await redis.sismember(set,u.id)) return;
    if((await redis.scard(set))>=5){ r.users.remove(u.id).catch(()=>{}); return; }
    await redis.sadd(set,u.id); await redis.expire(set,604800);
    await redis.incrby(kPt(u.id),1); await redis.incrby(kLike(u.id),1);
    return;
  }
  const lang=FLAG_TO_LANG[emoji]; if(!lang) return;
  const orig=r.message.content; if(!orig) return;
  try{
    const tr=await translate(orig,lang);
    await r.message.reply({embeds:[{description:`> ${orig}\n\n**${tr}**`,footer:{text:`🌐 translated to ${lang}`}}]});
  }catch{}
});

/* ---------------- Relay endpoint -------------------------------------------- */
const app=express(); app.use(bodyParser.json());
app.post('/relay',async (req,res)=>{
  const {toGuild,toChannel,userTag,userAvatar,originGuild,originTz='0',
         content,files,targetLang,sentAt}=req.body;
  try{
    const g=await client.guilds.fetch(toGuild); const ch=await g.channels.fetch(toChannel);
    if(!ch.isTextBased()) return res.sendStatus(404);
    let tr=null,was=false;if(targetLang){try{tr=await translate(content,targetLang);was=true;}catch{}}
    const embed={
      author:{name:`${userTag} [UTC${originTz>=0?'+':''}${originTz}] @ ${originGuild}`,icon_url:userAvatar},
      description:was?`> ${content}\n\n**${tr}**`:content,
      footer:{text:`🌐 global chat${was?' • auto-translated':''}`},
      timestamp:new Date(sentAt).toISOString()
    };
    const msg=await ch.send({embeds:[embed],files}); await msg.react('👍');
    res.send({status:'ok'});
  }catch(e){console.error('relay',e);res.sendStatus(500);}
});
app.get('/healthz',(_,r)=>r.send('OK'));
app.listen(process.env.PORT||3000,()=>console.log('🚦 relay on',process.env.PORT||3000));

/* ---------------- Login ------------------------------------------------------ */
client.login(process.env.DISCORD_TOKEN)
  .then(()=>console.log('✅ Logged in'))
  .catch(e=>console.error('login',e));
