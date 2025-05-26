import express from 'express';
import bodyParser from 'body-parser';
import fetch from 'node-fetch';
import { Redis } from '@upstash/redis';

const app = express();
app.use(bodyParser.json());

// Upstash Redis
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN
});

/* ---------- Join / Leave ---------- */
app.post('/global/join', async (req, res) => {
  await redis.sadd('global:channels', JSON.stringify(req.body));
  console.log('🟢 Joined', req.body);
  res.send({ status: 'joined' });
});

app.post('/global/leave', async (req, res) => {
  await redis.srem('global:channels', JSON.stringify(req.body));
  console.log('🔴 Left', req.body);
  res.send({ status: 'left' });
});

/* ---------- Publish ---------- */
app.post('/publish', async (req, res) => {
  const msg = req.body;

  // メンションを含むメッセージはブロック
  if (/(?:@everyone|@here|<@!?\\d+>)/.test(msg.content)) {
    console.log('🔒 Mention blocked:', msg.content);
    return res.send({ status: 'blocked' });
  }

  const set = await redis.smembers('global:channels');

  for (const entry of set) {
    const parsed =
      typeof entry === 'string' && entry.startsWith('{')
        ? JSON.parse(entry)
        : entry;

    // 同じギルドには送らない
    if (parsed.guildId === msg.guildId) continue;

    try {
      const r = await fetch(`${process.env.BOT_ENDPOINT}/relay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...msg, ...parsed })
      });
      console.log(`➡️ Relay to ${parsed.guildId}/${parsed.channelId}:`, r.status);
    } catch (err) {
      console.error('Relay error:', err.message);
    }
  }

  res.send({ status: 'ok' });
});

/* ---------- Health ---------- */
app.get('/healthz', (_req, res) => res.send('OK'));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Hub listening on ${port}`));
