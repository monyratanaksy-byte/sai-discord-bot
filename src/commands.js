import {
  ActionRowBuilder,
  ApplicationCommandOptionType,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
} from 'discord.js';
import { featureCommands, runFeatureSlashCommand } from './server-features.js';

export const slashCommands = [
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check whether S.A.I is online.'),
  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show S.A.I commands and what you can use.')
    .addStringOption((option) =>
      option
        .setName('category')
        .setDescription('Show one command category.')
        .setRequired(false)
        .addChoices(
          { name: 'General', value: 'general' },
          { name: 'Voice & Community', value: 'community' },
          { name: 'Economy & Levels', value: 'economy' },
          { name: 'Moderation', value: 'moderation' },
          { name: 'Setup & Admin', value: 'admin' },
          { name: 'Utilities', value: 'utilities' },
        ),
    ),
  new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Show useful account and server information for a user.')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('The user to inspect.')
        .setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName('profile')
    .setDescription('Show a user profile card.')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('The user profile to show.')
        .setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName('coords')
    .setDescription('Convert Minecraft coordinates between the Overworld and Nether.')
    .addStringOption((option) =>
      option
        .setName('from')
        .setDescription('The dimension your coordinates are currently in.')
        .setRequired(true)
        .addChoices(
          { name: 'Overworld to Nether', value: 'overworld' },
          { name: 'Nether to Overworld', value: 'nether' },
        ),
    )
    .addNumberOption((option) =>
      option
        .setName('x')
        .setDescription('X coordinate.')
        .setRequired(true),
    )
    .addNumberOption((option) =>
      option
        .setName('y')
        .setDescription('Y coordinate.')
        .setRequired(true),
    )
    .addNumberOption((option) =>
      option
        .setName('z')
        .setDescription('Z coordinate.')
        .setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName('admin')
    .setDescription('S.A.I admin utilities.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('status')
        .setDescription('Show bot runtime and server status.'),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('config')
        .setDescription('Show the active join-to-create configuration.'),
    ),
].map((command) => command.toJSON()).concat(featureCommands);

export const commandMentionDescriptions = slashCommands.map((command) => ({
  name: command.name,
  description: command.description,
  options: command.options?.map((option) => ({
    name: option.name,
    type: ApplicationCommandOptionType[option.type] || option.type,
    required: option.required || false,
  })),
}));

const helpCategories = [
  ['general', 'General', 'Core commands and profile tools.', '🏠', ['ping', 'help', 'userinfo', 'profile', 'poll', 'afk']],
  ['community', 'Community', 'Tickets, confessions, and server interaction.', '💬', ['ticket', 'confess', 'snipe', 'editsnipe']],
  ['economy', 'Economy', 'Levels, coins, shop, and rewards.', '🪙', ['rank', 'balance', 'daily', 'givecoins', 'rate', 'leaderboard', 'shop', 'economy']],
  ['moderation', 'Moderation', 'Staff moderation tools.', '🛡️', ['mod']],
  ['admin', 'Admin', 'Setup, dashboard-connected systems, and server controls.', '⚙️', ['setup', 'verification', 'role', 'emoji', 'raid', 'backup', 'analytics', 'invites', 'bot', 'admin']],
  ['utilities', 'Utilities', 'Useful tools and calculators.', '🧭', ['coords']],
];

export async function runSlashCommand(interaction) {
  if (interaction.commandName === 'ping') {
    await interaction.reply({ content: 'S.A.I is online.', ephemeral: true });
    return;
  }

  if (interaction.commandName === 'help') {
    await interaction.reply({ ...buildHelpPayload(interaction, interaction.options.getString('category') || 'general', 0), ephemeral: true });
    return;
  }

  if (interaction.commandName === 'userinfo') {
    const selected = interaction.options.getUser('user') || interaction.user;
    const target = await fetchFullUser(interaction.client, selected.id);
    const member = interaction.guild
      ? await interaction.guild.members.fetch(target.id).catch(() => null)
      : null;

    await interaction.reply({ embeds: [buildUserInfoEmbed(target, member)] });
    return;
  }

  if (interaction.commandName === 'profile') {
    const selected = interaction.options.getUser('user') || interaction.user;
    const target = await fetchFullUser(interaction.client, selected.id);
    const member = interaction.guild
      ? await interaction.guild.members.fetch(target.id).catch(() => null)
      : null;

    await interaction.reply({ embeds: [buildProfileEmbed(target, member)] });
    return;
  }

  if (interaction.commandName === 'coords') {
    await interaction.reply({ embeds: [buildCoordsEmbed(interaction)] });
    return;
  }

  if (interaction.commandName === 'admin') {
    await runAdminCommand(interaction);
    return;
  }

  await runFeatureSlashCommand(interaction);
}

export async function runPrefixCommand(message, prefix) {
  if (!message.content.startsWith(prefix) || message.author.bot) return false;

  const [commandName, ...args] = message.content
    .slice(prefix.length)
    .trim()
    .split(/\s+/);

  if (!commandName) return false;

  if (commandName === 'ping') {
    await message.reply('S.A.I is online.');
    return true;
  }

  if (commandName === 'help') {
    await message.reply({ embeds: [buildHelpEmbed({ member: message.member, guild: message.guild })] });
    return true;
  }

  if (commandName === 'userinfo' || commandName === 'profile') {
    const target = await resolveTargetUser(message, args[0]);
    const member = message.guild
      ? await message.guild.members.fetch(target.id).catch(() => null)
      : null;

    await message.reply({
      embeds: [
        commandName === 'userinfo'
          ? buildUserInfoEmbed(target, member)
          : buildProfileEmbed(target, member),
      ],
    });
    return true;
  }

  return false;
}

export async function handleHelpComponent(interaction) {
  if (!interaction.customId.startsWith('help:')) return false;
  const [, action, rawCategory = 'general', rawPage = '0'] = interaction.customId.split(':');
  const currentIndex = Math.max(0, helpCategories.findIndex(([key]) => key === rawCategory));
  let category = rawCategory;
  let page = Number(rawPage) || 0;

  if (interaction.isStringSelectMenu()) {
    category = interaction.values[0] || 'general';
    page = 0;
  } else if (action === 'next') {
    category = helpCategories[(currentIndex + 1) % helpCategories.length][0];
    page = 0;
  } else if (action === 'prev') {
    category = helpCategories[(currentIndex - 1 + helpCategories.length) % helpCategories.length][0];
    page = 0;
  }

  await interaction.update(buildHelpPayload(interaction, category, page));
  return true;
}

function buildHelpPayload(context, selectedCategory = 'general', page = 0) {
  return {
    embeds: [buildHelpEmbed(context, selectedCategory, page)],
    components: helpComponents(selectedCategory, page),
  };
}

function buildHelpEmbed(context, selectedCategory = 'general', page = 0) {
  const canModerate = context.member?.permissions?.has?.(PermissionFlagsBits.ModerateMembers);
  const isAdmin = context.member?.permissions?.has?.(PermissionFlagsBits.Administrator);
  const category = helpCategories.find(([key]) => key === selectedCategory) || helpCategories[0];
  const [key, name, summary, emoji, commandNames] = category;
  const locked =
    (key === 'moderation' && !canModerate) ||
    (key === 'admin' && !isAdmin);
  const rows = formatHelpRows(commandNames);
  const pages = chunkRows(rows, 8);
  const pageIndex = Math.min(Math.max(page, 0), Math.max(pages.length - 1, 0));
  const visibleRows = pages[pageIndex] || [];

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`${emoji} ${name}${locked ? ' · locked' : ''}`)
    .setDescription([
      summary,
      '',
      visibleRows.join('\n') || 'No commands in this section.',
    ].join('\n'))
    .addFields(
      { name: 'Navigation', value: 'Use the menu below to switch sections. Use Next/Previous to browse quickly.' },
      { name: 'Booster Rewards', value: 'Server boosters receive `1.5x` XP and coins from messages, voice, and daily rewards.' },
    )
    .setFooter({ text: `${emoji} Page ${pageIndex + 1}/${Math.max(pages.length, 1)} · Dashboard handles advanced setup and logs.` });
  const botIcon = context.client?.user?.displayAvatarURL?.({ size: 128 });
  embed.setAuthor(botIcon ? { name: 'S.A.I Command Center', iconURL: botIcon } : { name: 'S.A.I Command Center' });
  return embed;
}

