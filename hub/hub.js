/**
 * hub/hub.js – Global Chat Relay (フル版)
 */

import express from 'express';
import bodyParser from 'body-parser';
import fetch from 'node-fetch';
import { Redis } from '@upstash/redis';

const app = express(); app.use(bodyParser.json());

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN
});

/* --- Join --- */
app.post('/global/join', async (req, res) => {
  const key = JSON.stringify(req.body);
  if (await redis.sismember('global:channels', key)) {
    console.log('🔄 Already joined', req.body);
    return res.send({ status: 'already' });
  }
  await redis.sadd('global:channels', key);
  console.log('🟢 Joined', req.body);
  res.send({ status: 'joined' });
});

/* --- Leave --- */
app.post('/global/leave', async (req, res) => {
  const key = JSON.stringify(req.body);
  await redis.srem('global:channels', key);
  console.log('🔴 Left', req.body);
  res.send({ status: 'left' });
});

/* --- Publish --- */
app.post('/publish', async (req, res) => {
  const msg = req.body; // { guildId, content, ... }

  if (/(?:@everyone|@here|<@!?\\d+>)/.test(msg.content)) {
    console.log('🔒 Mention blocked');
    return res.send({ status: 'blocked' });
  }

  const list = await redis.smembers('global:channels');

  for (const entry of list) {
    const { guildId, channelId } = JSON.parse(entry);
    if (guildId === msg.guildId) continue;

    try {
      const r = await fetch(`${process.env.BOT_ENDPOINT}/relay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...msg, toGuild: guildId, toChannel: channelId })
      });
      const js = await r.json().catch(() => ({}));
      console.log(
        `➡️ Relayed to ${guildId}/${channelId}:`, r.status, js.messageId ?? ''
      );
    } catch (err) {
      console.error('Relay error →', guildId, channelId, err.message);
    }
  }

  res.send({ status: 'ok' });
});

/* --- Health --- */
app.get('/healthz', (_req, res) => res.send('OK'));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Hub listening on ${port}`));
