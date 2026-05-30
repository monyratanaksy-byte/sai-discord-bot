import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { getGuildData, updateGuildData } from './storage.js';

const voiceJoinTimes = new Map();
const deletedMessages = new Map();
const editedMessages = new Map();

export const featureCommands = [
  new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configure S.A.I server systems.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName('welcome')
        .setDescription('Set the welcome/rules verification flow.')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Where welcome/rules messages are posted.')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        )
        .addRoleOption((option) =>
          option
            .setName('verified_role')
            .setDescription('Role given when a member accepts the rules.')
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName('rules')
            .setDescription('Short rules text for the welcome panel.')
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('roles')
        .setDescription('Create a reaction/button role panel.')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Where the role panel is posted.')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        )
        .addStringOption((option) =>
          option.setName('title').setDescription('Panel title.').setRequired(true),
        )
        .addRoleOption((option) => option.setName('role1').setDescription('Role 1.').setRequired(true))
        .addRoleOption((option) => option.setName('role2').setDescription('Role 2.').setRequired(false))
        .addRoleOption((option) => option.setName('role3').setDescription('Role 3.').setRequired(false))
        .addRoleOption((option) => option.setName('role4').setDescription('Role 4.').setRequired(false))
        .addRoleOption((option) => option.setName('role5').setDescription('Role 5.').setRequired(false)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('tickets')
        .setDescription('Create a ticket panel.')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Where the ticket panel is posted.')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        )
        .addChannelOption((option) =>
          option
            .setName('category')
            .setDescription('Category where tickets are created.')
            .addChannelTypes(ChannelType.GuildCategory)
            .setRequired(false),
        )
        .addRoleOption((option) =>
          option.setName('support_role').setDescription('Role allowed to see tickets.').setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('logs')
        .setDescription('Set the server log channel.')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Where logs are posted.')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('systems')
        .setDescription('Toggle AutoMod, leveling, economy, temp text, or voice rewards.')
        .addStringOption((option) =>
          option
            .setName('system')
            .setDescription('System to toggle.')
            .setRequired(true)
            .addChoices(
              { name: 'AutoMod', value: 'automodEnabled' },
              { name: 'Leveling', value: 'levelingEnabled' },
              { name: 'Economy', value: 'economyEnabled' },
              { name: 'Temporary text channels', value: 'tempTextEnabled' },
              { name: 'Voice activity rewards', value: 'voiceRewardsEnabled' },
            ),
        )
        .addBooleanOption((option) =>
          option.setName('enabled').setDescription('On or off.').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('stats')
        .setDescription('Set up server stat voice channels.')
        .addChannelOption((option) =>
          option
            .setName('category')
            .setDescription('Category for stat channels.')
            .addChannelTypes(ChannelType.GuildCategory)
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('booster')
        .setDescription('Set booster rewards.')
        .addRoleOption((option) =>
          option.setName('role').setDescription('Extra role given to boosters.').setRequired(false),
        )
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Where booster thanks are posted.')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('confession')
        .setDescription('Set the confession output channel.')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Where anonymous confessions are posted.')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        ),
    ),
  new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Ticket commands.')
    .addSubcommand((sub) => sub.setName('close').setDescription('Close the current ticket.')),
  new SlashCommandBuilder()
    .setName('mod')
    .setDescription('Moderation commands.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand((sub) =>
      sub
        .setName('warn')
        .setDescription('Warn a member.')
        .addUserOption((option) => option.setName('user').setDescription('Member.').setRequired(true))
        .addStringOption((option) => option.setName('reason').setDescription('Reason.').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('warnings')
        .setDescription('Show member warnings.')
        .addUserOption((option) => option.setName('user').setDescription('Member.').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('timeout')
        .setDescription('Timeout a member.')
        .addUserOption((option) => option.setName('user').setDescription('Member.').setRequired(true))
        .addIntegerOption((option) => option.setName('minutes').setDescription('Minutes.').setRequired(true))
        .addStringOption((option) => option.setName('reason').setDescription('Reason.').setRequired(false)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('kick')
        .setDescription('Kick a member.')
        .addUserOption((option) => option.setName('user').setDescription('Member.').setRequired(true))
        .addStringOption((option) => option.setName('reason').setDescription('Reason.').setRequired(false)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('ban')
        .setDescription('Ban a member.')
        .addUserOption((option) => option.setName('user').setDescription('Member.').setRequired(true))
        .addStringOption((option) => option.setName('reason').setDescription('Reason.').setRequired(false)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('purge')
        .setDescription('Bulk delete recent messages.')
        .addIntegerOption((option) =>
          option.setName('amount').setDescription('1 to 100 messages.').setRequired(true),
        ),
    ),
  new SlashCommandBuilder()
    .setName('poll')
    .setDescription('Create a button poll.')
    .addStringOption((option) => option.setName('question').setDescription('Question.').setRequired(true))
    .addStringOption((option) => option.setName('option1').setDescription('Option 1.').setRequired(true))
    .addStringOption((option) => option.setName('option2').setDescription('Option 2.').setRequired(true))
    .addStringOption((option) => option.setName('option3').setDescription('Option 3.').setRequired(false))
    .addStringOption((option) => option.setName('option4').setDescription('Option 4.').setRequired(false)),
  new SlashCommandBuilder()
    .setName('afk')
    .setDescription('Set or clear your AFK status.')
    .addStringOption((option) => option.setName('reason').setDescription('Why you are AFK.').setRequired(false)),
  new SlashCommandBuilder()
    .setName('rank')
    .setDescription('Show your level and coins.')
    .addUserOption((option) => option.setName('user').setDescription('User.').setRequired(false)),
  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Show the server XP leaderboard.'),
  new SlashCommandBuilder()
    .setName('analytics')
    .setDescription('Show join, leave, message, and voice analytics.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName('invites')
    .setDescription('Show the invite tracker leaderboard.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName('confess')
    .setDescription('Send an anonymous confession.'),
  new SlashCommandBuilder()
    .setName('snipe')
    .setDescription('Show the last deleted message in this channel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder()
    .setName('editsnipe')
    .setDescription('Show the last edited message in this channel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder()
    .setName('raid')
    .setDescription('Enable or disable raid mode.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addBooleanOption((option) => option.setName('enabled').setDescription('On or off.').setRequired(true)),
  new SlashCommandBuilder()
    .setName('backup')
    .setDescription('Save or view a lightweight server backup.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) => sub.setName('save').setDescription('Save channel/role structure.'))
    .addSubcommand((sub) => sub.setName('view').setDescription('View the latest backup summary.')),
  new SlashCommandBuilder()
    .setName('shop')
    .setDescription('Economy shop commands.')
    .addSubcommand((sub) => sub.setName('view').setDescription('View shop items.'))
    .addSubcommand((sub) =>
      sub
        .setName('add-role')
        .setDescription('Add a purchasable role.')
        .addRoleOption((option) => option.setName('role').setDescription('Role.').setRequired(true))
        .addIntegerOption((option) => option.setName('price').setDescription('Coin price.').setRequired(true)),
    ),
  new SlashCommandBuilder()
    .setName('emoji')
    .setDescription('Admin emoji tools.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Add a custom server emoji from an image, URL, or existing custom emoji.')
        .addStringOption((option) =>
          option
            .setName('name')
            .setDescription('Emoji name, letters/numbers/underscore only.')
            .setRequired(true),
        )
        .addAttachmentOption((option) =>
          option
            .setName('image')
            .setDescription('PNG, JPG, GIF, or WEBP image file.')
            .setRequired(false),
        )
        .addStringOption((option) =>
          option
            .setName('image_url')
            .setDescription('Direct image URL.')
            .setRequired(false),
        )
        .addStringOption((option) =>
          option
            .setName('emoji')
            .setDescription('Existing custom emoji to clone, like :name:.')
            .setRequired(false),
        ),
    ),
].map((command) => command.toJSON());

export async function initFeatures(client) {
  await Promise.all(client.guilds.cache.map((guild) => refreshInviteCache(guild)));
  await Promise.all(client.guilds.cache.map((guild) => updateStatsChannels(guild)));
}

export async function runFeatureSlashCommand(interaction) {
  if (interaction.commandName === 'setup') return runSetup(interaction);
  if (interaction.commandName === 'ticket') return runTicket(interaction);
  if (interaction.commandName === 'mod') return runMod(interaction);
  if (interaction.commandName === 'poll') return runPoll(interaction);
  if (interaction.commandName === 'afk') return runAfk(interaction);
  if (interaction.commandName === 'rank') return runRank(interaction);
  if (interaction.commandName === 'leaderboard') return runLeaderboard(interaction);
  if (interaction.commandName === 'analytics') return runAnalytics(interaction);
  if (interaction.commandName === 'invites') return runInvites(interaction);
  if (interaction.commandName === 'confess') return showConfessionModal(interaction);
  if (interaction.commandName === 'snipe') return runSnipe(interaction, deletedMessages, 'deleted');
  if (interaction.commandName === 'editsnipe') return runSnipe(interaction, editedMessages, 'edited');
  if (interaction.commandName === 'raid') return runRaid(interaction);
  if (interaction.commandName === 'backup') return runBackup(interaction);
  if (interaction.commandName === 'shop') return runShop(interaction);
  if (interaction.commandName === 'emoji') return runEmoji(interaction);
  return false;
}

export async function handleFeatureButton(interaction) {
  const [scope, action, ...args] = interaction.customId.split(':');
  if (scope !== 'feature') return false;

  if (action === 'verify') return verifyMember(interaction);
  if (action === 'role') return toggleRole(interaction, args[0]);
  if (action === 'ticket') return openTicket(interaction);
  if (action === 'close_ticket') return closeTicket(interaction);
  if (action === 'poll') return votePoll(interaction, args[0], Number(args[1]));
  if (action === 'shop') return buyShopRole(interaction, args[0]);
  return false;
}

export async function handleFeatureModal(interaction) {
  if (interaction.customId !== 'feature_confession_modal') return false;
  const guildData = await getGuildData(interaction.guildId);
  const channel = await interaction.guild.channels
    .fetch(guildData.config.confessionChannelId)
    .catch(() => null);

  if (!channel?.isTextBased()) {
    await interaction.reply({ content: 'Confession channel is not configured.', ephemeral: true });
    return true;
  }

  const text = interaction.fields.getTextInputValue('confession').trim();
  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0x9b59b6)
        .setTitle('Anonymous Confession')
        .setDescription(text)
        .setTimestamp(),
    ],
  });
  await interaction.reply({ content: 'Your confession was sent anonymously.', ephemeral: true });
  return true;
}

export async function handleFeatureMessageCreate(message) {
  if (!message.guild || message.author.bot) return;
  const guildData = await getGuildData(message.guild.id);
  guildData.analytics.messages += 1;

  if (await handleLordNicknameCommand(message)) {
    await updateGuildData(message.guild.id, () => {});
    return;
  }

  if (guildData.afk[message.author.id]) {
    delete guildData.afk[message.author.id];
    await message.reply('Welcome back, your AFK status was cleared.').catch(() => {});
  }

  for (const user of message.mentions.users.values()) {
    const afk = guildData.afk[user.id];
    if (afk) {
      await message.reply(`${user.tag} is AFK: ${afk.reason}`).catch(() => {});
      break;
    }
  }

  if (guildData.config.raidMode) {
    await message.delete().catch(() => {});
    return;
  }

  if (guildData.config.automodEnabled && shouldAutoMod(message.content)) {
    await message.delete().catch(() => {});
    await message.channel
      .send(`${message.author}, that message was blocked by AutoMod.`)
      .then((sent) => setTimeout(() => sent.delete().catch(() => {}), 5000))
      .catch(() => {});
    await logEvent(message.guild, 'AutoMod', `${message.author.tag} was blocked in ${message.channel}.`);
    return;
  }

  if (guildData.config.levelingEnabled) {
    addUserProgress(guildData, message.author.id, 8, guildData.config.economyEnabled ? 2 : 0);
  }

  await updateGuildData(message.guild.id, () => {});
}

export async function handleFeatureMessageDelete(message) {
  if (!message.guild || message.author?.bot || !message.content) return;
  deletedMessages.set(message.channel.id, {
    author: message.author.tag,
    content: message.content,
    createdTimestamp: message.createdTimestamp,
  });
  await logEvent(message.guild, 'Message Deleted', `**${message.author.tag}** in ${message.channel}:\n${trim(message.content, 900)}`);
}

export async function handleFeatureMessageUpdate(oldMessage, newMessage) {
  if (!oldMessage.guild || oldMessage.author?.bot || oldMessage.content === newMessage.content) return;
  editedMessages.set(oldMessage.channel.id, {
    author: oldMessage.author.tag,
    before: oldMessage.content || '[unknown]',
    after: newMessage.content || '[unknown]',
  });
}

export async function handleFeatureGuildMemberAdd(member) {
  const guildData = await getGuildData(member.guild.id);
  guildData.analytics.joins += 1;

  if (guildData.config.raidMode) {
    await member.timeout(60 * 60 * 1000, 'S.A.I raid mode is enabled.').catch(() => {});
  }

  const invite = await detectInvite(member.guild, guildData);
  const welcomeChannel = await member.guild.channels
    .fetch(guildData.config.welcomeChannelId)
    .catch(() => null);

  if (welcomeChannel?.isTextBased()) {
    await welcomeChannel.send({
      content: `Welcome ${member}!`,
      embeds: [
        new EmbedBuilder()
          .setColor(0x57f287)
          .setTitle('Welcome to the server')
          .setDescription(guildData.config.rulesText || 'Read the rules, then press the button below to verify.')
          .addFields({ name: 'Invited by', value: invite || 'Unknown', inline: true }),
      ],
      components: [verifyRow()],
    }).catch(() => {});
  }

  await updateStatsChannels(member.guild);
  await updateGuildData(member.guild.id, () => {});
}

export async function handleFeatureGuildMemberRemove(member) {
  await updateGuildData(member.guild.id, (guildData) => {
    guildData.analytics.leaves += 1;
  });
  await logEvent(member.guild, 'Member Left', `${member.user.tag} left the server.`);
  await updateStatsChannels(member.guild);
}

export async function handleFeatureGuildMemberUpdate(oldMember, newMember) {
  const boostedBefore = !oldMember.premiumSince && newMember.premiumSince;
  if (!boostedBefore) return;

  const guildData = await getGuildData(newMember.guild.id);
  if (guildData.config.boosterRoleId) {
    await newMember.roles.add(guildData.config.boosterRoleId, 'S.A.I booster reward.').catch(() => {});
  }

  const channel = await newMember.guild.channels
    .fetch(guildData.config.boosterChannelId)
    .catch(() => null);
  if (channel?.isTextBased()) {
    await channel.send(`Thanks for boosting, ${newMember}!`).catch(() => {});
  }
}

export async function handleFeatureVoiceStateUpdate(oldState, newState) {
  const now = Date.now();
  const oldKey = `${oldState.guild.id}:${oldState.id}`;

  if (!oldState.channelId && newState.channelId) {
    voiceJoinTimes.set(oldKey, now);
    return;
  }

  if (oldState.channelId && !newState.channelId) {
    await recordVoiceTime(oldState.guild, oldState.id, now);
    return;
  }

  if (oldState.channelId !== newState.channelId) {
    await recordVoiceTime(oldState.guild, oldState.id, now);
    voiceJoinTimes.set(oldKey, now);
  }
}

export async function createTemporaryTextChannel(voiceChannel, ownerId) {
  const guildData = await getGuildData(voiceChannel.guild.id);
  if (!guildData.config.tempTextEnabled) return null;

  const channel = await voiceChannel.guild.channels.create({
    name: `${voiceChannel.name}-chat`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 90),
    type: ChannelType.GuildText,
    parent: voiceChannel.parentId || null,
    permissionOverwrites: [
      { id: voiceChannel.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: ownerId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
    ],
    reason: 'S.A.I temporary voice room text channel.',
  });

  await channel.send(`Temporary text chat for ${voiceChannel}.`).catch(() => {});
  return channel;
}

async function runSetup(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'welcome') {
    const channel = interaction.options.getChannel('channel', true);
    const role = interaction.options.getRole('verified_role', true);
    const rules = interaction.options.getString('rules') || null;
    await updateGuildData(interaction.guildId, (guildData) => {
      guildData.config.welcomeChannelId = channel.id;
      guildData.config.verifiedRoleId = role.id;
      guildData.config.rulesText = rules;
    });
    await channel.send({
      embeds: [panelEmbed('Welcome & Rules', rules || 'Read the rules, then verify to unlock the server.')],
      components: [verifyRow()],
    });
    return interaction.reply({ content: 'Welcome/rules flow is set up.', ephemeral: true });
  }

  if (sub === 'roles') {
    const channel = interaction.options.getChannel('channel', true);
    const title = interaction.options.getString('title', true);
    const roles = [1, 2, 3, 4, 5]
      .map((index) => interaction.options.getRole(`role${index}`))
      .filter(Boolean);
    const menuId = `${Date.now()}`;
    await updateGuildData(interaction.guildId, (guildData) => {
      guildData.roleMenus[menuId] = {
        title,
        roleIds: roles.map((role) => role.id),
      };
    });
    await channel.send({
      embeds: [panelEmbed(title, 'Click a button to toggle a role.')],
      components: [new ActionRowBuilder().addComponents(roles.map((role) => button(`feature:role:${role.id}`, role.name, ButtonStyle.Secondary)))],
    });
    return interaction.reply({ content: 'Role button panel created.', ephemeral: true });
  }

  if (sub === 'tickets') {
    const channel = interaction.options.getChannel('channel', true);
    const category = interaction.options.getChannel('category');
    const supportRole = interaction.options.getRole('support_role');
    await updateGuildData(interaction.guildId, (guildData) => {
      guildData.config.ticketCategoryId = category?.id || null;
      guildData.config.supportRoleId = supportRole?.id || null;
    });
    await channel.send({
      embeds: [panelEmbed('Support Tickets', 'Open a private ticket if you need help.')],
      components: [new ActionRowBuilder().addComponents(button('feature:ticket:open', 'Open Ticket', ButtonStyle.Primary))],
    });
    return interaction.reply({ content: 'Ticket panel created.', ephemeral: true });
  }

  if (sub === 'logs') {
    const channel = interaction.options.getChannel('channel', true);
    await updateGuildData(interaction.guildId, (guildData) => {
      guildData.config.logChannelId = channel.id;
    });
    return interaction.reply({ content: `Server logs will go to ${channel}.`, ephemeral: true });
  }

  if (sub === 'systems') {
    const system = interaction.options.getString('system', true);
    const enabled = interaction.options.getBoolean('enabled', true);
    await updateGuildData(interaction.guildId, (guildData) => {
      guildData.config[system] = enabled;
    });
    return interaction.reply({ content: `${system} is now ${enabled ? 'enabled' : 'disabled'}.`, ephemeral: true });
  }

  if (sub === 'stats') {
    const category = interaction.options.getChannel('category', true);
    await updateGuildData(interaction.guildId, (guildData) => {
      guildData.config.statsCategoryId = category.id;
    });
    await updateStatsChannels(interaction.guild);
    return interaction.reply({ content: 'Server stat channels are configured.', ephemeral: true });
  }

  if (sub === 'booster') {
    const role = interaction.options.getRole('role');
    const channel = interaction.options.getChannel('channel');
    await updateGuildData(interaction.guildId, (guildData) => {
      guildData.config.boosterRoleId = role?.id || null;
      guildData.config.boosterChannelId = channel?.id || null;
    });
    return interaction.reply({ content: 'Booster rewards are configured.', ephemeral: true });
  }

  if (sub === 'confession') {
    const channel = interaction.options.getChannel('channel', true);
    await updateGuildData(interaction.guildId, (guildData) => {
      guildData.config.confessionChannelId = channel.id;
    });
    return interaction.reply({ content: `Confessions will post in ${channel}.`, ephemeral: true });
  }

  return false;
}

async function runTicket(interaction) {
  if (interaction.options.getSubcommand() !== 'close') return false;
  return closeTicket(interaction);
}

async function runMod(interaction) {
  const sub = interaction.options.getSubcommand();
  const targetUser = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason') || 'No reason provided.';

  if (sub === 'purge') {
    const amount = Math.min(Math.max(interaction.options.getInteger('amount', true), 1), 100);
    const deleted = await interaction.channel.bulkDelete(amount, true);
    await interaction.reply({ content: `Deleted ${deleted.size} messages.`, ephemeral: true });
    await logEvent(interaction.guild, 'Purge', `${interaction.user.tag} deleted ${deleted.size} messages in ${interaction.channel}.`);
    return true;
  }

  const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

  if (sub === 'warn') {
    await updateGuildData(interaction.guildId, (guildData) => {
      guildData.warnings[targetUser.id] ||= [];
      guildData.warnings[targetUser.id].push({
        reason,
        moderatorId: interaction.user.id,
        at: Date.now(),
      });
    });
    await interaction.reply({ content: `Warned ${targetUser.tag}.`, ephemeral: true });
    await logEvent(interaction.guild, 'Warning', `${targetUser.tag}: ${reason}`);
    return true;
  }

  if (sub === 'warnings') {
    const guildData = await getGuildData(interaction.guildId);
    const warnings = guildData.warnings[targetUser.id] || [];
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xf1c40f)
          .setTitle(`${targetUser.tag} warnings`)
          .setDescription(warnings.length ? warnings.map((warning, index) => `${index + 1}. ${warning.reason}`).join('\n') : 'No warnings.'),
      ],
      ephemeral: true,
    });
    return true;
  }

  if (!member && sub !== 'ban') {
    await interaction.reply({ content: 'That member is not in the server.', ephemeral: true });
    return true;
  }

  if (sub === 'timeout') {
    const minutes = interaction.options.getInteger('minutes', true);
    await member.timeout(minutes * 60 * 1000, reason);
    await interaction.reply({ content: `Timed out ${targetUser.tag} for ${minutes} minutes.`, ephemeral: true });
  } else if (sub === 'kick') {
    await member.kick(reason);
    await interaction.reply({ content: `Kicked ${targetUser.tag}.`, ephemeral: true });
  } else if (sub === 'ban') {
    await interaction.guild.members.ban(targetUser.id, { reason });
    await interaction.reply({ content: `Banned ${targetUser.tag}.`, ephemeral: true });
  }

  await logEvent(interaction.guild, `Mod ${sub}`, `${interaction.user.tag} used ${sub} on ${targetUser.tag}: ${reason}`);
  return true;
}

async function runPoll(interaction) {
  const question = interaction.options.getString('question', true);
  const options = [1, 2, 3, 4]
    .map((index) => interaction.options.getString(`option${index}`))
    .filter(Boolean);
  const pollId = `${Date.now()}`;

  await updateGuildData(interaction.guildId, (guildData) => {
    guildData.polls ||= {};
    guildData.polls[pollId] = {
      question,
      options,
      votes: {},
    };
  });

  await interaction.reply({
    embeds: [pollEmbed(question, options, {})],
    components: [pollButtons(pollId, options)],
  });
  return true;
}

async function runAfk(interaction) {
  const reason = interaction.options.getString('reason') || 'AFK';
  await updateGuildData(interaction.guildId, (guildData) => {
    guildData.afk[interaction.user.id] = { reason, since: Date.now() };
  });
  await interaction.reply({ content: `AFK set: ${reason}`, ephemeral: true });
  return true;
}

async function runRank(interaction) {
  const user = interaction.options.getUser('user') || interaction.user;
  const guildData = await getGuildData(interaction.guildId);
  const progress = getUserProgress(guildData, user.id);
  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle(`${user.username}'s rank`)
        .addFields(
          { name: 'Level', value: String(progress.level), inline: true },
          { name: 'XP', value: String(progress.xp), inline: true },
          { name: 'Coins', value: String(progress.coins), inline: true },
        ),
    ],
  });
  return true;
}

async function runLeaderboard(interaction) {
  const guildData = await getGuildData(interaction.guildId);
  const rows = Object.entries(guildData.levels)
    .sort(([, a], [, b]) => b.xp - a.xp)
    .slice(0, 10)
    .map(([userId, progress], index) => `${index + 1}. <@${userId}> - level ${progress.level}, ${progress.xp} XP`);
  await interaction.reply({
    embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle('XP Leaderboard').setDescription(rows.join('\n') || 'No XP yet.')],
  });
  return true;
}

async function runAnalytics(interaction) {
  const guildData = await getGuildData(interaction.guildId);
  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle('Server Analytics')
        .addFields(
          { name: 'Joins', value: String(guildData.analytics.joins), inline: true },
          { name: 'Leaves', value: String(guildData.analytics.leaves), inline: true },
          { name: 'Messages', value: String(guildData.analytics.messages), inline: true },
          {
            name: 'Voice Activity',
            value: `${Math.floor(guildData.analytics.voiceSeconds / 60)} minutes`,
            inline: true,
          },
        ),
    ],
    ephemeral: true,
  });
  return true;
}

