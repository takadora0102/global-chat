/**
 * index.js – Global Chat Bot
 *  (2025-07-XX: 画像返信対応＆Auto-Translate 再検証版)
 *
 * ＜主な変更点＞
 *  1. MessageCreate→「返信(Reply)として引用されたメッセージ」が画像だった場合も画像の URL を埋め込む
 *  2. /relay 処理にデバッグ用ログを追加し、Redis から読まれる destLang・autoOnが正しく取得できているかを確認
 *  3. 条件を満たす場合にきちんと Google 翻訳を呼び出して、翻訳済みテキストを送信するように修正
 */

import 'dotenv/config';
import {
  Client,
  IntentsBitField,
  Events,
  PermissionFlagsBits,
  OverwriteType,
  ChannelType,
  MessageFlags,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} from 'discord.js';
import express from 'express';
import bodyParser from 'body-parser';
import { randomUUID } from 'crypto';
import { Redis } from '@upstash/redis';
import {
  FLAG_TO_LANG,
  REGIONS,
  REGION_LANGS,
  CHANNEL_NAME_SETUP,
  SETUP_PASSWORD,
  RATE_LIMIT_RPM,
  RATE_LIMIT_RPD,
  FALLBACK_API_URL
} from './constants.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* ────────── 0. 環境変数チェック ────────── */
for (const k of [
  'DISCORD_TOKEN',
  'HUB_ENDPOINT',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'SUPPORT_SERVER_URL',
  'NEWS_SOURCE',
  'GEMINI_API_KEY'
]) {
  if (!process.env[k]) {
    console.error(`❌ Missing env: ${k}`);
    process.exit(1);
  }
}
const NEWS_SOURCE = process.env.NEWS_SOURCE;

/* ────────── 1. Redis & Client 初期化 ────────── */
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN
});
const client = new Client({
  intents: [
    IntentsBitField.Flags.Guilds,
    IntentsBitField.Flags.GuildMessages,
    IntentsBitField.Flags.MessageContent,
    IntentsBitField.Flags.GuildMessageReactions
  ],
  partials: ['MESSAGE', 'CHANNEL', 'REACTION']
});

/* ────────── 2. ヘルパー関数 ────────── */
const kMsg = (u) => `msg_cnt:${u}`;
const kLike = (u) => `like_cnt:${u}`;