function helpComponents(selectedCategory, page) {
  return [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`help:select:${selectedCategory}:${page}`)
        .setPlaceholder('Pick a section')
        .addOptions(helpCategories.map(([value, label, description, emoji]) => ({
          label,
          value,
          description,
          emoji,
          default: value === selectedCategory,
        }))),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`help:prev:${selectedCategory}:${page}`)
        .setLabel('Previous')
        .setEmoji('⬅️')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`help:next:${selectedCategory}:${page}`)
        .setLabel('Next')
        .setEmoji('➡️')
        .setStyle(ButtonStyle.Primary),
    ),
  ];
}

function formatHelpRows(commandNames) {
  const rows = [];
  for (const commandName of commandNames) {
    const command = slashCommands.find((item) => item.name === commandName);
    if (!command) continue;
    rows.push(...formatCommandRows(command));
  }
  return rows;
}

function chunkRows(rows, maxRows) {
  const chunks = [];
  let current = [];
  for (const row of rows) {
    if (current.length >= maxRows) {
      chunks.push(current);
      current = [row];
    } else {
      current.push(row);
    }
  }
  if (current.length) chunks.push(current);
  return chunks;
}

function formatCommandRows(command) {
  const subcommands = command.options?.filter((option) => option.type === 1) || [];
  if (!subcommands.length) {
    return [`• \`/${command.name}\` - ${command.description}`];
  }
  return subcommands.map((subcommand) => `• \`/${command.name} ${subcommand.name}\` - ${subcommand.description}`);
}

