/**
 * deploy-commands.js
 *
 * ・このファイルを実行すると、以下の 4 つのコマンドを
 *   Discord のグローバルスラッシュコマンドとして登録します。
 *   ────────────────────────────────────────────────────────────
 *   • /setup     （管理者専用：グローバルチャットのカテゴリとチャンネルを自動作成）
 *   • /profile   （自分の累計メッセージ数・累計いいね数を表示）
 *   • /ranking   （メッセージ数／いいね数のランキングを表示）
 *   • /help      （言語選択メニュー → 選択言語のヘルプを表示）
 *   ────────────────────────────────────────────────────────────
 *
 * 実行例:
 *   $ node deploy-commands.js
 *
 * 前提:
 *   • プロジェクト直下に .env ファイルを置き、次の変数を定義していること
 *       DISCORD_TOKEN=<Bot のトークン>
 *       CLIENT_ID=<Bot のアプリケーション ID>
 *   • package.json に "type": "module" が設定されていること
 */

import 'dotenv/config';
import { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 現在のファイル位置を取得するためのユーティリティ
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

/* ───────────────────────────────────────────────────────────────────────────
 * 1) /help の定義（commands/help.js から動的インポート）
 * ───────────────────────────────────────────────────────────────────────────
 */
const helpModule = await import(path.join(__dirname, 'commands', 'help.js'));
// commands/help.js の中で `export default { data: new SlashCommandBuilder(), … }` を想定
const helpData   = helpModule.default.data.toJSON();

/* ───────────────────────────────────────────────────────────────────────────
 * 2) /setup, /profile, /ranking の定義を手動で作成
 * ───────────────────────────────────────────────────────────────────────────
 */
/** /setup （管理者専用） */
const cmdSetup = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('Automatically create the Global Chat category and its channels')
  // このコマンドは管理者権限を持つメンバーのみ実行可
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setDMPermission(false);

/** /profile */
const cmdProfile = new SlashCommandBuilder()
  .setName('profile')
  .setDescription('Show your total message count and total likes received')
  .setDMPermission(false);

/** /ranking
 *  サブコマンド (messages, likes) を持つ例
 */
const cmdRanking = new SlashCommandBuilder()
  .setName('ranking')
  .setDescription('Show leaderboards')
  .setDMPermission(false)
  .addSubcommand((sub) =>
    sub
      .setName('messages')
      .setDescription('Top 10 users by messages sent')
  )
  .addSubcommand((sub) =>
    sub
      .setName('likes')
      .setDescription('Top 10 users by likes received')
  );

/* ───────────────────────────────────────────────────────────────────────────
 * 3) 全コマンドを配列にまとめて JSON 化
 * ───────────────────────────────────────────────────────────────────────────
 */
const commands = [
  helpData,               // commands/help.js から取得した /help の定義
  cmdSetup.toJSON(),      // /setup
  cmdProfile.toJSON(),    // /profile
  cmdRanking.toJSON()     // /ranking
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('🚀 Refreshing global application (/) commands (4 commands)...');

    // グローバルコマンドとして一括登録
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );

    console.log('✅ Successfully reloaded application commands.');
  } catch (error) {
    console.error('❌ Failed to deploy commands:', error);
  }
})();