// ---- Translation Utilities ----
async function callFreeTranslateAPI(text, lang) {
  const url = `${FALLBACK_API_URL}&tl=${lang}&q=${encodeURIComponent(text)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('translate api fail');
  const j = await r.json();
  return j[0].map((v) => v[0]).join('');
}

async function callGeminiTranslateAPI(text, lang) {
  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const payload = {
    contents: [{
      role: 'user',
      parts: [{ text: `Translate the following text to ${lang}:\n\n${text}` }]
    }]
  };
  const r = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!r.ok) throw new Error(`gemini api fail: ${r.status}`);
  const j = await r.json();
  const parts = j.candidates?.[0]?.content?.parts || [];
  return parts.map(p => p.text).join('');
}

async function checkGeminiRate(guildId) {
  try {
    const rpmKey = `gemini:rpm:${guildId}`;
    const rpmCount = await redis.incr(rpmKey);
    if (rpmCount === 1) await redis.expire(rpmKey, 60);

    const today = new Date().toISOString().slice(0, 10);
    const rpdKey = `gemini:rpd:${guildId}:${today}`;
    const rpdCount = await redis.incr(rpdKey);
    if (rpdCount === 1) await redis.expire(rpdKey, 86400);

    return rpmCount <= RATE_LIMIT_RPM && rpdCount <= RATE_LIMIT_RPD;
  } catch (e) {
    console.error('rate limit check error:', e);
    return false;
  }
}

async function translate(text, lang, guildId) {
  let useGemini = false;
  try {
    const flag = await redis.get(`gemini:enabled:${guildId}`);
    if (flag === 'true') {
      const within = await checkGeminiRate(guildId);
      if (within) useGemini = true;
    }
  } catch (e) {
    console.error('gemini check error:', e);
  }

  if (useGemini) {
    try {
      return await callGeminiTranslateAPI(text, lang);
    } catch (e) {
      console.error('gemini api error, falling back:', e);
    }
  }
  return await callFreeTranslateAPI(text, lang);
}

/* Relay Embed ビルダー */
function buildRelayEmbed({ userTag, originGuild, tz, userAvatar, content, userId, auto, reply }) {
  const sign = tz >= 0 ? '+' + tz : tz;
  const eb = new EmbedBuilder()
    .setAuthor({ name: `${userTag} [${originGuild} UTC${sign}]`, iconURL: userAvatar })
    .setFooter({ text: `UID:${userId} 🌐 global chat${auto ? ' • auto-translated' : ''}` })
    .setTimestamp(Date.now());

  if (reply) eb.addFields({ name: '↪️ Reply to', value: reply.slice(0, 256) });
  if (content) eb.setDescription(content);
  return eb;
}

/* Duplicate ガード */
async function alreadySent(globalKey) {
  const key = `dup:${globalKey}`;
  if (await redis.get(key)) return true;
  await redis.set(key, '1', { ex: 60 });
  return false;
}

/* ────────── locale → UTC オフセット簡易マップ ────────── */
const LOCALE_TZ_MAP = {
  'ja': 9,             // 日本
  'ko': 9,             // 韓国
  'zh': 8, 'zh-CN': 8, // 中国
  'zh-TW': 8,          // 台湾（代表値として +8）
  'th': 7,
  'vi': 7,
  'id': 7,
  'en-US': -5,         // 北米(代表値:EST)
  'en-CA': -5,
  'en-GB': 0,
  'fr': 1,
  'de': 1,
  'es': 1,   'es-ES': 1,
  'es-MX': -6,
  'es-AR': -3,
  'pt-BR': -3,
  'ru': 3,
  'uk': 2,
  'tr': 3,
  'ar': 3,
  'fa': 3.5,
  'hi': 5.5,
  'bn': 6,
  'he': 2
  // 追加したい場合はここに書き足す
};

/* ────────── 3. /setup コマンド ────────── */
async function handleSetup(interaction) {
  try {
    /* (1) 権限チェック & defer */
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.editReply('❌ Need Administrator permission.');
    }

    /* (2) “Global Chat” カテゴリ */
    const category = await interaction.guild.channels.create({
      name: 'Global Chat',
      type: ChannelType.GuildCategory
    });

    /* (3) bot-announcements ＝普通の Text チャンネル */
    const botAnnouncements = await interaction.guild.channels.create({
      name: 'bot-announcements',
      type: ChannelType.GuildText,
      parent: category.id,
      permissionOverwrites: [
        {
          id:   interaction.guild.roles.everyone.id,
          deny: [PermissionFlagsBits.SendMessages],
          type: OverwriteType.Role
        }
      ]
    });

    /*  サポート側 Announcement をフォロー  */
    try {
      const src = await client.channels.fetch(NEWS_SOURCE);
      if (src?.type === ChannelType.GuildAnnouncement && src.addFollower) {
        await src.addFollower(botAnnouncements.id, 'auto-follow');
        console.log('✓ followed support announcement');
      }
    } catch (e) { console.error('follow failed:', e); }

    /* (4) global-chat 本体 */
    const globalChat = await interaction.guild.channels.create({
      name: 'global-chat',
      type: ChannelType.GuildText,
      parent: category.id
    });

    /* (5) settings （管理者のみ閲覧）*/
    const settings = await interaction.guild.channels.create({
      name: CHANNEL_NAME_SETUP,
      type: ChannelType.GuildText,
      parent: category.id,
      permissionOverwrites: [
        {
          id:   interaction.guild.roles.everyone.id,
          deny: [PermissionFlagsBits.ViewChannel],
          type: OverwriteType.Role
        }
      ]
    });

    /* (6) Redis 登録 + HUB 連携 */
    await redis.sadd('bot:channels', globalChat.id);
    fetch(process.env.HUB_ENDPOINT + '/global/join', {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify({ guildId: interaction.guild.id, channelId: globalChat.id })
    }).catch(() => {});

    /* ────────── Settings 用 UI ────────── */

    /* A) 地域セレクト（後続で言語セレクトへ分岐） */
    const rowRegion = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('setting_region')
        .setPlaceholder('Select region (for default language)')
        .addOptions(REGIONS.map(r => ({ label: r.label, value: r.value, emoji: r.emoji })))
    );

    /* B) タイムゾーンセレクト（UTC-11 〜 UTC+13 → 25 個ちょうど） */
    const tzOpts = [];
    for (let o = -11; o <= 13; o++) {
      tzOpts.push({ label: `UTC${o >= 0 ? '+' + o : o}`, value: String(o) });
    }
    const rowTZ = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('set_timezone')
        .setPlaceholder('Select timezone (UTC offset)')
        .addOptions(tzOpts)
    );

    /* C) Auto-Translate ON/OFF */
    const rowAuto = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('autotrans_on').setLabel('Auto ON').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('autotrans_off').setLabel('OFF').setStyle(ButtonStyle.Danger)
    );

    /* D) Detect TZ（locale 推定）& Support サーバー */
    const rowMisc = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('detect_timezone').setLabel('Detect TZ').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setURL(process.env.SUPPORT_SERVER_URL).setLabel('Support').setStyle(ButtonStyle.Link)
    );

    /* E) settings チャンネルへ送信 */
    await settings.send({
      content:
        '**Global Chat Settings**\n\n' +
        '1️⃣ Default Language (select region → bot asks language)\n' +
        '2️⃣ Timezone\n' +
        '3️⃣ Auto-Translate ON / OFF\n' +
        '4️⃣ Detect Timezone (based on your Discord locale)\n',
      components: [rowRegion, rowTZ, rowAuto, rowMisc]
    });

    // Gemini translation setup
    await settings.send('パスワードを送信してください');

    /* 完了 */
    await interaction.editReply('✅ Setup completed!');
  } catch (e) {
    console.error('setup error:', e);
    if (interaction.deferred) {
      await interaction.editReply('❌ Setup failed. Check permissions / ENV.');
    }
  }
}


/* ────────── 4. /profile コマンド ────────── */
async function handleProfile(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const m = (await redis.get(kMsg(interaction.user.id))) || '0';
  const l = (await redis.get(kLike(interaction.user.id))) || '0';
  await interaction.editReply(`📊 **${interaction.user.tag}**\n• Messages: ${m}\n• 👍: ${l}`);
}

/* ────────── 5. /ranking コマンド ────────── */
async function handleRanking(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const sub = interaction.options.getSubcommand();
  const pattern = sub === 'messages' ? 'msg_cnt:*' : 'like_cnt:*';
  const list = [];
  for (const key of await redis.keys(pattern)) {
    const id = key.split(':')[1];
    list.push({ id, v: Number(await redis.get(key) || 0) });
  }
  list.sort((a, b) => b.v - a.v).splice(10);
  const lines = await Promise.all(
    list.map(async (u, i) => {
      try {
        const user = await client.users.fetch(u.id);
        return `#${i + 1} – ${user.tag} (${u.v})`;
      } catch {
        return `#${i + 1} – (unknown) (${u.v})`;
      }
    })
  );
  await interaction.editReply(`🏆 Top 10 by ${sub}\n\n${lines.join('\n') || 'No data'}`);
}

