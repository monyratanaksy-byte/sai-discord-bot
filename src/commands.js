import {
  ApplicationCommandOptionType,
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';

export const slashCommands = [
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check whether S.A.I is online.'),
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
].map((command) => command.toJSON());

export const commandMentionDescriptions = slashCommands.map((command) => ({
  name: command.name,
  description: command.description,
  options: command.options?.map((option) => ({
    name: option.name,
    type: ApplicationCommandOptionType[option.type] || option.type,
    required: option.required || false,
  })),
}));

export async function runSlashCommand(interaction) {
  if (interaction.commandName === 'ping') {
    await interaction.reply({ content: 'S.A.I is online.', ephemeral: true });
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

  if (interaction.commandName === 'admin') {
    await runAdminCommand(interaction);
  }
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
    await message.reply(
      [
        '**S.A.I commands**',
        `\`${prefix}ping\` - Check bot status`,
        `\`${prefix}userinfo [@user|user_id]\` - Show user information`,
        `\`${prefix}profile [@user|user_id]\` - Show a user profile`,
        'Slash commands: `/ping`, `/userinfo`, `/profile`',
      ].join('\n'),
    );
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
