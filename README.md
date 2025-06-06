# Global Chat

**Global Chat** は複数の Discord サーバー間で共通のテキストチャンネルを実現するボットとハブのセットです。自動翻訳機能を備え、言語の壁を越えた交流を支援します。

## ディレクトリ構成

- `bot` – Discord ボット本体。各サーバーに参加させて `/setup` を実行すると、必要なチャンネルを作成しハブへ登録します。
- `hub` – ボット間の通信を仲介する中継サーバー。参加サーバーのメッセージを受け取り、他のサーバーへ配信します。

## 使用方法

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

## ライセンス

このリポジトリのコードは ISC License の下で提供されます。詳細は `LICENSE` ファイルを参照してください。
