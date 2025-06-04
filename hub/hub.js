/**
 * hub/hub.js – Global Chat Relay (2025-05-28 Fix for corrupted entries)
 */

import express from 'express';
import bodyParser from 'body-parser';
import fetch from 'node-fetch';
import { Redis } from '@upstash/redis';

const app = express();
app.use(bodyParser.json());

const redis = new Redis({
  url:   process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN
});

/* ---------- Join / Leave ---------- */
app.post('/global/join', async (req, res) => {
  const key = JSON.stringify(req.body);
  if (await redis.sismember('global:channels', key)) {
    console.log('🔄 already joined', req.body);
    return res.send({ status: 'already' });
  }
  await redis.sadd('global:channels', key);
  console.log('🟢 joined', req.body);
  res.send({ status: 'joined' });
});

app.post('/global/leave', async (req, res) => {
  const key = JSON.stringify(req.body);
  await redis.srem('global:channels', key);
  console.log('🔴 left', req.body);
  res.send({ status: 'left' });
});

/* ---------- Publish (そのまま中継) ---------- */
app.post('/publish', async (req, res) => {
  const msg = req.body;
  // mention guard
  if (/(?:@everyone|@here|<@!?\\d+>)/.test(msg.content)) {
    console.log('🔒 mention blocked');
    return res.send({ status: 'blocked' });
  }

  const list = await redis.smembers('global:channels');
  for (const entry of list) {
    let parsed;
    // 【修正ポイント】entry が文字列かオブジェクトか判定
    if (typeof entry === 'string') {
      try {
        parsed = JSON.parse(entry);
      } catch {
        console.warn('⚠️ corrupted entry removed', entry);
        await redis.srem('global:channels', entry);
        continue;
      }
    } else if (typeof entry === 'object' && entry.guildId && entry.channelId) {
      parsed = entry;
    } else {
      console.warn('⚠️ invalid entry removed', entry);
      await redis.srem('global:channels', entry);
      continue;
    }

    const { guildId, channelId } = parsed;
    if (guildId === msg.guildId) continue; // 自分には返さない

    // 翻訳設定取得
    const langInfo = await redis.hgetall(`lang:${guildId}`);
    const lang     = langInfo?.lang ?? null;
    const shouldTranslate = lang && langInfo?.auto !== 'false';
    const targetLang      = shouldTranslate ? lang : null;

    // ログ：Relay 宛先と targetLang
    console.log('🔄 sending to relay →', guildId, channelId, 'targetLang:', targetLang);

    try {
      const r = await fetch(`${process.env.BOT_ENDPOINT}/relay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body:   JSON.stringify({ ...msg, toGuild: guildId, toChannel: channelId, targetLang })
      });

      // ログ：Relay レスポンス
      console.log('➡️ relay response', guildId, channelId, r.status);

      const js = await r.json().catch(() => ({}));
      console.log(`➡️ ${guildId}/${channelId}`, r.status, js.messageId ?? '');
    } catch (err) {
      console.error('relay err →', guildId, channelId, err.message);
    }
  }

  res.send({ status: 'ok' });
});

/* ---------- Health ---------- */
app.get('/healthz', (_q, r) => r.send('OK'));
app.listen(process.env.PORT || 3000, () => console.log('Hub listening'));
