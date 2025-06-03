import { SlashCommandBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription(
      'Show your total messages and 👍 reactions in the global-chat channel.'
    )
};
