// deploy-commands.js
import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { data as globalCommand } from './commands/global.js';

const commands = [globalCommand.toJSON()];
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('Started refreshing application commands globally.');
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );
    console.log('Successfully reloaded application commands globally.');
  } catch (err) {
    console.error(err);
  }
})();

// index.js
import 'dotenv/config';
import fetch from 'node-fetch';
import express from 'express';
import bodyParser from 'body-parser';
import { Client, GatewayIntentBits, Partials, Events, SlashCommandBuilder } from 'discord.js';

// --- Translation Helper ---
async function translate(text, target) {
  const url =
    'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto' +
    `&tl=${target}&dt=t&q=${encodeURIComponent(text)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Translation API error: ${res.status}`);
  const data = await res.json();
  return data[0].map(item => item[0]).join('');
}

// --- Discord Client ---
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions
  ],
  partials: [Partials.Message, Partials.Reaction, Partials.Channel]
});

// --- Global Chat Command Definition (for registration) ---
export const data = new SlashCommandBuilder()
  .setName('global')
  .setDescription('グローバルチャット機能')
  .addSubcommand(sub =>
    sub.setName('join')
      .setDescription('このチャンネルをグローバルチャットに参加させる')
      .addChannelOption(opt =>
        opt.setName('channel')
           .setDescription('参加させるチャンネル')
           .setRequired(true)
      )
  )
  .addSubcommand(sub =>
    sub.setName('leave')
      .setDescription('このチャンネルをグローバルチャットから退出させる')
  );

const HUB = process.env.HUB_ENDPOINT;

// --- Slash Command Handler ---
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === 'global') {
    const sub = interaction.options.getSubcommand();
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    if (sub === 'join') {
      await fetch(`${HUB}/global/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guildId: interaction.guildId, channelId: channel.id })
      });
      await interaction.reply('このチャンネルをグローバルチャットに登録しました！');
    } else if (sub === 'leave') {
      await fetch(`${HUB}/global/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guildId: interaction.guildId, channelId: interaction.channelId })
      });
      await interaction.reply('このチャンネルをグローバルチャットから解除しました！');
    }
  }
});

// --- Message Publish Handler ---
client.on(Events.MessageCreate, async msg => {
  if (msg.author.bot) return;
  await fetch(`${HUB}/publish`, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({
      guildId: msg.guildId,
      channelId: msg.channelId,
      userId: msg.author.id,
      content: msg.content
    })
  });
});

// --- Relay Endpoint for Hub to Bot ---
const app = express();
app.use(bodyParser.json());
app.post('/relay', async (req, res) => {
  const { toGuild, toChannel, userId, content } = req.body;
  try {
    const channel = await client.guilds.cache
      .get(toGuild).channels.fetch(toChannel);
    await channel.send(`[🌐] <@${userId}>: ${content}`);
    res.send({ status: 'relayed' });
  } catch {
    res.sendStatus(500);
  }
});

// --- Reaction Translation Mapping ---
const FLAG_TO_LANG = { '🇯🇵':'ja', '🇺🇸':'en', '🇬🇧':'en' };

// --- Reaction Translation Handler ---
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
    await reaction.message.reply(`> ${original}\n\n**${translated}**`);
  } catch (err) {
    console.error('❌ 翻訳エラー:', err);
  }
});

// --- Ready & Health ---
client.once(Events.ClientReady, () => console.log(`✅ Logged in as ${client.user.tag}`));
client.login(process.env.DISCORD_TOKEN);
app.get('/healthz', (_req, res) => res.send('OK'));
app.listen(process.env.PORT||3000, () => console.log('HTTP server running'));