/* ────────── 6. /help UI (地域→言語) ────────── */


/* ────────── 7. InteractionCreate 全体 ────────── */
client.on(Events.InteractionCreate, async (i) => {
  // --- コマンド系 ---
  if (i.isChatInputCommand()) {
    if (i.commandName === 'setup')   return handleSetup(i);
    if (i.commandName === 'profile') return handleProfile(i);
    if (i.commandName === 'ranking') return handleRanking(i);
    if (i.commandName === 'help') {
      // /help → 地域選択
      return i.reply({
        content: '🔎 Select your region:',
        components: [
          new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId('help_region')
              .setPlaceholder('Pick region')
              .addOptions(
                REGIONS.map(r => ({ label: r.label, value: r.value, emoji: r.emoji }))
              )
          )
        ],
        flags: MessageFlags.Ephemeral
      });
    }
  }

  // --- /help の 地域→言語 フロー ---
  if (i.isStringSelectMenu() && i.customId === 'help_region') {
    const chosenRegion = i.values[0];
    const langs = REGION_LANGS[chosenRegion] || ['en'];
    return i.update({
      content: '📖 Select a language:',
      components: [
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('help_lang')
            .setPlaceholder('Pick language')
            .addOptions(langs.map(code => ({ label: code, value: code })))
        )
      ]
    });
  }
  if (i.isStringSelectMenu() && i.customId === 'help_lang') {
    const chosenLang = i.values[0];
    const __dir = path.dirname(fileURLToPath(import.meta.url));
    const { HELP_TEXTS } = await import(path.join(__dir, 'commands', 'help.js'));
    const text = HELP_TEXTS[chosenLang] || HELP_TEXTS.en;
    const chunks = text.match(/[\s\S]{1,2000}/g) || [text];

    await i.update({ content: chunks[0], components: [] });
    for (let idx = 1; idx < chunks.length; idx++) {
      await i.followUp({ content: chunks[idx], flags: MessageFlags.Ephemeral });
    }
    return;
  }

  // --- settings: Default Language → 地域選択 → 言語選択 ---
  if (i.isStringSelectMenu() && i.customId === 'setting_region') {
    const chosenRegion = i.values[0];
    const langs = REGION_LANGS[chosenRegion] || ['en'];

    // ✓: 別メッセージ (Ephemeral) で言語選択を促す
    return i.reply({
      content: '📑 Now select your language:',
      components: [
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('setting_lang')
            .setPlaceholder('Pick language')
            .addOptions(langs.map(code => ({ label: code, value: code })))
        )
      ],
      flags: MessageFlags.Ephemeral
    });
  }
  if (i.isStringSelectMenu() && i.customId === 'setting_lang') {
    const chosenLang = i.values[0];
    await redis.hset(`lang:${i.guildId}`, { lang: chosenLang, auto: 'true' });
    return i.reply({ content: `✅ Default Language set to **${chosenLang}** (Auto ON).`, flags: MessageFlags.Ephemeral });
  }

  // --- settings: Timezone / Auto / Detect / Support ---
  if (i.isStringSelectMenu() && i.customId === 'set_timezone') {
    const tzValue = i.values[0];
    await redis.hset(`tz:${i.guildId}`, { tz: tzValue });
    const sign = tzValue >= 0 ? '+' : '';
    return i.reply({ content: `✅ Timezone set to UTC${sign}${tzValue}`, flags: MessageFlags.Ephemeral });
  }
  if (i.isButton() && ['autotrans_on', 'autotrans_off'].includes(i.customId)) {
    const val = i.customId === 'autotrans_on' ? 'true' : 'false';
    await redis.hset(`lang:${i.guildId}`, { auto: val });
    return i.reply({ content: `🔄 Auto-Translate is now **${val === 'true' ? 'ON' : 'OFF'}**.`, flags: MessageFlags.Ephemeral });
  }
  if (i.isButton() && i.customId === 'detect_timezone') {
    const loc = i.locale ?? i.user?.locale;
    let tz = LOCALE_TZ_MAP[loc];
    if (tz === undefined && typeof loc === 'string' && loc.includes('-')) {
      tz = LOCALE_TZ_MAP[loc.split('-')[0]];
    }
    if (tz === undefined) tz = 0;
    await redis.hset(`tz:${i.guildId}`, { tz: String(tz) });
    const sign = tz >= 0 ? '+' : '';
    return i.reply({ content: `🌐 Detected Timezone set to UTC${sign}${tz}.`, flags: MessageFlags.Ephemeral });
  }
});

