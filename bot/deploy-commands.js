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

/* ----- /additem (Admin only) ----- */
const cmdAddItem = new SlashCommandBuilder()
  .setName('additem')
  .setDescription('Add a new shop item (role) dynamically')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption(o =>
    o
      .setName('name')
      .setDescription('The role name')
      .setRequired(true)
  )
  .addStringOption(o =>
    o
      .setName('color')
      .setDescription('HEX color code, e.g. #FFA500')
      .setRequired(true)
  );

/* ----- Assemble and deploy ----- */
const commands = [
  cmdSetup.toJSON(),
  cmdAnnounce.toJSON(),
  cmdAddItem.toJSON(),
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
