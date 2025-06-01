import 'dotenv/config';
import { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

/* ----- /setup (Admin only) ----- */
const cmdSetup = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('Automatically create the Global Chat category and its channels')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

/* ----- /profile ----- */
const cmdProfile = new SlashCommandBuilder()
  .setName('profile')
  .setDescription('Show your total message count and total likes received');

/* ----- /ranking ----- */
const cmdRanking = new SlashCommandBuilder()
  .setName('ranking')
  .setDescription('Show leaderboards')
  .addSubcommand((s) =>
    s.setName('messages').setDescription('Top 10 by messages sent')
  )
  .addSubcommand((s) =>
    s.setName('likes').setDescription('Top 10 by likes received')
  );

const commands = [
  cmdSetup.toJSON(),
  cmdProfile.toJSON(),
  cmdRanking.toJSON()
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );
    console.log('✅ Global commands refreshed');
  } catch (err) {
    console.error('❌ Command deploy failed:', err);
  }
})();