/* ────────── 8. MessageCreate ────────── */
client.on(Events.MessageCreate, async (msg) => {
  // Bot 自身のメッセージや、Global Chat につながっていないチャンネルは無視
  if (msg.author.bot) return;
  if (msg.channel.name === CHANNEL_NAME_SETUP) {
    if (msg.member?.permissions.has(PermissionFlagsBits.Administrator) &&
        msg.content.trim() === SETUP_PASSWORD) {
      try {
        await redis.set(`gemini:enabled:${msg.guildId}`, 'true');
        await msg.reply('Gemini 翻訳が有効化されました');
      } catch (e) {
        console.error('gemini enable error:', e);
      }
    }
    return;
  }
  if (!(await redis.sismember('bot:channels', msg.channelId))) return;

  /* 1) メッセージ統計 */
  await redis.incrby(kMsg(msg.author.id), 1);

  /* 2) 返信の抜粋（replyExcerpt）を取得 */
  let replyExcerpt = null;
  if (msg.reference?.messageId) {
    try {
      const ref = await msg.channel.messages.fetch(msg.reference.messageId);

      // (1) 元メッセージにテキストがあればそれを引用
      if (ref.content) {
        replyExcerpt = ref.content.slice(0, 250);
      }
      // (2) テキストがなく添付画像があれば、最初の画像 URL を引用
      else if (ref.attachments.size > 0) {
        const url = ref.attachments.first().url;
        replyExcerpt = `[Image] ${url}`;
      }
      // (3) それ以外に embed があれば embed.description を引用
      else if (ref.embeds.length > 0 && ref.embeds[0].description) {
        replyExcerpt = ref.embeds[0].description.slice(0, 250);
      }
    } catch (e) {
      // 参照先メッセージが取得できなかった場合は何もしない
      console.error('Reply fetch error:', e);
    }
  }

  /* 3) メタ情報（タイムゾーン・言語・自動翻訳設定）を取得 */
  const tz   = (await redis.hget(`tz:${msg.guildId}`, 'tz')) ?? '0';
  const lang = (await redis.hget(`lang:${msg.guildId}`, 'lang')) ?? 'en';
  const auto = (await redis.hget(`lang:${msg.guildId}`, 'auto')) === 'true';

  /* 4) ペイロードを作成 */
  const payload = {
    globalId   : randomUUID(),
    guildId    : msg.guildId,
    channelId  : msg.channelId,
    userTag    : msg.author.tag,
    userAvatar : msg.author.displayAvatarURL(),
    originGuild: msg.guild.name,
    tz,
    content    : msg.content,
    replyExcerpt,
    sentAt     : Date.now(),
    // payload.files は [{ attachment: URL, name: ファイル名 }, ...] の配列
    files      : msg.attachments.map(a => ({ attachment: a.url, name: a.name })),
    targetLang : auto ? lang : null,
    userId     : msg.author.id
  };

  /* 5) HUB へ publish 試行 */
  let ok = false;
  try {
    const res = await fetch(process.env.HUB_ENDPOINT + '/publish', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
    ok = res.ok;
  } catch {
    ok = false;
  }

  /* 6) フォールバック：もし publish に失敗したら Redis 上の全チャンネルへ直接転送 */
  if (!ok) {
    // 先に Embed を作成
    const embed = buildRelayEmbed({
      userTag: payload.userTag,
      originGuild: payload.originGuild,
      tz: payload.tz,
      userAvatar: payload.userAvatar,
      content: payload.content,
      userId: payload.userId,
      auto: !!payload.targetLang,
      reply: payload.replyExcerpt
    });

    // Redis に登録されているすべての bot:channels を巡回
    const channelIds = await redis.smembers('bot:channels');
    for (const channelId of channelIds) {
      // 自分自身の投稿チャンネルには送り返さない
      if (channelId === msg.channelId) continue;

      const dupKey = `${payload.globalId}:${channelId}`;
      if (await alreadySent(dupKey)) continue;

      try {
        const ch = await client.channels.fetch(channelId);
        if (!ch || !ch.isTextBased()) continue;

        // Discord.js v14 では、files オプションに
        // 「URL の配列」か「{ attachment, name } の配列」を渡せる
        const filesToSend = payload.files.map(f => ({ attachment: f.attachment, name: f.name }));

        const sent = await ch.send({
          embeds: [embed],
          files: filesToSend
        });
        await sent.react('👍');
      } catch (e) {
        console.error(`Fallback relay to ${channelId} failed:`, e);
      }
    }
  }
});

/* ────────── 9. MessageReactionAdd (👍 & 国旗翻訳) ────────── */
client.on(Events.MessageReactionAdd, async (reaction, user) => {
  if (user.bot) return;

  // partial（キャッシュ外状態）の場合は fetch して完全なオブジェクトを取得
  if (reaction.partial) {
    try {
      await reaction.fetch();
    } catch (err) {
      console.error('Failed to fetch partial reaction:', err);
      return;
    }
  }

  const msg = reaction.message;

  /* 👍 いいねカウント */
  if (reaction.emoji.name === '👍' && msg.author?.id === client.user.id) {
    const setKey = `like_set:${msg.id}`;
    if (await redis.sismember(setKey, user.id)) return;
    if ((await redis.scard(setKey)) >= 5) {
      return reaction.users.remove(user.id).catch(() => {});
    }
    await redis.sadd(setKey, user.id);
    await redis.expire(setKey, 60 * 60 * 24 * 7);
    const m = msg.embeds[0]?.footer?.text.match(/UID:(\d+)/);
    if (m) await redis.incrby(kLike(m[1]), 1);
    return;
  }

  /* 国旗リアクション翻訳 */
  const langCode = FLAG_TO_LANG[reaction.emoji.name];
  if (!langCode) return;
  const original = msg.content || msg.embeds[0]?.description || '';
  if (!original) return;
  try {
    const translated = await translate(original, langCode, msg.guildId);
    await msg.reply({
      embeds: [
        new EmbedBuilder()
          .setDescription(`> ${original}\n\n**${translated}**`)
          .setFooter({ text: `🌐 translated to ${langCode}` })
      ]
    });
  } catch (e) {
    console.error('translate error:', e);
  }
});

/* ────────── 10. Express relay (グローバルチャット間の自動翻訳) ────────── */
const app = express();
app.use(bodyParser.json());

app.post('/relay', async (req, res) => {
  try {
    const p = req.body;
    // p: { globalId, guildId, channelId, userTag, userAvatar, originGuild, tz,content, replyExcerpt, files, targetLang, userId }
    for (const channelId of await redis.smembers('bot:channels')) {
      if (channelId === p.channelId) continue;

      const dupKey = `${p.globalId}:${channelId}`;
      if (await alreadySent(dupKey)) continue;

      try {
        const ch = await client.channels.fetch(channelId);

        // ─── ここで送信先サーバーの言語設定を Redis から取得 ───
        const destLang = await redis.hget(`lang:${ch.guildId}`, 'lang');
        const autoOn   = (await redis.hget(`lang:${ch.guildId}`, 'auto')) === 'true';
        const srcLang  = await redis.hget(`lang:${p.guildId}`, 'lang');

        // デバッグ用ログ（Redis から取得できているか確認）
        console.log(`→ Relay to ${channelId} (guild:${ch.guildId}): destLang=${destLang}, autoOn=${autoOn}, srcLang=${srcLang}`);

        let finalContent = p.content;
        let autoFlag = false;
        // 「Auto-Translate ON」で言語設定があり、送信元と異なる場合に翻訳
        if (autoOn && destLang && destLang !== srcLang) {
          try {
            finalContent = await translate(p.content, destLang, ch.guildId);
            autoFlag = true;
          } catch (e) {
            console.error('auto-translate error:', e);
            finalContent = p.content;
          }
        }

        const embed = buildRelayEmbed({
          userTag: p.userTag,
          originGuild: p.originGuild,
          tz: p.tz,
          userAvatar: p.userAvatar,
          content: finalContent,
          userId: p.userId,
          auto: autoFlag,
          reply: p.replyExcerpt
        });

        const sent = await ch.send({
          embeds: [embed],
          files: p.files?.map((f) => f.attachment) || []
        });
        await sent.react('👍');
      } catch (e) {
        console.error(`relay to ${channelId} failed:`, e);
      }
    }
    return res.send({ ok: true });
  } catch (e) {
    console.error('relay error:', e);
    return res.sendStatus(500);
  }
});

app.get('/healthz', (_, res) => res.send('OK'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('🚦 relay on', PORT));

/* ────────── 11. Bot ログイン ────────── */
client.login(process.env.DISCORD_TOKEN)
  .then(() => console.log('✅ Logged in & ready'))
  .catch((e) => console.error('login error', e));
