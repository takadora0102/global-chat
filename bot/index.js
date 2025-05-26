import 'dotenv/config';
import express from 'express';
import bodyParser from 'body-parser';
import fetch from 'node-fetch';
import {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  SlashCommandBuilder
} from 'discord.js';

/* ---------- 翻訳ヘルパ ---------- */
async function translate(text, target) {
  const url =
    'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto' +
    `&tl=${target}&dt=t&q=${encodeURIComponent(text)}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Translation error: ${res.status}`);
  const data = await res.json();
  return data[0].map(item => item[0]).join('');
}

/* ---------- Discord クライアント ---------- */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions
  ],
  partials: [Partials.Message, Partials.Reaction, Partials.Channel]
});

const HUB = process.env.HUB_ENDPOINT;

/* ---------- Slash Command 定義 ---------- */
export const data = new SlashCommandBuilder()
  .setName('global')
  .setDescription('グローバルチャット機能')
  .addSubcommand(sub =>
    sub
      .setName('join')
      .setDescription('このチャンネルをグローバルチャットに参加させる')
      .addChannelOption(opt =>
        opt.setName('channel').setDescription('参加チャンネル').setRequired(true)
      )
  )
  .addSubcommand(sub =>
    sub.setName('leave').setDescription('グローバルチャットから退出させる')
  );

/* ---------- Slash Command ハンドラ ---------- */
client.on(Events.InteractionCreate, async i => {
  if (!i.isChatInputCommand()) return;
  if (i.commandName !== 'global') return;

  const sub = i.options.getSubcommand();
  const channel = i.options.getChannel('channel') || i.channel;

  const payload = { guildId: i.guildId, channelId: channel.id };
  const path = sub === 'join' ? 'join' : 'leave';

  await fetch(`${HUB}/global/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  await i.reply(
    sub === 'join'
      ? 'このチャンネルをグローバルチャットに登録しました！'
      : 'このチャンネルをグローバルチャットから解除しました！'
  );
});

/* ---------- メッセージ → Hub ---------- */
client.on(Events.MessageCreate, async msg => {
  if (msg.author.bot) return;

  await fetch(`${HUB}/publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      guildId: msg.guildId,
      channelId: msg.channelId,
      userId: msg.author.id,
      userTag: msg.author.tag,
      userAvatar: msg.author.displayAvatarURL(),
      originGuild: msg.guild.name,
      content: msg.content,
      replyTo: msg.reference?.messageId ?? null
    })
  });
});

/* ---------- Relay 受信 ---------- */
const app = express();
app.use(bodyParser.json());

app.post('/relay', async (req, res) => {
  const {
    toGuild,
    toChannel,
    userTag,
    userAvatar,
    originGuild,
    content,
    replyTo
  } = req.body;

  try {
    const channel = await client.guilds.cache
      .get(toGuild)
      .channels.fetch(toChannel);

    // メンション防止・Embed 形式
    const embed = {
      author: { name: `${userTag} @ ${originGuild}`, icon_url: userAvatar },
      description: content,
      footer: { text: '🌐 global chat' }
    };

    const opts = replyTo
      ? { embeds: [embed], reply: { messageReference: replyTo } }
      : { embeds: [embed] };

    await channel.send(opts);
    res.send({ status: 'relayed' });
  } catch (err) {
    console.error('Relay error:', err.message);
    res.sendStatus(500);
  }
});

/* ---------- 国旗リアクション翻訳 ---------- */
const FLAG_TO_LANG = {
  // 既存
  '🇯🇵': 'ja',
  '🇺🇸': 'en',
  '🇬🇧': 'en',
  // アジア
  '🇨🇳': 'zh',
  '🇹🇼': 'zh',
  '🇰🇷': 'ko',
  '🇮🇳': 'hi',
  '🇹🇭': 'th',
  '🇻🇳': 'vi',
  '🇮🇩': 'id',
  '🇵🇭': 'tl',
  '🇹🇷': 'tr',
  '🇸🇦': 'ar',
  // ヨーロッパ
  '🇪🇸': 'es',
  '🇫🇷': 'fr',
  '🇵🇹': 'pt',
  '🇮🇹': 'it',
  '🇩🇪': 'de',
  '🇷🇺': 'ru',
  '🇳🇱': 'nl',
  '🇵🇱': 'pl',
  '🇸🇪': 'sv'
};

client.on(Events.MessageReactionAdd, async (reaction, user) => {
  if (user.bot) return;

  if (reaction.partial) await reaction.fetch();
  if (reaction.message.partial) await reaction.message.fetch();

  const lang = FLAG_TO_LANG[reaction.emoji.name];
  if (!lang) return;

  const original = reaction.message.content;
  if (!original) return;

  try {
    const translated = await translate(original, lang);
    await reaction.message.reply({
      embeds: [
        {
          description: `> ${original}\n\n**${translated}**`,
          footer: { text: `🌐 translated to ${lang}` }
        }
      ]
    });
  } catch (err) {
    console.error('Translate error:', err.message);
  }
});

/* ---------- 起動 & Health ---------- */
client.once(Events.ClientReady, () =>
  console.log(`✅ Logged in as ${client.user.tag}`)
);
client.login(process.env.DISCORD_TOKEN);

app.get('/healthz', (_req, res) => res.send('OK'));
app.listen(process.env.PORT || 3000);
