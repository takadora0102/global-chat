// bot/deploy-commands.js
import 'dotenv/config';
import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import { data as cmdGlobal } from './commands/global.js';

/* ----- /setup は管理者向けなので維持 ----- */
const cmdSetup = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('カテゴリとチャンネルを自動作成')
  .setDefaultMemberPermissions(0x00000008);     // Administrator

/* ----- /announce → 権限指定を外す ----- */
const cmdAnnounce = new SlashCommandBuilder()
  .setName('announce')
  .setDescription('全サーバーの #bot-お知らせ に一斉送信')
  .addStringOption(o =>
    o.setName('text').setDescription('メッセージ本文').setRequired(true)
  );                                            // ← 権限行なし

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
