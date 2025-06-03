/**
 * deploy-commands.js – 4 slash commands をグローバル登録
 *
 * 必須 env: DISCORD_TOKEN, CLIENT_ID
 */

import { REST, Routes } from 'discord.js';
import fs from 'node:fs';
import path from 'node:path';
import 'dotenv/config';

const commands = [];

/* コマンドファイルを読み込み */
const commandsPath = path.join(process.cwd(), 'commands');
for (const file of fs.readdirSync(commandsPath)) {
  if (!file.endsWith('.js')) continue;
  const { default: cmd } = await import(path.join(commandsPath, file));
  commands.push(cmd.data.toJSON());
}

/* REST で PUT */
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
try {
  console.log(`🚀 Refreshing global slash commands (${commands.length}) …`);
  await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
  console.log('✅ Commands refreshed');
} catch (err) {
  console.error(err);
}
