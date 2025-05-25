import express from 'express';
import bodyParser from 'body-parser';
import { Redis } from '@upstash/redis';

const app = express();
app.use(bodyParser.json());

// Upstash Redis の設定は環境変数から
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN
});

// チャンネル登録
app.post('/global/join', async (req, res) => {
  const { guildId, channelId } = req.body;
  await redis.sadd('global:channels', JSON.stringify({ guildId, channelId }));
  res.send({ status: 'joined' });
});

// チャンネル解除
app.post('/global/leave', async (req, res) => {
  const { guildId, channelId } = req.body;
  await redis.srem('global:channels', JSON.stringify({ guildId, channelId }));
  res.send({ status: 'left' });
});

// メッセージ中継
app.post('/publish', async (req, res) => {
  const msg = req.body; // { guildId, channelId, userId, content }
  const registered = await redis.smembers('global:channels');
  for (const entry of registered) {
    const { guildId: toGuild, channelId: toChannel } = JSON.parse(entry);
    // ここで Bot 側の受信用エンドポイントに中継リクエストを送る
    // 例: fetch(`${BOT_ENDPOINT}/relay`, { method: 'POST', body: JSON.stringify({ toGuild, toChannel, ...msg }) })
  }
  res.send({ status: 'ok' });
});

// ヘルスチェック
app.get('/healthz', (_req, res) => res.send('OK'));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Hub listening on ${port}`));
