/**
 * hub/hub.js – Global Chat Relay (auto-translate対応)
 */

import express from 'express';
import bodyParser from 'body-parser';
import fetch from 'node-fetch';
import { Redis } from '@upstash/redis';

const app=express(); app.use(bodyParser.json());

const redis=new Redis({
  url:process.env.UPSTASH_REDIS_REST_URL,
  token:process.env.UPSTASH_REDIS_REST_TOKEN
});

/* ---------- Join / Leave ---------- */
app.post('/global/join',async(req,res)=>{
  const key=JSON.stringify(req.body);
  if(await redis.sismember('global:channels',key)){
    console.log('🔄 already joined',req.body);
    return res.send({ status:'already' });
  }
  await redis.sadd('global:channels',key);
  console.log('🟢 joined',req.body);
  res.send({ status:'joined' });
});

app.post('/global/leave',async(req,res)=>{
  const key=JSON.stringify(req.body);
  await redis.srem('global:channels',key);
  console.log('🔴 left',req.body);
  res.send({ status:'left' });
});

/* ---------- Publish ---------- */
app.post('/publish',async(req,res)=>{
  const msg=req.body;
  if(/(?:@everyone|@here|<@!?\\d+>)/.test(msg.content)){
    console.log('🔒 mention blocked'); return res.send({ status:'blocked' });
  }

  const list=await redis.smembers('global:channels');
  for(const entry of list){
    let parsed;
    try{
      parsed=typeof entry==='string'&&entry.trim().startsWith('{')
        ? JSON.parse(entry)
        : entry;
    }catch{
      console.warn('⚠️ corrupted entry removed',entry);
      await redis.srem('global:channels',entry);
      continue;
    }
    const { guildId,channelId }=parsed;
    if(guildId===msg.guildId) continue;

    /* ▼ 宛先ギルドの言語設定を取得 */
    const langInfo = await redis.hgetall(`lang:${guildId}`);
    const targetLang = (langInfo?.autoTranslate==='true' && langInfo.lang)
      ? langInfo.lang
      : null;

    try{
      const r=await fetch(`${process.env.BOT_ENDPOINT}/relay`,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ ...msg, toGuild:guildId, toChannel:channelId, targetLang })
      });
      const js=await r.json().catch(()=>({}));
      console.log(`➡️ ${guildId}/${channelId}`,r.status,js.messageId??'');
    }catch(err){
      console.error('relay err →',guildId,channelId,err.message);
    }
  }
  res.send({ status:'ok' });
});

/* ---------- Health ---------- */
app.get('/healthz',(_q,r)=>r.send('OK'));
app.listen(process.env.PORT||3000,()=>console.log('Hub listening'));
