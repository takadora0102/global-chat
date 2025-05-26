// hub/hub.js
import express from 'express';
import bodyParser from 'body-parser';
import fetch from 'node-fetch';
import { Redis } from '@upstash/redis';

const app = express();
app.use(bodyParser.json());

// Upstash Redis クライアントのセットアップ
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN
});

// --- チャンネル登録エンドポイント ---
app.post('/global/join', async (req, res) => {
  const { guildId, channelId } = req.body;
  await redis.sadd('global:channels', JSON.stringify({ guildId, channelId }));
  console.log(`🟢 Joined ${guildId}/${channelId}`);
  res.send({ status: 'joined' });
});

// --- チャンネル解除エンドポイント ---
app.post('/global/leave', async (req, res) => {
  const { guildId, channelId } = req.body;
  await redis.srem('global:channels', JSON.stringify({ guildId, channelId }));
  console.log(`🔴 Left ${guildId}/${channelId}`);
  res.send({ status: 'left' });
});

// --- メッセージ中継エンドポイント ---
app.post('/publish', async (req, res) => {
  const msg = req.body;
  console.log('📨 /publish received:', msg);

  const registered = await redis.smembers('global:channels');
  for (const entry of registered) {
    console.log('  raw entry:', entry, 'typeof:', typeof entry);

    // JSON 文字列かオブジェクトかを判定してパースまたはそのまま利用
    let parsed;
    if (typeof entry === 'object') {
      parsed = entry;
    } else if (
      typeof entry === 'string' &&
      entry.trim().startsWith('{') &&
      entry.trim().endsWith('}')
    ) {
      try {
        parsed = JSON.parse(entry);
      } catch {
        console.warn('❌ Invalid JSON, skipping entry:', entry);
        continue;
      }
    } else {
      console.warn('❌ Unrecognized entry format, skipping:', entry);
      continue;
    }

    const { guildId: toGuild, channelId: toChannel } = parsed;
    console.log(`➡️ Relaying to ${toGuild}/${toChannel}`);

    try {
      const r = await fetch(
        `${process.env.BOT_ENDPOINT}/relay`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...msg, toGuild, toChannel })
        }
      );
      console.log(`   -> relay status: ${r.status}`);
    } catch (err) {
      console.error(`❌ Relay failed to ${toGuild}/${toChannel}:`, err.message);
    }
  }

  res.send({ status: 'ok' });
});

// --- ヘルスチェックエンドポイント ---
app.get('/healthz', (_req, res) => res.send('OK'));

// --- サーバー起動 ---
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Hub listening on ${port}`));
