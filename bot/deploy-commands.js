/**
 * deploy-commands.js – 修正版
 *
 * 「commands フォルダ内の .js ファイルをすべて読み込み、
 *  default export に data プロパティがあれば toJSON() → 登録する」
 * という構造ですが、Windows では import() に直接パスを渡すと
 * ERR_UNSUPPORTED_ESM_URL_SCHEME が発生するため、
 * file:// 形式の URL に変換しています。
 *
 * 必須環境変数:
 *   DISCORD_TOKEN
 *   CLIENT_ID
 */

import { REST, Routes } from 'discord.js';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import 'dotenv/config';

const commands = [];
const commandsPath = path.join(process.cwd(), 'commands');

for (const file of readdirSync(commandsPath)) {
  if (!file.endsWith('.js')) continue;

  // 絶対パスを組み立て
  const filePath = path.join(commandsPath, file);
  // file:// URL に変換
  const fileUrl = pathToFileURL(filePath).href;

  try {
    const { default: cmd } = await import(fileUrl);
    if (cmd?.data?.toJSON) {
      commands.push(cmd.data.toJSON());
      console.log(`✔︎ Loaded slash command: ${cmd.data.name}`);
    } else {
      console.warn(`⚠︎ Skip non-command file: ${file}`);
    }
  } catch (err) {
    console.error(`❌ Failed to import ${file}:`, err);
  }
}

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log(`🚀 Deploying ${commands.length} global slash commands…`);
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );
    console.log('✅ Commands deployed successfully.');
  } catch (err) {
    console.error('❌ Deployment failed:', err);
    process.exit(1);
  }
})();
