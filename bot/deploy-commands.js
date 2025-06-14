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
import pino from 'pino';
const logger = pino();

// ----- Environment Variables Check -----
for (const k of ['DISCORD_TOKEN', 'CLIENT_ID']) {
  if (!process.env[k]) {
    logger.error(`❌ Missing env: ${k}`);
    process.exit(1);
  }
}

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
      logger.info(`✔︎ Loaded slash command: ${cmd.data.name}`);
    } else {
      console.warn(`⚠︎ Skip non-command file: ${file}`);
    }
  } catch (err) {
    logger.error(`❌ Failed to import ${file}:`, err);
  }
}

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    logger.info(`🚀 Deploying ${commands.length} global slash commands…`);
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );
    logger.info('✅ Commands deployed successfully.');
  } catch (err) {
    logger.error('❌ Deployment failed:', err);
    process.exit(1);
  }
})();
