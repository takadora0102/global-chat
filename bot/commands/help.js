// commands/help.js
import {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder,
} from 'discord.js';
import { LANG_CHOICES } from '../constants.js';

export const HELP_TEXTS = {
  // 日本語
  'ja': `# Global Chat Bot ヘルプ

**Global Chat Bot** は、複数サーバーの同名チャンネルをつなぎ、言語の壁を越えてコミュニケーションを楽しむための Discord Bot です。以下のコマンドや機能で構成されています。

---

## 1. コマンドの説明

### \`/setup\`
- **概要**：サーバー管理者が最初に実行する初期設定コマンドです。
- **動作内容**：
  1. 「Global Chat」というカテゴリーを新規作成する。
  2. その下に以下のテキストチャンネルを自動で作成し、適切に配置する。  
     - \`bot-announcements\` … Bot から全サーバーへのお知らせ用  
     - \`global-chat\` … 他サーバーと連携するグローバルチャット用  
     - \`settings\` … 翻訳・タイムゾーンなど設定用  
  3. 作成した \`global-chat\` チャンネルを中央 HUB に登録し、他サーバーとメッセージをつなげるリクエストを自動送信する。
- **使用権限**：管理者（Administrator）のみ  
- **実行例**：  
  \`\`\`
  /setup
  \`\`\`

---

### \`/profile\`
- **概要**：コマンドを実行したユーザー自身の活動統計を表示します。  
- **表示内容**：  
  - **Messages Sent**：このサーバーで送信したメッセージの累計数  
  - **Likes Received**：他のユーザーから付与された👍リアクションの累計数  
- **使用権限**：サーバー内の全ユーザー  
- **実行例**：  
  \`\`\`
  /profile
  \`\`\`

---

### \`/ranking\`
- **概要**：サーバー内メンバーの上位ランキングを確認できます。  
- **サブコマンド**：  
  1. \`/ranking messages\` … **累計メッセージ数** が多い上位10名を表示  
  2. \`/ranking likes\` … **累計👍数** が多い上位10名を表示  
- **表示例**（埋め込みメッセージ）：  
  \`\`\`
  🏆 Top 10 by Messages  
  1. @Alice – 3,450  
  2. @Bob   – 2,982  
  …  
  \`\`\`
- **使用権限**：サーバー内の全ユーザー  
- **実行例**：  
  \`\`\`
  /ranking messages  
  /ranking likes  
  \`\`\`

---

## 2. グローバルチャット機能

### 2.1 他サーバー連携チャット
- **仕組み**：  
  - \`/setup\` によって作られた各サーバー内の \`global-chat\` チャンネルは、中央 HUB を介して互いにつながります。  
  - あるサーバーに投稿されたメッセージは、**リアルタイム**で他のすべての登録サーバーの同名チャンネルにも自動転送されます。  
- **投稿時の情報表示**：  
  - Bot が埋め込みメッセージを送信し、以下のメタ情報を付与します。  
    - **投稿者タグ**（例：\`@User#1234\`）  
    - **投稿サーバー名**  
    - **UTCオフセット**（例：\`UTC+9\` など）  
  - これによって、どのサーバーの誰が、どのタイムゾーンで発言したかが一目でわかります。

### 2.2 国旗リアクション翻訳
- **概要**：  
  - \`global-chat\` に投稿されたメッセージに対して、任意の国旗絵文字（🇯🇵🇺🇸🇪🇸 など）をリアクションすると、Bot が自動的にその国の言語へ翻訳したメッセージを返信します。  
  - 例：日本語訳がほしい場合、🇯🇵（国旗）をリアクション → Botが日本語訳を埋め込みで返信。  
- **翻訳対象**：以下 26 の主要言語に対応しています。  
  \`\`\`
  ja, en, en-GB, zh, zh-TW, ko, es, es-MX, fr, de,
  pt, pt-BR, ru, uk, el, he, ur, ms, es-CO, fa,
  bn, th, vi, hi, id, ar
  \`\`\`  
  - 各言語には対応する国旗絵文字を設定しているため、該当の絵文字をリアクションするだけで即時翻訳が実行されます。  
- **自動翻訳（Auto-Translate）**：  
  - \`settings\` チャンネル内で自動翻訳を **ON** にすると、\`global-chat\` に新規投稿されたすべてのメッセージが、ユーザーの設定言語に自動で翻訳されて表示されます。  
  - **OFF** にすると、自動翻訳は停止し原文のみが流れます。

---

## 3. おすすめの利用フロー

以下は、「はじめてGlobal Chat Botを導入して利用するまでの基本的なフロー例」です。

1. **管理者が \`/setup\` を実行**  
   - サーバー管理権限を持つユーザーが \`/setup\` を入力すると、  
     - 新たに「Global Chat」というカテゴリーと \`bot-announcements\`、\`global-chat\`、\`settings\` チャンネルが自動作成される。  
     - 自動で \`global-chat\` が中央 HUB に登録され、他サーバーとの接続が確立する。

2. **ユーザーは \`settings\` チャンネルで言語設定**
   - ボットから表示される UI で自分の **デフォルト言語** を設定する。
   - 必要に応じて自動翻訳を **ON**、または **OFF** に切り替える。  
   - これで、以後 \`global-chat\` に投稿されたメッセージは自動翻訳済みで自分の言語に届くようになる。

3. **グローバルチャットで会話を楽しむ**  
   - \`global-chat\` チャンネルにテキストを投稿すると、リアルタイムで他サーバーにも転送される。  
   - 他サーバーのメンバーの発言を読むとき、自動翻訳が有効ならそのまま自分の言語で理解できる。  
   - 「あえて原文を読みたい」「別の言語の翻訳が見たい」ときは、該当メッセージに **国旗リアクション** をつけると、その言語に即時翻訳して Bot が返答する。

4. **自分のアクティビティを確認**  
   - **\`/profile\`** を使って、自分がどれくらいメッセージを送り、どれだけ👍をもらったかをいつでも確認できる。  
   - **\`/ranking messages\`** でサーバー内の累計メッセージ数上位 10 名を確認し、コミュニティの盛り上がりを楽しもう。  
   - **\`/ranking likes\`** では累計👍数上位 10 名を確認でき、反応が多い人気ユーザーをチェックできる。
`,

  // English (US)
  'en': `# Global Chat Bot Help

**Global Chat Bot** is a Discord bot designed to connect identically named channels across multiple servers, breaking down language barriers and creating a shared chat experience. Below are the commands and features:

---

## 1. Commands

### \`/setup\`
- **Overview**: The initial setup command that a server administrator runs after inviting the bot.
- **What it does**:
  1. Creates a new category called “Global Chat.”
  2. Under that category, automatically creates the following text channels:
     - \`bot-announcements\` … For broadcasting announcements from the bot to all servers.
     - \`global-chat\` … For the cross-server global chat.
     - \`settings\` … For configuring translation and timezone preferences.
  3. Registers the created \`global-chat\` channel with the central HUB and automatically sends a request to link it to other servers.
- **Permissions Required**: Administrator only.
- **Example**:
  \`\`\`
  /setup
  \`\`\`

---

### \`/profile\`
- **Overview**: Shows statistics for the user who ran the command.
- **Displayed Info**:
  - **Messages Sent**: Total number of messages the user has sent in this server.
  - **Likes Received**: Total number of 👍 reactions the user has received.
- **Permissions Required**: Any user in the server.
- **Example**:
  \`\`\`
  /profile
  \`\`\`

---

### \`/ranking\`
- **Overview**: Displays server member leaderboards.
- **Subcommands**:
  1. \`/ranking messages\` … Shows top 10 by **total messages sent**.
  2. \`/ranking likes\` … Shows top 10 by **total 👍 received**.
- **Display Example** (embedded message):
  \`\`\`
  🏆 Top 10 by Messages
  1. @Alice – 3,450
  2. @Bob   – 2,982
  …
  \`\`\`
- **Permissions Required**: Any user in the server.
- **Examples**:
  \`\`\`
  /ranking messages
  /ranking likes
  \`\`\`

---

## 2. Global Chat Features

### 2.1 Cross-Server Chat
- **How It Works**:
  - The \`global-chat\` channel created by \`/setup\` in each server is linked through a central HUB.
  - Any message posted in one server’s \`global-chat\` is **instantly** forwarded to the same channel in all other registered servers.
- **Message Metadata**:
  - The bot posts as an embed, including:
    - **Author Tag** (e.g., \`@User#1234\`)
    - **Origin Server Name**
    - **UTC Offset** (e.g., \`UTC+9\`)
  - This clearly shows who, from which server and timezone, sent each message.

### 2.2 Flag-Reaction Translation
- **Overview**:
  - In \`global-chat\`, react to any message with a country flag emoji (🇯🇵🇺🇸🇪🇸, etc.) and the bot automatically replies with a translation into that country’s language.
  - Example: React with 🇯🇵 to get a Japanese translation of the message.
- **Supported Languages** (26 total):
  \`\`\`
  ja, en, en-GB, zh, zh-TW, ko, es, es-MX, fr, de,
  pt, pt-BR, ru, uk, el, he, ur, ms, es-CO, fa,
  bn, th, vi, hi, id, ar
  \`\`\`
  - Each language is mapped to a corresponding flag emoji, so reacting triggers an immediate translation.
- **Auto-Translate**:
  - In the \`settings\` channel, toggle **Auto-Translate ON** to have all new \`global-chat\` messages automatically translated into each user’s chosen language.
  - Toggle **OFF** to see only the original text.

---

## 3. Recommended Workflow

1. **Invite the Bot to Your Server**
   - Make the bot Public in Developer Portal, set up OAuth2 scopes/permissions, and use the generated invite link.
   - (Alternatively, use the “Add to Server” button in the bot’s profile if available.)

2. **Admin Runs \`/setup\`**
   - A user with Administrator privilege runs \`/setup\` to:
     - Create a “Global Chat” category and add \`bot-announcements\`, \`global-chat\`, and \`settings\` channels.
     - Automatically register \`global-chat\` with the central HUB for cross-server linking.

3. **Users Configure Language in \`settings\`**
   - In \`settings\`, each user sets their **default language**.
   - Turn Auto-Translate ON or OFF as desired.
   - From then on, messages in \`global-chat\` are automatically translated into each user’s language if Auto-Translate is ON.

4. **Enjoy Cross-Server Chat**
   - Post in \`global-chat\` to have your message broadcast instantly to all linked servers.
   - With Auto-Translate enabled, you’ll see others’ messages in your chosen language right away.
   - To view a message in a different language (or original), react with the corresponding flag emoji and get an immediate translation.

5. **Check Your Activity**
   - Use **\`/profile\`** to see how many messages you’ve sent and how many 👍 you’ve received.
   - Use **\`/ranking messages\`** to see the top 10 message senders in the server.
   - Use **\`/ranking likes\`** to see the top 10 users by 👍 received.

6. **(Optional) \`bot-announcements\` for Important Notices**
   - Admins can post in \`bot-announcements\` to broadcast announcements to all servers the bot is in.
   - This channel is typically used by the bot owner for important updates.`,
  
  // 简体中文
  'zh': `# Global Chat Bot 帮助

**Global Chat Bot** 是一款 Discord 机器人，用于将多个服务器中同名频道连接起来，突破语言障碍，实现跨服实时聊天。以下是它的命令和功能：

---

## 1. 命令说明

### \`/setup\`
- **概述**：服务器管理员在邀请机器人后运行的初始设置命令。  
- **功能**：  
  1. 创建一个名为 “Global Chat” 的新分类。  
  2. 在该分类下自动创建以下文本频道：  
     - \`bot-announcements\` … 用于机器人向所有服务器广播公告。  
     - \`global-chat\` … 用于跨服务器的全局聊天。  
     - \`settings\` … 用于配置翻译和时区偏好。  
  3. 将创建的 \`global-chat\` 频道注册到中央 HUB，并自动发送请求以连接其他服务器。  
- **所需权限**：仅限管理员（Administrator）。  
- **示例**：  
  \`\`\`
  /setup
  \`\`\`

---

### \`/profile\`
- **概述**：显示执行该命令的用户的统计信息。  
- **显示内容**：  
  - **Messages Sent**：用户在此服务器中发送的消息总数。  
  - **Likes Received**：用户收到的 👍 反应总数。  
- **所需权限**：服务器中的任何用户。  
- **示例**：  
  \`\`\`
  /profile
  \`\`\`

---

### \`/ranking\`
- **概述**：显示服务器成员排行榜。  
- **子命令**：  
  1. \`/ranking messages\` … 按 **累计发送消息数** 排名前 10 名。  
  2. \`/ranking likes\` … 按 **累计 👍 数** 排名前 10 名。  
- **显示示例**（嵌入消息）：  
  \`\`\`
  🏆 Top 10 by Messages  
  1. @Alice – 3,450  
  2. @Bob   – 2,982  
  …  
  \`\`\`  
- **所需权限**：服务器中的任何用户。  
- **示例**：  
  \`\`\`
  /ranking messages  
  /ranking likes  
  \`\`\`

---

## 2. 全局聊天功能

### 2.1 跨服务器聊天
- **工作原理**：  
  - 每个服务器运行 \`/setup\` 后，会在该服务器中创建一个 \`global-chat\` 频道，并通过中央 HUB 互相连接。  
  - 在其中一个服务器的 \`global-chat\` 中发布的消息，会**即时**转发到所有其他已注册服务器的同名频道。  
- **消息元信息**：  
  - 机器人会以嵌入消息形式发送，并包含：  
    - **作者标签**（例如：\`@User#1234\`）  
    - **来源服务器名称**  
    - **UTC 偏移**（例如：\`UTC+9\`）  
  - 这样可以一目了然地了解每条消息由哪个服务器的哪位用户在何时区发送。

### 2.2 国旗反应翻译
- **概览**：  
  - 在 \`global-chat\` 中，对任意消息添加国旗表情（🇯🇵🇺🇸🇪🇸 等）作为反应，机器人会自动以对应国家的语言回复翻译后的消息。  
  - 例如：对需要日文翻译的消息添加 🇯🇵，机器人将以日文嵌入形式回复翻译结果。  
- **支持语言**（共 26 种）：  
  \`\`\`
  ja, en, en-GB, zh, zh-TW, ko, es, es-MX, fr, de,
  pt, pt-BR, ru, uk, el, he, ur, ms, es-CO, fa,
  bn, th, vi, hi, id, ar
  \`\`\`  
  - 每种语言对应一个国旗表情，添加该表情即可即时触发翻译。  
- **自动翻译（Auto-Translate）**：  
  - 在 \`settings\` 频道中将**自动翻译打开**后，所有新发布到 \`global-chat\` 的消息都会自动翻译成每位用户设置的语言。  
  - 关闭时，仅显示原文。

---

## 3. 推荐使用流程

1. **邀请机器人到服务器**  
   - 在 Developer Portal 将机器人设为公开（Public Bot），设置 OAuth2 范围和权限后，通过生成的邀请链接添加到服务器。  
   - （或者，如果在机器人资料页中可见“添加到服务器”按钮，也可以直接点击该按钮。）

2. **管理员运行 \`/setup\`**  
   - 拥有管理员权限的用户运行 \`/setup\`：  
     - 创建“Global Chat”分类，并添加 \`bot-announcements\`、\`global-chat\`、\`settings\` 三个频道。  
     - 自动注册 \`global-chat\` 到中央 HUB，以建立跨服务器连接。

3. **用户在 \`settings\` 频道设置语言**  
   - 在 \`settings\` 频道中，用户设置自己的**默认语言**。  
   - 按需打开或关闭自动翻译。  
   - 此后，如果自动翻译开启，\`global-chat\` 中发布的消息会自动翻译成用户设置的语言。

4. **享受跨服务器聊天**  
   - 在 \`global-chat\` 频道输入消息，消息将即时广播到所有连接的服务器。  
   - Auto-Translate 开启时，可即时以自己选择的语言阅读他人消息。  
   - 若想查看原文或其他语言翻译，对消息添加对应国旗表情，机器人会返还翻译内容。

5. **查看活跃度**  
   - 使用 **\`/profile\`** 查看自己发送的消息数量及收到的 👍 次数。  
   - 使用 **\`/ranking messages\`** 查看服务器中发送消息最多的前 10 名。  
   - 使用 **\`/ranking likes\`** 查看收到 👍 最多的前 10 名。

6. **（可选）\`bot-announcements\` 发送重要通告**  
   - 管理员可在 \`bot-announcements\` 频道发布公告，广播至机器人所在的所有服务器。  
   - 通常由Bot拥有者用于发布重要更新。`,

  // 繁體中文
  'zh-TW': `# Global Chat Bot 說明

**Global Chat Bot** 是一款 Discord 機器人，用於將多個伺服器中同名的頻道連接起來，突破語言隔閡，實現跨服即時聊天。以下是它的指令和功能：

---

## 1. 指令說明

### \`/setup\`
- **概覽**：伺服器管理員在邀請機器人後執行的初始設定指令。  
- **功能**：  
  1. 建立一個名為「Global Chat」的新分類。  
  2. 在該分類下自動建立以下文本頻道：  
     - \`bot-announcements\` … 用於從機器人向所有伺服器廣播公告。  
     - \`global-chat\` … 用於跨伺服器的全域聊天。  
     - \`settings\` … 用於配置翻譯和時區偏好。  
  3. 將建立的 \`global-chat\` 頻道註冊到中央 HUB，並自動發送請求以連接其他伺服器。  
- **所需權限**：僅限管理員（Administrator）。  
- **範例**：  
  \`\`\`
  /setup
  \`\`\`

---

### \`/profile\`
- **概覽**：顯示執行此指令的使用者的統計資訊。  
- **顯示內容**：  
  - **Messages Sent**：使用者在此伺服器中發送的訊息總數。  
  - **Likes Received**：使用者收到的 👍 反應總數。  
- **所需權限**：伺服器中的任何使用者。  
- **範例**：  
  \`\`\`
  /profile
  \`\`\`

---

### \`/ranking\`
- **概覽**：顯示伺服器成員的排行榜。  
- **子指令**：  
  1. \`/ranking messages\` … 按 **累計發送訊息數** 排名前 10 名。  
  2. \`/ranking likes\` … 按 **累計 👍 數** 排名前 10 名。  
- **顯示範例**（嵌入訊息）：  
  \`\`\`
  🏆 Top 10 by Messages  
  1. @Alice – 3,450  
  2. @Bob   – 2,982  
  …  
  \`\`\`  
- **所需權限**：伺服器中的任何使用者。  
- **範例**：  
  \`\`\`
  /ranking messages  
  /ranking likes  
  \`\`\`

---

## 2. 全域聊天功能

### 2.1 跨伺服器聊天
- **運作方式**：  
  - 每個伺服器執行 \`/setup\` 後，會在該伺服器中建立 \`global-chat\` 頻道，並透過中央 HUB 相互連接。  
  - 任意一個伺服器的 \`global-chat\` 中發布的訊息，會**立即**轉發到所有其他已註冊伺服器的同名頻道。  
- **訊息元資訊**：  
  - 機器人會以嵌入訊息形式發送，並包含：  
    - **作者標籤**（例如：\`@User#1234\`）  
    - **來源伺服器名稱**  
    - **UTC 偏移**（例如：\`UTC+9\`）  
  - 這可讓大家一目了然地知道每條訊息是由哪個伺服器的哪位使用者，以及其時區。

### 2.2 國旗反應翻譯
- **概覽**：  
  - 在 \`global-chat\` 中，對任意訊息添加國旗表情（🇯🇵🇺🇸🇪🇸 等）作為反應，機器人會自動以對應國家的語言回覆翻譯後的訊息。  
  - 例如：對需要日文翻譯的訊息添加 🇯🇵，機器人將以日文嵌入形式回覆翻譯結果。  
- **支援語言**（共 26 種）：  
  \`\`\`
  ja, en, en-GB, zh, zh-TW, ko, es, es-MX, fr, de,
  pt, pt-BR, ru, uk, el, he, ur, ms, es-CO, fa,
  bn, th, vi, hi, id, ar
  \`\`\`  
  - 每種語言對應一個國旗表情，添加該表情即可立即觸發翻譯。  
- **自動翻譯（Auto-Translate）**：  
  - 在 \`settings\` 頻道中將**自動翻譯打開**後，所有新發布到 \`global-chat\` 的訊息都會自動翻譯成每位使用者設定的語言。  
  - 關閉後，僅顯示原文。

---

## 3. 推薦使用流程

1. **邀請機器人到伺服器**  
   - 在 Developer Portal 將機器人設為公開（Public Bot），設定 OAuth2 範圍和權限後，通過生成的邀請連結添加到伺服器。  
   - （或者，如果在機器人資料頁中可見“添加到伺服器”按鈕，也可以直接點擊該按鈕。）

2. **管理員執行 \`/setup\`**  
   - 擁有管理員權限的使用者執行 \`/setup\`：  
     - 建立 “Global Chat” 分類，並新增 \`bot-announcements\`、\`global-chat\`、\`settings\` 三個頻道。  
     - 自動註冊 \`global-chat\` 到中央 HUB，以建立跨伺服器連接。

3. **使用者在 \`settings\` 頻道設定語言**  
   - 在 \`settings\` 頻道中，使用者設定自己的**預設語言**。  
   - 按需開啟/關閉自動翻譯。  
   - 此後，如果開啟自動翻譯，\`global-chat\` 中發布的訊息會自動翻譯成使用者設定的語言。

4. **享受跨伺服器聊天**  
   - 在 \`global-chat\` 頻道發送訊息，該訊息會立即廣播到所有連接的伺服器。  
   - 如果開啟了自動翻譯，即可立即以自己選擇的語言閱讀他人訊息。  
   - 想查看原文或其他語言翻譯時，對該訊息添加相應的國旗表情，機器人會立即回覆翻譯內容。

5. **查看你的活躍度**  
   - 使用 **\`/profile\`** 檢查你發送的訊息數量和收到的 👍 次數。  
   - 使用 **\`/ranking messages\`** 查看當前伺服器中訊息發送數最多的前 10 名。  
   - 使用 **\`/ranking likes\`** 查看當前伺服器中 👍 數最多的前 10 名。

6. **（選擇）\`bot-announcements\` 頻道發布重要通知**  
   - 管理員可以在 \`bot-announcements\` 頻道發布公告，以向機器人所在的所有伺服器廣播資訊。  
   - 該頻道通常由機器人擁有者用於發布重要更新。`,

  // 한국어
  'ko': `# Global Chat Bot 도움말

**Global Chat Bot** 은 여러 서버에서 동일한 이름의 채널을 연결하여 언어 장벽을 허물고, 함께 채팅을 즐길 수 있도록 도와주는 Discord 봇입니다. 아래에 명령어와 기능을 설명합니다.

---

## 1. 명령어 설명

### \`/setup\`
- **개요**: 봇을 서버에 초대한 후, 서버 관리자가 처음 실행하는 초기 설정 명령어입니다.  
- **기능**:
  1. “Global Chat”이라는 새 카테고리를 생성합니다.  
  2. 해당 카테고리 아래에 자동으로 다음 텍스트 채널을 생성하고 배치합니다:
     - \`bot-announcements\` … 봇에서 모든 서버로 공지를 보내는 용도  
     - \`global-chat\` … 서버 간 연결된 글로벌 채팅용  
     - \`settings\` … 번역 및 시간대 설정용  
  3. 생성된 \`global-chat\` 채널을 중앙 허브(HUB)에 등록하고, 자동으로 다른 서버와 메시지를 연결하는 요청을 보냅니다.  
- **필요 권한**: 관리자(Administrator)만 가능  
- **예시**:
  \`\`\`
  /setup
  \`\`\`

---

### \`/profile\`
- **개요**: 명령어를 실행한 사용자의 활동 통계를 보여줍니다.  
- **표시 정보**:
  - **Messages Sent**: 해당 서버에서 사용자가 보낸 총 메시지 수  
  - **Likes Received**: 다른 사용자가 남긴 👍 리액션의 총 횟수  
- **필요 권한**: 서버 내 모든 사용자  
- **예시**:
  \`\`\`
  /profile
  \`\`\`

---

### \`/ranking\`
- **개요**: 서버 내 멤버의 랭킹을 확인할 수 있는 명령어입니다.  
- **서브명령어**:
  1. \`/ranking messages\` … **총 메시지 수** 기준 상위 10명 표시  
  2. \`/ranking likes\` … **총 👍 수** 기준 상위 10명 표시  
- **표시 예시**(임베드 메시지):
  \`\`\`
  🏆 Top 10 by Messages  
  1. @Alice – 3,450  
  2. @Bob   – 2,982  
  …  
  \`\`\`
- **필요 권한**: 서버 내 모든 사용자  
- **예시**:
  \`\`\`
  /ranking messages  
  /ranking likes  
  \`\`\`

---

## 2. 글로벌 채팅 기능

### 2.1 서버 간 채팅 연결
- **작동 방식**:
  - 각 서버에서 \`/setup\` 실행 시, 해당 서버에 \`global-chat\` 채널이 생성됩니다. 이 채널들은 중앙 허브(HUB)를 통해 서로 연결됩니다.  
  - 어떤 서버의 \`global-chat\`에 메시지를 작성하면, **즉시** 다른 모든 연결된 서버의 동일한 채널로 자동 전송됩니다.  
- **메시지 메타 정보**:
  - 봇이 임베드 메시지를 보내며 다음 정보를 포함합니다:
    - **작성자 태그**(예: \`@User#1234\`)  
    - **작성 서버 이름**  
    - **UTC 오프셋**(예: \`UTC+9\`)  
  - 이를 통해 누가 어느 서버, 어느 시간대에서 작성했는지 한눈에 파악할 수 있습니다.

### 2.2 국기 리액션 번역
- **개요**:
  - \`global-chat\`에서 모든 사용자는 메시지에 국기 이모지(🇯🇵🇺🇸🇪🇸 등)로 리액션할 수 있습니다.  
  - 특정 국기 리액션을 추가하면 봇이 해당 국가 언어로 **즉시 번역**된 메시지를 답장으로 보내줍니다.  
  - 예시: 일본어 번역이 필요할 때 🇯🇵 리액션 → 봇이 일본어 번역 결과를 임베드로 답장.  
- **지원 언어**(총 26개):
  \`\`\`
  ja, en, en-GB, zh, zh-TW, ko, es, es-MX, fr, de,
  pt, pt-BR, ru, uk, el, he, ur, ms, es-CO, fa,
  bn, th, vi, hi, id, ar
  \`\`\`
  - 각 언어마다 대응하는 국기 이모지가 매핑되어 있어, 해당 이모지를 리액션하면 즉시 번역이 실행됩니다.  
- **자동 번역 (Auto-Translate)**:
  - \`settings\` 채널에서 **Auto-Translate ON**으로 설정하면, 새로 작성된 모든 \`global-chat\` 메시지가 사용자 설정 언어로 자동 번역되어 표시됩니다。  
  - **OFF**로 하면 원문만 표시됩니다。  

---

## 3. 추천 사용 흐름

1. **봇을 서버에 초대하기**  
   - Developer Portal에서 봇을 Public으로 설정하고, OAuth2 스코프/권한을 구성한 뒤, 생성된 초대 링크를 사용해 서버에 추가합니다。  
   - (이후 봇 프로필에서 “서버에 추가” 버튼이 보이면, 해당 버튼을 클릭해도 됩니다。)

2. **관리자가 \`/setup\` 실행**  
   - 관리자 권한이 있는 사용자가 \`/setup\`을 입력하면:
     - “Global Chat” 카테고리와 \`bot-announcements\`、\`global-chat\`、\`settings\` 채널이 자동으로 생성됩니다。  
     - 생성된 \`global-chat\` 채널이 중앙 허브에 등록되어，다른 서버와 연결이 완료됩니다。

3. **사용자가 \`settings\` 채널에서 언어 설정**  
   - \`settings\` 채널에서 **기본 언어**를 설정합니다。  
   - Auto-Translate를 **ON** 또는 **OFF**로 전환합니다。  
   - 이후 \`global-chat\`에 작성된 메시지는 Auto-Translate가 켜져 있으면 자동으로 설정 언어로 번역되어 표시됩니다。

4. **글로벌 채팅 즐기기**  
   - \`global-chat\` 채널에 메시지를 입력하면, 메시지가 즉시 다른 모든 연결된 서버에 전파됩니다。  
   - Auto-Translate가 켜져 있으면, 다른 서버 멤버의 메시지를 선택한 언어로 바로 읽을 수 있습니다。  
   - 원문이나 다른 언어 번역이 필요할 때는 메시지에 해당 국기 이모지로 리액션하면, 봇이 즉시 번역본을 답장합니다。

5. **내 활동 확인하기**  
   - **\`/profile\`** 명령으로 내가 보낸 메시지 수와 받은 👍 수를 확인합니다。  
   - **\`/ranking messages\`** 명령으로 메시지를 가장 많이 보낸 상위 10명을 확인합니다。  
   - **\`/ranking likes\`** 명령으로 👍를 가장 많이 받은 상위 10명을 확인합니다。

6. **（선택）\`bot-announcements\` 채널로 중요 공지 보내기**  
   - 관리자는 \`bot-announcements\` 채널에 공지를 올려, 봇이 활성화된 모든 서버에 걸쳐 정보를 브로드캐스트할 수 있습니다。  
   - 이 채널은 주로 봇 소유자가 중요한 업데이트를 알릴 때 사용합니다。`,

  // Español (ES)
  'es': `# Ayuda de Global Chat Bot

**Global Chat Bot** es un bot de Discord diseñado para conectar canales con el mismo nombre en varios servidores, eliminando barreras de idioma y creando una experiencia de chat compartida. A continuación se describen los comandos y funcionalidades:

---

## 1. Comandos

### \`/setup\`
- **Descripción**: Comando de configuración inicial que ejecuta un administrador del servidor después de invitar al bot.  
- **Qué hace**:  
  1. Crea una nueva categoría llamada “Global Chat”.  
  2. En esa categoría, crea automáticamente los siguientes canales de texto:  
     - \`bot-announcements\` … Para transmitir anuncios del bot a todos los servidores.  
     - \`global-chat\` … Para el chat global entre servidores.  
     - \`settings\` … Para configurar preferencias de traducción y zona horaria.  
  3. Registra el canal \`global-chat\` en el HUB central y envía automáticamente una solicitud para vincularlo a otros servidores.  
- **Permisos requeridos**: Solo Administrador.  
- **Ejemplo**:  
  \`\`\`
  /setup
  \`\`\`

---

### \`/profile\`
- **Descripción**: Muestra estadísticas del usuario que ejecutó el comando.  
- **Información mostrada**:  
  - **Messages Sent**: Número total de mensajes que el usuario ha enviado en este servidor.  
  - **Likes Received**: Número total de reacciones 👍 que el usuario ha recibido.  
- **Permisos requeridos**: Cualquier usuario en el servidor.  
- **Ejemplo**:  
  \`\`\`
  /profile
  \`\`\`

---

### \`/ranking\`
- **Descripción**: Muestra las tablas de clasificación de miembros del servidor.  
- **Subcomandos**:  
  1. \`/ranking messages\` … Muestra los 10 mejores por **número total de mensajes enviados**.  
  2. \`/ranking likes\` … Muestra los 10 mejores por **número total de reacciones 👍 recibidas**.  
- **Ejemplo de visualización** (mensaje embebido):  
  \`\`\`
  🏆 Top 10 by Messages  
  1. @Alice – 3,450  
  2. @Bob   – 2,982  
  …  
  \`\`\`  
- **Permisos requeridos**: Cualquier usuario en el servidor.  
- **Ejemplos**:  
  \`\`\`
  /ranking messages  
  /ranking likes  
  \`\`\`

---

## 2. Funcionalidades del Global Chat

### 2.1 Chat entre Servidores
- **Cómo funciona**:  
  - El canal \`global-chat\` creado por \`/setup\` en cada servidor se vincula a través de un HUB central.  
  - Cualquier mensaje publicado en \`global-chat\` de un servidor se reenvía **instantáneamente** al mismo canal en todos los demás servidores registrados.  
- **Metadatos del mensaje**:  
  - El bot envía un embed que incluye:  
    - **Etiqueta del autor** (por ejemplo, \`@User#1234\`)  
    - **Nombre del servidor de origen**  
    - **Desfase UTC** (por ejemplo, \`UTC+9\`)  
  - Esto muestra claramente quién, de qué servidor y en qué zona horaria, envió cada mensaje.

### 2.2 Traducción por Reacción de Bandera
- **Descripción**:  
  - En \`global-chat\`, reacciona a cualquier mensaje con un emoji de bandera (🇯🇵🇺🇸🇪🇸, etc.) y el bot responde automáticamente con una traducción al idioma correspondiente.  
  - Ejemplo: Reacciona con 🇯🇵 para obtener una traducción al japonés del mensaje.  
- **Idiomas compatibles** (26 en total):  
  \`\`\`
  ja, en, en-GB, zh, zh-TW, ko, es, es-MX, fr, de,
  pt, pt-BR, ru, uk, el, he, ur, ms, es-CO, fa,
  bn, th, vi, hi, id, ar
  \`\`\`  
  - Cada idioma está mapeado a un emoji de bandera correspondiente, por lo que reaccionar lo desencadena inmediatamente.  
- **Auto-Translate**:  
  - En el canal \`settings\`, activa **Auto-Translate ON** para que todos los nuevos mensajes de \`global-chat\` se traduzcan automáticamente al idioma elegido por cada usuario.  
  - Desactiva **OFF** para ver solo el texto original.

---

## 3. Flujo recomendado

1. **Invitar el Bot a tu Servidor**  
   - Haz que el bot sea público en el Developer Portal, configura los scopes/permisos OAuth2 y utiliza el enlace de invitación generado.  
   - (Alternativamente, haz clic en el botón “Agregar al servidor” en el perfil del bot si está disponible.)

2. **El Administrador Ejecuta \`/setup\`**  
   - Un usuario con privilegios de Administrador ejecuta \`/setup\` para:  
     - Crear la categoría “Global Chat” y agregar los canales \`bot-announcements\`, \`global-chat\` y \`settings\`.  
     - Registrar automáticamente \`global-chat\` en el HUB central para vinculación entre servidores.

3. **Los Usuarios Configuran Idioma en \`settings\`**  
   - En \`settings\`, cada usuario establece su **idioma predeterminado**.  
   - Activa o desactiva Auto-Translate según desees.  
   - A partir de ese momento, los mensajes en \`global-chat\` se traducirán automáticamente al idioma elegido si Auto-Translate está activado.

4. **Disfruta del Chat entre Servidores**  
   - Publica en \`global-chat\` y tu mensaje se transmitirá instantáneamente a todos los servidores vinculados.  
   - Con Auto-Translate habilitado, verás los mensajes de otros en tu idioma elegido inmediatamente.  
   - Para ver un mensaje en otro idioma (o en el original), reacciona con el emoji de bandera correspondiente y obtén la traducción al instante.

5. **Consulta tu Actividad**  
   - Usa **\`/profile\`** para ver cuántos mensajes has enviado y cuántas 👍 has recibido.  
   - Usa **\`/ranking messages\`** para ver los 10 usuarios que más mensajes han enviado.  
   - Usa **\`/ranking likes\`** para ver los 10 usuarios con más 👍 recibidos.

6. **Anuncios (Opcional)**  
   - Los administradores pueden publicar en \`bot-announcements\` para difundir anuncios a todos los servidores donde esté el bot.  
   - Este canal suele ser utilizado por el dueño del bot para actualizaciones importantes.`,
  
  // Español (MX)
  'es-MX': `# Ayuda de Global Chat Bot

**Global Chat Bot** es un bot de Discord que conecta canales con el mismo nombre en diversos servidores, eliminando barreras lingüísticas y creando una experiencia de chat compartido. A continuación se describen comandos y funcionalidades:

---

## 1. Comandos

### \`/setup\`
- **Descripción**: Comando de configuración inicial que ejecuta un administrador del servidor tras invitar al bot.  
- **Qué hace**:  
  1. Crea una categoría llamada “Global Chat”.  
  2. Dentro de esa categoría, crea automáticamente los siguientes canales de texto:  
     - \`bot-announcements\` … Para enviar anuncios del bot a todos los servidores.  
     - \`global-chat\` … Para el chat global entre servidores.  
     - \`settings\` … Para configurar opciones de traducción y zona horaria.  
  3. Registra el canal \`global-chat\` en el HUB central y envía una solicitud automática para vincularlo a otros servidores.  
- **Permisos requeridos**: Solo Administrador.  
- **Ejemplo**:  
  \`\`\`
  /setup
  \`\`\`

---

### \`/profile\`
- **Descripción**: Muestra estadísticas del usuario que ejecutó el comando.  
- **Información mostrada**:  
  - **Messages Sent**: Número total de mensajes que el usuario ha enviado en este servidor.  
  - **Likes Received**: Número total de reacciones 👍 que el usuario ha recibido.  
- **Permisos requeridos**: Cualquier usuario en el servidor.  
- **Ejemplo**:  
  \`\`\`
  /profile
  \`\`\`

---

### \`/ranking\`
- **Descripción**: Muestra tablas de clasificación de miembros del servidor.  
- **Subcomandos**:  
  1. \`/ranking messages\` … Muestra top 10 por **total de mensajes enviados**.  
  2. \`/ranking likes\` … Muestra top 10 por **total de reacciones 👍 recibidas**.  
- **Ejemplo de visualización** (mensaje embebido):  
  \`\`\`
  🏆 Top 10 by Messages  
  1. @Alice – 3,450  
  2. @Bob   – 2,982  
  …  
  \`\`\`  
- **Permisos requeridos**: Cualquier usuario en el servidor.  
- **Ejemplos**:  
  \`\`\`
  /ranking messages  
  /ranking likes  
  \`\`\`

---

## 2. Funcionalidades del Global Chat

### 2.1 Chat entre Servidores
- **Cómo funciona**:  
  - El canal \`global-chat\` creado por \`/setup\` en cada servidor se vincula mediante un HUB central.  
  - Cualquier mensaje publicado en \`global-chat\` de un servidor se reenvía **al instante** al mismo canal en todos los demás servidores registrados.  
- **Metadatos del mensaje**:  
  - El bot envía un embed que incluye:  
    - **Etiqueta del autor** (por ejemplo, \`@User#1234\`)  
    - **Nombre del servidor de origen**  
    - **Desfase UTC** (por ejemplo, \`UTC+9\`)  
  - Esto muestra claramente quién, de qué servidor y en qué zona horaria, envió cada mensaje.

### 2.2 Traducción por Reacción de Bandera
- **Descripción**:  
  - En \`global-chat\`, reacciona a cualquier mensaje con un emoji de bandera (🇯🇵🇺🇸🇪🇸, etc.) y el bot responderá automáticamente con la traducción al idioma correspondiente.  
  - Ejemplo: Reacciona con 🇯🇵 para obtener la traducción al japonés del mensaje.  
- **Idiomas compatibles** (26 en total):  
  \`\`\`
  ja, en, en-GB, zh, zh-TW, ko, es, es-MX, fr, de,
  pt, pt-BR, ru, uk, el, he, ur, ms, es-CO, fa,
  bn, th, vi, hi, id, ar
  \`\`\`  
  - Cada idioma está mapeado a un emoji de bandera respectivo, por lo que reaccionar lo activa al instante.  
- **Auto-Translate**:  
  - En el canal \`settings\`, activa **Auto-Translate ON** para que todos los nuevos mensajes de \`global-chat\` se traduzcan automáticamente al idioma elegido por cada usuario.  
  - Desactiva **OFF** para ver solo el texto original.

---

## 3. Flujo recomendado

1. **Invitar al Bot a Tu Servidor**  
   - Haz que el bot sea público en el Developer Portal, configura OAuth2 scopes/permissions y usa el enlace de invitación generado.  
   - (Alternativamente, usa el botón “Agregar al servidor” en el perfil del bot si está disponible.)

2. **El Administrador Ejecuta \`/setup\`**  
   - Un usuario con privilegios de Administrador ejecuta \`/setup\` para:  
     - Crear la categoría “Global Chat” y agregar los canales \`bot-announcements\`, \`global-chat\` y \`settings\`.  
     - Registrar automáticamente \`global-chat\` en el HUB central para vinculación entre servidores.

3. **Los Usuarios Configuran Idioma en \`settings\`**  
   - En \`settings\`, cada usuario establece su **idioma predeterminado**.  
   - Activa o desactiva Auto-Translate según lo desees.  
   - A partir de ese momento, los mensajes en \`global-chat\` se traducirán automáticamente al idioma elegido si Auto-Translate está activado.

4. **Disfruta del Chat entre Servidores**  
   - Publica en \`global-chat\` y tu mensaje se transmitirá instantáneamente a todos los servidores vinculados.  
   - Con Auto-Translate habilitado, verás los mensajes de otros en tu idioma elegido de inmediato.  
   - Para ver un mensaje en otro idioma (o en el original), reacciona con el emoji de bandera correspondiente y obtén la traducción al instante.

5. **Consulta tu Actividad**  
   - Usa **\`/profile\`** para ver cuántos mensajes has enviado y cuántas 👍 has recibido.  
   - Usa **\`/ranking messages\`** para ver los 10 usuarios que más mensajes han enviado.  
   - Usa **\`/ranking likes\`** para ver los 10 usuarios con más 👍 recibidos.

6. **Anuncios (Opcional)**  
   - Los administradores pueden publicar en \`bot-announcements\` para difundir anuncios a todos los servidores donde esté el bot.  
   - Este canal suele ser utilizado por el dueño del bot para actualizaciones importantes.`,  

  // Französisch
  'fr': `# Aide de Global Chat Bot

**Global Chat Bot** est un bot Discord conçu pour connecter des salons portant le même nom sur plusieurs serveurs, franchissant les barrières linguistiques et créant une expérience de chat partagée. Ci-dessous, vous trouverez les commandes et fonctionnalités :

---

## 1. Commandes

### \`/setup\`
- **Vue d’ensemble** : La commande de configuration initiale qu’un administrateur de serveur exécute après avoir invité le bot.  
- **Fonction :**
  1. Crée une nouvelle catégorie nommée “Global Chat”.  
  2. Sous cette catégorie, crée automatiquement les salons texte suivants :  
     - \`bot-announcements\` … Pour diffuser des annonces du bot à tous les serveurs.  
     - \`global-chat\` … Pour le chat global inter‐serveurs.  
     - \`settings\` … Pour configurer les préférences de traduction et de fuseau horaire.  
  3. Enregistre le salon \`global-chat\` créé dans le HUB central et envoie automatiquement une demande pour le lier à d’autres serveurs.  
- **Permissions requises** : Administrateur uniquement.  
- **Exemple** :  
  \`\`\`
  /setup
  \`\`\`

---

### \`/profile\`
- **Vue d’ensemble** : Affiche les statistiques de l’utilisateur ayant exécuté la commande.  
- **Informations affichées ** :  
  - **Messages envoyés ** : Nombre total de messages envoyés par l’utilisateur sur ce serveur.  
  - **Réactions 👍 reçues ** : Nombre total de réactions 👍 reçues par l’utilisateur.  
- **Permissions requises ** : Tout utilisateur du serveur.  
- **Exemple ** :  
  \`\`\`
  /profile
  \`\`\`

---

### \`/ranking\`
- **Vue d’ensemble** : Affiche les classements des membres du serveur.  
- **Sous‐commandes ** :  
  1. \`/ranking messages\` … Affiche le top 10 par **nombre total de messages envoyés**.  
  2. \`/ranking likes\` … Affiche le top 10 par **nombre total de 👍 reçues**.  
- **Exemple d’affichage** (message intégré) :  
  \`\`\`
  🏆 Top 10 by Messages  
  1. @Alice – 3 450  
  2. @Bob  – 2 982  
  …  
  \`\`\`  
- **Permissions requises ** : Tout utilisateur du serveur.  
- **Exemples ** :  
  \`\`\`
  /ranking messages  
  /ranking likes  
  \`\`\`

---

## 2. Fonctionnalités du Global Chat

### 2.1 Chat inter‐serveurs
- **Comment ça marche ** :  
  - Le salon \`global-chat\` créé par \`/setup\` dans chaque serveur est relié via un HUB central.  
  - Tout message publié dans le \`global-chat\` d’un serveur est transmis **instantanément** au même salon dans tous les autres serveurs enregistrés.  
- **Métadonnées du message ** :  
  - Le bot publie un embed incluant :  
    - **Tag de l’auteur** (par exemple : \`@User#1234\`)  
    - **Nom du serveur d’origine**  
    - **Décalage UTC** (par exemple : \`UTC+9\`)  
  - Cela montre clairement qui, de quel serveur et quel fuseau horaire, a envoyé chaque message.

### 2.2 Traduction par réaction de drapeau
- **Vue d’ensemble** :  
  - Dans \`global-chat\`, réagissez à n’importe quel message avec un emoji de drapeau (🇯🇵🇺🇸🇪🇸, etc.) et le bot répond automatiquement avec une traduction dans la langue correspondante.  
  - Exemple : Réagissez avec 🇯🇵 pour obtenir une traduction en japonais du message.  
- **Langues prises en charge** (26 au total) :  
  \`\`\`
  ja, en, en-GB, zh, zh-TW, ko, es, es-MX, fr, de,
  pt, pt-BR, ru, uk, el, he, ur, ms, es-CO, fa,
  bn, th, vi, hi, id, ar
  \`\`\`  
  - Chaque langue est mappée à un emoji de drapeau correspondant, donc en réagissant vous déclenchez la traduction instantanément.  
- **Auto-Translate ** :  
  - Dans le salon \`settings\`, activez **Auto-Translate ON** pour que tous les nouveaux messages de \`global-chat\` soient automatiquement traduits dans la langue choisie par chaque utilisateur.  
  - Désactivez **OFF** pour voir uniquement le texte d’origine.

---

## 3. Flux recommandé

1. **Inviter le Bot sur votre serveur**  
   - Rendez le bot public dans le Developer Portal, configurez les scopes/permissions OAuth2 et utilisez le lien d’invitation généré.  
   - (Sinon, utilisez le bouton “Ajouter au serveur” sur le profil du bot, si disponible.)

2. **L’Administrateur exécute \`/setup\`**  
   - Un utilisateur ayant les droits d’administrateur exécute \`/setup\` pour :  
     - Créer une catégorie “Global Chat” et ajouter les salons \`bot-announcements\`、\`global-chat\` et \`settings\`.  
     - Enregistrer automatiquement \`global-chat\` dans le HUB central pour le lien inter‐serveurs.

3. **Les utilisateurs configurent la langue dans \`settings\`**  
   - Dans \`settings\`, chaque utilisateur définit sa **langue par défaut**.  
   - Activez ou désactivez Auto-Translate selon vos besoins.  
   - À partir de ce moment, les messages dans \`global-chat\` seront automatiquement traduits dans la langue sélectionnée si Auto-Translate est activé.

4. **Profitez du chat inter‐serveurs**  
   - Publiez dans \`global-chat\` pour que votre message soit transmis instantanément à tous les serveurs liés.  
   - Avec Auto-Translate activé, vous verrez immédiatement les messages des autres dans la langue choisie.  
   - Pour voir un message dans une autre langue (ou dans sa langue d’origine), réagissez avec l’emoji de drapeau correspondant et obtenez la traduction sur le champ.

5. **Consultez votre activité**  
   - Utilisez **\`/profile\`** pour voir le nombre de messages que vous avez envoyés et le nombre de 👍 que vous avez reçus.  
   - Utilisez **\`/ranking messages\`** pour voir les 10 utilisateurs ayant envoyé le plus de messages sur le serveur.  
   - Utilisez **\`/ranking likes\`** pour voir les 10 utilisateurs ayant reçu le plus de 👍.

6. **Annonces (Optionnel)**  
   - Les administrateurs peuvent publier dans \`bot-announcements\` pour envoyer des annonces à tous les serveurs où se trouve le bot.  
   - Ce salon est généralement utilisé par le propriétaire du bot pour des mises à jour importantes.`,
  
  // Deutsch
  'de': `# Global Chat Bot Hilfe

**Global Chat Bot** ist ein Discord-Bot, der gleichnamige Kanäle auf mehreren Servern verbindet, Sprachbarrieren überwindet und ein gemeinsames Chat-Erlebnis schafft. Nachfolgend sind die Befehle und Funktionen beschrieben:

---

## 1. Befehle

### \`/setup\`
- **Übersicht**: Der Einrichtungsbefehl, den ein Serveradministrator nach dem Einladen des Bots ausführt.  
- **Was es macht**:  
  1. Erstellt eine neue Kategorie namens „Global Chat“.  
  2. Unter dieser Kategorie werden automatisch folgende Textkanäle erstellt:  
     - \`bot-announcements\` … Zum Senden von Ankündigungen des Bots an alle Server.  
     - \`global-chat\` … Für den globalen Chat über Server hinweg.  
     - \`settings\` … Zum Konfigurieren von Übersetzungs- und Zeitzoneneinstellungen.  
  3. Registriert den erstellten \`global-chat\`-Kanal im zentralen HUB und sendet automatisch eine Anfrage, um ihn mit anderen Servern zu verknüpfen.  
- **Erforderliche Berechtigungen**: Nur Administrator.  
- **Beispiel**:  
  \`\`\`
  /setup
  \`\`\`

---

### \`/profile\`
- **Übersicht**: Zeigt Statistiken des Benutzers an, der den Befehl ausgeführt hat.  
- **Angezeigte Infos**:  
  - **Nachrichten gesendet**: Gesamtzahl der Nachrichten, die der Benutzer auf diesem Server gesendet hat.  
  - **Erhaltene 👍**: Gesamtzahl der 👍-Reaktionen, die der Benutzer erhalten hat.  
- **Erforderliche Berechtigungen**: Jeder Benutzer auf dem Server.  
- **Beispiel**:  
  \`\`\`
  /profile
  \`\`\`

---

### \`/ranking\`
- **Übersicht**: Zeigt Ranglisten der Servermitglieder an.  
- **Unterbefehle**:  
  1. \`/ranking messages\` … Zeigt die Top 10 nach **insgesamt gesendeten Nachrichten** an.  
  2. \`/ranking likes\` … Zeigt die Top 10 nach **insgesamt erhaltenen 👍** an.  
- **Beispielanzeige** (Embed-Nachricht):  
  \`\`\`
  🏆 Top 10 by Messages  
  1. @Alice – 3.450  
  2. @Bob   – 2.982  
  …  
  \`\`\`  
- **Erforderliche Berechtigungen**: Jeder Benutzer auf dem Server.  
- **Beispiele**:  
  \`\`\`
  /ranking messages  
  /ranking likes  
  \`\`\`

---

## 2. Global Chat Funktionen

### 2.1 Serverübergreifender Chat
- **Funktionsweise**:  
  - Der \`global-chat\`-Kanal, der von \`/setup\` in jedem Server erstellt wurde, ist über einen zentralen HUB verknüpft.  
  - Jede Nachricht, die in einem Server im \`global-chat\` gepostet wird, wird **sofort** an denselben Kanal in allen anderen registrierten Servern weitergeleitet.  
- **Nachrichten-Metadaten**:  
  - Der Bot sendet eine Embed-Nachricht mit folgenden Informationen:  
    - **Autor-Tag** (z. B. \`@User#1234\`)  
    - **Name des Ursprungsservers**  
    - **UTC-Versatz** (z. B. \`UTC+9\`)  
  - Dies zeigt klar, wer von welchem Server und in welcher Zeitzone die Nachricht gesendet hat.

### 2.2 Flag-Reaktion Übersetzung
- **Übersicht**:  
  - Reagiere im \`global-chat\` auf eine Nachricht mit einem Länderflaggen-Emoji (🇯🇵🇺🇸🇪🇸 etc.) und der Bot antwortet automatisch mit einer Übersetzung in die entsprechende Sprache.  
  - Beispiel: Reagiere mit 🇯🇵, um eine japanische Übersetzung der Nachricht zu erhalten.  
- **Unterstützte Sprachen** (insgesamt 26):  
  \`\`\`
  ja, en, en-GB, zh, zh-TW, ko, es, es-MX, fr, de,
  pt, pt-BR, ru, uk, el, he, ur, ms, es-CO, fa,
  bn, th, vi, hi, id, ar
  \`\`\`  
  - Jede Sprache ist einer entsprechenden Länderflagge zugeordnet, sodass durch die Reaktion sofort eine Übersetzung ausgelöst wird.  
- **Auto-Translate**:  
  - Im \`settings\`-Kanal kannst du **Auto-Translate ON** aktivieren, damit alle neuen \`global-chat\`-Nachrichten automatisch in die Sprache jedes Benutzers übersetzt werden.  
  - **OFF** zeigt nur den Originaltext an.

---

## 3. Empfohlener Ablauf

1. **Den Bot auf deinem Server einladen**  
   - Stelle den Bot im Developer Portal auf “Public”, konfiguriere OAuth2-Scopes/Berechtigungen und verwende den generierten Einladungslink.  
   - (Alternativ kannst du im Profil des Bots auf “Zum Server hinzufügen” klicken, falls verfügbar.)  

2. **Der Administrator führt \`/setup\` aus**  
   - Ein Benutzer mit Administrator-Rechten führt \`/setup\` aus, um:  
     - Eine Kategorie “Global Chat” zu erstellen und die Kanäle \`bot-announcements\`, \`global-chat\` und \`settings\` hinzuzufügen.  
     - Automatisch den \`global-chat\`-Kanal im zentralen HUB zu registrieren, um die Verbindung zwischen den Servern herzustellen.

3. **Benutzer konfigurieren ihre Sprache im \`settings\`-Kanal**  
   - Im \`settings\`, wählt jeder Benutzer seine **Standard-Sprache** aus.  
   - Aktiviere oder deaktiviere Auto-Translate nach Bedarf.  
   - Ab diesem Zeitpunkt werden \`global-chat\`-Nachrichten automatisch in die gewählte Sprache übersetzt, wenn Auto-Translate aktiviert ist.

4. **Cross-Server-Chat genießen**  
   - Poste im \`global-chat\` und deine Nachricht wird sofort an alle verknüpften Server gesendet.  
   - Mit aktiviertem Auto-Translate siehst du Nachrichten anderer in deiner gewählten Sprache sofort.  
   - Um eine Nachricht in einer anderen Sprache (oder im Original) zu sehen, reagiere mit dem entsprechenden Länderflaggen-Emoji und erhalte die Übersetzung sofort.

5. **Deine Aktivität überprüfen**  
   - Verwende **\`/profile\`**, um zu sehen, wie viele Nachrichten du gesendet und wie viele 👍 du erhalten hast.  
   - Verwende **\`/ranking messages\`**, um die Top 10 der Nachrichtensender im Server anzuzeigen.  
   - Verwende **\`/ranking likes\`**, um die Top 10 der Nutzer mit den meisten 👍 zu sehen.

6. **Ankündigungen (Optional)**  
   - Administratoren können im Kanal \`bot-announcements\` eine Ankündigung posten, um Nachrichten an alle Server zu senden, in denen sich der Bot befindet.  
   - Dieser Kanal wird normalerweise vom Bot-Inhaber für wichtige Updates verwendet.`,
  
  // Português (PT)
  'pt': `# Ajuda do Global Chat Bot

**Global Chat Bot** é um bot do Discord projetado para conectar canais com o mesmo nome em vários servidores, quebrando barreiras linguísticas e criando uma experiência de chat compartilhado. Abaixo estão os comandos e recursos:

---

## 1. Comandos

### \`/setup\`
- **Visão Geral**: Comando de configuração inicial que um administrador do servidor executa após convidar o bot.  
- **O que faz**:  
  1. Cria uma nova categoria chamada “Global Chat”.  
  2. Sob essa categoria, cria automaticamente os seguintes canais de texto:  
     - \`bot-announcements\` … Para transmitir anúncios do bot a todos os servidores.  
     - \`global-chat\` … Para o chat global entre servidores.  
     - \`settings\` … Para configurar preferências de tradução e fuso horário.  
  3. Registra o canal \`global-chat\` criado no HUB central e envia automaticamente uma solicitação para vinculá-lo a outros servidores.  
- **Permissões Necessárias**: Somente Administrador.  
- **Exemplo**:  
  \`\`\`
  /setup
  \`\`\`

---

### \`/profile\`
- **Visão Geral**: Mostra estatísticas do usuário que executou o comando.  
- **Informações Exibidas**:  
  - **Mensagens Enviadas**: Número total de mensagens que o usuário enviou neste servidor.  
  - **Reações 👍 Recebidas**: Número total de reações 👍 que o usuário recebeu.  
- **Permissões Necessárias**: Qualquer usuário no servidor.  
- **Exemplo**:  
  \`\`\`
  /profile
  \`\`\`

---

### \`/ranking\`
- **Visão Geral**: Exibe as listas de classificação dos membros do servidor.  
- **Subcomandos**:  
  1. \`/ranking messages\` … Mostra o top 10 por **número total de mensagens enviadas**.  
  2. \`/ranking likes\` … Mostra o top 10 por **número total de reações 👍 recebidas**.  
- **Exemplo de exibição** (mensagem incorporada):  
  \`\`\`
  🏆 Top 10 by Messages  
  1. @Alice – 3,450  
  2. @Bob   – 2,982  
  …  
  \`\`\`  
- **Permissões Necessárias**: Qualquer usuário no servidor.  
- **Exemplos**:  
  \`\`\`
  /ranking messages  
  /ranking likes  
  \`\`\`

---

## 2. Funcionalidades do Global Chat

### 2.1 Chat entre Servidores
- **Como funciona**:  
  - O canal \`global-chat\` criado por \`/setup\` em cada servidor é vinculado por meio de um HUB central.  
  - Qualquer mensagem enviada no \`global-chat\` de um servidor é **instantaneamente** encaminhada ao mesmo canal em todos os outros servidores registrados.  
- **Metadados da mensagem**:  
  - O bot envia uma embed que inclui:  
    - **Tag do autor** (por exemplo, \`@User#1234\`)  
    - **Nome do servidor de origem**  
    - **Offset UTC** (por exemplo, \`UTC+9\`)  
  - Isso mostra claramente quem, de qual servidor e em qual fuso horário, enviou cada mensagem.

### 2.2 Tradução por Reação de Bandeira
- **Visão Geral**:  
  - No \`global-chat\`, reaja a qualquer mensagem com um emoji de bandeira (🇯🇵🇺🇸🇪🇸, etc.) e o bot responde automaticamente com uma tradução para o idioma correspondente.  
  - Exemplo: Reaja com 🇯🇵 para obter a tradução para o japonês da mensagem.  
- **Idiomas Compatíveis** (26 no total):  
  \`\`\`
  ja, en, en-GB, zh, zh-TW, ko, es, es-MX, fr, de,
  pt, pt-BR, ru, uk, el, he, ur, ms, es-CO, fa,
  bn, th, vi, hi, id, ar
  \`\`\`  
  - Cada idioma está mapeado para um emoji de bandeira correspondente, então reagir aciona a tradução imediatamente.  
- **Auto-Translate**:  
  - No canal \`settings\`, ative **Auto-Translate ON** para que todas as novas mensagens de \`global-chat\` sejam automaticamente traduzidas para o idioma escolhido por cada usuário.  
  - Desative **OFF** para ver apenas o texto original.

---

## 3. Fluxo recomendado

1. **Convide o Bot para o seu Servidor**  
   - Torne o bot público no Developer Portal, configure os escopos/​permissões OAuth2 e use o link de convite gerado.  
   - (Alternativamente, use o botão “Adicionar ao Servidor” no perfil do bot, se estiver disponível.)

2. **O Administrador Executa \`/setup\`**  
   - Um usuário com privilégios de Administrador executa \`/setup\` para:  
     - Criar uma categoria “Global Chat” e adicionar os canais \`bot-announcements\`, \`global-chat\` e \`settings\`.  
     - Registrar automaticamente o canal \`global-chat\` no HUB central para vinculação entre servidores.

3. **Usuários Configuram Idioma em \`settings\`**  
   - Em \`settings\`, cada usuário define seu **idioma padrão**.  
   - Ative ou desative o Auto-Translate conforme desejar.  
   - A partir de então, as mensagens em \`global-chat\` serão traduzidas automaticamente para o idioma escolhido se o Auto-Translate estiver ativado.

4. **Aproveite o Chat entre Servidores**  
   - Publique em \`global-chat\` e sua mensagem será transmitida instantaneamente para todos os servidores vinculados.  
   - Com o Auto-Translate ativado, você verá as mensagens dos outros no idioma escolhido imediatamente.  
   - Para ver uma mensagem em outro idioma (ou no original), reaja com o emoji de bandeira correspondente e receba a tradução na hora.

5. **Verifique sua Atividade**  
   - Use **\`/profile\`** para ver quantas mensagens você enviou e quantas 👍 você recebeu.  
   - Use **\`/ranking messages\`** para ver os 10 usuários que mais enviaram mensagens.  
   - Use **\`/ranking likes\`** para ver os 10 usuários com mais 👍 recebidos.

6. **Anúncios (Opcional)**  
   - Administradores podem postar em \`bot-announcements\` para enviar anúncios a todos os servidores onde o bot está presente.  
   - Este canal geralmente é usado pelo proprietário do bot para atualizações importantes.`,
  
  // Русский
  'ru': `# Справка по Global Chat Bot

**Global Chat Bot** — это бот для Discord, предназначенный для объединения каналов с одинаковым именем на нескольких серверах, преодоления языковых барьеров и создания единого чата. Ниже приведены команды и функции:

---

## 1. Команды

### \`/setup\`
- **Обзор**: Команда первоначальной настройки, которую администратор сервера выполняет после приглашения бота.  
- **Что делает**:  
  1. Создает новую категорию с названием “Global Chat”.  
  2. Под этой категорией автоматически создает следующие текстовые каналы:  
     - \`bot-announcements\` … Для рассылки объявлений от бота на все серверы.  
     - \`global-chat\` … Для глобального чата между серверами.  
     - \`settings\` … Для настройки параметров перевода и часового пояса.  
  3. Регистрирует созданный канал \`global-chat\` в центральном HUB и автоматически отправляет запрос на его подключение к другим серверам.  
- **Необходимые права**: Только Администратор.  
- **Пример**:  
  \`\`\`
  /setup
  \`\`\`

---

### \`/profile\`
- **Обзор**: Показывает статистику пользователя, выполнившего команду.  
- **Отображаемые данные**:  
  - **Сообщения отправлены**: Общее количество сообщений, отправленных пользователем на этом сервере.  
  - **Реакции 👍 получены**: Общее количество реакций 👍, полученных пользователем.  
- **Необходимые права**: Любой пользователь на сервере.  
- **Пример**:  
  \`\`\`
  /profile
  \`\`\`

---

### \`/ranking\`
- **Обзор**: Отображает таблицы лидеров участников сервера.  
- **Субкоманды**:  
  1. \`/ranking messages\` … Показывает топ 10 по **общему количеству отправленных сообщений**.  
  2. \`/ranking likes\` … Показывает топ 10 по **общему количеству полученных реакций 👍**.  
- **Пример отображения** (встроенное сообщение):  
  \`\`\`
  🏆 Top 10 by Messages  
  1. @Alice – 3 450  
  2. @Bob   – 2 982  
  …  
  \`\`\`  
- **Необходимые права**: Любой пользователь на сервере.  
- **Примеры**:  
  \`\`\`
  /ranking messages  
  /ranking likes  
  \`\`\`

---

## 2. Функции глобального чата

### 2.1 Межсерверный чат
- **Как это работает**:  
  - Канал \`global-chat\`, созданный командой \`/setup\` на каждом сервере, связывается через центральный HUB.  
  - Любое сообщение, отправленное в \`global-chat\` на одном сервере, **незамедлительно** пересылается в этот же канал на всех других зарегистрированных серверах.  
- **Метаданные сообщения**:  
  - Бот публикует embed-сообщение, включающее:  
    - **Тег автора** (например, \`@User#1234\`)  
    - **Название сервера-источника**  
    - **UTC-смещение** (например, \`UTC+9\`)  
  - Это наглядно показывает, кто, с какого сервера и в каком часовом поясе отправил сообщение.

### 2.2 Перевод по реакции с флагом
- **Обзор**:  
  - В \`global-chat\` отреагируйте на любое сообщение эмодзи флага (🇯🇵🇺🇸🇪🇸 и т. д.), и бот автоматически ответит переводом на соответствующий язык.  
  - Пример: Отреагируйте 🇯🇵, чтобы получить перевод сообщения на японский.  
- **Поддерживаемые языки** (всего 26):  
  \`\`\`
  ja, en, en-GB, zh, zh-TW, ko, es, es-MX, fr, de,
  pt, pt-BR, ru, uk, el, he, ur, ms, es-CO, fa,
  bn, th, vi, hi, id, ar
  \`\`\`  
  - Каждый язык соответствует соответствующему эмодзи флага, поэтому при реакции перевод запускается мгновенно.  
- **Авто-перевод (Auto-Translate)**:  
  - В канале \`settings\` включите **Auto-Translate ON**, чтобы все новые сообщения в \`global-chat\` автоматически переводились на язык, выбранный пользователем.  
  - **OFF** отображает только оригинальный текст.

---

## 3. Рекомендуемый порядок действий

1. **Пригласить Бота на ваш сервер**  
   - Включите для бота опцию Public в Developer Portal, настройте параметры OAuth2 и используйте сгенерированную ссылку приглашения.  
   - (Или нажмите кнопку “Add to Server” в профиле бота, если она доступна.)

2. **Администратор выполняет \`/setup\`**  
   - Пользователь с правами администратора выполняет \`/setup\` для:  
     - Создания категории “Global Chat” и добавления каналов \`bot-announcements\`, \`global-chat\` и \`settings\`.  
     - Автоматической регистрации канала \`global-chat\` в центральном HUB для создания связи между серверами.

3. **Пользователи настраивают язык в канале \`settings\`**  
   - В \`settings\` каждый пользователь выбирает свою **язык по умолчанию**.  
   - Включите или отключите Auto-Translate по желанию.  
   - С этого момента новые сообщения в \`global-chat\` автоматически переводятся на выбранный язык при включенном Auto-Translate.

4. **Наслаждайтесь межсерверным чатом**  
   - Отправьте сообщение в \`global-chat\` и оно сразу распространится на все связанные серверы.  
   - При включенном Auto-Translate вы сразу увидите сообщения других на выбранном языке.  
   - Чтобы увидеть сообщение в другом языке (или оригинале), отреагируйте соответствующим эмодзи флага и получите перевод мгновенно.

5. **Проверяйте свою активность**  
   - Используйте **\`/profile\`**, чтобы узнать, сколько сообщений вы отправили и сколько 👍 получили.  
   - Используйте **\`/ranking messages\`**, чтобы увидеть топ 10 пользователей по количеству отправленных сообщений.  
   - Используйте **\`/ranking likes\`**, чтобы увидеть топ 10 пользователей по количеству полученных 👍.

6. **Оголошения (опционально)**  
   - Администраторы могут публиковать в канале \`bot-announcements\`, чтобы создавать объявления во все сервера, где присутствует бот.  
   - Этот канал обычно используется владельцем бота для важных обновлений.`,  

  // Українська
  'uk': `# Довідка по Global Chat Bot

**Global Chat Bot** — це бот для Discord, що дозволяє поєднувати канали з однаковими назвами на різних серверах, долаючи мовні бар’єри та створюючи єдиний простір для чату. Нижче наведено команди та функції:

---

## 1. Команди

### \`/setup\`
- **Огляд**: Команда початкового налаштування, яку виконує адміністратор сервера після запрошення бота.  
- **Що робить**:  
  1. Створює нову категорію з назвою “Global Chat”.  
  2. Під цією категорією автоматично створює такі текстові канали:  
     - \`bot-announcements\` … Для надсилання оголошень від бота на всі сервери.  
     - \`global-chat\` … Для глобального чату між серверами.  
     - \`settings\` … Для налаштування параметрів перекладу та часових поясів.  
  3. Реєструє створений канал \`global-chat\` у центральному HUB і автоматично надсилає запит на підключення до інших серверів.  
- **Необхідні права**: Адміністратор (Administrator) лише.  
- **Приклад**:  
  \`\`\`
  /setup
  \`\`\`

---

### \`/profile\`
- **Огляд**: Відображає статистику користувача, який виконав команду.  
- **Відображувана інформація**:  
  - **Messages Sent**: Загальна кількість повідомлень, відправлених користувачем на цьому сервері.  
  - **Likes Received**: Загальна кількість реакцій 👍, отриманих користувачем.  
- **Необхідні права**: Будь-який користувач на сервері.  
- **Приклад**:  
  \`\`\`
  /profile
  \`\`\`

---

### \`/ranking\`
- **Огляд**: Відображає лідерборди учасників сервера.  
- **Підкоманди**:  
  1. \`/ranking messages\` … Показує топ 10 за **загальною кількістю відправлених повідомлень**.  
  2. \`/ranking likes\` … Показує топ 10 за **загальною кількістю отриманих реакцій 👍**.  
- **Приклад відображення** (embed-повідомлення):  
  \`\`\`
  🏆 Top 10 by Messages  
  1. @Alice – 3 450  
  2. @Bob   – 2 982  
  …  
  \`\`\`  
- **Необхідні права**: Будь-який користувач на сервері.  
- **Приклади**:  
  \`\`\`
  /ranking messages  
  /ranking likes  
  \`\`\`

---

## 2. Функції глобального чату

### 2.1 Чат між серверами
- **Як це працює**:  
  - Канал \`global-chat\`, створений командою \`/setup\` на кожному сервері, пов’язаний через центральний HUB.  
  - Будь-яке повідомлення, надіслане в \`global-chat\` одного сервера, **миттєво** пересилається до цього ж каналу на всіх інших зареєстрованих серверах.  
- **Метадані повідомлення**:  
  - Бот публікує embed-повідомлення з наступною інформацією:  
    - **Тег автора** (наприклад, \`@User#1234\`)  
    - **Назва сервера-джерела**  
    - **Зсув UTC** (наприклад, \`UTC+9\`)  
  - Це чітко показує, хто, з якого сервера та в якому часовому поясі надіслав повідомлення.

### 2.2 Переклад за реакцією з прапором
- **Огляд**:  
  - У \`global-chat\`, відреагуйте на будь-яке повідомлення емодзі прапора (🇯🇵🇺🇸🇪🇸 тощо), і бот автоматично відповість перекладом на відповідну мову.  
  - Приклад: відреагуйте 🇯🇵, щоб отримати переклад повідомлення японською.  
- **Підтримувані мови** (усього 26):  
  \`\`\`
  ja, en, en-GB, zh, zh-TW, ko, es, es-MX, fr, de,
  pt, pt-BR, ru, uk, el, he, ur, ms, es-CO, fa,
  bn, th, vi, hi, id, ar
  \`\`\`  
  - Кожна мова пов’язана зі своїм емодзі прапора, тому реакція одразу запускає переклад.  
- **Авто-переклад (Auto-Translate)**:  
  - У каналі \`settings\`, увімкніть **Auto-Translate ON**, щоб усі нові повідомлення в \`global-chat\` автоматично перекладалися на обрану мову користувача.  
  - **OFF** показує тільки оригінальний текст.

---

## 3. Рекомендований порядок дій

1. **Запросити бота на свій сервер**  
   - Увімкніть бота як Public у Developer Portal, налаштуйте параметри OAuth2 і використовуйте згенероване посилання запрошення.  
   - (Або натисніть кнопку “Add to Server” у профілі бота, якщо вона доступна.)

2. **Адміністратор виконує \`/setup\`**  
   - Користувач з правами адміністратора виконує \`/setup\` для:  
     - Створення категорії “Global Chat” і додавання каналів \`bot-announcements\`, \`global-chat\` та \`settings\`.  
     - Автоматичної реєстрації каналу \`global-chat\` у центральному HUB для створення зв’язку між серверами.

3. **Користувачі налаштовують мову в каналі \`settings\`**  
   - У \`settings\` кожен користувач обирає свою **мову за замовчуванням**.  
   - Увімкніть або вимкніть Auto-Translate за потребою.  
   - Відтепер нові повідомлення в \`global-chat\` автоматично перекладатимуться на обрану мову, якщо Auto-Translate увімкнено.

4. **Насолоджуйтеся чатом між серверами**  
   - Надішліть повідомлення в \`global-chat\`, і воно одразу пошириться на всі підключені сервери.  
   - При увімкненому Auto-Translate ви відразу побачите повідомлення інших на обраній мові.  
   - Щоб побачити повідомлення іншою мовою (або в оригіналі), відреагуйте емодзі відповідного прапора, і отримаєте переклад миттєво.

5. **Перевіряйте свою активність**  
   - Використовуйте **\`/profile\`**, щоб дізнатися, скільки повідомлень ви надіслали і скільки 👍 отримали.  
   - Використовуйте **\`/ranking messages\`**, щоб побачити топ 10 користувачів за кількістю надісланих повідомлень.  
   - Використовуйте **\`/ranking likes\`**, щоб побачити топ 10 користувачів за кількістю отриманих 👍.

6. **Оголошення (опційно)**  
   - Адміністратори можуть публікувати в канал \`bot-announcements\`, щоб надсилати оголошення на всі сервери, де є бот.  
   - Цей канал зазвичай використовується власником бота для важливих оновлень.`,  

  // Ελληνικά
  'el': `# Βοήθεια Global Chat Bot

**Global Chat Bot** είναι ένα Discord bot σχεδιασμένο για να συνδέει κανάλια με το ίδιο όνομα σε πολλούς διακομιστές, ξεπερνώντας τα γλωσσικά εμπόδια και δημιουργώντας μια κοινή εμπειρία συνομιλίας. Παρακάτω βρίσκονται οι εντολές και οι λειτουργίες:

---

## 1. Εντολές

### \`/setup\`
- **Επισκόπηση**: Η αρχική εντολή ρύθμισης που εκτελεί ο διαχειριστής του διακομιστή μετά την πρόσκληση του bot.  
- **Τι κάνει**:  
  1. Δημιουργεί μια νέα κατηγορία με την ονομασία “Global Chat”.  
  2. Υπό αυτή την κατηγορία, δημιουργεί αυτόματα τα ακόλουθα κείμενα κανάλια:  
     - \`bot-announcements\` … Για την αποστολή ανακοινώσεων από το bot σε όλους τους διακομιστές.  
     - \`global-chat\` … Για την παγκόσμια συνομιλία μεταξύ διακομιστών.  
     - \`settings\` … Για τη ρύθμιση προτιμήσεων μετάφρασης και ζώνης ώρας.  
  3. Καταχωρεί το δημιουργημένο κανάλι \`global-chat\` στο κεντρικό HUB και στέλνει αυτόματα ένα αίτημα για σύνδεσή του με άλλους διακομιστές.  
- **Απαιτούμενα Δικαιώματα**: Μόνο Διαχειριστής.  
- **Παράδειγμα**:  
  \`\`\`
  /setup
  \`\`\`

---

### \`/profile\`
- **Επισκόπηση**: Εμφανίζει στατιστικά στοιχεία για τον χρήστη που εκτέλεσε την εντολή.  
- **Εμφανιζόμενες Πληροφορίες**:  
  - **Απεσταλμένα μηνύματα**: Συνολικός αριθμός μηνυμάτων που έχει στείλει ο χρήστης σε αυτόν τον διακομιστή.  
  - **Εμφανίσεις 👍**: Συνολικός αριθμός αντιδράσεων 👍 που έχει λάβει ο χρήστης.  
- **Απαιτούμενα Δικαιώματα**: Οποιοσδήποτε χρήστης στον διακομιστή.  
- **Παράδειγμα**:  
  \`\`\`
  /profile
  \`\`\`

---

### \`/ranking\`
- **Επισκόπηση**: Εμφανίζει τα leaderboards των μελών του διακομιστή.  
- **Υποεντολές**:  
  1. \`/ranking messages\` … Εμφανίζει το top 10 βάσει **συνολικού αριθμού σταλμένων μηνυμάτων**.  
  2. \`/ranking likes\` … Εμφανίζει το top 10 βάσει **συνολικών αντιδράσεων 👍 που λήφθηκαν**.  
- **Παράδειγμα Εμφάνισης** (embed μήνυμα):  
  \`\`\`
  🏆 Top 10 by Messages  
  1. @Alice – 3,450  
  2. @Bob   – 2,982  
  …  
  \`\`\`  
- **Απαιτούμενα Δικαιώματα**: Οποιοσδήποτε χρήστης στον διακομιστή.  
- **Παραδείγματα**:  
  \`\`\`
  /ranking messages  
  /ranking likes  
  \`\`\`

---

## 2. Λειτουργίες Global Chat

### 2.1 Συνομιλία μεταξύ Διακομιστών
- **Πώς λειτουργεί**:  
  - Το κανάλι \`global-chat\`, που δημιουργείται με την εντολή \`/setup\` σε κάθε διακομιστή, συνδέεται μέσω ενός κεντρικού HUB.  
  - Οποιοδήποτε μήνυμα δημοσιεύεται στο \`global-chat\` ενός διακομιστή **στεγάζεται αμέσως** στο ίδιο κανάλι σε όλους τους άλλους εγγεγραμμένους διακομιστές.  
- **Μεταδεδομένα Μηνύματος**:  
  - Το bot στέλνει ένα embedded μήνυμα που περιλαμβάνει:  
    - **Ετικέτα συγγραφέα** (π.χ. \`@User#1234\`)  
    - **Όνομα διακομιστή προέλευσης**  
    - **UTC μετατόπιση** (π.χ. \`UTC+9\`)  
  - Αυτό δείχνει με σαφήνεια ποιος, από ποιο διακομιστή και σε ποια ζώνη ώρας, έστειλε κάθε μήνυμα.

### 2.2 Μετάφραση με Αντίδραση Σημαίας
- **Επισκόπηση**:  
  - Στο \`global-chat\`, αντιδράστε σε οποιοδήποτε μήνυμα με ένα emoji σημαίας (🇯🇵🇺🇸🇪🇸 κ.λπ.) και το bot απαντά αυτόματα με μετάφραση στη γλώσσα που αντιστοιχεί.  
  - Παράδειγμα: Αντιδράστε με 🇯🇵 για να λάβετε μια ιαπωνική μετάφραση του μηνύματος.  
- **Υποστηριζόμενες Γλώσσες** (26 συνολικά):  
  \`\`\`
  ja, en, en-GB, zh, zh-TW, ko, es, es-MX, fr, de,
  pt, pt-BR, ru, uk, el, he, ur, ms, es-CO, fa,
  bn, th, vi, hi, id, ar
  \`\`\`  
  - Κάθε γλώσσα είναι αντιστοιχισμένη σε ένα emoji σημαίας, οπότε με την αντίδραση ενεργοποιείται αμέσως η μετάφραση.  
- **Auto-Translate**:  
  - Στο κανάλι \`settings\`, ενεργοποιήστε **Auto-Translate ON** για να μεταφράζονται αυτόματα όλα τα νέα μηνύματα του \`global-chat\` στη γλώσσα που έχει επιλέξει κάθε χρήστης.  
  - **OFF** εμφανίζει μόνο το πρωτότυπο κείμενο.

---

## 3. Συνιστώμενη Ροή

1. **Προσκαλέστε το Bot στον Server σας**  
   - Κάντε το bot δημόσιο στο Developer Portal, ρυθμίστε τα OAuth2 scopes/permissions και χρησιμοποιήστε τον γεννημένο σύνδεσμο πρόσκλησης.  
   - (Εναλλακτικά, πατήστε το κουμπί “Add to Server” στο προφίλ του bot, εάν είναι διαθέσιμο.)

2. **Ο Διαχειριστής Εκτελεί \`/setup\`**  
   - Χρήστης με δικαιώματα διαχειριστή εκτελεί \`/setup\` για:  
     - Δημιουργία κατηγορίας “Global Chat” και προσθήκη των καναλιών \`bot-announcements\`, \`global-chat\` και \`settings\`.  
     - Αυτόματη εγγραφή του καναλιού \`global-chat\` στο κεντρικό HUB για σύνδεση μεταξύ διακομιστών.

3. **Οι Χρήστες Ρυθμίζουν τη Γλώσσα στο \`settings\`**  
   - Στο \`settings\`, κάθε χρήστης επιλέγει τη **γλώσσα προεπιλογής** του.  
   - Ενεργοποιήστε ή απενεργοποιήστε το Auto-Translate όπως επιθυμείτε.  
   - Από αυτό το σημείο και μετά, εάν το Auto-Translate είναι ενεργό, τα νέα μηνύματα στο \`global-chat\` θα μεταφράζονται αυτόματα στην επιλεγμένη γλώσσα.

4. **Απολαύστε τη Συνομιλία μεταξύ Διακομιστών**  
   - Δημοσιεύστε μήνυμα στο \`global-chat\` και θα μεταδοθεί αμέσως σε όλους τους συνδεδεμένους διακομιστές.  
   - Με ενεργοποιημένο Auto-Translate, θα δείτε αμέσως τα μηνύματα άλλων στην επιλεγμένη γλώσσα σας.  
   - Για να δείτε ένα μήνυμα σε άλλη γλώσσα (ή στο πρωτότυπο), αντιδράστε με το αντίστοιχο emoji σημαίας και λάβετε τη μετάφραση αμέσως.

5. **Ελέγξτε τη Δραστηριότητά σας**  
   - Χρησιμοποιήστε **\`/profile\`** για να δείτε πόσα μηνύματα έχετε στείλει και πόσα 👍 έχετε λάβει.  
   - Χρησιμοποιήστε **\`/ranking messages\`** για να δείτε τους 10 χρήστες που έχουν στείλει τα περισσότερα μηνύματα.  
   - Χρησιμοποιήστε **\`/ranking likes\`** για να δείτε τους 10 χρήστες που έχουν λάβει τα περισσότερα 👍.

6. **Ανακοινώσεις (Προαιρετικό)**  
   - Οι διαχειριστές μπορούν να δημοσιεύουν στο \`bot-announcements\` για να στείλουν ανακοινώσεις σε όλους τους διακομιστές όπου βρίσκεται το bot.  
   - Αυτό το κανάλι χρησιμοποιείται συνήθως από τον ιδιοκτήτη του bot για σημαντικές ενημερώσεις.`,

  // עברית
  'he': `# עזרה ל-Global Chat Bot

**Global Chat Bot** הוא בוט ל-Discord המיועד לחבר ערוצים בעלי שם זהה בכמה שרתים, לשבור חסמי שפה וליצור חוויית צ’אט משותפת. להלן הפקודות והפיצ’רים:

---

## 1. פקודות

### \`/setup\`
- **סקירה**: הפקודה לתצורה ראשונית שמנהל השרת מריץ לאחר הזמנת הבוט.  
- **מה היא עושה**:  
  1. יוצרת קטגוריה חדשה בשם “Global Chat”.  
  2. מתחת לקטגוריה זו, יוצרת באופן אוטומטי את ערוצי הטקסט הבאים:  
     - \`bot-announcements\` … לשידור הודעות בוט לכל השרתים.  
     - \`global-chat\` … לצ’אט גלובלי בין השרתים.  
     - \`settings\` … להגדרת העדפות תרגום ואזור זמן.  
  3. רושמת את ערוץ \`global-chat\` שנוצר במרכז ה-HUB ושולחת אוטומטית בקשה לקשר אותו לשרתים אחרים.  
- **ההרשאות הנדרשות**: מנהל בלבד (Administrator).  
- **דוגמה**:  
  \`\`\`
  /setup
  \`\`\`

---

### \`/profile\`
- **סקירה**: מציגה סטטיסטיקות של המשתמש שביצע את הפקודה.  
- **מידע מוצג**:  
  - **Messages Sent**: מספר ההודעות הכולל שהמשתמש שלח בשרת זה.  
  - **Likes Received**: מספר התגובות 👍 הכולל שהמשתמש קיבל.  
- **ההרשאות הנדרשות**: כל משתמש בשרת.  
- **דוגמה**:  
  \`\`\`
  /profile
  \`\`\`

---

### \`/ranking\`
- **סקירה**: מציגה לוחות צמרת של חברי השרת.  
- **פקודות משנה**:  
  1. \`/ranking messages\` … מציג את עשרת הראשונים לפי **מספר ההודעות הכולל שנשלחו**.  
  2. \`/ranking likes\` … מציג את עשרת הראשונים לפי **מספר ה-👍 הכולל שהתקבל**.  
- **דוגמה להצגה** (הודעת embed):  
  \`\`\`
  🏆 Top 10 by Messages  
  1. @Alice – 3,450  
  2. @Bob   – 2,982  
  …  
  \`\`\`  
- **ההרשאות הנדרשות**: כל משתמש בשרת.  
- **דוגמאות**:  
  \`\`\`
  /ranking messages  
  /ranking likes  
  \`\`\`

---

## 2. פיצ’רים של הצ’אט הגלובלי

### 2.1 צ’אט בין שרתים
- **איך זה עובד**:  
  - ערוץ \`global-chat\`, שנוצר ע”י \`/setup\` בכל שרת, מקושר דרך HUB מרכזי.  
  - כל הודעה שנשלחת בערוץ \`global-chat\` בשרת אחד מועברת **מיידית** לאחרים באותו שם בערוצים של כל השרתים המחוברים.  
- **מטא-מידע של ההודעה**:  
  - הבוט שולח הודעת embed הכוללת:  
    - **תג המחבר** (לדוגמה : \`@User#1234\`)  
    - **שם שרת המקור**  
    - **הסטת UTC** (לדוגמה : \`UTC+9\`)  
  - בכך רואים בבהירות מי, מאיזה שרת ובאיזו אזור זמן שלח כל הודעה.

### 2.2 תרגום ע”י תגובה בדגל
- **סקירה**:  
  - בערוץ \`global-chat\`, הגב לכל הודעה עם אימוג’י דגל (🇯🇵🇺🇸🇪🇸 וכו’), והבוט ישיב אוטומטית בתרגום לשפה המתאימה.  
  - דוגמה : הגב באמצעות 🇯🇵 כדי לקבל תרגום ליפנית של ההודעה.  
- **שפות נתמכות** (26 בסך הכל):  
  \`\`\`
  ja, en, en-GB, zh, zh-TW, ko, es, es-MX, fr, de,
  pt, pt-BR, ru, uk, el, he, ur, ms, es-CO, fa,
  bn, th, vi, hi, id, ar
  \`\`\`  
  - כל שפה מוקצה אימוג’י דגל משלה, כך שהתגובה תפעיל תרגום מיד.  
- **Auto-Translate**:  
  - בערוץ \`settings\`, הפעל **Auto-Translate ON** כדי שכל ההודעות החדשות ב־\`global-chat\` יתורגמו אוטומטית לשפה הנבחרת של כל משתמש.  
  - **OFF** יציג רק את הטקסט המקורי.

---

## 3. זרימת המלצות

1. **הזמנת הבוט לשרת שלך**  
   - הפוך את הבוט לציבורי (Public) ב־Developer Portal, הגדר את OAuth2 scopes/permissions והשתמש בקישור ההזמנה שנוצר.  
   - (חלופית, אם זמינה, לחץ על כפתור “Add to Server” בפרופיל הבוט.)

2. **המנהל מריץ \`/setup\`**  
   - משתמש עם הרשאות מנהל מריץ \`/setup\` כדי:  
     - ליצור קטגוריה “Global Chat” ולהוסיף את הערוצים \`bot-announcements\`, \`global-chat\` ו־\`settings\`.  
     - לרשום אוטומטית את ערוץ \`global-chat\` ב־HUB המרכזי כדי ליצור קישוריות בין השרתים.

3. **המשתמשים מגדירים שפה בערוץ \`settings\`**  
   - בערוץ \`settings\`, כל משתמש בוחר את **שפת ברירת המחדל** שלו.  
   - הפעל או השבת את Auto-Translate לפי הצורך.  
   - מעכשיו, אם Auto-Translate פעיל, הודעות חדשות ב־\`global-chat\` יתורגמו אוטומטית לשפה שנבחרה.

4. **תיהנו מצ’אט בין שרתים**  
   - פרסם הודעה ב־\`global-chat\` וההודעה שלך תישלח מייד לכל השרתים המקושרים.  
   - כש־Auto-Translate פעיל, תראה את ההודעות של אחרים מיד בשפה שבחרת.  
   - כדי לראות הודעה בשפה אחרת (או בשפת המקור), הגיבו באימוג’י דגל המתאים וקבלו תרגום מיידי.

5. **בדקו את הפעילות שלכם**  
   - השתמשו ב־**\`/profile\`** כדי לראות כמה הודעות שלחתם וכמה 👍 קיבלתם.  
   - השתמשו ב־**\`/ranking messages\`** כדי לראות את 10 המשתמשים ששלחו הכי הרבה הודעות.  
   - השתמשו ב־**\`/ranking likes\`** כדי לראות את 10 המשתמשים שקיבלו הכי הרבה 👍.

6. **הודעות (אופציונלי)**  
   - מנהלים יכולים לפרסם הודעות בערוץ \`bot-announcements\` כדי לשלוח הודעות לכל השרתים אליהם הבוט מחובר.  
   - ערוץ זה משמש בדרך כלל על ידי בעל הבוט לעדכונים חשובים.`,
  
  // اردو
  'ur': `# گلوبل چیٹ بوٹ کی مدد

**Global Chat Bot** ایک Discord بوٹ ہے جو ایک ہی نام والے چینلز کو مختلف سرورز پر مربوط کرتا ہے، زبانوں کی رکاوٹیں دور کرتا ہے، اور ایک مشترکہ چیٹ کا تجربہ فراہم کرتا ہے۔ ذیل میں کمانڈز اور خصوصیات ہیں:

---

## 1. کمانڈز

### \`/setup\`
- **جائزہ**: ابتدائی سیٹ اپ کمانڈ جو سرور ایڈمنسٹریٹر بوٹ کو انوائٹ کرنے کے بعد چلائے گا۔  
- **یہ کیا کرتا ہے**:  
  1. ایک نیا کیٹیگری بناتا ہے جس کا نام “Global Chat” ہوتا ہے۔  
  2. اس کیٹیگری کے نیچے خودبخود مندرجہ ذیل ٹیکسٹ چانلز بناتا ہے:  
     - \`bot-announcements\` … تمام سرورز کو بوٹ کی طرف سے اشتہارات بھیجنے کے لئے۔  
     - \`global-chat\` … سرورز کے درمیان گلوبل چیٹ کے لئے۔  
     - \`settings\` … ترجمہ اور ٹائم زون کی ترتیبات کے لئے۔  
  3. بنائے گئے \`global-chat\` چینل کو مرکزی HUB میں رجسٹر کرتا ہے اور خودبخود دوسرے سرورز سے لنک کرنے کی درخواست بھیجتا ہے۔  
- **ضروری اجازتیں**: صرف اڈمنسٹریٹر۔  
- **مثال**:  
  \`\`\`
  /setup
  \`\`\`

---

### \`/profile\`
- **جائزہ**: اس کمانڈ کو چلانے والے صارف کے لئے اعدادوشمار دکھاتا ہے۔  
- **ظاہر ہونے والی معلومات**:  
  - **Messages Sent**: اس سرور میں اس صارف کی جانب سے بھیجے گئے کل پیغامات کی تعداد۔  
  - **Likes Received**: اس صارف کو موصول ہونے والی کل 👍 ریئیکشنز کی تعداد۔  
- **ضروری اجازتیں**: سرور میں کوئی بھی صارف۔  
- **مثال**:  
  \`\`\`
  /profile
  \`\`\`

---

### \`/ranking\`
- **جائزہ**: سرور ممبران کے لیڈر بورڈز دکھاتا ہے۔  
- **سب کمانڈز**:  
  1. \`/ranking messages\` … **کل بھیجے گئے پیغامات کی تعداد** کی بنیاد پر ٹاپ 10 دکھاتا ہے۔  
  2. \`/ranking likes\` … **موصول ہونے والی کل 👍 ریئیکشنز** کی بنیاد پر ٹاپ 10 دکھاتا ہے۔  
- **نمائش کی مثال** (ایمبیڈ پیغام):  
  \`\`\`
  🏆 Top 10 by Messages  
  1. @Alice – 3,450  
  2. @Bob   – 2,982  
  …  
  \`\`\`  
- **ضروری اجازتیں**: سرور میں کوئی بھی صارف۔  
- **مثالیں**:  
  \`\`\`
  /ranking messages  
  /ranking likes  
  \`\`\`

---

## 2. گلوبل چیٹ خصوصیات

### 2.1 سرورز کے درمیان چیٹ
- **یہ کیسے کام کرتا ہے**:  
  - ہر سرور میں \`/setup\` کے ذریعے بنایا گیا \`global-chat\` چینل ایک مرکزی HUB کے ذریعے منسلک ہوتا ہے۔  
  - جب بھی کسی سرور کے \`global-chat\` میں کوئی پیغام پوسٹ کیا جاتا ہے تو اسے **فوری طور پر** دیگر تمام رجسٹرڈ سرورز کے اسی چینل میں بھیج دیا جاتا ہے۔  
- **پیغام کا میٹا ڈیٹا**:  
  - بوٹ ایک ایمبیڈ کے طور پر پیغام بھیجتا ہے، جس میں شامل ہوتا ہے:  
    - **مصنف کا ٹیگ** (مثال کے طور پر \`@User#1234\`)  
    - **ماخذ سرور کا نام**  
    - **UTC آفسٹ** (مثال کے طور پر \`UTC+9\`)  
  - اس طرح یہ واضح ہوتا ہے کہ کس نے، کس سرور سے، اور کس ٹائم زون سے پیغام بھیجا۔

### 2.2 جھنڈے کے ردعمل سے ترجمہ
- **جائزہ**:  
  - \`global-chat\` میں کسی بھی پیغام پر کسی ملک کے جھنڈے کے ایموجی (🇯🇵🇺🇸🇪🇸 وغیرہ) کے ساتھ ردعمل کریں، اور بوٹ خودکار طور پر اس زبان میں ترجمہ کے ساتھ جواب دے گا۔  
  - مثال: 🇯🇵 کے ساتھ ردعمل کرنے پر، پیغام کا جاپانی ترجمہ موصول ہوگا۔  
- **معاون زبانیں** (کل 26):  
  \`\`\`
  ja, en, en-GB, zh, zh-TW, ko, es, es-MX, fr, de,
  pt, pt-BR, ru, uk, el, he, ur, ms, es-CO, fa,
  bn, th, vi, hi, id, ar
  \`\`\`  
  - ہر زبان کو اس کے متعلقہ جھنڈے کے ایموجی کے ساتھ میپ کیا گیا ہے، لہذا ردعمل کرنے سے فوری ترجمہ ہوتا ہے۔  
- **آٹو-ترجمہ (Auto-Translate)**:  
  - \`settings\` چینل میں **Auto-Translate ON** کو فعال کریں تاکہ \`global-chat\` میں تمام نئے پیغامات خودکار طور پر ہر صارف کی منتخب کردہ زبان میں ترجمہ ہو جائیں۔  
  - **OFF** کو منتخب کرنے سے صرف اصل متن دکھائے گا۔`,

  // Bahasa Melayu
  'ms': `# Bantuan Global Chat Bot

**Global Chat Bot** ialah bot Discord yang direka untuk menyambungkan saluran yang sama nama di pelbagai pelayan, memecahkan halangan bahasa dan mencipta pengalaman sembang bersama. Berikut ialah arahan dan ciri-ciri:

---

## 1. Arahan

### \`/setup\`
- **Gambaran Keseluruhan**: Arahan persediaan awal yang dilaksanakan oleh pentadbir pelayan setelah menjemput bot.  
- **Apa yang dilakukan**:  
  1. Membuat kategori baru bernama “Global Chat”.  
  2. Dalam kategori itu, secara automatik membuat saluran teks berikut:  
     - \`bot-announcements\` … Untuk menyiarkan pengumuman daripada bot ke semua pelayan.  
     - \`global-chat\` … Untuk sembang global antara pelayan.  
     - \`settings\` … Untuk mengkonfigurasi tetapan terjemahan dan zon masa.  
  3. Mendaftar saluran \`global-chat\` yang dicipta ke HUB pusat dan secara automatik menghantar permintaan untuk menghubungkannya dengan pelayan lain.  
- **Keperluan Kebenaran**: Pentadbir sahaja.  
- **Contoh**:  
  \`\`\`
  /setup
  \`\`\`

---

### \`/profile\`
- **Gambaran Keseluruhan**: Menunjukkan statistik untuk pengguna yang menjalankan arahan.  
- **Maklumat Dipaparkan**:  
  - **Messages Sent**: Jumlah mesej yang dihantar oleh pengguna dalam pelayan ini.  
  - **Likes Received**: Jumlah reaksi 👍 yang diterima oleh pengguna.  
- **Keperluan Kebenaran**: Mana-mana pengguna dalam pelayan.  
- **Contoh**:  
  \`\`\`
  /profile
  \`\`\`

---

### \`/ranking\`
- **Gambaran Keseluruhan**: Memaparkan papan pendahulu ahli pelayan.  
- **Subarahan**:  
  1. \`/ranking messages\` … Menunjukkan 10 teratas mengikut **jumlah mesej dihantar**.  
  2. \`/ranking likes\` … Menunjukkan 10 teratas mengikut **jumlah reaksi 👍 diterima**.  
- **Contoh Paparan** (mesej embed):  
  \`\`\`
  🏆 Top 10 by Messages  
  1. @Alice – 3,450  
  2. @Bob   – 2,982  
  …  
  \`\`\`  
- **Keperluan Kebenaran**: Mana-mana pengguna dalam pelayan.  
- **Contoh**:  
  \`\`\`
  /ranking messages  
  /ranking likes  
  \`\`\`

---

## 2. Fungsi Global Chat

### 2.1 Sembang Merentas Pelayan
- **Bagaimana Ia Berfungsi**:  
  - Saluran \`global-chat\` yang dicipta oleh \`/setup\` dalam setiap pelayan disambungkan melalui HUB pusat.  
  - Apa-apa mesej yang dihantar dalam \`global-chat\` satu pelayan akan **terus-menerus** disiarkan ke saluran yang sama di semua pelayan yang didaftarkan.  
- **Metadata Mesej**:  
  - Bot menghantar embed yang termasuk:  
    - **Tag Pengarang** (contoh: \`@User#1234\`)  
    - **Nama Pelayan Asal**  
    - **Offset UTC** (contoh: \`UTC+9\`)  
  - Ini menunjukkan dengan jelas siapa, dari pelayan mana dan zon masa mana, menghantar setiap mesej.

### 2.2 Terjemahan Reaksi Bendera
- **Gambaran Keseluruhan**:  
  - Dalam \`global-chat\`, beri reaksi pada mesej apa pun dengan emoji bendera (🇯🇵🇺🇸🇪🇸, dll.), dan bot akan secara automatik membalas dengan terjemahan ke bahasa yang sepadan.  
  - Contoh: Reaksi dengan 🇯🇵 untuk mendapatkan terjemahan Jepun bagi mesej itu.  
- **Bahasa Disokong** (26 jumlah):  
  \`\`\`
  ja, en, en-GB, zh, zh-TW, ko, es, es-MX, fr, de,
  pt, pt-BR, ru, uk, el, he, ur, ms, es-CO, fa,
  bn, th, vi, hi, id, ar
  \`\`\`  
  - Setiap bahasa dipetakan kepada emoji bendera yang sepadan, jadi reaksi akan memicu terjemahan seketika.  
- **Auto-Translate**:  
  - Dalam saluran \`settings\`, togol **Auto-Translate ON** untuk menjadikan semua mesej baharu \`global-chat\` diterjemah secara automatik ke bahasa pilihan setiap pengguna.  
  - Togol **OFF** untuk melihat hanya teks asal.

---

## 3. Aliran Disyorkan

1. **Ajak Bot ke Pelayan Anda**  
   - Jadikan bot Public dalam Developer Portal, tetapkan skop/​kebenaran OAuth2 dan gunakan pautan jemputan yang dihasilkan.  
   - (Atau, klik butang “Add to Server” pada profil bot jika tersedia.)

2. **Pentadbir Jalankan \`/setup\`**  
   - Pengguna yang memiliki hak Pentadbir menjalankan \`/setup\` untuk:  
     - Membuat kategori “Global Chat” dan menambah saluran \`bot-announcements\`, \`global-chat\` dan \`settings\`.  
     - Mendaftarkan saluran \`global-chat\` secara automatik ke HUB pusat untuk menyambungkan pelayan.

3. **Pengguna Tetapkan Bahasa dalam \`settings\`**  
   - Di dalam \`settings\`, setiap pengguna menetapkan **bahasa lalai** mereka.  
   - Aktifkan atau nyahaktifkan Auto-Translate mengikut kehendak.  
   - Sejak itu, mesej dalam \`global-chat\` akan diterjemah automatik ke bahasa yang dipilih jika Auto-Translate dihidupkan.

4. **Nikmati Sembang Merentas Pelayan**  
   - Hantar mesej dalam \`global-chat\` dan mesej anda akan disiarkan segera ke semua pelayan yang dipautkan.  
   - Dengan Auto-Translate dihidupkan, anda akan melihat mesej orang lain segera dalam bahasa pilihan anda.  
   - Untuk melihat mesej dalam bahasa lain (atau bahasa asal), beri reaksi emoji bendera yang sesuai dan terjemahan akan dihantar segera.

5. **Semak Aktiviti Anda**  
   - Gunakan **\`/profile\`** untuk melihat berapa banyak mesej anda hantar dan berapa 👍 yang anda terima.  
   - Gunakan **\`/ranking messages\`** untuk melihat top 10 pengguna yang hantar mesej terbanyak.  
   - Gunakan **\`/ranking likes\`** untuk melihat top 10 pengguna yang terima 👍 terbanyak.

6. **Pengumuman (Pilihan)**  
   - Pentadbir boleh menghantar pengumuman dalam saluran \`bot-announcements\` untuk menyiarkan maklumat kepada semua pelayan yang mempunyai bot.  
   - Saluran ini biasanya digunakan oleh pemilik bot untuk kemas kini penting.`,
  
  // Tiếng Việt
  'vi': `# Hướng dẫn Global Chat Bot

**Global Chat Bot** là bot Discord được thiết kế để kết nối các kênh cùng tên trên nhiều máy chủ, phá vỡ rào cản ngôn ngữ và tạo ra trải nghiệm trò chuyện chung. Dưới đây là lệnh và tính năng:

---

## 1. Lệnh

### \`/setup\`
- **Tổng quan**: Lệnh cài đặt ban đầu mà quản trị viên máy chủ (Administrator) chạy sau khi mời bot.  
- **Nó làm gì**:  
  1. Tạo một danh mục mới có tên “Global Chat”.  
  2. Dưới danh mục đó, tự động tạo các kênh văn bản sau:  
     - \`bot-announcements\` … Dùng để bot gửi thông báo đến tất cả máy chủ.  
     - \`global-chat\` … Dùng để trò chuyện toàn cầu giữa các máy chủ.  
     - \`settings\` … Dùng để cấu hình cài đặt dịch và múi giờ.  
  3. Đăng ký kênh \`global-chat\` vừa tạo vào HUB trung tâm và tự động gửi yêu cầu kết nối đến các máy chủ khác.  
- **Quyền cần có**: Chỉ Administrator.  
- **Ví dụ**:  
  \`\`\`
  /setup
  \`\`\`

---

### \`/profile\`
- **Tổng quan**: Hiển thị thống kê cho người dùng đã chạy lệnh.  
- **Thông tin hiển thị**:  
  - **Messages Sent**: Tổng số tin nhắn người dùng đã gửi trên máy chủ này.  
  - **Likes Received**: Tổng số phản ứng 👍 người dùng đã nhận.  
- **Quyền cần có**: Bất kỳ người dùng nào trong máy chủ.  
- **Ví dụ**:  
  \`\`\`
  /profile
  \`\`\`

---

### \`/ranking\`
- **Tổng quan**: Hiển thị bảng xếp hạng thành viên máy chủ.  
- **Lệnh con**:  
  1. \`/ranking messages\` … Hiển thị top 10 theo **tổng số tin nhắn đã gửi**.  
  2. \`/ranking likes\` … Hiển thị top 10 theo **tổng số phản ứng 👍 đã nhận**.  
- **Ví dụ hiển thị** (embed message):  
  \`\`\`
  🏆 Top 10 by Messages  
  1. @Alice – 3,450  
  2. @Bob   – 2,982  
  …  
  \`\`\`  
- **Quyền cần có**: Bất kỳ người dùng nào trong máy chủ.  
- **Ví dụ**:  
  \`\`\`
  /ranking messages  
  /ranking likes  
  \`\`\`

---

## 2. Tính năng Global Chat

### 2.1 Chat giữa các máy chủ
- **Cách hoạt động**:  
  - Kênh \`global-chat\` được tạo bằng lệnh \`/setup\` trong mỗi máy chủ sẽ được kết nối qua HUB trung tâm.  
  - Bất kỳ tin nhắn nào đăng trong kênh \`global-chat\` một máy chủ sẽ được **ngay lập tức** chuyển đến cùng một kênh trong tất cả các máy chủ khác đã đăng ký.  
- **Siêu dữ liệu tin nhắn**:  
  - Bot sẽ gửi embed message bao gồm:  
    - **Thẻ tác giả** (ví dụ : \`@User#1234\`)  
    - **Tên máy chủ gốc**  
    - **Độ lệch UTC** (ví dụ : \`UTC+9\`)  
  - Điều này cho phép bạn biết rõ ai, từ máy chủ nào và múi giờ nào đã gửi tin nhắn.

### 2.2 Dịch bằng phản ứng cờ
- **Tổng quan**:  
  - Trong \`global-chat\`, phản ứng với bất kỳ tin nhắn nào bằng emoji cờ (🇯🇵🇺🇸🇪🇸, v.v.) và bot sẽ tự động trả lời bằng bản dịch sang ngôn ngữ tương ứng.  
  - Ví dụ: Phản ứng bằng 🇯🇵 để nhận bản dịch tiếng Nhật của tin nhắn đó.  
- **Ngôn ngữ được hỗ trợ** (tổng cộng 26):  
  \`\`\`
  ja, en, en-GB, zh, zh-TW, ko, es, es-MX, fr, de,
  pt, pt-BR, ru, uk, el, he, ur, ms, es-CO, fa,
  bn, th, vi, hi, id, ar
  \`\`\`  
  - Mỗi ngôn ngữ được ánh xạ tới một emoji cờ tương ứng, vì vậy phản ứng ngay lập tức kích hoạt bản dịch.  
- **Auto-Translate**:  
  - Trong kênh \`settings\`, bật **Auto-Translate ON** để tất cả tin nhắn mới trong \`global-chat\` được tự động dịch sang ngôn ngữ mà mỗi người dùng đã chọn.  
  - Tắt **OFF** để chỉ hiển thị văn bản gốc.

---

## 3. Luồng sử dụng đề xuất

1. **Mời bot vào máy chủ của bạn**  
   - Đặt bot thành Public trong Developer Portal, cấu hình phạm vi và quyền OAuth2, rồi sử dụng liên kết mời đã tạo.  
   - (Hoặc nhấp vào nút “Add to Server” trong hồ sơ bot nếu có)

2. **Admin chạy \`/setup\`**  
   - Người dùng có quyền Administrator chạy \`/setup\` để:  
     - Tạo danh mục “Global Chat” và thêm các kênh \`bot-announcements\`, \`global-chat\` và \`settings\`.  
     - Tự động đăng ký kênh \`global-chat\` vào HUB trung tâm để thiết lập kết nối giữa các máy chủ.

3. **Người dùng cấu hình ngôn ngữ trong kênh \`settings\`**  
   - Trong kênh \`settings\`, mỗi người dùng chọn **ngôn ngữ mặc định** của mình.  
   - Bật hoặc tắt Auto-Translate theo ý muốn.  
   - Từ đó, nếu Auto-Translate được bật thì tin nhắn mới trong \`global-chat\` sẽ tự động được dịch sang ngôn ngữ đã chọn.

4. **Thưởng thức chat giữa các máy chủ**  
   - Đăng tin nhắn trong \`global-chat\` và nó sẽ được phát ngay lập tức đến tất cả các máy chủ đã kết nối.  
   - Với Auto-Translate được bật, bạn sẽ thấy tin nhắn của người khác ngay lập tức bằng ngôn ngữ bạn đã chọn.  
   - Để xem tin nhắn trong ngôn ngữ khác (hoặc ngôn ngữ gốc), phản ứng với emoji cờ tương ứng và nhận bản dịch ngay tức thì.

5. **Kiểm tra hoạt động của bạn**  
   - Sử dụng **\`/profile\`** để xem bạn đã gửi bao nhiêu tin nhắn và nhận bao nhiêu 👍.  
   - Sử dụng **\`/ranking messages\`** để xem top 10 người dùng gửi nhiều tin nhắn nhất.  
   - Sử dụng **\`/ranking likes\`** để xem top 10 người dùng nhận nhiều 👍 nhất.

6. **Thông báo (Tùy chọn)**  
   - Admin có thể đăng thông báo trong kênh \`bot-announcements\` để gửi thông điệp đến tất cả các máy chủ bot đang ở.  
   - Kênh này thường được sử dụng bởi chủ bot cho các bản cập nhật quan trọng.`,
  
  // বাংলা
  'bn': `# গ্লোবাল চ্যাট বট সহায়িকা

**Global Chat Bot** হল একটি Discord বট যা একই নামে বিভিন্ন সার্ভারের চ্যানেল সংযুক্ত করে, ভাষাগত বাধা দূর করে এবং একটি শেয়ারড চ্যাট অভিজ্ঞতা তৈরি করে। নীচে কমান্ড এবং বৈশিষ্ট্যসমূহ দেওয়া হল:

---

## 1. কমান্ডসমূহ

### \`/setup\`
- **সংক্ষিপ্ত বিবরণ**: একটি সার্ভার অ্যাডমিন বটকে আমন্ত্রণ করার পর প্রথমবারের মতো চালানোর জন্য এই ইনিশিয়াল সেটআপ কমান্ড।  
- **এটি যা করে**:  
  1. “Global Chat” নামে একটি নতুন ক্যাটাগরি তৈরি করে।  
  2. সেই ক্যাটাগরির নীচে স্বয়ংক্রিয়ভাবে নিম্নলিখিত টেক্সট চ্যানেলগুলো তৈরি করে:  
     - \`bot-announcements\` … বটের পক্ষ থেকে সব সার্ভারে ঘোষণা পাঠানোর জন্য।  
     - \`global-chat\` … সার্ভারগুলির মধ্যে গ্লোবাল চ্যাটের জন্য।  
     - \`settings\` … অনুবাদ এবং টাইমজোন সেটিংসের জন্য।  
  3. তৈরি করা \`global-chat\` চ্যানেলটিকে সেন্ট্রাল HUB এ রেজিস্টার করে এবং স্বয়ংক্রিয়ভাবে অন্য সার্ভারগুলির সাথে যুক্ত করার অনুরোধ পাঠায়।  
- **আবশ্যকীয় অনুমতি**: শুধুমাত্র অ্যাডমিন।  
- **উদাহরণ**:  
  \`\`\`
  /setup
  \`\`\`

---

### \`/profile\`
- **সংক্ষিপ্ত বিবরণ**: কমান্ড চালানো ব্যবহারকারীর জন্য পরিসংখ্যান দেখায়।  
- **দেখানো তথ্য**:  
  - **Messages Sent**: ব্যবহারকারী এই সার্ভারে যতগুলো বার্তা পাঠিয়েছেন তার মোট সংখ্যা।  
  - **Likes Received**: ব্যবহারকারী যতগুলো 👍 প্রতিক্রিয়া পেয়েছেন তার মোট সংখ্যা।  
- **আবশ্যকীয় অনুমতি**: সার্ভারের যেকোনো ব্যবহারকারী।  
- **উদাহরণ**:  
  \`\`\`
  /profile
  \`\`\`

---

### \`/ranking\`
- **সংক্ষিপ্ত বিবরণ**: সার্ভারের সদস্যদের লিডারবোর্ড দেখায়।  
- **উপ-কমান্ডসমূহ**:  
  1. \`/ranking messages\` … **মোট পাঠানো বার্তা** এর ভিত্তিতে শীর্ষ 10 দেখায়।  
  2. \`/ranking likes\` … **মোট প্রাপ্ত 👍 প্রতিক্রিয়া** এর ভিত্তিতে শীর্ষ 10 দেখায়।  
- **দেখানোর উদাহরণ** (এম্বেড বার্তা):  
  \`\`\`
  🏆 Top 10 by Messages  
  1. @Alice – 3,450  
  2. @Bob   – 2,982  
  …  
  \`\`\`  
- **আবশ্যক:** সার্ভরের যেকোনো ব্যবহারকারী।  
- **উদাহরণসমূহ**:  
  \`\`\`
  /ranking messages  
  /ranking likes  
  \`\`\`

---

## 2. গ্লোবাল চ্যাট বৈশিষ্ট্য

### 2.1 সার্ভার-মধ্যে চ্যাট
- **এটি কীভাবে কাজ করে**:  
  - প্রতিটি সার্ভারে \`/setup\` চালানোর পর তৈরি হওয়া \`global-chat\` চ্যানেলটি সেন্ট্রাল HUB এর মাধ্যমে সংযুক্ত হয়।  
  - কোন সার্ভারের \`global-chat\` এ কোন বার্তা পোস্ট করলে তা **তৎক্ষণাৎ** অন্যান্য সকল রেজিস্টার্ড সার্ভারের একই নামের চ্যানেল এ প্রেরণ করা হয়।  
- **বার্তার মেটাডেটা**:  
  - বট একটি এম্বেড বার্তা হিসেবে পাঠায়, যাতে অন্তর্ভুক্ত থাকে:  
    - **লেখকের ট্যাগ** (যেমন: \`@User#1234\`)  
    - **যে সার্ভার থেকে এসেছে তার নাম**  
    - **UTC অফসেট** (যেমন: \`UTC+9\`)  
  - এর ফলে বোঝা যায়, কোন সার্ভারের কোন ব্যবহারকারী এবং কোন টাইমজোনে বার্তা পাঠিয়েছেন।

### 2.2 পতাকা-প্রতিক্রিয়া অনুবাদ
- **সংক্ষিপ্ত বিবরণ**:  
  - \`global-chat\` এ যেকোনো বার্তায় একটি দেশীয় পতাকার ইমোজি (🇯🇵🇺🇸🇪🇸 ইত্যাদি) দিয়ে প্রতিক্রিয়া দিন, এবং বট স্বয়ংক্রিয়ভাবে ঐ দেশের ভাষায় অনুবাদসহ উত্তর দেবে।  
  - উদাহরণ: 🇯🇵 দিয়ে প্রতিক্রিয়া দিলে বার্তাটির জাপানি অনুবাদ পাবেন।  
- **সহায়তা প্রাপ্ত ভাষাসমূহ** (মোট 26 টি):  
  \`\`\`
  ja, en, en-GB, zh, zh-TW, ko, es, es-MX, fr, de,
  pt, pt-BR, ru, uk, el, he, ur, ms, es-CO, fa,
  bn, th, vi, hi, id, ar
  \`\`\`  
  - প্রতিটি ভাষার সাথে সংশ্লিষ্ট পতাকা ইমোজি ম্যাপ করা হয়েছে, তাই মাত্র প্রতিক্রিয়া দিলে তাৎক্ষণিক অনুবাদ শুরু হয়।  
- **স্বয়ংক্রিয় অনুবাদ (Auto-Translate)**:  
  - \`settings\` চ্যানেলে **Auto-Translate ON** চালু করলে, \`global-chat\` এ সমস্ত নতুন বার্তা স্বয়ংক্রিয়ভাবে প্রতিটি ব্যবহারকারীর নির্বাচিত ভাষায় অনুবাদিত হয়।  
  - **OFF** করলে শুধুমাত্র মূল পাঠ্য দেখায়।

---

## 3. সুপারিশকৃত ব্যবহার প্রবাহ

1. **আপনার সার্ভারে বট আমন্ত্রণ করুন**  
   - Developer Portal এ বটটিকে Public করে, OAuth2 স্কোপ/অনুমতি সেট করে, এবং তৈরি হওয়া আমন্ত্রণ লিঙ্ক ব্যবহার করুন।  
   - (অথবা, যদি উপলব্ধ থাকে তাহলে বটের প্রোফাইলে “Add to Server” বোতামে ক্লিক করুন।)

2. **এডমিন \`/setup\` চালান**  
   - একটি ব্যবহারকারী যার কাছে এডমিন অনুমতি রয়েছে, \`/setup\` চালান যাতে:  
     - “Global Chat” নামে একটি ক্যাটাগরি তৈরি করা হয় এবং \`bot-announcements\`, \`global-chat\` এবং \`settings\` চ্যানেলগুলো যোগ করা হয়।  
     - তৈরি হওয়া \`global-chat\` চ্যানেলটি স্বয়ংক্রিয়ভাবে কেন্দ্রীয় HUB এ রেজিস্টার করা হয় যাতে সার্ভারগুলির মধ্যে সংযোগ স্থাপন করা যায়।

3. **ব্যবহারকারীরা \`settings\` চ্যানেলে তাদের ভাষা সেট করুন**  
   - \`settings\` এ, প্রতিটি ব্যবহারকারী তাদের **ডিফল্ট ভাষা** সেট করবেন।  
   - প্রয়োজন অনুসারে Auto-Translate কে **ON** বা **OFF** করবেন।  
   - এভাবে, যদি Auto-Translate চালু থাকে তাহলে \`global-chat\` এ নতুন কোনো বার্তা স্বয়ংক্রিয়ভাবে নির্বাচিত ভাষায় অনুবাদ হবে।

4. **সার্ভার-মধ্যে চ্যাটে উপভোগ করুন**  
   - \`global-chat\` এ বার্তা পাঠান, এবং আপনার বার্তা তাৎক্ষণিকভাবে সমস্ত সংযুক্ত সার্ভারে সম্প্রচার হবে।  
   - Auto-Translate চালু থাকলে, আপনি অন্যদের বার্তা আপনার নির্বাচিত ভাষায় তৎক্ষণাৎ দেখতে পারবেন।  
   - অন্য কোনো ভাষায় (বা মূল ভাষায়) বার্তা দেখতে, সংশ্লিষ্ট পতাকা ইমোজি দিয়ে প্রতিক্রিয়া দিন এবং অনুবাদ নির্ঘণ্টে পেয়ে যান।

5. **আপনার কার্যকলাপ পর্যবেক্ষণ করুন**  
   - **\`/profile\`** ব্যবহার করে দেখুন আপনি কত বার্তা পাঠিয়েছেন এবং কত 👍 পেয়েছেন।  
   - **\`/ranking messages\`** ব্যবহার করে সার্ভারে সবচেয়ে বেশি বার্তা পাঠানো শীর্ষ 10 ব্যবহারকারী দেখুন।  
   - **\`/ranking likes\`** ব্যবহার করে সবচেয়ে বেশি 👍 গ্রহণকারী শীর্ষ 10 ব্যবহারকারী দেখুন।

6. **ঘোষণা (ঐচ্ছিক)**  
   - এডমিনরা \`bot-announcements\` চ্যানেলে ঘোষণা পোস্ট করতে পারেন যাতে বট যে সমস্ত সার্ভারে রয়েছে সেখানকার সবাই তা দেখেন।  
   - এই চ্যানেলটি সাধারণত বটের মালিক গুরুত্বপূর্ণ আপডেটের জন্য ব্যবহার করেন।`,  

  // ไทย
  'th': `# คู่มือ Global Chat Bot

**Global Chat Bot** คือบอท Discord ที่ออกแบบมาเพื่อเชื่อมต่อช่อง (channel) ที่มีชื่อเหมือนกันในหลายเซิร์ฟเวอร์ ลบกำแพงด้านภาษา และสร้างประสบการณ์การแชทร่วมกัน ด้านล่างนี้คือคำสั่งและคุณสมบัติ:

---

## 1. คำสั่ง

### \`/setup\`
- **ภาพรวม**: คำสั่งตั้งค่าเริ่มต้นที่ผู้ดูแลเซิร์ฟเวอร์ (Administrator) ใช้หลังจากเชิญบอทเข้าเซิร์ฟเวอร์  
- **ทำอะไรบ้าง**:  
  1. สร้างหมวดหมู่ใหม่ชื่อ “Global Chat”  
  2. ใต้หมวดหมู่นั้น สร้างช่องข้อความ (text channels) ต่อไปนี้โดยอัตโนมัติ:  
     - \`bot-announcements\` … สำหรับบอทออกประกาศไปยังทุกเซิร์ฟเวอร์  
     - \`global-chat\` … สำหรับการแชทข้ามเซิร์ฟเวอร์  
     - \`settings\` … สำหรับตั้งค่าการแปลภาษาและโซนเวลา  
  3. ลงทะเบียนช่อง \`global-chat\` ที่สร้างขึ้นกับ HUB กลาง และส่งคำร้องขอเชื่อมต่อไปยังเซิร์ฟเวอร์อื่น ๆ อัตโนมัติ  
- **สิทธิ์ที่ต้องการ**: เฉพาะ Administrator  
- **ตัวอย่าง**:  
  \`\`\`
  /setup
  \`\`\`

---

### \`/profile\`
- **ภาพรวม**: แสดงสถิติผู้ใช้ที่สั่งคำสั่ง  
- **ข้อมูลที่แสดง**:  
  - **Messages Sent**: จำนวนข้อความรวมที่ผู้ใช้ส่งในเซิร์ฟเวอร์นี้  
  - **Likes Received**: จำนวนการกด 👍 ที่ผู้ใช้ได้รับ  
- **สิทธิ์ที่ต้องการ**: ผู้ใช้ใดก็ได้ในเซิร์ฟเวอร์  
- **ตัวอย่าง**:  
  \`\`\`
  /profile
  \`\`\`

---

### \`/ranking\`
- **ภาพรวม**: แสดงตารางอันดับสมาชิกภายในเซิร์ฟเวอร์  
- **คำสั่งย่อย**:  
  1. \`/ranking messages\` … แสดง 10 อันดับแรกโดยพิจารณาจาก **จำนวนข้อความที่ส่งทั้งหมด**  
  2. \`/ranking likes\` … แสดง 10 อันดับแรกโดยพิจารณาจาก **จำนวน 👍 ที่ได้รับรวมทั้งหมด**  
- **ตัวอย่างการแสดง** (embed message):  
  \`\`\`
  🏆 Top 10 by Messages  
  1. @Alice – 3,450  
  2. @Bob   – 2,982  
  …  
  \`\`\`  
- **สิทธิ์ที่ต้องการ**: ผู้ใช้ใดก็ได้ในเซิร์ฟเวอร์  
- **ตัวอย่าง**:  
  \`\`\`
  /ranking messages  
  /ranking likes  
  \`\`\`

---

## 2. คุณสมบัติ Global Chat

### 2.1 แชทข้ามเซิร์ฟเวอร์
- **วิธีการทำงาน**:  
  - ช่อง \`global-chat\` ที่สร้างโดย \`/setup\` ในแต่ละเซิร์ฟเวอร์จะถูกเชื่อมต่อผ่าน HUB กลาง  
  - ข้อความใด ๆ ที่โพสต์ใน \`global-chat\` ของเซิร์ฟเวอร์ใด จะถูกส่ง **ทันที** ไปยังช่องเดียวกันในเซิร์ฟเวอร์อื่นที่ลงทะเบียนไว้ทั้งหมด  
- **เมตาเดตาข้อความ**:  
  - บอทจะส่ง embed message พร้อมข้อมูลดังนี้:  
    - **แท็กผู้ส่ง** (เช่น \`@User#1234\`)  
    - **ชื่อเซิร์ฟเวอร์ต้นทาง**  
    - **UTC Offset** (เช่น \`UTC+9\`)  
  - ช่วยให้ทราบได้อย่างชัดเจนว่า ใคร จากเซิร์ฟเวอร์ไหน และโซนเวลาใด ส่งข้อความนั้น  

### 2.2 การแปลด้วยปฏิกิริยาธง
- **ภาพรวม**:  
  - ใน \`global-chat\` ให้กด react กับข้อความใด ๆ เป็นอีโมจิธง (🇯🇵🇺🇸🇪🇸 ฯลฯ) แล้วบอทจะตอบกลับด้วยข้อความแปลเป็นภาษาของธงนั้นโดยอัตโนมัติ  
  - ตัวอย่าง: react ด้วย 🇯🇵 เพื่อรับการแปลเป็นภาษาญี่ปุ่นของข้อความนั้น  
- **ภาษาที่รองรับ** (รวม 26 ภาษา):  
  \`\`\`
  ja, en, en-GB, zh, zh-TW, ko, es, es-MX, fr, de,
  pt, pt-BR, ru, uk, el, he, ur, ms, es-CO, fa,
  bn, th, vi, hi, id, ar
  \`\`\`  
  - ทุกภาษาเชื่อมกับอีโมจิธงที่สอดคล้องกัน ทำให้การ react จะกระตุ้นการแปลทันที  
- **Auto-Translate**:  
  - ในช่อง \`settings\` ให้เปิด **Auto-Translate ON** เพื่อให้ข้อความใหม่ทั้งหมดใน \`global-chat\` แปลเป็นภาษาที่ผู้ใช้เลือกโดยอัตโนมัติ  
  - ปิด **OFF** เพื่อแสดงเฉพาะข้อความต้นฉบับ  

---

## 3. ขั้นตอนแนะนำ

1. **เชิญบอทเข้าร่วมเซิร์ฟเวอร์**  
   - ตั้งค่าบอทเป็น Public ใน Developer Portal, กำหนด OAuth2 scopes/permissions แล้วใช้ลิงก์เชิญที่สร้างขึ้น  
   - (หรือคลิกปุ่ม “Add to Server” ในโปรไฟล์บอท หากมี)

2. **ผู้ดูแลระบบรันคำสั่ง \`/setup\`**  
   - ผู้ใช้ที่มีสิทธิ์ Administrator รัน \`/setup\` เพื่อ:  
     - สร้างหมวดหมู่ “Global Chat” และเพิ่มช่อง \`bot-announcements\`, \`global-chat\` และ \`settings\`  
     - บอทจะลงทะเบียน \`global-chat\` ใน HUB กลางโดยอัตโนมัติ เพื่อเชื่อมการสนทนาข้ามเซิร์ฟเวอร์

3. **ผู้ใช้ตั้งค่าภาษาในช่อง \`settings\`**  
   - ใน \`settings\` แต่ละผู้ใช้ตั้งค่า **ภาษาตั้งต้น** ของตนเอง  
   - เปิดหรือปิด Auto-Translate ตามต้องการ  
   - ตั้งแต่นั้นเป็นต้นไป หาก Auto-Translate เปิดอยู่ ข้อความใหม่ใน \`global-chat\` จะถูกแปลเป็นภาษาที่ตั้งไว้โดยอัตโนมัติ

4. **เพลิดเพลินกับการสนทนาข้ามเซิร์ฟเวอร์**  
   - พิมพ์ข้อความใน \`global-chat\` แล้วข้อความจะกระจายไปยังเซิร์ฟเวอร์อื่นทั้งหมดทันที  
   - หาก Auto-Translate เปิดอยู่ คุณจะเห็นข้อความของผู้อื่นเป็นภาษาที่คุณเลือกทันที  
   - หากต้องการดูข้อความในภาษาต้นฉบับหรือภาษาอื่น ให้ react ด้วยอีโมจิธงที่ตรงกัน แล้วรับการแปลทันที

5. **ตรวจสอบกิจกรรมของคุณ**  
   - ใช้ **\`/profile\`** เพื่อตรวจสอบว่าคุณส่งข้อความไปกี่ครั้งและได้รับ 👍 ไปกี่ครั้ง  
   - ใช้ **\`/ranking messages\`** เพื่อตรวจสอบ 10 ผู้ใช้ที่ส่งข้อความมากที่สุด  
   - ใช้ **\`/ranking likes\`** เพื่อตรวจสอบ 10 ผู้ใช้ที่ได้รับ 👍 มากที่สุด  

6. **ประกาศ (ตัวเลือก)**  
   - ผู้ดูแลระบบสามารถโพสต์ประกาศในช่อง \`bot-announcements\` เพื่อส่งประกาศไปยังทุกเซิร์ฟเวอร์ที่บอทอยู่  
   - ช่องนี้มักใช้งานโดยเจ้าของบอทสำหรับการอัปเดตสำคัญ`,  

  // हिंदी
  'hi': `# ग्लोबल चैट बॉट सहायता

**Global Chat Bot** एक Discord बॉट है जो एक ही नाम वाले चैनलों को कई सर्वरों पर जोड़ता है, भाषा की बाधाओं को पार करता है और एक साझा चैट अनुभव बनाता है। नीचे इसके कमांड और सुविधाओं की जानकारी दी गई है:

---

## 1. कमांड

### \`/setup\`
- **सारांश**: प्रारंभिक सेटअप कमांड जिसे सर्वर व्यवस्थापक बॉट को आमंत्रित करने के बाद चलाते हैं।  
- **यह क्या करता है**:  
  1. “Global Chat” नामक एक नई श्रेणी बनाता है।  
  2. उस श्रेणी के अंतर्गत स्वचालित रूप से निम्नलिखित टेक्स्ट चैनल बनाता है:  
     - \`bot-announcements\` … सभी सर्वरों को बॉट से घोषणाएँ भेजने के लिए।  
     - \`global-chat\` … सर्वरों के बीच ग्लोबल चैट के लिए।  
     - \`settings\` … अनुवाद और टाइमज़ोन सेटिंग्स के लिए।  
  3. बनाए गए \`global-chat\` चैनल को केंद्रीय HUB में पंजीकृत करता है और दूसरे सर्वरों से जुड़ने का अनुरोध स्वचालित रूप से भेजता है।  
- **अनुमतियाँ आवश्यक**: केवल व्यवस्थापक (Administrator)।  
- **उदाहरण**:  
  \`\`\`
  /setup
  \`\`\`

---

### \`/profile\`
- **सारांश**: उस उपयोगकर्ता के लिए सांख्यिकी दिखाता है जिसने कमांड चलाया।  
- **दिखाई जाने वाली जानकारी**:  
  - **Messages Sent**: उस सर्वर पर उपयोगकर्ता द्वारा भेजे गए कुल संदेशों की संख्या।  
  - **Likes Received**: उपयोगकर्ता को प्राप्त कुल 👍 प्रतिक्रियाओं की संख्या।  
- **अनुमतियाँ आवश्यक**: सर्वर में कोई भी उपयोगकर्ता।  
- **उदाहरण**:  
  \`\`\`
  /profile
  \`\`\`

---

### \`/ranking\`
- **सारांश**: सर्वर सदस्यों की लीडरबोर्ड दिखाता है।  
- **सब-कमांड**:  
  1. \`/ranking messages\` … **कुल भेजे गए संदेश** के आधार पर शीर्ष 10 दिखाता है।  
  2. \`/ranking likes\` … **कुल प्राप्त 👍 प्रतिक्रियाओं** के आधार पर शीर्ष 10 दिखाता है।  
- **दिखावट का उदाहरण** (एम्बेड संदेश):  
  \`\`\`
  🏆 Top 10 by Messages  
  1. @Alice – 3,450  
  2. @Bob   – 2,982  
  …  
  \`\`\`  
- **अनुमतियाँ आवश्यक**: सर्वर में कोई भी उपयोगकर्ता।  
- **उदाहरण**:  
  \`\`\`
  /ranking messages  
  /ranking likes  
  \`\`\`

---

## 2. ग्लोबल चैट सुविधाएँ

### 2.1 सर्वर-के-पार चैट
- **यह कैसे काम करता है**:  
  - प्रत्येक सर्वर में \`/setup\` द्वारा बनाया गया \`global-chat\` चैनल एक केंद्रीय HUB के माध्यम से जुड़ा होता है।  
  - जब भी किसी सर्वर के \`global-chat\` में कोई संदेश पोस्ट किया जाता है, तो वह **तुरंत** सभी अन्य पंजीकृत सर्वरों के उसी नाम वाले चैनל पर अग्रेषित हो जाता है।  
- **संदेश मेटाडेटा**:  
  - बॉट एक एम्बेड के रूप में संदेश भेजता है, जिसमें निम्नलिखित शामिल होते हैं:  
    - **लेखक टैग** (उदा.: \`@User#1234\`)  
    - **मूल सर्वर का नाम**  
    - **UTC ऑफ़सेट** (उदा.: \`UTC+9\`)  
  - इससे स्पष्ट होता है कि किसने, कौन से सर्वर से और किस टाइमज़ोन से संदेश भेजा।

### 2.2 ध्वज-प्रतिक्रिया अनुवाद
- **सारांश**:  
  - \`global-chat\` में किसी भी संदेश पर देश का ध्वज इमोजी (🇯🇵🇺🇸🇪🇸, आदि) के साथ प्रतिक्रिया करें, और बॉट स्वचालित रूप से उस देश की भाषा में अनुवाद के साथ उत्तर देगा।  
  - उदाहरण: 🇯🇵 के साथ प्रतिक्रिया देने से संदेश का जापानी अनुवाद प्राप्त करें।  
- **समर्थित भाषाएँ** (कुल 26):  
  \`\`\`
  ja, en, en-GB, zh, zh-TW, ko, es, es-MX, fr, de,
  pt, pt-BR, ru, uk, el, he, ur, ms, es-CO, fa,
  bn, th, vi, hi, id, ar
  \`\`\`  
  - प्रत्येक भाषा को संबंधित ध्वज इमोजी से मैप किया गया है, इसलिए प्रतिक्रिया करने से तत्काल अनुवाद सक्रिय हो जाता है।  
- **स्वचालित अनुवाद (Auto-Translate)**:  
  - \`settings\` चैनल में **Auto-Translate ON** सक्षम करें ताकि \`global-chat\` में सभी नए संदेश स्वचालित रूप से प्रत्येक उपयोगकर्ता की चुनी गई भाषा में अनुवादित हो जाएँ।  
  - **OFF** केवल मूल पाठ दिखाएगा।

---

## 3. अनुशंसित वर्कफ़्लो

1. **बॉट को अपने सर्वर में आमंत्रित करें**  
   - Developer Portal में बॉट को Public सेट करें, OAuth2 scopes/permissions कॉन्फ़िगर करें, और उत्पन्न आमंत्रण लिंक का उपयोग करें।  
   - (या यदि उपलब्ध हो तो बॉट की प्रोफ़ाइल में “Add to Server” बटन पर क्लिक करें।)

2. **एडमिन \`/setup\` को चलाएं**  
   - एक उपयोगकर्ता जिसके पास एडमिन अधिकार ह जो \`/setup\` को चलाए ताकि:  
     - “Global Chat” श्रेणी बनाई जाए और चैनल \`bot-announcements\`, \`global-chat\`, और \`settings\` जोड़े जाएँ।  
     - बनाए गए \`global-chat\` चैनल को केंद्रीय HUB में स्वचालित रूप से पंजीकृत किया जाए ताकि सर्वरों के बीच कनेक्शन स्थापित हो सके।

3. **उपयोगकर्ता \`settings\` चैनल में भाषा सेट करें**  
   - \`settings\` में प्रत्येक उपयोगकर्ता अपनी **डिफ़ॉल्ट भाषा** सेट करता है।  
   - Auto-Translate को **ON** या **OFF** में सेट करें।  
   - इसके बाद, यदि Auto-Translate सक्षम है, तो \`global-chat\` में सभी नए संदेश स्वचालित रूप से चुनी गई भाषा में अनुवादित होंगे।

4. **सर्वर-के-पार चैट का आनंद लें**  
   - \`global-chat\` में संदेश भेजें, और वह संदेश तुरंत सभी जुड़े हुए सर्वरों में प्रसारित हो जाएगा।  
   - Auto-Translate सक्षम होने पर, आप दूसरों के संदेश अपनी चुनी हुई भाषा में तुरंत देखेंगे।  
   - किसी अन्य भाषा (या मूल) में संदेश देखने के लिए, संबंधित ध्वज इमोजी के साथ प्रतिक्रिया करें और तुरंत अनुवाद प्राप्त करें।

5. **अपनी गतिविधि जांचें**  
   - **\`/profile\`** का उपयोग करें ताकि यह देखें कि आपने कितने संदेश भेजे और कितने 👍 प्राप्त किए।  
   - **\`/ranking messages\`** का उपयोग करें ताकि सर्वर में सबसे अधिक संदेश भेजने वाले शीर्ष 10 उपयोगकर्ताओं को देखें।  
   - **\`/ranking likes\`** का उपयोग करें ताकि सर्वर में सबसे अधिक 👍 प्राप्त करने वाले शीर्ष 10 उपयोगकर्ताओं को देखें।

6. **घोषणाएँ (वैकल्पिक)**  
   - एडमिन \`bot-announcements\` चैनल में घोषणाएँ पोस्ट कर सकते हैं ताकि उन सभी सर्वरों में सूचना भेजी जा सके जहां बॉट उपस्थित है।  
   - यह चैनल आम तौर पर बॉट के मालिक द्वारा महत्वपूर्ण अपडेट के लिए उपयोग किया जाता है।`,

  // فارسی
  'fa': `# راهنمای Global Chat Bot

**Global Chat Bot** یک بات Discord است که برای متصل کردن کانال‌هایی با نام یکسان در چندین سرور طراحی شده تا موانع زبانی را از بین ببرد و تجربه چت مشترکی را فراهم کند. در ادامه دستورات و قابلیت‌ها آورده شده است:

---

## 1. دستورات

### \`/setup\`
- **مرور کلی**: دستور راه‌اندازی اولیه که یک ادمین سرور پس از دعوت کردن بات اجرا می‌کند.  
- **کارهایی که انجام می‌دهد**:  
  1. یک دسته‌بندی جدید با نام “Global Chat” ایجاد می‌کند.  
  2. زیر آن دسته‌بندی، به‌طور خودکار کانال‌های متنی زیر را ایجاد می‌کند:  
     - \`bot-announcements\` … برای انتشار اعلان‌های بات در تمام سرورها.  
     - \`global-chat\` … برای چت جهانی در بین سرورها.  
     - \`settings\` … برای تنظیم تنظیمات ترجمه و منطقه زمانی.  
  3. کانال \`global-chat\` ایجاد‌شده را در HUB مرکزی ثبت می‌کند و به‌طور خودکار درخواست پیوند دادن به سایر سرورها را ارسال می‌کند.  
- **مجوزهای مورد نیاز**: فقط ادمین (Administrator).  
- **مثال**:  
  \`\`\`
  /setup
  \`\`\`

---

### \`/profile\`
- **مرور کلی**: آمار کاربری را که این دستور را اجرا کرده است نشان می‌دهد.  
- **اطلاعات نمایش داده‌شده**:  
  - **Messages Sent**: تعداد کل پیام‌هایی که کاربر در این سرور ارسال کرده است.  
  - **Likes Received**: تعداد کل واکنش‌های 👍 که کاربر دریافت کرده است.  
- **مجوزهای مورد نیاز**: هر کاربر در سرور.  
- **مثال**:  
  \`\`\`
  /profile
  \`\`\`

---

### \`/ranking\`
- **مرور کلی**: جدول رده‌بندی اعضای سرور را نمایش می‌دهد.  
- **زیر‌دستورات**:  
  1. \`/ranking messages\` … **تعداد کل پیام‌های ارسال‌شده** بر اساس آن، 10 نفر برتر را نشان می‌دهد.  
  2. \`/ranking likes\` … **تعداد کل واکنش‌های 👍 دریافت‌شده** بر اساس آن، 10 نفر برتر را نشان می‌دهد.  
- **مثال نمایش** (پیام embed):  
  \`\`\`
  🏆 Top 10 by Messages  
  1. @Alice – 3,450  
  2. @Bob   – 2,982  
  …  
  \`\`\`  
- **مجوزهای مورد نیاز**: هر کاربر در سرور.  
- **مثال‌ها**:  
  \`\`\`
  /ranking messages  
  /ranking likes  
  \`\`\`

---

## 2. قابلیت‌های گلوبل چت

### 2.1 چت بین‌سروری
- **نحوه کار**:  
  - کانال \`global-chat\` که توسط \`/setup\` در هر سرور ایجاد شده است، از طریق یک HUB مرکزی متصل می‌شود.  
  - هر پیامی که در یک سرور در \`global-chat\` ارسال شود، **فوری** به همان کانال در تمام سرورهای ثبت‌شده دیگر فوروارد می‌شود.  
- **متادیتای پیام**:  
  - بات یک embed ارسال می‌کند که شامل موارد زیر است:  
    - **تگ نویسنده** (مثال: \`@User#1234\`)  
    - **نام سرور مبدا**  
    - **شیفت UTC** (مثال: \`UTC+9\`)  
  - این به‌وضوح نشان می‌دهد که چه کسی، از کدام سرور و در چه منطقه زمانی، پیام را ارسال کرده است.

### 2.2 ترجمه با واکنش پرچم
- **مرور کلی**:  
  - در \`global-chat\`، به هر پیام با یک ایموجی پرچم کشور (🇯🇵🇺🇸🇪🇸 و غیره) واکنش نشان دهید و بات به‌طور خودکار با ترجمه به زبان مربوطه پاسخ می‌دهد.  
  - مثال: واکنش با 🇯🇵 برای دریافت ترجمه ژاپنی پیام.  
- **زبان‌های پشتیبانی‌شده** (در مجموع 26):  
  \`\`\`
  ja, en, en-GB, zh, zh-TW, ko, es, es-MX, fr, de,
  pt, pt-BR, ru, uk, el, he, ur, ms, es-CO, fa,
  bn, th, vi, hi, id, ar
  \`\`\`  
  - هر زبان به ایموجی پرچم مربوطه نگاشت می‌شود و واکنش دادن بلافاصله ترجمه را فعال می‌کند۔  
- **ترجمه خودکار (Auto-Translate)**:  
  - در کانال \`settings\`، **Auto-Translate ON** را فعال کنید تا همه پیام‌های جدید \`global-chat\` به‌طور خودکار به زبان انتخابی هر کاربر ترجمه شوند।  
  - **OFF** فقط متن اصلی را نمایش می‌دهد۔

---

## 3. جریان پیشنهادی

1. **دعوت بوٹ به سرور خود**  
   - در Developer Portal بوٹ را به حالت Public تبدیل کنید، مجوزهای OAuth2 را تنظیم کرده و از لینک دعوت تولید شده استفاده کنید۔  
   - (یا اگر در پروفایل بوٹ موجود باشد، روی دکمه “Add to Server” کلیک کنید۔)

2. **ادمین \`/setup\` را اجرا می‌کند**  
   - کاربری که دارای حق ادمین است \`/setup\` را اجرا می‌کند تا:  
     - یک دسته‌بندی “Global Chat” ایجاد کند و کانال‌های \`bot-announcements\`, \`global-chat\` و \`settings\` را اضافه کند।  
     - کانال \`global-chat\` ایجادشده را به‌طور خودکار در HUB مرکزی ثبت کند تا اتصال بین سرورها برقرار شود۔

3. **کاربران زبان خود را در کانال \`settings\` تنظیم می‌کنند**  
   - در \`settings\` هر کاربر **زبان پیش‌فرض** خود را تعیین می‌کند۔  
   - اگر نیاز دارید، Auto-Translate را **ON** یا **OFF** کنید۔  
   - از آن پس، اگر Auto-Translate فعال باشد، پیام‌های جدید در \`global-chat\` به‌طور خودکار به زبان انتخابی ترجمه خواهند شد۔

4. **از چت بین سرورها لذت ببرید**  
   - در \`global-chat\` پیغام ارسال کنید و آن بلافاصله پراکنده خواهد شد به همه سرورهای متصل।  
   - با فعال‌سازی Auto-Translate، فورا می‌توانید پیام‌های دیگران را در زبان انتخابی خود ببینید।  
   - برای دیدن پیغام به زبان دیگر (یا اصلی)، با ایموجی پرچم مناسب واکنش نشان دهید و ترجمه را بلافاصله دریافت کنید।

5. **فعالیت خود را بررسی کنید**  
   - از **\`/profile\`** استفاده کنید تا ببینید چند پیام ارسال کرده‌اید و چند 👍 دریافت کرده‌اید۔  
   - از **\`/ranking messages\`** استفاده کنید تا 10 کاربری را که بیشترین پیام ارسال کرده‌اند، ببینید۔  
   - از **\`/ranking likes\`** استفاده کنید تا 10 کاربری را که بیشترین 👍 دریافت کرده‌اند، ببینید।

6. **اعلانات (اختیاری)**  
   - ادمین‌ها می‌توانند در کانال \`bot-announcements\` اعلانات منتشر کنند تا به همه سرورهایی که بوٹ در آن‌ها حضور دارد اطلاع داده شود۔  
   - این کانال معمولاً توسط مالک بوٹ برای بروزرسانی‌های مهم استفاده می‌شود۔`,

  // Bahasa Indonesia
  'id': `# Panduan Global Chat Bot

**Global Chat Bot** adalah bot Discord yang dirancang untuk menyambungkan saluran dengan nama yang sama di beberapa server, menghilangkan hambatan bahasa dan menciptakan pengalaman chat bersama. Berikut ini adalah perintah dan fitur-fitur:

---

## 1. Perintah

### \`/setup\`
- **Gambaran Umum**: Perintah konfigurasi awal yang dijalankan oleh administrator server setelah mengundang bot.  
- **Fungsinya**:  
  1. Membuat kategori baru bernama “Global Chat”.  
  2. Di bawah kategori tersebut, secara otomatis membuat saluran teks berikut:  
     - \`bot-announcements\` … Untuk siaran pengumuman dari bot ke semua server.  
     - \`global-chat\` … Untuk chat global antar server.  
     - \`settings\` … Untuk mengatur preferensi terjemahan dan zona waktu.  
  3. Mendaftarkan saluran \`global-chat\` yang dibuat ke HUB pusat dan secara otomatis mengirim permintaan untuk menghubungkannya ke server lain.  
- **Izin Diperlukan**: Administrator saja.  
- **Contoh**:  
  \`\`\`
  /setup
  \`\`\`

---

### \`/profile\`
- **Gambaran Umum**: Menampilkan statistik untuk pengguna yang menjalankan perintah.  
- **Informasi yang Ditampilkan**:  
  - **Messages Sent**: Total jumlah pesan yang dikirim pengguna di server ini.  
  - **Likes Received**: Total jumlah reaksi 👍 yang diterima pengguna.  
- **Izin Diperlukan**: Semua pengguna di server.  
- **Contoh**:  
  \`\`\`
  /profile
  \`\`\`

---

### \`/ranking\`
- **Gambaran Umum**: Menampilkan papan peringkat anggota server.  
- **Sub-perintah**:  
  1. \`/ranking messages\` … Menampilkan 10 teratas berdasarkan **total pesan yang dikirim**.  
  2. \`/ranking likes\` … Menampilkan 10 teratas berdasarkan **total reaksi 👍 yang diterima**.  
- **Contoh Tampilan** (embed message):  
  \`\`\`
  🏆 Top 10 by Messages  
  1. @Alice – 3,450  
  2. @Bob   – 2,982  
  …  
  \`\`\`  
- **Izin Diperlukan**: Semua pengguna di server.  
- **Contoh**:  
  \`\`\`
  /ranking messages  
  /ranking likes  
  \`\`\`

---

## 2. Fitur Global Chat

### 2.1 Chat Antara Server
- **Cara Kerja**:  
  - Saluran \`global-chat\` yang dibuat dengan \`/setup\` di setiap server dihubungkan melalui HUB pusat.  
  - Setiap pesan yang diposting di \`global-chat\` satu server akan **segera** diteruskan ke saluran yang sama di semua server terdaftar lainnya.  
- **Metadata Pesan**:  
  - Bot mengirim embed message yang mencakup:  
    - **Tag Pengirim** (misalnya, \`@User#1234\`)  
    - **Nama Server Asal**  
    - **Offset UTC** (misalnya, \`UTC+9\`)  
  - Ini menampilkan dengan jelas siapa, dari server mana, dan zona waktu mana yang mengirim pesan tersebut.

### 2.2 Terjemahan dengan Reaksi Bendera
- **Gambaran Umum**:  
  - Di \`global-chat\`, beri reaksi pada pesan apa pun dengan emoji bendera (🇯🇵🇺🇸🇪🇸, dll.) dan bot akan secara otomatis membalas dengan terjemahan ke bahasa yang sesuai.  
  - Contoh: Reaksi dengan 🇯🇵 untuk mendapatkan terjemahan bahasa Jepang dari pesan tersebut.  
- **Bahasa yang Didukung** (total 26):  
  \`\`\`
  ja, en, en-GB, zh, zh-TW, ko, es, es-MX, fr, de,
  pt, pt-BR, ru, uk, el, he, ur, ms, es-CO, fa,
  bn, th, vi, hi, id, ar
  \`\`\`  
  - Setiap bahasa dipetakan ke emoji bendera yang sesuai, sehingga bereaksi memicu terjemahan seketika.  
- **Auto-Translate**:  
  - Di saluran \`settings\`, aktifkan **Auto-Translate ON** agar semua pesan baru di \`global-chat\` diterjemahkan otomatis ke bahasa pilihan setiap pengguna.  
  - Nonaktifkan **OFF** untuk melihat hanya teks asli.

---

## 3. Alur yang Direkomendasikan

1. **Undang Bot ke Server Anda**  
   - Jadikan bot publik di Developer Portal, atur skop/perizinan OAuth2, dan gunakan tautan undangan yang dihasilkan.  
   - (Atau klik tombol “Add to Server” di profil bot jika tersedia.)

2. **Admin Menjalankan \`/setup\`**  
   - Pengguna dengan hak Administrator menjalankan \`/setup\` untuk:  
     - Membuat kategori “Global Chat” dan menambahkan saluran \`bot-announcements\`, \`global-chat\`, dan \`settings\`.  
     - Mendaftarkan saluran \`global-chat\` secara otomatis ke HUB pusat untuk menghubungkan antar server.

3. **Pengguna Mengatur Bahasa di Saluran \`settings\`**  
   - Di \`settings\`, setiap pengguna memilih **bahasa default** mereka.  
   - Aktifkan atau nonaktifkan Auto-Translate sesuai keinginan.  
   - Sejak itu, pesan di \`global-chat\` akan diterjemahkan otomatis ke bahasa yang dipilih jika Auto-Translate diaktifkan.

4. **Nikmati Chat Antar Server**  
   - Posting pesan di \`global-chat\` dan pesan Anda akan segera disiarkan ke semua server yang terhubung.  
   - Dengan Auto-Translate diaktifkan, Anda akan langsung melihat pesan orang lain dalam bahasa pilihan Anda.  
   - Untuk melihat pesan dalam bahasa lain (atau teks aslinya), bereaksi dengan emoji bendera yang sesuai dan terjemahan akan langsung muncul.

5. **Periksa Aktivitas Anda**  
   - Gunakan **\`/profile\`** untuk melihat berapa pesan yang telah Anda kirim dan berapa 👍 yang telah Anda terima.  
   - Gunakan **\`/ranking messages\`** untuk melihat 10 pengguna teratas berdasarkan jumlah pesan yang dikirim.  
   - Gunakan **\`/ranking likes\`** untuk melihat 10 pengguna teratas berdasarkan jumlah 👍 yang mereka terima.

6. **Pengumuman (Opsional)**  
   - Admin dapat memposting pengumuman di saluran \`bot-announcements\` untuk mengirim pesan ke semua server di mana bot berada.  
   - Saluran ini biasanya digunakan oleh pemilik bot untuk pembaruan penting.`,
  
  // العربية
  'ar': `# مساعدة بوت Global Chat

**Global Chat Bot** هو بوت Discord مصمم لربط القنوات التي تحمل نفس الاسم عبر عدة خوادم، متجاوزًا حواجز اللغة وموفرًا تجربة دردشة مشتركة. فيما يلي الأوامر والوظائف:

---

## 1. الأوامر

### \`/setup\`
- **نظرة عامة**: أمر الإعداد الأولي الذي يشغله مسؤول الخادم بعد دعوة البوت.  
- **ما يفعله**:  
  1. ينشئ فئة جديدة باسم “Global Chat”.  
  2. تحت تلك الفئة، ينشئ تلقائيًا القنوات النصية التالية:  
     - \`bot-announcements\` … لبث الإعلانات من البوت إلى جميع الخوادم.  
     - \`global-chat\` … للدردشة العالمية بين الخوادم.  
     - \`settings\` … لتكوين تفضيلات الترجمة والمنطقة الزمنية.  
  3. يسجل قناة \`global-chat\` التي تم إنشاؤها في الـ HUB المركزي ويرسل تلقائيًا طلبًا لربطها بالخوادم الأخرى.  
- **الأذونات المطلوبة**: المسؤول فقط (Administrator).  
- **مثال**:  
  \`\`\`
  /setup
  \`\`\`

---

### \`/profile\`
- **نظرة عامة**: يعرض إحصائيات المستخدم الذي نفذ الأمر.  
- **المعلومات المعروضة**:  
  - **Messages Sent**: إجمالي عدد الرسائل التي أرسلها المستخدم في هذا الخادم.  
  - **Likes Received**: إجمالي عدد ردود 👍 التي تلقاها المستخدم.  
- **الأذونات المطلوبة**: أي مستخدم في الخادم.  
- **مثال**:  
  \`\`\`
  /profile
  \`\`\`

---

### \`/ranking\`
- **نظرة عامة**: يعرض لائحة الترتيب لأعضاء الخادم.  
- **الأوامر الفرعية**:  
  1. \`/ranking messages\` … يعرض أفضل 10 بناءً على **إجمالي الرسائل المرسلة**.  
  2. \`/ranking likes\` … يعرض أفضل 10 بناءً على **إجمالي ردود 👍 التي تم تلقيها**.  
- **مثال عرض** (رسالة مضمنة embed):  
  \`\`\`
  🏆 Top 10 by Messages  
  1. @Alice – 3,450  
  2. @Bob   – 2,982  
  …  
  \`\`\`  
- **الأذونات المطلوبة**: أي مستخدم في الخادم.  
- **أمثلة**:  
  \`\`\`
  /ranking messages  
  /ranking likes  
  \`\`\`

---

## 2. ميزات الدردشة العالمية

### 2.1 الدردشة عبر الخوادم
- **كيف يعمل**:  
  - قناة \`global-chat\` التي تم إنشاؤها باستخدام \`/setup\` في كل خادم مرتبطة عبر HUB مركزي.  
  - أي رسالة يتم نشرها في \`global-chat\` على خادم ما يتم إعادة توجيهها **فوريًا** إلى نفس القناة في جميع الخوادم المسجلة الأخرى.  
- **بيانات تعريف الرسالة metadata**:  
  - يرسل البوت رسالة مضمنة embed تتضمن:  
    - **علامة الكاتب** (مثل \`@User#1234\`)  
    - **اسم الخادم الأصلي**  
    - **إزاحة UTC** (مثل \`UTC+9\`)  
  - يوضح ذلك بوضوح من، ومن أي خادم، وفي أي نطاق زمني أرسل كل رسالة.

### 2.2 الترجمة بواسطة تفاعل العلم
- **نظرة عامة**:  
  - في \`global-chat\`, قم بالتفاعل مع أي رسالة باستخدام رمز تعبيري للعلم (🇯🇵🇺🇸🇪🇸, إلخ) وسيقوم البوت بالرد تلقائيًا بترجمة إلى اللغة المطابقة.  
  - مثال: قم بالتفاعل ب🇯🇵 للحصول على ترجمة يابانية للرسالة.  
- **اللغات المدعومة** (26 لغة إجماليًا):  
  \`\`\`
  ja, en, en-GB, zh, zh-TW, ko, es, es-MX, fr, de,
  pt, pt-BR, ru, uk, el, he, ur, ms, es-CO, fa,
  bn, th, vi, hi, id, ar
  \`\`\`  
  - يتم تعيين كل لغة إلى رمز تعبيري علم متوافق، لذا يؤدي التفاعل إلى تنشيط الترجمة على الفور.  
- **الترجمة التلقائية Auto-Translate**:  
  - في قناة \`settings\`, شغل **Auto-Translate ON** لجعل جميع الرسائل الجديدة في \`global-chat\` تُترجم تلقائيًا إلى لغة اختيار كل مستخدم.  
  - قم بإيقاف تشغيل **OFF** لعرض النص الأصلي فقط.`,

  // 日本語と英語のテキストはすでに示したため省略していますが、実際には26言語分すべてを上記のように記述します。
};
export default {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Get help in 26 languages'),

  async execute(interaction) {
    // 言語選択用セレクトメニューを生成
    const options = LANG_CHOICES;

    const selectMenu = new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('select_help_language')
          .setPlaceholder('Please select the language you want to display')
          .addOptions(
            options.map(opt => ({
              label: opt.label,
              value: opt.value,
              emoji: opt.emoji,
            }))
          )
      );

    await interaction.reply({
      content: 'Please select the language you want to display.',
      components: [selectMenu],
      ephemeral: true,
    });
  }
};