async function runInvites(interaction) {
  const guildData = await getGuildData(interaction.guildId);
  const rows = Object.entries(guildData.invites)
    .sort(([, a], [, b]) => b.joins - a.joins)
    .slice(0, 10)
    .map(([userId, invite], index) => `${index + 1}. <@${userId}> - ${invite.joins} join(s)`);

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle('Invite Tracker')
        .setDescription(rows.join('\n') || 'No tracked invites yet.'),
    ],
    ephemeral: true,
  });
  return true;
}

async function runRaid(interaction) {
  const enabled = interaction.options.getBoolean('enabled', true);
  await updateGuildData(interaction.guildId, (guildData) => {
    guildData.config.raidMode = enabled;
  });
  await interaction.reply({ content: `Raid mode is now ${enabled ? 'enabled' : 'disabled'}.`, ephemeral: true });
  await logEvent(interaction.guild, 'Raid Mode', `${interaction.user.tag} set raid mode to ${enabled}.`);
  return true;
}

async function runBackup(interaction) {
  const sub = interaction.options.getSubcommand();
  if (sub === 'save') {
    const backup = {
      at: Date.now(),
      roles: interaction.guild.roles.cache
        .filter((role) => role.id !== interaction.guild.id)
        .map((role) => ({ id: role.id, name: role.name, color: role.hexColor, position: role.position })),
      channels: interaction.guild.channels.cache.map((channel) => ({
        id: channel.id,
        name: channel.name,
        type: channel.type,
        parentId: channel.parentId,
      })),
    };
    await updateGuildData(interaction.guildId, (guildData) => {
      guildData.backups.latest = backup;
    });
    await interaction.reply({ content: `Backup saved with ${backup.roles.length} roles and ${backup.channels.length} channels.`, ephemeral: true });
    return true;
  }

  const guildData = await getGuildData(interaction.guildId);
  const backup = guildData.backups.latest;
  await interaction.reply({
    content: backup
      ? `Latest backup: <t:${Math.floor(backup.at / 1000)}:F>, ${backup.roles.length} roles, ${backup.channels.length} channels.`
      : 'No backup saved yet.',
    ephemeral: true,
  });
  return true;
}

