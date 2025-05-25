// commands/global.js
import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('global')
  .setDescription('グローバルチャット機能')
  .addSubcommand(sub =>
    sub
      .setName('join')
      .setDescription('このチャンネルをグローバルチャットに参加させる')
      .addChannelOption(opt =>
        opt.setName('channel')
           .setDescription('参加させるチャンネル')
           .setRequired(true)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName('leave')
      .setDescription('このチャンネルをグローバルチャットから退出させる')
  );
