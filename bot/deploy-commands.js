import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { data as globalCommand } from './commands/global.js';

const commands = [ globalCommand.toJSON() ];
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('Refreshing global slash commands…');
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),  // ← グローバル登録
      { body: commands }
    );
    console.log('✔️ Global commands reloaded.');
  } catch (err) {
    console.error('❌ Failed to reload commands:', err);
  }
})();
