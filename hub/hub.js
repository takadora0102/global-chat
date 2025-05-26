/**
 * hub/hub.js  ―  Global-Chat Relay API
 *
 * 1. /global/join   : チャンネル登録（重複チェック）
 * 2. /global/leave  : チャンネル解除
 * 3. /publish       : 登録チャンネルへ中継
 *      - 同一ギルド宛はスキップ
 *      - @everyone / @here / @ユーザー を含む場合はブロック
 *      - Bot へ送るキー名は { toGuild , toChannel }
 * 4. /healthz       : keep-alive 用
 */

import express from 'express';
import bodyParser from 'body-parser';
import fetch from 'node-fetch';
import { Redis } from '@upstash/redis';

const app = express();
app.use(bodyParser.json());

/* ---------- Upstash Redis ---------- */
const redis = new Redis({
  url:   process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN
});

/* ---------- チャンネル登録 ---------- */
app.post('/global/join', async (req, res) => {
  const key = JSON.stringify(req.body);               // { guildId, channelId }
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
  const msg = req.body;   // { guildId, channelId, content, ... }

  /* メンション系はブロック */
  if (/(?:@everyone|@here|<@!?\\d+>)/.test(msg.content)) {
    console.log('🔒 Mention blocked:', msg.content);
    return res.send({ status: 'blocked' });
  }

  /* 登録チャンネル一覧 */
  const list = await redis.smembers('global:channels');

  for (const entry of list) {
    const { guildId, channelId } =
      typeof entry === 'string' ? JSON.parse(entry) : entry;

    /* 同じギルドには送らない */
    if (guildId === msg.guildId) continue;

    try {
      const r = await fetch(`${process.env.BOT_ENDPOINT}/relay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...msg,
          toGuild:   guildId,
          toChannel: channelId
        })
      });
      console.log(`➡️ Relayed to ${guildId}/${channelId}:`, r.status);
    } catch (err) {
      console.error('Relay error →', guildId, channelId, err.message);
    }
  }

  res.send({ status: 'ok' });
});

/* ---------- ヘルスチェック ---------- */
app.get('/healthz', (_req, res) => res.send('OK'));

/* ---------- 起動 ---------- */
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Hub listening on ${port}`));
