import 'dotenv/config';
import express from 'express';
import { Client, GatewayIntentBits, Events } from 'discord.js';
import bodyParser from 'body-parser';
import fetch from 'node-fetch';

// Discord Client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions
  ]
});

// グローバルハブの URL を環境変数で
const HUB = process.env.HUB_ENDPOINT;

// /global join コマンド例（別途Slash登録が必要）
client.on(Events.InteractionCreate, async i => {
  if (!i.isChatInputCommand()) return;
  if (i.commandName === 'global') {
    const channel = i.options.getChannel('channel');
    await fetch(`${HUB}/global/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guildId: i.guildId, channelId: channel.id })
    });
    await i.reply('このチャンネルをグローバルチャットに登録しました！');
  }
});

// メッセージをハブに中継
client.on(Events.MessageCreate, async msg => {
  if (msg.author.bot) return;
  // ここで「登録済みか確認」してから中継
  await fetch(`${HUB}/publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      guildId: msg.guildId,
      channelId: msg.channelId,
      userId: msg.author.id,
      content: msg.content
    })
  });
});

// 受信中継メッセージを自チャンネルへ流し込み（Express サーバ）
const app = express();
app.use(bodyParser.json());
app.post('/relay', async (req, res) => {
  const { toGuild, toChannel, userId, content } = req.body;
  const channel = await client.guilds.cache
    .get(toGuild)
    .channels.fetch(toChannel);
  channel.send(`[🌐] <@${userId}>: ${content}`);
  res.send({ status: 'relayed' });
});

// Ready & Express Health
client.once(Events.ClientReady, () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});
app.get('/healthz', (_req, res) => res.send('OK'));

client.login(process.env.DISCORD_TOKEN);
app.listen(process.env.PORT || 3000);
