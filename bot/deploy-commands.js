// deploy-commands.js
import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { data as globalCommand } from './commands/global.js';

const commands = [ globalCommand.toJSON() ];
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('Refreshing commands globally…');
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );
    console.log('Commands reloaded.');
  } catch (err) {
    console.error(err);
  }
})();
