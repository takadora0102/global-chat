// bot/deploy-commands.js  （変更なし）
import 'dotenv/config';
import { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { data as cmdGlobal } from './commands/global.js'; // /global join|leave

const cmdSetup = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('カテゴリとチャンネルを自動作成')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

const cmdAnnounce = new SlashCommandBuilder()
  .setName('announce')
  .setDescription('全サーバーの #bot-お知らせ に一斉送信（運営専用）')
  .addStringOption(o =>
    o.setName('text').setDescription('メッセージ本文').setRequired(true)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

const commands = [
  cmdSetup.toJSON(),
  cmdAnnounce.toJSON(),
  cmdGlobal.toJSON()
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );
    console.log('✅ Global commands refreshed');
  } catch (err) {
    console.error('❌ Command deploy failed:', err);
  }
})();
