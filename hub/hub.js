/**
 * hub/hub.js
 * -----------------
 * - Redis に登録チャンネルを保持
 * - join/leave で重複チェック
 * - publish でメンション付きメッセージをブロック
 * - publish から Bot へ relay する際は toGuild / toChannel を渡す
 */

import express from 'express';
import bodyParser from 'body-parser';
import fetch from 'node-fetch';
import { Redis } from '@upstash/redis';

const app = express();
app.use(bodyParser.json());

/* ---------- Upstash Redis ---------- */
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN
});

/* ---------- チャンネル登録 ---------- */
app.post('/global/join', async (req, res) => {
  const key = JSON.stringify(req.body);      // { guildId, channelId }
  const exists = await redis.sismember('global:channels', key);

  if (exists) {
    console.log('🔄 Already joined', req.body);
    return res.send({ status: 'already' });
  }
  await redis.sadd('global:channels', key);
  console.log('🟢 Joined', req.body);
  res.send({ status: 'joined' });
});

/* ---------- チャンネル解除 ---------- */
app.post('/global/leave', async (req, res) => {
  const key = JSON.stringify(req.body);
  await redis.srem('global:channels', key);
  console.log('🔴 Left', req.body);
  res.send({ status: 'left' });
});

/* ---------- メッセージ中継 ---------- */
app.post('/publish', async (req, res) => {
  const msg = req.body;  // { guildId, channelId, userId, userTag, userAvatar, originGuild, content, replyTo }

  /* メンション付き or everyone/here をブロック */
  if (/(?:@everyone|@here|<@!?\\d+>)/.test(msg.content)) {
    console.log('🔒 Mention blocked:', msg.content);
    return res.send({ status: 'blocked' });
  }

  /* 登録チャンネルを取得 */
  const entries = await redis.smembers('global:channels');

  for (const entry of entries) {
    const parsed =
      typeof entry === 'string' && entry.trim().startsWith('{')
        ? JSON.parse(entry)        // { guildId, channelId }
        : entry;

    /* 同じギルドには送らない */
    if (parsed.guildId === msg.guildId) continue;

    try {
      /* Bot の /relay へ中継。キー名を toGuild / toChannel にそろえる！ */
      const r = await fetch(`${process.env.BOT_ENDPOINT}/relay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...msg,
          toGuild:   parsed.guildId,
          toChannel: parsed.channelId
        })
      });

      console.log(
        `➡️ Relayed to ${parsed.guildId}/${parsed.channelId}:`,
        r.status
      );
    } catch (err) {
      console.error('Relay error:', err.message);
    }
  }

  res.send({ status: 'ok' });
});

/* ---------- ヘルスチェック ---------- */
app.get('/healthz', (_req, res) => res.send('OK'));

/* ---------- 起動 ---------- */
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Hub listening on ${port}`));