async function runShop(interaction) {
  const sub = interaction.options.getSubcommand();
  const guildData = await getGuildData(interaction.guildId);

  if (sub === 'add-role') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({ content: 'Administrator permission is required.', ephemeral: true });
      return true;
    }

    const role = interaction.options.getRole('role', true);
    const price = interaction.options.getInteger('price', true);
    await updateGuildData(interaction.guildId, (data) => {
      data.shops[role.id] = { roleId: role.id, price };
    });
    await interaction.reply({ content: `${role} added to the shop for ${price} coins.`, ephemeral: true });
    return true;
  }

  const items = Object.values(guildData.shops || {});
  if (!items.length) {
    await interaction.reply({ content: 'The shop is empty.', ephemeral: true });
    return true;
  }

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle('Server Shop')
        .setDescription(items.map((item) => `<@&${item.roleId}> - ${item.price} coins`).join('\n')),
    ],
    components: [
      new ActionRowBuilder().addComponents(
        items.slice(0, 5).map((item) => button(`feature:shop:${item.roleId}`, `Buy ${item.price}`, ButtonStyle.Success)),
      ),
    ],
    ephemeral: true,
  });
  return true;
}

async function runEmoji(interaction) {
  if (interaction.options.getSubcommand() !== 'add') return false;

  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: 'Administrator permission is required.', ephemeral: true });
    return true;
  }

  const me = await interaction.guild.members.fetchMe().catch(() => null);
  if (!me?.permissions.has(PermissionFlagsBits.ManageGuildExpressions)) {
    await interaction.reply({
      content: 'S.A.I needs the Manage Expressions permission to add emojis.',
      ephemeral: true,
    });
    return true;
  }

  const name = interaction.options.getString('name', true).trim();
  if (!/^[a-zA-Z0-9_]{2,32}$/.test(name)) {
    await interaction.reply({
      content: 'Emoji name must be 2-32 characters and only use letters, numbers, or underscores.',
      ephemeral: true,
    });
    return true;
  }

  const attachment = interaction.options.getAttachment('image');
  const imageUrl = interaction.options.getString('image_url');
  const emojiInput = interaction.options.getString('emoji');
  const source = getEmojiSource(attachment, imageUrl, emojiInput);

  if (!source) {
    await interaction.reply({
      content: 'Give me an image attachment, direct image URL, or existing custom emoji to clone.',
      ephemeral: true,
    });
    return true;
  }

  await interaction.deferReply({ ephemeral: true });

  const emoji = await interaction.guild.emojis
    .create({
      attachment: source,
      name,
      reason: `S.A.I emoji add requested by ${interaction.user.tag}.`,
    })
    .catch(async (error) => {
      console.error('Emoji create failed:', error);
      await interaction.editReply('Could not add that emoji. Check the image type, server emoji slots, and bot permissions.');
      return null;
    });

  if (!emoji) return true;

  await interaction.editReply(`Added emoji ${emoji} as \`:${emoji.name}:\`.`);
  await logEvent(interaction.guild, 'Emoji Added', `${interaction.user.tag} added ${emoji} as \`:${emoji.name}:\`.`);
  return true;
}

