/**
 * hub/hub.js – Global Chat Relay
 * 2025-05-27  修正版
 * ・autoTranslate が未設定（null / undefined）の場合でも翻訳を行う
 * ・コード整理（機能は変わりません）
 */
import express from 'express';
import bodyParser from 'body-parser';
import fetch from 'node-fetch';
import { Redis } from '@upstash/redis';

const app  = express();
const PORT = process.env.PORT || 3000;
app.use(bodyParser.json());

const redis = new Redis({
  url:   process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN
});

/* ---------- JOIN / LEAVE ---------- */
app.post('/global/join', async (req, res) => {
  const key = JSON.stringify(req.body);
  if (await redis.sismember('global:channels', key)) return res.send({ status: 'already' });
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

/* ---------- PUBLISH ---------- */
app.post('/publish', async (req, res) => {
  const msg = req.body;

  /* Mentions guard */
  if (/(?:@everyone|@here|<@!?\\d+>)/.test(msg.content)) {
    console.log('🔒 mention blocked'); return res.send({ status: 'blocked' });
  }

  const list = await redis.smembers('global:channels');

  for (const entry of list) {
    let parsed;
    try { parsed = JSON.parse(entry); }
    catch { await redis.srem('global:channels', entry); continue; }

    const { guildId, channelId } = parsed;
    if (guildId === msg.guildId) continue;                 // 自分には返さない

    /* ▼ 翻訳設定の取得 ------------- */
    const langInfo = await redis.hgetall(`lang:${guildId}`);
    const lang     = langInfo?.lang ?? null;
    // autoTranslate が「false」だけ翻訳OFF、空欄や未設定なら翻訳ON
    const shouldTranslate = lang && langInfo?.autoTranslate !== 'false';
    const targetLang      = shouldTranslate ? lang : null;

    /* ▼ Relay 呼び出し ------------ */
    try {
      const r = await fetch(`${process.env.BOT_ENDPOINT}/relay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body:   JSON.stringify({ ...msg, toGuild: guildId, toChannel: channelId, targetLang })
      });
      const js = await r.json().catch(() => ({}));
      console.log(`➡️ ${guildId}/${channelId}`, r.status, js.messageId ?? '');
    } catch (err) {
      console.error('relay err →', guildId, channelId, err.message);
    }
  }
  res.send({ status: 'ok' });
});

/* ---------- HEALTH ---------- */
app.get('/healthz', (_q, r) => r.send('OK'));
app.listen(PORT, () => console.log('Hub listening on', PORT));
