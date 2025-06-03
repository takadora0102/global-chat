import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription(
      'Create the “Global Chat” category, channels, and register this server to the hub.'
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) // Admin-only
};
