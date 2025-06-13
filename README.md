# Global Chat

**Global Chat** は複数の Discord サーバー間で共通のテキストチャンネルを実現するボットとハブのセットです。自動翻訳機能を備え、言語の壁を越えた交流を支援します。

## ディレクトリ構成

- `bot` – Discord ボット本体。各サーバーに参加させて `/setup` を実行すると、必要なチャンネルを作成しハブへ登録します。
- `hub` – ボット間の通信を仲介する中継サーバー。参加サーバーのメッセージを受け取り、他のサーバーへ配信します。

## 使用方法

Node.js 18 以上がインストールされていることを確認してください。

1. それぞれのディレクトリで依存パッケージをインストールします。
   ```bash
   cd bot && npm install
   cd ../hub && npm install
   ```
2. 下記の環境変数を設定します（`.env` などを利用してください）。
3. ハブから起動します。
   ```bash
   node hub.js
   ```
4. つづいてボットを起動します。
   ```bash
   node index.js
   ```
5. ボットを招待したサーバーで `/setup` を実行すると、`global-chat` チャンネルが作成され会話を共有できるようになります。

開発者向けには `bot` ディレクトリで `npm install` を実行して devDependencies をインストールし、`npm test --prefix bot` で Jest スイートを実行できます。

## 必要な環境変数

### 共通
- `UPSTASH_REDIS_REST_URL` – Upstash Redis の REST URL
- `UPSTASH_REDIS_REST_TOKEN` – Upstash Redis のトークン

### Bot 用
- `DISCORD_TOKEN` – ボットのトークン
- `HUB_ENDPOINT` – ハブサーバーの URL
- `SUPPORT_SERVER_URL` – サポートサーバーへのリンク
- `NEWS_SOURCE` – フォローするアナウンスチャンネル ID
- `CLIENT_ID` – スラッシュコマンド登録用のアプリケーション ID
- `PORT` – (任意) ボット側の HTTP サーバー待ち受けポート

### Hub 用
- `BOT_ENDPOINT` – ボットの `/relay` エンドポイント URL
- `PORT` – (任意) ハブサーバーの待ち受けポート

## Gemini 翻訳の有効化

1. `/setup` 実行後、`settings` チャンネルでパスワード `ct1204` を送信します。
2. 有効化に成功すると Redis に `gemini:enabled:<guildId>` が保存されます。
3. 1 分あたり **15** 回、1 日あたり **1500** 回のレート制限があります。上限を超えた場合は自動的に Google 翻訳へフォールバックします。
4. 翻訳結果のフッターには Gemini 使用時 `[G]`、Google 翻訳使用時 `[D]` が表示されます。

## ライセンス

このリポジトリのコードは ISC License の下で提供されます。詳細は `LICENSE` ファイルを参照してください。
