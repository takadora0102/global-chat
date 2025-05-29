// deploy-commands.js
import 'dotenv/config';
import { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { data as cmdGlobal } from './commands/global.js';

/* ----- /setup (Admin only) ----- */
const cmdSetup = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('Automatically create the Global Chat category and its channels')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

/* ----- /announce (Bot Owner) ----- */
const cmdAnnounce = new SlashCommandBuilder()
  .setName('announce')
  .setDescription('Broadcast an announcement to the #bot-announcements channel on all servers')
  .addStringOption(o =>
    o
      .setName('text')
      .setDescription('Announcement message')
      .setRequired(true)
  );

const commands = [
  cmdSetup.toJSON(),
  cmdAnnounce.toJSON(),
  cmdGlobal.toJSON()
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