async function handleLordNicknameCommand(message) {
  const member = await message.guild.members.fetch(message.author.id).catch(() => null);
  if (!member?.permissions.has(PermissionFlagsBits.Administrator)) return false;

  const parsed = parseLordNicknameCommand(message);
  if (!parsed) return false;

  const target = await message.guild.members.fetch(parsed.userId).catch(() => null);
  if (!target) {
    await message.reply('I could not find that member.').catch(() => {});
    return true;
  }

  if (!target.manageable) {
    await message.reply('I cannot change that member nickname because their role is above S.A.I.').catch(() => {});
    return true;
  }

  await target.setNickname(parsed.nickname, `S.A.I lord command by ${message.author.tag}.`);
  await sendLordWebhookReply(message, target);
  await logEvent(
    message.guild,
    'Lord Nickname Command',
    `${message.author.tag} renamed ${target.user.tag} to **${parsed.nickname}**.`,
  );
  return true;
}

async function verifyMember(interaction) {
  const guildData = await getGuildData(interaction.guildId);
  const roleId = guildData.config.verifiedRoleId;
  if (!roleId) {
    await interaction.reply({ content: 'No verified role is configured.', ephemeral: true });
    return true;
  }
  await interaction.member.roles.add(roleId, 'S.A.I welcome verification.');
  await interaction.reply({ content: 'You are verified.', ephemeral: true });
  return true;
}