async function resolveTargetUser(message, rawTarget) {
  const mentioned = message.mentions.users.first();
  if (mentioned) return fetchFullUser(message.client, mentioned.id);

  const id = rawTarget?.replace(/[<@!>]/g, '');
  if (id) {
    const fetched = await message.client.users.fetch(id).catch(() => null);
    if (fetched) return fetched;
  }

  return fetchFullUser(message.client, message.author.id);
}

async function fetchFullUser(client, userId) {
  return client.users.fetch(userId, { force: true }).catch(() => client.users.cache.get(userId));
}

function buildUserInfoEmbed(user, member) {
  const roles =
    member?.roles.cache
      .filter((role) => role.id !== member.guild.id)
      .sort((a, b) => b.position - a.position)
      .map((role) => role.toString())
      .slice(0, 12)
      .join(', ') || 'None';

  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`${user.username}'s information`)
    .setThumbnail(user.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: 'User ID', value: user.id, inline: true },
      { name: 'Bot Account', value: user.bot ? 'Yes' : 'No', inline: true },
      {
        name: 'Created',
        value: `<t:${Math.floor(user.createdTimestamp / 1000)}:F>`,
        inline: false,
      },
      {
        name: 'Joined Server',
        value: member?.joinedTimestamp
          ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>`
          : 'Not available',
        inline: false,
      },
      { name: 'Roles', value: roles, inline: false },
    );
}

function buildProfileEmbed(user, member) {
  return new EmbedBuilder()
    .setColor(member?.displayColor || 0x2b2d31)
    .setAuthor({
      name: user.globalName || user.username,
      iconURL: user.displayAvatarURL({ size: 128 }),
    })
    .setTitle('User Profile')
    .setThumbnail(user.displayAvatarURL({ size: 512 }))
    .addFields(
      { name: 'Username', value: user.tag, inline: true },
      {
        name: 'Server Nickname',
        value: member?.nickname || 'None',
        inline: true,
      },
      {
        name: 'Highest Role',
        value: member?.roles.highest?.name || 'None',
        inline: true,
      },
    )
    .setImage(user.bannerURL?.({ size: 1024 }) || null);
}

function buildCoordsEmbed(interaction) {
  const from = interaction.options.getString('from', true);
  const input = {
    x: interaction.options.getNumber('x', true),
    y: interaction.options.getNumber('y', true),
    z: interaction.options.getNumber('z', true),
  };
  const scale = from === 'overworld' ? 1 / 8 : 8;
  const sourceName = from === 'overworld' ? 'Overworld' : 'Nether';
  const targetName = from === 'overworld' ? 'Nether' : 'Overworld';
  const exact = {
    x: input.x * scale,
    y: input.y,
    z: input.z * scale,
  };
  const block = {
    x: Math.round(exact.x),
    y: Math.round(exact.y),
    z: Math.round(exact.z),
  };
  const sourceChunk = getChunkCoords(input);
  const targetChunk = getChunkCoords(block);

  return new EmbedBuilder()
    .setColor(from === 'overworld' ? 0x2ecc71 : 0xe74c3c)
    .setTitle(`Minecraft Coordinates: ${sourceName} -> ${targetName}`)
    .addFields(
      {
        name: `${sourceName} input`,
        value: formatCoordLine(input),
        inline: false,
      },
      {
        name: `${targetName} exact`,
        value: formatCoordLine(exact),
        inline: false,
      },
      {
        name: 'Recommended block',
        value: formatCoordLine(block),
        inline: false,
      },
      {
        name: 'Chunk',
        value: `Source: \`${sourceChunk.x}, ${sourceChunk.z}\`\nTarget: \`${targetChunk.x}, ${targetChunk.z}\``,
        inline: true,
      },
      {
        name: 'Scale',
        value: from === 'overworld' ? '`X/Z / 8`' : '`X/Z * 8`',
        inline: true,
      },
    )
    .setFooter({ text: 'Y does not scale between dimensions. Portal linking uses X/Z distance.' });
}

