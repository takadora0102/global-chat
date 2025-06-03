/**
 * deploy-commands.js  –  Robust version
 *   • “commands” フォルダ内の .js を走査
 *   • default export に data が無ければスキップ
 *   • 4 コマンド (/setup, /profile, /ranking, /help) だけを登録
 *
 * 必要環境変数:
 *   DISCORD_TOKEN, CLIENT_ID
 */

import { REST, Routes } from 'discord.js';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import 'dotenv/config';

/* ------------- 収集 ------------- */
const commands = [];
const dir = path.join(process.cwd(), 'commands');

for (const file of readdirSync(dir)) {
  if (!file.endsWith('.js')) continue;
  const { default: cmd } = await import(path.join(dir, file));
  if (cmd?.data?.toJSON) {
    commands.push(cmd.data.toJSON());
    console.log(`✔︎ Loaded slash command: ${cmd.data.name}`);
  } else {
    console.warn(`⚠︎ Skip non-command file: ${file}`);
  }
}

/* ------------- REST put ------------- */
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log(`🚀 Deploying ${commands.length} global slash commands…`);
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    console.log('✅ Slash commands deployed successfully');
  } catch (err) {
    console.error('❌ Deployment failed:', err);
    process.exit(1);
  }
})();
