import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription(
      'Create the “Global-Chat Settings” category, channels, and register this server to the hub.'
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) // Admin-only
};