function getChunkCoords(coords) {
  return {
    x: Math.floor(coords.x / 16),
    z: Math.floor(coords.z / 16),
  };
}

function formatCoordLine(coords) {
  return `\`X ${formatCoord(coords.x)} | Y ${formatCoord(coords.y)} | Z ${formatCoord(coords.z)}\``;
}

function formatCoord(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

async function runAdminCommand(interaction) {
  const member = interaction.member;
  const isAdmin =
    typeof member?.permissions?.has === 'function' &&
    member.permissions.has(PermissionFlagsBits.Administrator);

  if (!isAdmin) {
    await interaction.reply({
      content: 'Administrator permission is required for this command.',
      ephemeral: true,
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'status') {
    const uptimeSeconds = Math.floor(interaction.client.uptime / 1000);
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x57f287)
          .setTitle('S.A.I Admin Status')
          .addFields(
            { name: 'Bot', value: interaction.client.user.tag, inline: true },
            { name: 'Servers', value: String(interaction.client.guilds.cache.size), inline: true },
            { name: 'Uptime', value: `${uptimeSeconds}s`, inline: true },
          ),
      ],
      ephemeral: true,
    });
    return;
  }

  if (subcommand === 'config') {
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle('S.A.I Active Config')
          .addFields(
            {
              name: 'Join-to-create channel',
              value: process.env.JOIN_TO_CREATE_CHANNEL_ID
                ? `<#${process.env.JOIN_TO_CREATE_CHANNEL_ID}>`
                : 'Not configured',
              inline: false,
            },
            { name: 'Prefix', value: process.env.PREFIX || 's!', inline: true },
          ),
      ],
      ephemeral: true,
    });
  }
}