async function toggleRole(interaction, roleId) {
  const role = await interaction.guild.roles.fetch(roleId).catch(() => null);
  if (!role) {
    await interaction.reply({ content: 'That role no longer exists.', ephemeral: true });
    return true;
  }
  const hasRole = interaction.member.roles.cache.has(role.id);
  await interaction.member.roles[hasRole ? 'remove' : 'add'](role.id, 'S.A.I button role.');
  await interaction.reply({ content: `${hasRole ? 'Removed' : 'Added'} ${role}.`, ephemeral: true });
  return true;
}

async function openTicket(interaction) {
  const guildData = await getGuildData(interaction.guildId);
  const existing = Object.values(guildData.tickets).find((ticket) => ticket.ownerId === interaction.user.id && !ticket.closed);
  if (existing) {
    await interaction.reply({ content: `You already have an open ticket: <#${existing.channelId}>`, ephemeral: true });
    return true;
  }

  const overwrites = [
    { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
  ];
  if (guildData.config.supportRoleId) {
    overwrites.push({ id: guildData.config.supportRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });
  }

  const channel = await interaction.guild.channels.create({
    name: `ticket-${interaction.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 90),
    type: ChannelType.GuildText,
    parent: guildData.config.ticketCategoryId || null,
    permissionOverwrites: overwrites,
    reason: 'S.A.I support ticket.',
  });

  await updateGuildData(interaction.guildId, (data) => {
    data.tickets[channel.id] = { channelId: channel.id, ownerId: interaction.user.id, closed: false, createdAt: Date.now() };
  });
  await channel.send({
    content: `${interaction.user}`,
    embeds: [panelEmbed('Ticket Opened', 'Staff will help you here. Use the button below or `/ticket close` to close it.')],
    components: [new ActionRowBuilder().addComponents(button('feature:close_ticket', 'Close Ticket', ButtonStyle.Danger))],
  });
  await interaction.reply({ content: `Ticket created: ${channel}`, ephemeral: true });
  return true;
}

async function closeTicket(interaction) {
  const guildData = await getGuildData(interaction.guildId);
  const ticket = guildData.tickets[interaction.channelId];
  if (!ticket) {
    await interaction.reply({ content: 'This is not a S.A.I ticket channel.', ephemeral: true });
    return true;
  }

  await updateGuildData(interaction.guildId, (data) => {
    data.tickets[interaction.channelId].closed = true;
    data.tickets[interaction.channelId].closedAt = Date.now();
  });
  await interaction.reply({ content: 'Closing this ticket in 5 seconds.', ephemeral: true });
  setTimeout(() => interaction.channel.delete('S.A.I ticket closed.').catch(() => {}), 5000);
  return true;
}

async function votePoll(interaction, pollId, optionIndex) {
  const guildData = await getGuildData(interaction.guildId);
  const poll = guildData.polls?.[pollId];
  if (!poll) {
    await interaction.reply({ content: 'That poll is no longer active.', ephemeral: true });
    return true;
  }
  poll.votes[interaction.user.id] = optionIndex;
  await updateGuildData(interaction.guildId, () => {});
  await interaction.update({
    embeds: [pollEmbed(poll.question, poll.options, poll.votes)],
    components: [pollButtons(pollId, poll.options)],
  });
  return true;
}

async function buyShopRole(interaction, roleId) {
  const guildData = await getGuildData(interaction.guildId);
  const item = guildData.shops[roleId];
  const progress = getUserProgress(guildData, interaction.user.id);
  if (!item || progress.coins < item.price) {
    await interaction.reply({ content: 'You do not have enough coins for that.', ephemeral: true });
    return true;
  }
  progress.coins -= item.price;
  await interaction.member.roles.add(roleId, 'S.A.I shop purchase.');
  await updateGuildData(interaction.guildId, () => {});
  await interaction.reply({ content: `Purchased <@&${roleId}>.`, ephemeral: true });
  return true;
}

function showConfessionModal(interaction) {
  return interaction.showModal(
    new ModalBuilder()
      .setCustomId('feature_confession_modal')
      .setTitle('Anonymous Confession')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('confession')
            .setLabel('Confession')
            .setStyle(TextInputStyle.Paragraph)
            .setMinLength(3)
            .setMaxLength(1800)
            .setRequired(true),
        ),
      ),
  );
}

async function runSnipe(interaction, cache, type) {
  const sniped = cache.get(interaction.channelId);
  await interaction.reply({
    embeds: [
      sniped
        ? new EmbedBuilder()
            .setColor(0xe67e22)
            .setTitle(`Last ${type} message`)
            .addFields(
              { name: 'Author', value: sniped.author, inline: true },
              { name: type === 'edited' ? 'Before' : 'Message', value: trim(sniped.before || sniped.content, 1000) },
              ...(type === 'edited' ? [{ name: 'After', value: trim(sniped.after, 1000) }] : []),
            )
        : new EmbedBuilder().setColor(0x95a5a6).setTitle('Nothing to snipe'),
    ],
    ephemeral: true,
  });
  return true;
}

async function recordVoiceTime(guild, userId, now) {
  const key = `${guild.id}:${userId}`;
  const joinedAt = voiceJoinTimes.get(key);
  if (!joinedAt) return;
  voiceJoinTimes.delete(key);

  const seconds = Math.max(0, Math.floor((now - joinedAt) / 1000));
  if (seconds < 30) return;

  await updateGuildData(guild.id, (guildData) => {
    guildData.analytics.voiceSeconds += seconds;
    if (guildData.config.voiceRewardsEnabled) {
      addUserProgress(guildData, userId, Math.floor(seconds / 30), guildData.config.economyEnabled ? Math.floor(seconds / 120) : 0);
    }
  });
}

async function refreshInviteCache(guild) {
  const invites = await guild.invites.fetch().catch(() => null);
  if (!invites) return;

  await updateGuildData(guild.id, (guildData) => {
    guildData.inviteUses = Object.fromEntries(invites.map((invite) => [invite.code, invite.uses || 0]));
  });
}

async function detectInvite(guild, guildData) {
  const invites = await guild.invites.fetch().catch(() => null);
  if (!invites) return null;

  let usedInvite = null;
  for (const invite of invites.values()) {
    const oldUses = guildData.inviteUses[invite.code] || 0;
    if ((invite.uses || 0) > oldUses) {
      usedInvite = invite;
      break;
    }
  }

  guildData.inviteUses = Object.fromEntries(invites.map((invite) => [invite.code, invite.uses || 0]));
  if (!usedInvite?.inviter) return null;

  guildData.invites[usedInvite.inviter.id] ||= { joins: 0 };
  guildData.invites[usedInvite.inviter.id].joins += 1;
  return `${usedInvite.inviter.tag} (${usedInvite.code})`;
}

async function updateStatsChannels(guild) {
  const guildData = await getGuildData(guild.id);
  if (!guildData.config.statsCategoryId) return;

  const categoryId = guildData.config.statsCategoryId;
  const stats = [
    ['members', `Members: ${guild.memberCount}`],
    ['boosts', `Boosts: ${guild.premiumSubscriptionCount || 0}`],
    ['joins', `Joins: ${guildData.analytics.joins}`],
  ];

  guildData.stats ||= {};
  for (const [key, name] of stats) {
    const existing = guildData.stats[key]
      ? await guild.channels.fetch(guildData.stats[key]).catch(() => null)
      : null;
    if (existing) {
      await existing.setName(name).catch(() => {});
    } else {
      const channel = await guild.channels
        .create({
          name,
          type: ChannelType.GuildVoice,
          parent: categoryId,
          permissionOverwrites: [{ id: guild.id, deny: [PermissionFlagsBits.Connect] }],
          reason: 'S.A.I stat channel.',
        })
        .catch(() => null);
      if (channel) guildData.stats[key] = channel.id;
    }
  }
  await updateGuildData(guild.id, () => {});
}

async function logEvent(guild, title, description) {
  const guildData = await getGuildData(guild.id);
  const channel = await guild.channels.fetch(guildData.config.logChannelId).catch(() => null);
  if (!channel?.isTextBased()) return;
  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle(title)
        .setDescription(description)
        .setTimestamp(),
    ],
  }).catch(() => {});
}

function addUserProgress(guildData, userId, xp, coins) {
  const progress = getUserProgress(guildData, userId);
  progress.xp += xp;
  progress.coins += coins;
  progress.level = Math.floor(Math.sqrt(progress.xp / 100)) + 1;
}

function getUserProgress(guildData, userId) {
  guildData.levels[userId] ||= { xp: 0, level: 1, coins: 0 };
  guildData.levels[userId].coins ||= 0;
  return guildData.levels[userId];
}

function shouldAutoMod(content) {
  return /(discord\.gg\/|discord\.com\/invite\/|@everyone|@here)/i.test(content);
}

function verifyRow() {
  return new ActionRowBuilder().addComponents(button('feature:verify', 'Accept Rules', ButtonStyle.Success));
}

function panelEmbed(title, description) {
  return new EmbedBuilder().setColor(0x5865f2).setTitle(title).setDescription(description);
}

function pollEmbed(question, options, votes) {
  const counts = options.map((_, index) => Object.values(votes).filter((vote) => vote === index).length);
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(question)
    .setDescription(options.map((option, index) => `**${index + 1}.** ${option} - ${counts[index]} vote(s)`).join('\n'));
}

function pollButtons(pollId, options) {
  return new ActionRowBuilder().addComponents(
    options.map((option, index) =>
      button(`feature:poll:${pollId}:${index}`, String(index + 1), ButtonStyle.Secondary),
    ),
  );
}

function getEmojiSource(attachment, imageUrl, emojiInput) {
  if (attachment?.url) return attachment.url;
  if (imageUrl?.startsWith('http://') || imageUrl?.startsWith('https://')) return imageUrl;

  const customEmoji = emojiInput?.match(/^<(?<animated>a?):(?<name>[a-zA-Z0-9_]+):(?<id>\d{17,20})>$/);
  if (!customEmoji?.groups) return null;

  const extension = customEmoji.groups.animated ? 'gif' : 'png';
  return `https://cdn.discordapp.com/emojis/${customEmoji.groups.id}.${extension}?quality=lossless`;
}

function parseLordNicknameCommand(message) {
  const content = message.content.trim().replace(/\s+/g, ' ');
  const patterns = [
    /^(?:i\s+)?sai\s+command\s+<@!?(?<userId>\d{17,20})>\s+to\s+nick\s+(?:your\s*self|yourself|them|him|her)\s+(?<nickname>.+)$/i,
    /^sai\s+nick\s+<@!?(?<userId>\d{17,20})>\s+(?<nickname>.+)$/i,
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (!match?.groups) continue;

    const nickname = match.groups.nickname.trim().slice(0, 32);
    if (!nickname) return null;

    return {
      userId: match.groups.userId,
      nickname,
    };
  }

  return null;
}

async function sendLordWebhookReply(message, target) {
  const username = target.displayName || target.user.username;
  const avatarURL = target.displayAvatarURL({ size: 256 }) ||
    target.user.displayAvatarURL({ size: 256 });

  if (message.channel?.createWebhook) {
    const webhook = await message.channel
      .createWebhook({
        name: username.slice(0, 80),
        avatar: avatarURL,
        reason: 'S.A.I lord nickname command response.',
      })
      .catch(() => null);

    if (webhook) {
      await webhook
        .send({
          content: 'Yes, My Lord!',
          allowedMentions: { parse: [] },
        })
        .catch(() => {});
      await webhook.delete('S.A.I lord nickname command response complete.').catch(() => {});
      return;
    }
  }

  await message.reply('Yes, My Lord!').catch(() => {});
}

function button(customId, label, style) {
  return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style);
}

function trim(value, max) {
  if (!value) return '[empty]';
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}
