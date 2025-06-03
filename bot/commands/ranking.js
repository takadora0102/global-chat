import { SlashCommandBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('ranking')
    .setDescription('Display the top 10 leaderboards.')
    .addSubcommand((sub) =>
      sub
        .setName('messages')
        .setDescription('Top 10 users by total messages sent in global-chat.')
    )
    .addSubcommand((sub) =>
      sub
        .setName('likes')
        .setDescription('Top 10 users by total 👍 reactions received.')
    )
};
