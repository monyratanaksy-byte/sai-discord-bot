import crypto from 'node:crypto';
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
import { config } from './config.js';
import { getGuildData, updateGuildData } from './storage.js';

const voiceJoinTimes = new Map();
const voiceSessionStats = new Map();
const voiceRewardIntervalMs = 5 * 60_000;
const boosterRewardMultiplier = 1.5;
const voiceCompanionRewardMultiplier = 1.5;
const dailyRewardCoins = 150;
const dailyRewardCooldownMs = 24 * 60 * 60 * 1000;
const rankPassCooldownMs = 6 * 60 * 60 * 1000;
const voiceMilestoneHours = [1, 5, 10, 25, 50, 100, 250, 500, 1000];
const deletedMessages = new Map();
const editedMessages = new Map();
const reminderTimers = new Map();
const hiddenCommandDeletes = new Set();
const recentMessageTimes = new Map();

export const featureCommands = [
  new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configure S.A.I server systems.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName('template')
        .setDescription('Create the recommended S.A.I server layout, roles, and permissions.'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('welcome')
        .setDescription('Set the welcome channel and automatic member role.')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Where welcome messages are posted.')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        )
        .addRoleOption((option) =>
          option
            .setName('auto_role')
            .setDescription('Role automatically given when a member joins.')
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName('message')
            .setDescription('Short custom welcome message.')
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('welcome-off')
        .setDescription('Disable welcome messages and automatic join role.'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('verify')
        .setDescription('Set up verification role, verify channel, and locked server permissions.')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Channel where unverified users verify.')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        )
        .addRoleOption((option) =>
          option.setName('role').setDescription('Role users receive after verifying. Created if omitted.').setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('voice-categories')
        .setDescription('Set where normal and booster join-to-create rooms are made.')
        .addChannelOption((option) =>
          option
            .setName('normal')
            .setDescription('Category for normal Garden rooms.')
            .addChannelTypes(ChannelType.GuildCategory)
            .setRequired(true),
        )
        .addChannelOption((option) =>
          option
            .setName('booster')
            .setDescription('Category for booster perk rooms.')
            .addChannelTypes(ChannelType.GuildCategory)
            .setRequired(true),
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
        )
        .addChannelOption((option) =>
          option
            .setName('category')
            .setDescription('Category where booster perk voice rooms are created.')
            .addChannelTypes(ChannelType.GuildCategory)
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
    .setName('testverify')
    .setDescription('Create a test Discord OAuth verification link.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName('senduser')
    .setDescription('Add one verified S.A.I user to another server.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption((option) =>
      option.setName('user').setDescription('Verified user to add.').setRequired(true),
    )
    .addStringOption((option) =>
      option.setName('server_id').setDescription('Target server ID where S.A.I is already installed.').setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName('sendverified')
    .setDescription('Add verified S.A.I users to another server.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((option) =>
      option.setName('server_id').setDescription('Target server ID where S.A.I is already installed.').setRequired(true),
    )
    .addIntegerOption((option) =>
      option.setName('limit').setDescription('Maximum users to try, default 100.').setRequired(false),
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
        .setName('unwarn')
        .setDescription('Remove a warning by case number.')
        .addIntegerOption((option) => option.setName('case').setDescription('Case number.').setRequired(true)),
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
        .setName('untimeout')
        .setDescription('Remove a member timeout.')
        .addUserOption((option) => option.setName('user').setDescription('Member.').setRequired(true))
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
        .setName('unban')
        .setDescription('Unban a user by ID.')
        .addStringOption((option) => option.setName('user_id').setDescription('Discord user ID.').setRequired(true))
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
    .setName('balance')
    .setDescription('Show your coin balance.')
    .addUserOption((option) => option.setName('user').setDescription('User.').setRequired(false)),
  new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Claim your daily coin reward.'),
  new SlashCommandBuilder()
    .setName('gamble')
    .setDescription('Play coin gambling games with server coins.')
    .addSubcommand((sub) =>
      sub
        .setName('slots')
        .setDescription('Spin the S.A.I slot machine.')
        .addIntegerOption((option) => option.setName('amount').setDescription('Coins to bet.').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('coinflip')
        .setDescription('Bet on heads or tails.')
        .addIntegerOption((option) => option.setName('amount').setDescription('Coins to bet.').setRequired(true))
        .addStringOption((option) =>
          option
            .setName('choice')
            .setDescription('Your side.')
            .setRequired(true)
            .addChoices({ name: 'Heads', value: 'heads' }, { name: 'Tails', value: 'tails' }),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('dice')
        .setDescription('Guess a dice roll from 1 to 6.')
        .addIntegerOption((option) => option.setName('amount').setDescription('Coins to bet.').setRequired(true))
        .addIntegerOption((option) =>
          option
            .setName('guess')
            .setDescription('Number from 1 to 6.')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(6),
        ),
    )
    .addSubcommand((sub) => sub.setName('stats').setDescription('Show your gambling stats.'))
    .addSubcommand((sub) => sub.setName('leaderboard').setDescription('Show the gambling leaderboard.')),
  new SlashCommandBuilder()
    .setName('givecoins')
    .setDescription('Give coins to another member.')
    .addUserOption((option) => option.setName('user').setDescription('User.').setRequired(true))
    .addIntegerOption((option) => option.setName('amount').setDescription('Coins to give.').setRequired(true)),
  new SlashCommandBuilder()
    .setName('rate')
    .setDescription('Show how fast you earn XP and coins.'),
  new SlashCommandBuilder()
    .setName('activity')
    .setDescription('Configure public activity announcements.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName('setup')
        .setDescription('Set the channel for level-ups, milestones, and leaderboards.')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Activity feed channel.')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        ),
    ),
  new SlashCommandBuilder()
    .setName('vcleaderboard')
    .setDescription('Show the voice activity leaderboard.')
    .addStringOption((option) =>
      option
        .setName('period')
        .setDescription('Leaderboard period.')
        .setRequired(true)
        .addChoices(
          { name: 'Daily', value: 'daily' },
          { name: 'Weekly', value: 'weekly' },
          { name: 'All time', value: 'alltime' },
        ),
    )
    .addBooleanOption((option) =>
      option.setName('public').setDescription('Post publicly instead of private.').setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Show the server XP leaderboard.'),
  new SlashCommandBuilder()
    .setName('economy')
    .setDescription('Admin XP and coin controls.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName('add-xp')
        .setDescription('Add XP to a member.')
        .addUserOption((option) => option.setName('user').setDescription('User.').setRequired(true))
        .addIntegerOption((option) => option.setName('amount').setDescription('XP amount.').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('add-coins')
        .setDescription('Add coins to a member.')
        .addUserOption((option) => option.setName('user').setDescription('User.').setRequired(true))
        .addIntegerOption((option) => option.setName('amount').setDescription('Coin amount.').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('set-xp')
        .setDescription('Set a member XP total.')
        .addUserOption((option) => option.setName('user').setDescription('User.').setRequired(true))
        .addIntegerOption((option) => option.setName('amount').setDescription('XP amount.').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('set-coins')
        .setDescription('Set a member coin total.')
        .addUserOption((option) => option.setName('user').setDescription('User.').setRequired(true))
        .addIntegerOption((option) => option.setName('amount').setDescription('Coin amount.').setRequired(true)),
    ),
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
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove-role')
        .setDescription('Remove a role from the shop.')
        .addRoleOption((option) => option.setName('role').setDescription('Role.').setRequired(true)),
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
  new SlashCommandBuilder()
    .setName('role')
    .setDescription('Admin role tools.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName('give-everyone')
        .setDescription('Give a role to every non-bot member.')
        .addRoleOption((option) =>
          option.setName('role').setDescription('Role to give everyone.').setRequired(true),
        ),
    ),
  new SlashCommandBuilder()
    .setName('bot')
    .setDescription('Admin bot profile tools.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName('profile')
        .setDescription('Update S.A.I username, avatar, or server display name.')
        .addStringOption((option) =>
          option.setName('username').setDescription('New global bot username.').setRequired(false),
        )
        .addStringOption((option) =>
          option.setName('avatar_url').setDescription('Direct image URL for bot avatar.').setRequired(false),
        )
        .addStringOption((option) =>
          option.setName('display_name').setDescription('Bot display name/nickname in this server.').setRequired(false),
        ),
    ),
].map((command) => command.toJSON());

export async function initFeatures(client) {
  await Promise.all(client.guilds.cache.map((guild) => refreshInviteCache(guild)));
  await Promise.all(client.guilds.cache.map((guild) => updateStatsChannels(guild)));
  await Promise.all(client.guilds.cache.map((guild) => scheduleGuildReminders(client, guild.id)));
  seedActiveVoiceMembers(client);
  setInterval(() => rewardActiveVoiceMembers(client), voiceRewardIntervalMs).unref();
}

export async function runFeatureSlashCommand(interaction) {
  if (interaction.commandName === 'setup') return runSetup(interaction);
  if (interaction.commandName === 'testverify') return runTestVerify(interaction);
  if (interaction.commandName === 'senduser') return runSendUser(interaction);
  if (interaction.commandName === 'sendverified') return runSendVerified(interaction);
  if (interaction.commandName === 'ticket') return runTicket(interaction);
  if (interaction.commandName === 'mod') return runMod(interaction);
  if (interaction.commandName === 'poll') return runPoll(interaction);
  if (interaction.commandName === 'afk') return runAfk(interaction);
  if (interaction.commandName === 'rank') return runRank(interaction);
  if (interaction.commandName === 'balance') return runBalance(interaction);
  if (interaction.commandName === 'daily') return runDaily(interaction);
  if (interaction.commandName === 'gamble') return runGamble(interaction);
  if (interaction.commandName === 'givecoins') return runGiveCoins(interaction);
  if (interaction.commandName === 'rate') return runRate(interaction);
  if (interaction.commandName === 'activity') return runActivity(interaction);
  if (interaction.commandName === 'vcleaderboard') return runVoiceLeaderboard(interaction);
  if (interaction.commandName === 'leaderboard') return runLeaderboard(interaction);
  if (interaction.commandName === 'economy') return runEconomy(interaction);
  if (interaction.commandName === 'analytics') return runAnalytics(interaction);
  if (interaction.commandName === 'invites') return runInvites(interaction);
  if (interaction.commandName === 'confess') return showConfessionModal(interaction);
  if (interaction.commandName === 'snipe') return runSnipe(interaction, deletedMessages, 'deleted');
  if (interaction.commandName === 'editsnipe') return runSnipe(interaction, editedMessages, 'edited');
  if (interaction.commandName === 'raid') return runRaid(interaction);
  if (interaction.commandName === 'backup') return runBackup(interaction);
  if (interaction.commandName === 'shop') return runShop(interaction);
  if (interaction.commandName === 'emoji') return runEmoji(interaction);
  if (interaction.commandName === 'role') return runRole(interaction);
  if (interaction.commandName === 'bot') return runBotProfile(interaction);
  return false;
}

export async function handleFeatureButton(interaction) {
  const [scope, action, ...args] = interaction.customId.split(':');
  if (scope !== 'feature') return false;

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
        .setFooter({ text: 'Want to add a confession? Use /confess' })
        .setTimestamp(),
    ],
  });
  await sendConfessionAudit(interaction, text).catch((error) => {
    console.error('Confession audit webhook failed:', error);
  });
  await interaction.reply({ content: 'Your confession was sent anonymously.', ephemeral: true });
  return true;
}

export async function handleFeatureMessageCreate(message) {
  if (!message.guild || message.author.bot) return;
  const guildData = await getGuildData(message.guild.id);
  let levelUpNotice = null;
  guildData.analytics.messages += 1;

  if (await handleAdminSayCommand(message)) {
    await updateGuildData(message.guild.id, () => {});
    return;
  }

  if (await handleLordReminderCommand(message)) {
    await updateGuildData(message.guild.id, () => {});
    return;
  }

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

  const responder = Object.values(guildData.autoresponders || {}).find((item) =>
    item.enabled !== false && message.content.toLowerCase().includes(String(item.trigger || '').toLowerCase()));
  if (responder?.response) {
    await message.channel.send({ content: responder.response, allowedMentions: { parse: [] } }).catch(() => {});
  }

  const isAdmin =
    message.member?.permissions?.has(PermissionFlagsBits.Administrator) || false;
  const exemptRole = message.member?.roles.cache.some((role) => guildData.config.automodExemptRoleIds?.includes(role.id));
  const exemptChannel = guildData.config.automodExemptChannelIds?.includes(message.channelId);
  const automodReason = getAutoModReason(message, guildData);
  if (guildData.config.automodEnabled && !isAdmin && !exemptRole && !exemptChannel && automodReason) {
    await message.delete().catch(() => {});
    await message.channel
      .send(`${message.author}, that message was blocked by AutoMod.`)
      .then((sent) => setTimeout(() => sent.delete().catch(() => {}), 5000))
      .catch(() => {});
    await createModerationCase(message.guild.id, {
      type: 'automod',
      userId: message.author.id,
      moderatorId: message.client.user.id,
      reason: automodReason,
    });
    await logEvent(message.guild, 'AutoMod', `${message.author.tag} was blocked in ${message.channel}: ${automodReason}`);
    return;
  }

  if (guildData.config.levelingEnabled) {
    const result = addUserProgress(guildData, message.author.id, 8, guildData.config.economyEnabled ? 2 : 0, rewardMultiplierForMember(message.member));
    if (result.leveledUp) {
      levelUpNotice = { userId: message.author.id, level: result.level };
    }
    queueRankPassAnnouncement(message.guild, guildData, message.author.id, result);
  }

  await updateGuildData(message.guild.id, () => {});
  if (levelUpNotice) {
    await sendLevelUpMessage(message.guild, message.author.id, levelUpNotice.level).catch(() => {});
  }
}

export async function handleFeatureMessageDelete(message) {
  if (!message.guild || message.author?.bot || !message.content) return;
  if (hiddenCommandDeletes.delete(message.id)) return;
  deletedMessages.set(message.channel.id, {
    author: message.author.tag,
    content: message.content,
    createdTimestamp: message.createdTimestamp,
  });
  await logEvent(message.guild, 'Message Deleted', `**${message.author.tag}** in ${message.channel}:\n${trim(message.content, 900)}`);
}

export async function handleFeatureMessageUpdate(oldMessage, newMessage) {
  if (
    !oldMessage.guild
    || !oldMessage.author
    || oldMessage.author.bot
    || oldMessage.content === newMessage.content
    || (!oldMessage.content && !newMessage.content)
  ) {
    return;
  }

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

  const autoRoleId = guildData.config.autoRoleId;
  if (autoRoleId) {
    await member.roles.add(autoRoleId, 'S.A.I automatic join role.').catch(() => {});
  }

  const invite = await detectInvite(member.guild, guildData);
  const welcomeChannel = await member.guild.channels
    .fetch(guildData.config.welcomeChannelId)
    .catch(() => null);

  if (typeof welcomeChannel?.isTextBased === 'function' && welcomeChannel.isTextBased()) {
    const memberNumber = member.guild.memberCount || guildData.analytics.joins;
    const inviteText = invite
      ? `${invite.inviterTag} with \`${invite.code}\` (${invite.joins} total invite${invite.joins === 1 ? '' : 's'})`
      : 'Unknown invite';
    await welcomeChannel.send({
      content: `Welcome ${member}!`,
      embeds: [
        new EmbedBuilder()
          .setColor(0x57f287)
          .setTitle(`Welcome, ${member.user.username}`)
          .setDescription(
            guildData.config.rulesText
              || 'We are happy you made it here. Get comfortable, say hi when you are ready, and enjoy the server.',
          )
          .setThumbnail(member.displayAvatarURL({ size: 128 }))
          .addFields(
            { name: 'Member Number', value: `#${memberNumber}`, inline: true },
            { name: 'Invited By', value: inviteText, inline: true },
            { name: 'Getting Started', value: 'Check the channels, join a voice room, or open a ticket if you need help.' },
          )
          .setFooter({ text: `Joined ${member.guild.name}` })
          .setTimestamp(),
      ],
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
  if (typeof channel?.isTextBased === 'function' && channel.isTextBased()) {
    await channel.send(`Thanks for boosting, ${newMember}!`).catch(() => {});
  }
}

export async function handleFeatureVoiceStateUpdate(oldState, newState) {
  const now = Date.now();
  const oldKey = `${oldState.guild.id}:${oldState.id}`;

  if (!oldState.channelId && newState.channelId) {
    voiceJoinTimes.set(oldKey, now);
    voiceSessionStats.set(oldKey, { startedAt: now, seconds: 0, xp: 0, coins: 0 });
    return;
  }

  if (oldState.channelId && !newState.channelId) {
    await recordVoiceTime(oldState.guild, oldState.id, now, { final: true, voiceChannel: oldState.channel });
    return;
  }

  if (oldState.channelId !== newState.channelId) {
    await recordVoiceTime(oldState.guild, oldState.id, now, { voiceChannel: oldState.channel });
    voiceJoinTimes.set(oldKey, now);
    voiceSessionStats.set(oldKey, voiceSessionStats.get(oldKey) || { startedAt: now, seconds: 0, xp: 0, coins: 0 });
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

async function runServerTemplateSetup(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const me = await interaction.guild.members.fetchMe().catch(() => null);
  const requiredPermissions = [
    PermissionFlagsBits.ManageChannels,
    PermissionFlagsBits.ManageRoles,
    PermissionFlagsBits.ManageWebhooks,
  ];
  const missing = requiredPermissions.filter((permission) => !me?.permissions.has(permission));
  if (missing.length > 0) {
    await interaction.editReply(
      'S.A.I needs Manage Channels, Manage Roles, and Manage Webhooks before I can build the server layout.',
    );
    return true;
  }

  const everyoneRole = interaction.guild.roles.everyone;
  const memberRole = await getOrCreateRole(interaction.guild, {
    name: 'Member',
    color: 0x57f287,
    reason: 'S.A.I server template auto member role.',
  });
  const staffRole = await getOrCreateRole(interaction.guild, {
    name: 'Staff',
    color: 0x5865f2,
    reason: 'S.A.I server template staff role.',
  });

  const categoryInfo = await getOrCreateCategory(interaction.guild, 'info・🌸', [
    denySend(everyoneRole.id),
    allowRead(memberRole.id),
  ]);
  const categoryChat = await getOrCreateCategory(interaction.guild, 'chat・🌐', [
    denyView(everyoneRole.id),
    allowReadWrite(memberRole.id),
  ]);
  const categoryVoice = await getOrCreateCategory(interaction.guild, 'voice・🎧', [
    denyView(everyoneRole.id),
    allowVoice(memberRole.id),
  ]);
  const categoryBoosterVoice = await getOrCreateCategory(interaction.guild, 'booster perks・💎', [
    denyView(everyoneRole.id),
    allowVoice(memberRole.id),
  ]);
  const categorySupport = await getOrCreateCategory(interaction.guild, 'support・🛟', [
    denyView(everyoneRole.id),
    allowReadWrite(memberRole.id),
    allowReadWrite(staffRole.id),
  ]);
  const categoryStats = await getOrCreateCategory(interaction.guild, 'server・📊', [
    allowReadDenyConnect(everyoneRole.id),
  ]);
  const categoryArchive = await getOrCreateCategory(interaction.guild, 'archive・📦', [
    denyView(everyoneRole.id),
    allowReadWrite(staffRole.id),
  ]);
  const categoryStaff = await getOrCreateCategory(interaction.guild, 'staff・🔒', [
    denyView(everyoneRole.id),
    allowReadWrite(staffRole.id),
  ]);

  const welcome = await getOrCreateTextChannel(interaction.guild, 'welcome', categoryInfo.id, [
    allowReadOnly(everyoneRole.id),
  ]);
  const rules = await getOrCreateTextChannel(interaction.guild, 'rules', categoryInfo.id, [
    allowReadOnly(everyoneRole.id),
  ]);
  const roles = await getOrCreateTextChannel(interaction.guild, 'roles', categoryInfo.id, [
    allowReadOnly(everyoneRole.id),
  ]);
  const announcements = await getOrCreateTextChannel(interaction.guild, 'announcements', categoryInfo.id, [
    allowRead(memberRole.id),
    denySend(everyoneRole.id),
  ]);

  const general = await getOrCreateTextChannel(interaction.guild, 'general', categoryChat.id);
  const botCommands = await getOrCreateTextChannel(interaction.guild, 'bot-commands', categoryChat.id);
  const media = await getOrCreateTextChannel(interaction.guild, 'media', categoryChat.id);
  const tickets = await getOrCreateTextChannel(interaction.guild, 'tickets', categorySupport.id);
  const suggestions = await getOrCreateTextChannel(interaction.guild, 'suggestions', categorySupport.id);
  const logs = await getOrCreateTextChannel(interaction.guild, 'logs', categoryStaff.id);
  await getOrCreateTextChannel(interaction.guild, 'mod-chat', categoryStaff.id);
  await getOrCreateTextChannel(interaction.guild, 'old-stuff', categoryArchive.id);

  const createRoom = config.joinToCreateChannelId
    ? await interaction.guild.channels.fetch(config.joinToCreateChannelId).catch(() => null)
    : null;
  if (createRoom?.type === ChannelType.GuildVoice) {
    await createRoom.setParent(categoryVoice.id, { lockPermissions: false }).catch(() => {});
    await createRoom.setName('➕ Create a Room').catch(() => {});
    await createRoom.permissionOverwrites.set([
      denyView(everyoneRole.id),
      allowVoice(memberRole.id),
    ]).catch(() => {});
  }

  await welcome.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle('Welcome')
        .setDescription('Welcome in. We are happy you made it here. Say hi when you are ready and enjoy the server.'),
    ],
  }).catch(() => {});
  await rules.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('Server Rules')
        .setDescription([
          '1. Be respectful.',
          '2. No spam, raids, or invite advertising.',
          '3. Keep content in the right channels.',
          '4. Listen to staff.',
          '5. Use common sense.',
        ].join('\n')),
    ],
  }).catch(() => {});
  await tickets.send({
    embeds: [panelEmbed('Support Tickets', 'Open a private ticket if you need help.')],
    components: [new ActionRowBuilder().addComponents(button('feature:ticket:open', 'Open Ticket', ButtonStyle.Primary))],
  }).catch(() => {});

  await updateGuildData(interaction.guildId, (guildData) => {
    guildData.config.welcomeChannelId = welcome.id;
    guildData.config.autoRoleId = memberRole.id;
    guildData.config.verifiedRoleId = memberRole.id;
    guildData.config.rulesText = 'We are happy you made it here. Get comfortable, say hi when you are ready, and enjoy the server.';
    guildData.config.normalVoiceCategoryId = categoryVoice.id;
    guildData.config.boosterVoiceCategoryId = categoryBoosterVoice.id;
    guildData.config.ticketCategoryId = categorySupport.id;
    guildData.config.supportRoleId = staffRole.id;
    guildData.config.logChannelId = logs.id;
    guildData.config.statsCategoryId = categoryStats.id;
    guildData.config.automodEnabled = true;
    guildData.config.levelingEnabled = true;
    guildData.config.economyEnabled = true;
    guildData.config.tempTextEnabled = true;
    guildData.config.voiceRewardsEnabled = true;
  });

  await updateStatsChannels(interaction.guild);

  await interaction.editReply([
    'Server template created.',
    `Roles: ${memberRole}, ${staffRole}`,
    `Main channels: ${welcome}, ${rules}, ${roles}, ${announcements}, ${general}, ${botCommands}, ${media}, ${tickets}, ${suggestions}, ${logs}`,
    `Voice categories: normal rooms in ${categoryVoice}, booster rooms in ${categoryBoosterVoice}`,
    createRoom ? `Join-to-create renamed: ${createRoom}` : 'Join-to-create channel was not found from .env, so rename it manually to ➕ Create a Room.',
  ].join('\n'));
  return true;
}

async function runSetup(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'template') {
    return runServerTemplateSetup(interaction);
  }

  if (sub === 'welcome') {
    const channel = interaction.options.getChannel('channel', true);
    const role = interaction.options.getRole('auto_role', true);
    const message = interaction.options.getString('message') || null;
    await updateGuildData(interaction.guildId, (guildData) => {
      guildData.config.welcomeChannelId = channel.id;
      guildData.config.autoRoleId = role.id;
      guildData.config.rulesText = message;
    });
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x57f287)
          .setTitle('Welcome System Enabled')
          .setDescription(message || 'New members will receive a warm welcome here and get the auto role when they join.')
          .addFields({ name: 'Auto Role', value: `${role}`, inline: true }),
      ],
    });
    return interaction.reply({ content: `Welcome messages will go to ${channel}. New members will automatically get ${role}.`, ephemeral: true });
  }

  if (sub === 'welcome-off') {
    await updateGuildData(interaction.guildId, (guildData) => {
      guildData.config.welcomeChannelId = null;
      guildData.config.autoRoleId = null;
      guildData.config.rulesText = null;
    });
    return interaction.reply({ content: 'Welcome messages and automatic join role are disabled.', ephemeral: true });
  }

  if (sub === 'verify') {
    return runSetupVerify(interaction);
  }

  if (sub === 'voice-categories') {
    const normal = interaction.options.getChannel('normal', true);
    const booster = interaction.options.getChannel('booster', true);
    await updateGuildData(interaction.guildId, (guildData) => {
      guildData.config.normalVoiceCategoryId = normal.id;
      guildData.config.boosterVoiceCategoryId = booster.id;
    });
    return interaction.reply({
      content: `Normal Garden rooms will be created under ${normal}. Booster perk rooms will be created under ${booster}.`,
      ephemeral: true,
    });
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
    const category = interaction.options.getChannel('category');
    await updateGuildData(interaction.guildId, (guildData) => {
      guildData.config.boosterRoleId = role?.id || null;
      guildData.config.boosterChannelId = channel?.id || null;
      guildData.config.boosterVoiceCategoryId = category?.id || guildData.config.boosterVoiceCategoryId || null;
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

async function runSetupVerify(interaction) {
  const channel = interaction.options.getChannel('channel', true);
  let role = interaction.options.getRole('role');

  await interaction.deferReply({ ephemeral: true });

  if (!role) {
    role = await interaction.guild.roles.create({
      name: 'Verified',
      color: 0x57f287,
      reason: 'S.A.I verification setup.',
    });
  }

  await updateGuildData(interaction.guildId, (guildData) => {
    guildData.config.verifyChannelId = channel.id;
    guildData.config.verifiedRoleId = role.id;
    guildData.config.autoRoleId = null;
  });

  const permissionResult = await applyVerifyPermissions(interaction.guild, channel, role);
  const siteResult = await configureVerifySiteRole(interaction.guildId, role.id);
  await sendVerifyPanel(channel, role);

  const lines = [
    `Verification is set up in ${channel}.`,
    `Verified role: ${role}`,
    `Permissions updated: ${permissionResult.updated}`,
    permissionResult.failed ? `Permission failures: ${permissionResult.failed}` : null,
    siteResult.ok ? 'Verify site synced with this server role.' : `Verify site sync failed: ${siteResult.error}`,
  ].filter(Boolean);

  return interaction.editReply(lines.join('\n'));
}

async function applyVerifyPermissions(guild, verifyChannel, verifiedRole) {
  let updated = 0;
  let failed = 0;
  const everyoneId = guild.id;

  for (const channel of guild.channels.cache.values()) {
    try {
      if (!channel.permissionOverwrites?.edit) continue;

      if (channel.id === verifyChannel.id) {
        await channel.permissionOverwrites.edit(everyoneId, {
          ViewChannel: true,
          SendMessages: false,
          ReadMessageHistory: true,
          Connect: false,
        }, { reason: 'S.A.I verification channel setup.' });
        await channel.permissionOverwrites.edit(verifiedRole.id, {
          ViewChannel: false,
        }, { reason: 'S.A.I hides verify channel from verified users.' });
        updated += 1;
        continue;
      }

      await channel.permissionOverwrites.edit(everyoneId, {
        ViewChannel: false,
      }, { reason: 'S.A.I locks server behind verification.' });
      await channel.permissionOverwrites.edit(verifiedRole.id, {
        ViewChannel: true,
      }, { reason: 'S.A.I allows verified users to view server channels.' });
      updated += 1;
    } catch (error) {
      failed += 1;
      console.error(`Verify permission setup failed for channel ${channel.id}:`, error);
    }
  }

  return { updated, failed };
}

async function configureVerifySiteRole(guildId, verifyRoleId) {
  const verifySiteUrl = config.verifySiteUrl?.replace(/\/+$/, '');
  if (!verifySiteUrl || !config.verifyApiSecret) {
    return { ok: false, error: 'VERIFY_SITE_URL and VERIFY_API_SECRET must be set.' };
  }

  const response = await fetch(`${verifySiteUrl}/api/config-guild`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.verifyApiSecret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ guildId, verifyRoleId }),
  }).catch((error) => ({ ok: false, status: 0, json: async () => ({ error: error.message }) }));

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) return { ok: false, error: data.error || `HTTP ${response.status}` };
  return { ok: true };
}

async function sendVerifyPanel(channel, verifiedRole) {
  const verifySiteUrl = config.verifySiteUrl?.replace(/\/+$/, '');
  const url = verifySiteUrl
    ? `${verifySiteUrl}/verify?guild_id=${encodeURIComponent(channel.guild.id)}`
    : null;

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle('Verify')
    .setDescription('Verify with S.A.I to unlock access.')
    .addFields({ name: 'Role', value: `${verifiedRole}`, inline: true });

  const payload = { embeds: [embed], allowedMentions: { parse: [] } };
  if (url) {
    payload.components = [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('Verify')
          .setStyle(ButtonStyle.Link)
          .setURL(url),
      ),
    ];
  }

  await channel.send(payload);
}

async function runTestVerify(interaction) {
  const verifySiteUrl = config.verifySiteUrl?.replace(/\/+$/, '');
  const siteVerifyUrl = verifySiteUrl
    ? `${verifySiteUrl}/verify?guild_id=${encodeURIComponent(interaction.guildId)}`
    : null;
  const redirectUri = config.verifyRedirectUri;
  const state = Buffer.from(JSON.stringify({
    guildId: interaction.guildId,
    requestedBy: interaction.user.id,
    createdAt: Date.now(),
  })).toString('base64url');
  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: 'code',
    scope: 'identify guilds.join',
    state,
  });

  if (redirectUri) {
    params.set('redirect_uri', redirectUri);
  }

  const url = siteVerifyUrl || `https://discord.com/oauth2/authorize?${params.toString()}`;
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('S.A.I Test Verify')
    .setDescription('This creates the Discord authorization screen with the same kind of permission shown in your screenshot.')
    .addFields(
      { name: 'Permission Requested', value: '`Join servers for you` and basic profile access.' },
      {
        name: 'Important',
        value: siteVerifyUrl
          ? 'This link uses your configured verify site and can complete the OAuth callback if the Netlify secrets are set.'
          : 'VERIFY_SITE_URL is not set yet, so this is only a direct OAuth test link. Set VERIFY_SITE_URL to your Netlify verify site URL when deployed.',
      },
      {
        name: 'Can S.A.I force-add users?',
        value: 'No. The user must authorize first. After that, Discord allows adding them only with a valid `guilds.join` access token and S.A.I must already be in that server.',
      },
    );

  await interaction.reply({
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('Open Test Verify')
          .setStyle(ButtonStyle.Link)
          .setURL(url),
      ),
    ],
    ephemeral: true,
  });
  return true;
}

async function runSendUser(interaction) {
  const user = interaction.options.getUser('user', true);
  const serverId = interaction.options.getString('server_id', true).trim();
  if (!validateTargetServerId(serverId)) {
    return interaction.reply({ content: 'That server ID does not look valid.', ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });
  const result = await transferVerifiedUsers(interaction, {
    mode: 'single',
    userId: user.id,
    guildId: serverId,
  });

  if (!result.ok) {
    return interaction.editReply(`Could not send ${user.tag}: ${result.error || result.result?.error || 'Unknown error.'}`);
  }

  return interaction.editReply(`Sent ${user.tag} to server \`${serverId}\`.`);
}

async function runSendVerified(interaction) {
  const serverId = interaction.options.getString('server_id', true).trim();
  const limit = Math.min(Math.max(interaction.options.getInteger('limit') || 100, 1), 500);
  if (!validateTargetServerId(serverId)) {
    return interaction.reply({ content: 'That server ID does not look valid.', ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });
  const result = await transferVerifiedUsers(interaction, {
    mode: 'all',
    guildId: serverId,
    limit,
  });

  if (!result.ok) {
    return interaction.editReply(`Could not send verified users: ${result.error || 'Unknown error.'}`);
  }

  return interaction.editReply(
    `Tried ${result.requested} verified user(s) for server \`${serverId}\`.\nAdded: ${result.added}\nFailed: ${result.failed}`,
  );
}

function validateTargetServerId(serverId) {
  return /^\d{17,20}$/.test(serverId);
}

async function transferVerifiedUsers(interaction, body) {
  const verifySiteUrl = config.verifySiteUrl?.replace(/\/+$/, '');
  if (!verifySiteUrl || !config.verifyApiSecret) {
    return { ok: false, error: 'VERIFY_SITE_URL and VERIFY_API_SECRET must be set in Katabump .env.' };
  }

  if (!interaction.client.guilds.cache.has(body.guildId)) {
    return { ok: false, error: 'S.A.I must already be inside the target server before it can add verified users there.' };
  }

  const response = await fetch(`${verifySiteUrl}/api/transfer-user`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.verifyApiSecret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  }).catch((error) => ({ ok: false, status: 0, json: async () => ({ ok: false, error: error.message }) }));

  const data = await response.json().catch(() => ({ ok: false, error: `Verify site returned HTTP ${response.status}.` }));
  if (!response.ok) return { ok: false, ...data };
  return data;
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

  if (sub === 'unwarn') {
    const caseNumber = interaction.options.getInteger('case', true);
    let removed = null;
    await updateGuildData(interaction.guildId, (guildData) => {
      removed = guildData.moderationCases.find((item) => item.caseNumber === caseNumber && item.type === 'warn' && !item.revokedAt);
      if (removed) {
        removed.revokedAt = Date.now();
        removed.revokedBy = interaction.user.id;
        const warnings = guildData.warnings[removed.userId] || [];
        guildData.warnings[removed.userId] = warnings.filter((warning) => warning.caseNumber !== caseNumber);
      }
    });
    await interaction.reply({ content: removed ? `Removed warning case #${caseNumber}.` : `Active warning case #${caseNumber} was not found.`, ephemeral: true });
    return true;
  }

  if (sub === 'unban') {
    const userId = interaction.options.getString('user_id', true);
    await interaction.guild.members.unban(userId, reason);
    const caseItem = await createModerationCase(interaction.guildId, { type: 'unban', userId, moderatorId: interaction.user.id, reason });
    await interaction.reply({ content: `Unbanned <@${userId}>. Case #${caseItem.caseNumber}.`, ephemeral: true });
    return true;
  }

  const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

  if (sub === 'warn') {
    let caseItem;
    await updateGuildData(interaction.guildId, (guildData) => {
      caseItem = addModerationCase(guildData, { type: 'warn', userId: targetUser.id, moderatorId: interaction.user.id, reason });
      guildData.warnings[targetUser.id] ||= [];
      guildData.warnings[targetUser.id].push({
        caseNumber: caseItem.caseNumber,
        reason,
        moderatorId: interaction.user.id,
        at: Date.now(),
      });
    });
    await interaction.reply({ content: `Warned ${targetUser.tag}. Case #${caseItem.caseNumber}.`, ephemeral: true });
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
          .setDescription(warnings.length ? warnings.map((warning) => `#${warning.caseNumber || '?'} · ${warning.reason}`).join('\n') : 'No warnings.'),
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
  } else if (sub === 'untimeout') {
    await member.timeout(null, reason);
    await interaction.reply({ content: `Removed ${targetUser.tag}'s timeout.`, ephemeral: true });
  } else if (sub === 'kick') {
    await member.kick(reason);
    await interaction.reply({ content: `Kicked ${targetUser.tag}.`, ephemeral: true });
  } else if (sub === 'ban') {
    await interaction.guild.members.ban(targetUser.id, { reason });
    await interaction.reply({ content: `Banned ${targetUser.tag}.`, ephemeral: true });
  }

  const caseItem = await createModerationCase(interaction.guildId, {
    type: sub,
    userId: targetUser.id,
    moderatorId: interaction.user.id,
    reason,
    durationMinutes: sub === 'timeout' ? interaction.options.getInteger('minutes', true) : null,
  });
  await interaction.followUp({ content: `Moderation case #${caseItem.caseNumber} recorded.`, ephemeral: true }).catch(() => {});
  await logEvent(interaction.guild, `Mod ${sub}`, `${interaction.user.tag} used ${sub} on ${targetUser.tag}: ${reason}`);
  return true;
}

export async function createModerationCase(guildId, details) {
  let item;
  await updateGuildData(guildId, (guildData) => {
    item = addModerationCase(guildData, details);
  });
  return item;
}

function addModerationCase(guildData, details) {
  const item = {
    id: crypto.randomUUID(),
    caseNumber: guildData.nextCaseNumber++,
    at: Date.now(),
    ...details,
  };
  guildData.moderationCases.unshift(item);
  guildData.moderationCases.splice(500);
  return item;
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
  const member = await interaction.guild.members.fetch(user.id).catch(() => null);
  const multiplier = rewardMultiplierForMember(member);
  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle(`${user.username}'s rank`)
        .addFields(
          { name: 'Level', value: String(progress.level), inline: true },
          { name: 'XP', value: String(progress.xp), inline: true },
          { name: 'Coins', value: String(progress.coins), inline: true },
          {
            name: 'Booster Bonus',
            value: multiplier > 1 ? `${multiplier}x XP and coins active` : 'Not active',
            inline: true,
          },
        ),
    ],
  });
  return true;
}

async function runBalance(interaction) {
  const user = interaction.options.getUser('user') || interaction.user;
  const guildData = await getGuildData(interaction.guildId);
  const progress = getUserProgress(guildData, user.id);
  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle(`${user.username}'s wallet`)
        .addFields(
          { name: 'Coins', value: String(progress.coins), inline: true },
          { name: 'Level', value: String(progress.level), inline: true },
          { name: 'XP', value: String(progress.xp), inline: true },
        ),
    ],
    ephemeral: true,
  });
  return true;
}

async function runDaily(interaction) {
  let result;
  await updateGuildData(interaction.guildId, (guildData) => {
    guildData.economy.dailyClaims ||= {};
    const lastClaim = Number(guildData.economy.dailyClaims[interaction.user.id] || 0);
    const now = Date.now();
    if (now - lastClaim < dailyRewardCooldownMs) {
      result = { available: false, nextAt: lastClaim + dailyRewardCooldownMs };
      return;
    }

    const reward = applyRewardMultiplier(dailyRewardCoins, rewardMultiplierForMember(interaction.member));
    const progress = getUserProgress(guildData, interaction.user.id);
    progress.coins += reward;
    guildData.economy.dailyClaims[interaction.user.id] = now;
    result = { available: true, reward, coins: progress.coins };
  });

  if (!result.available) {
    await interaction.reply({
      content: `You already claimed your daily. Try again <t:${Math.floor(result.nextAt / 1000)}:R>.`,
      ephemeral: true,
    });
    return true;
  }

  await interaction.reply({
    content: `Daily claimed: +${result.reward} coins. Your balance is now ${result.coins} coins.`,
    ephemeral: true,
  });
  return true;
}

async function runGamble(interaction) {
  const sub = interaction.options.getSubcommand();
  if (sub === 'stats') return runGambleStats(interaction);
  if (sub === 'leaderboard') return runGambleLeaderboard(interaction);

  const amount = interaction.options.getInteger('amount', true);
  if (amount < 10 || amount > 50_000) {
    await interaction.reply({ content: 'Bet must be between 10 and 50,000 coins.', ephemeral: true });
    return true;
  }

  let result;
  await updateGuildData(interaction.guildId, (guildData) => {
    const progress = getUserProgress(guildData, interaction.user.id);
    if (progress.coins < amount) {
      result = { ok: false, reason: `You only have ${progress.coins} coins.` };
      return;
    }

    if (sub === 'slots') result = playSlots(amount);
    if (sub === 'coinflip') result = playCoinflip(amount, interaction.options.getString('choice', true));
    if (sub === 'dice') result = playDice(amount, interaction.options.getInteger('guess', true));

    if (!result) {
      result = { ok: false, reason: 'That gambling game is not available.' };
      return;
    }

    progress.coins = Math.max(0, progress.coins - amount + result.payout);
    const stats = getGambleStats(guildData, interaction.user.id);
    stats.plays += 1;
    stats.wagered += amount;
    stats.payout += result.payout;
    stats.profit += result.payout - amount;
    if (result.payout > amount) stats.wins += 1;
    else stats.losses += 1;
    stats.biggestWin = Math.max(stats.biggestWin, result.payout - amount);
    result.ok = true;
    result.balance = progress.coins;
  });

  if (!result.ok) {
    await interaction.reply({ content: result.reason, ephemeral: true });
    return true;
  }

  await interaction.reply({
    embeds: [gambleResultEmbed(interaction.user, result)],
  });
  return true;
}

function playSlots(amount) {
  const symbols = ['🍒', '🍋', '🔔', '⭐', '💎', '7️⃣'];
  const weights = [30, 24, 18, 14, 9, 5];
  const reels = [weightedPick(symbols, weights), weightedPick(symbols, weights), weightedPick(symbols, weights)];
  const [a, b, c] = reels;
  let multiplier = 0;
  let title = 'Slot Machine';

  if (a === b && b === c) {
    multiplier = { '🍒': 3, '🍋': 4, '🔔': 6, '⭐': 8, '💎': 12, '7️⃣': 25 }[a] || 3;
    title = a === '7️⃣' ? 'JACKPOT' : 'Triple Match';
  } else if (a === b || a === c || b === c) {
    multiplier = 1.5;
    title = 'Pair Hit';
  }

  const payout = Math.floor(amount * multiplier);
  return {
    game: 'Slots',
    title,
    display: `╭────────────╮\n│ ${reels.join(' │ ')} │\n╰────────────╯`,
    amount,
    payout,
  };
}

function playCoinflip(amount, choice) {
  const result = Math.random() < 0.5 ? 'heads' : 'tails';
  const won = result === choice;
  return {
    game: 'Coinflip',
    title: won ? 'You called it' : 'Wrong side',
    display: `${result === 'heads' ? '🪙 Heads' : '🪙 Tails'}\nYour pick: **${choice}**`,
    amount,
    payout: won ? amount * 2 : 0,
  };
}

function playDice(amount, guess) {
  const roll = Math.floor(Math.random() * 6) + 1;
  const won = roll === guess;
  return {
    game: 'Dice',
    title: won ? 'Perfect roll' : 'Dice missed',
    display: `🎲 Rolled **${roll}**\nYour guess: **${guess}**`,
    amount,
    payout: won ? amount * 5 : 0,
  };
}

function gambleResultEmbed(user, result) {
  const profit = result.payout - result.amount;
  return new EmbedBuilder()
    .setColor(profit > 0 ? 0x57f287 : 0xed4245)
    .setTitle(`${result.game}: ${result.title}`)
    .setDescription(result.display)
    .addFields(
      { name: 'Bet', value: `${result.amount} coins`, inline: true },
      { name: 'Payout', value: `${result.payout} coins`, inline: true },
      { name: profit >= 0 ? 'Profit' : 'Loss', value: `${profit >= 0 ? '+' : ''}${profit} coins`, inline: true },
      { name: 'Balance', value: `${result.balance} coins`, inline: true },
    )
    .setFooter({ text: `${user.username}'s gamble` })
    .setTimestamp();
}

async function runGambleStats(interaction) {
  const guildData = await getGuildData(interaction.guildId);
  const stats = getGambleStats(guildData, interaction.user.id);
  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle('Your gambling stats')
        .addFields(
          { name: 'Plays', value: String(stats.plays), inline: true },
          { name: 'Wins', value: String(stats.wins), inline: true },
          { name: 'Losses', value: String(stats.losses), inline: true },
          { name: 'Wagered', value: `${stats.wagered} coins`, inline: true },
          { name: 'Total payout', value: `${stats.payout} coins`, inline: true },
          { name: 'Profit', value: `${stats.profit >= 0 ? '+' : ''}${stats.profit} coins`, inline: true },
          { name: 'Biggest win', value: `${stats.biggestWin} coins`, inline: true },
        ),
    ],
    ephemeral: true,
  });
  return true;
}

async function runGambleLeaderboard(interaction) {
  const guildData = await getGuildData(interaction.guildId);
  const rows = Object.entries(guildData.gambling || {})
    .sort(([, a], [, b]) => Number(b.profit || 0) - Number(a.profit || 0))
    .slice(0, 10)
    .map(([userId, stats], index) => `${index + 1}. <@${userId}> - ${stats.profit >= 0 ? '+' : ''}${stats.profit || 0} coins (${stats.wins || 0}W/${stats.losses || 0}L)`);

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle('Gambling Leaderboard')
        .setDescription(rows.join('\n') || 'No gambling stats yet.'),
    ],
  });
  return true;
}

async function runGiveCoins(interaction) {
  const target = interaction.options.getUser('user', true);
  const amount = interaction.options.getInteger('amount', true);
  if (target.bot || target.id === interaction.user.id) {
    await interaction.reply({ content: 'Choose another non-bot member.', ephemeral: true });
    return true;
  }
  if (amount < 1 || amount > 1_000_000) {
    await interaction.reply({ content: 'Amount must be between 1 and 1,000,000 coins.', ephemeral: true });
    return true;
  }

  let result;
  await updateGuildData(interaction.guildId, (guildData) => {
    const giver = getUserProgress(guildData, interaction.user.id);
    const receiver = getUserProgress(guildData, target.id);
    if (giver.coins < amount) {
      result = { ok: false, balance: giver.coins };
      return;
    }
    giver.coins -= amount;
    receiver.coins += amount;
    result = { ok: true, balance: giver.coins, receiverCoins: receiver.coins };
  });

  if (!result.ok) {
    await interaction.reply({ content: `You only have ${result.balance} coins.`, ephemeral: true });
    return true;
  }

  await interaction.reply({
    content: `Sent ${amount} coins to ${target}. Your balance is now ${result.balance} coins.`,
    ephemeral: true,
  });
  return true;
}

async function runRate(interaction) {
  const multiplier = rewardMultiplierForMember(interaction.member);
  const messageXp = applyRewardMultiplier(8, multiplier);
  const messageCoins = applyRewardMultiplier(2, multiplier);
  const voiceXpPerMinute = applyRewardMultiplier(2, multiplier);
  const voiceCoinsPerTenMinutes = applyRewardMultiplier(5, multiplier);
  const groupVoiceMultiplier = multiplier * voiceCompanionRewardMultiplier;
  const groupVoiceXpPerMinute = applyRewardMultiplier(2, groupVoiceMultiplier);
  const groupVoiceCoinsPerTenMinutes = applyRewardMultiplier(5, groupVoiceMultiplier);
  const dailyCoins = applyRewardMultiplier(dailyRewardCoins, multiplier);

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle('Your earning rate')
        .setDescription(multiplier > 1 ? 'Booster bonus active: `1.5x` XP and coins.' : 'Boost the server to earn `1.5x` XP and coins.')
        .addFields(
          { name: 'Messages', value: `+${messageXp} XP and +${messageCoins} coins per message`, inline: false },
          { name: 'Voice chat solo', value: `About +${voiceXpPerMinute} XP per minute and +${voiceCoinsPerTenMinutes} coins per 10 minutes`, inline: false },
          { name: 'Voice chat with people', value: `About +${groupVoiceXpPerMinute} XP per minute and +${groupVoiceCoinsPerTenMinutes} coins per 10 minutes`, inline: false },
          { name: 'Daily', value: `+${dailyCoins} coins every 24 hours with /daily`, inline: false },
          { name: 'Level formula', value: 'Level increases from total XP, so higher levels take more activity.', inline: false },
        ),
    ],
    ephemeral: true,
  });
  return true;
}

async function runActivity(interaction) {
  const channel = interaction.options.getChannel('channel', true);
  await updateGuildData(interaction.guildId, (guildData) => {
    guildData.config.activityChannelId = channel.id;
  });
  await interaction.reply({
    content: `Activity announcements will post in ${channel}.`,
    ephemeral: true,
  });
  return true;
}

async function runVoiceLeaderboard(interaction) {
  const period = interaction.options.getString('period', true);
  const isPublic = interaction.options.getBoolean('public') || false;
  const guildData = await getGuildData(interaction.guildId);
  resetActivityBuckets(guildData);
  const rows = voiceLeaderboardRows(guildData, period);
  const title = {
    daily: 'Daily Voice Leaderboard',
    weekly: 'Weekly Voice Leaderboard',
    alltime: 'All-Time Voice Leaderboard',
  }[period];

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`🎙️ ${title}`)
    .setDescription(rows.length ? rows.join('\n') : 'No voice activity has been recorded for this period yet.')
    .setFooter({ text: 'Voice rewards update while members stay connected.' })
    .setTimestamp();

  if (isPublic) {
    const channel = await getActivityChannel(interaction.guild);
    if (!channel && !interaction.channel?.isTextBased()) {
      await interaction.reply({ content: 'No writable activity channel is configured.', ephemeral: true });
      return true;
    }
    await (channel || interaction.channel).send({ embeds: [embed] });
    await interaction.reply({ content: `Posted ${title.toLowerCase()}.`, ephemeral: true });
    return true;
  }

  await interaction.reply({ embeds: [embed], ephemeral: true });
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

async function runEconomy(interaction) {
  const sub = interaction.options.getSubcommand();
  const user = interaction.options.getUser('user', true);
  const amount = interaction.options.getInteger('amount', true);
  if (amount < 0 || amount > 1_000_000) {
    await interaction.reply({ content: 'Amount must be between 0 and 1,000,000.', ephemeral: true });
    return true;
  }

  const result = await adjustMemberProgress(interaction.guildId, user.id, sub, amount);
  await interaction.reply({
    content: `${user} now has level ${result.level}, ${result.xp} XP, and ${result.coins} coins.`,
    ephemeral: true,
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

  if (sub === 'add-role' || sub === 'remove-role') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({ content: 'Administrator permission is required.', ephemeral: true });
      return true;
    }

    const role = interaction.options.getRole('role', true);
    if (sub === 'remove-role') {
      await updateGuildData(interaction.guildId, (data) => {
        delete data.shops[role.id];
      });
      await interaction.reply({ content: `${role} removed from the shop.`, ephemeral: true });
      return true;
    }

    const price = interaction.options.getInteger('price', true);
    if (price < 1 || price > 1_000_000) {
      await interaction.reply({ content: 'Price must be between 1 and 1,000,000 coins.', ephemeral: true });
      return true;
    }
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

async function runRole(interaction) {
  if (interaction.options.getSubcommand() !== 'give-everyone') return false;
  const role = interaction.options.getRole('role', true);

  if (role.managed || role.id === interaction.guild.id) {
    await interaction.reply({ content: 'That role cannot be assigned manually.', ephemeral: true });
    return true;
  }

  const me = await interaction.guild.members.fetchMe().catch(() => null);
  if (!me?.permissions.has(PermissionFlagsBits.ManageRoles) || role.position >= me.roles.highest.position) {
    await interaction.reply({
      content: 'S.A.I needs Manage Roles and its role must be above the role you want to give.',
      ephemeral: true,
    });
    return true;
  }

  await interaction.deferReply({ ephemeral: true });
  const members = await interaction.guild.members.fetch();
  let added = 0;
  let skipped = 0;

  for (const member of members.values()) {
    if (member.user.bot || member.roles.cache.has(role.id)) {
      skipped += 1;
      continue;
    }
    await member.roles.add(role, `S.A.I give everyone requested by ${interaction.user.tag}.`)
      .then(() => {
        added += 1;
      })
      .catch(() => {
        skipped += 1;
      });
  }

  await interaction.editReply(`Finished. Added ${role} to ${added} member(s). Skipped ${skipped}.`);
  await logEvent(interaction.guild, 'Role Given To Everyone', `${interaction.user.tag} gave ${role} to ${added} member(s).`);
  return true;
}

async function runBotProfile(interaction) {
  if (interaction.options.getSubcommand() !== 'profile') return false;
  const username = interaction.options.getString('username');
  const avatarUrl = interaction.options.getString('avatar_url');
  const displayName = interaction.options.getString('display_name');

  if (!username && !avatarUrl && !displayName) {
    await interaction.reply({
      content: 'Give me at least one of: username, avatar_url, or display_name.',
      ephemeral: true,
    });
    return true;
  }

  await interaction.deferReply({ ephemeral: true });
  const updates = [];

  if (username || avatarUrl) {
    const clientUpdate = {};
    if (username) clientUpdate.username = username.slice(0, 32);
    if (avatarUrl) clientUpdate.avatar = avatarUrl;
    await interaction.client.user.set(clientUpdate)
      .then(() => updates.push('global profile'))
      .catch((error) => {
        console.error('Bot profile update failed:', error);
      });
  }

  if (displayName) {
    const me = await interaction.guild.members.fetchMe().catch(() => null);
    await me?.setNickname(displayName.slice(0, 32), `S.A.I display name changed by ${interaction.user.tag}.`)
      .then(() => updates.push('server display name'))
      .catch((error) => {
        console.error('Bot display name update failed:', error);
      });
  }

  await interaction.editReply(
    updates.length
      ? `Updated ${updates.join(' and ')}.`
      : 'Could not update profile. Check image URL, permissions, and Discord username/avatar rate limits.',
  );
  return true;
}

async function handleAdminSayCommand(message) {
  const member = await message.guild.members.fetch(message.author.id).catch(() => null);
  if (!member?.permissions.has(PermissionFlagsBits.Administrator)) return false;

  const parsed = parseAdminSayCommand(message.content);
  if (!parsed) return false;

  hiddenCommandDeletes.add(message.id);
  await message.delete().catch(() => hiddenCommandDeletes.delete(message.id));

  if (parsed.type === 'embed') {
    const color = parseHexColor(parsed.color) ?? 0x5865f2;
    await message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(color)
          .setTitle(parsed.title)
          .setDescription(parsed.body),
      ],
      allowedMentions: { parse: [] },
    }).catch(() => {});
    return true;
  }

  await message.channel.send({
    content: parsed.text,
    allowedMentions: { parse: [] },
  }).catch(() => {});
  return true;
}

async function handleLordReminderCommand(message) {
  const member = await message.guild.members.fetch(message.author.id).catch(() => null);
  if (!member?.permissions.has(PermissionFlagsBits.Administrator)) return false;

  const parsed = parseLordReminderCommand(message);
  if (!parsed) return false;

  const target = await message.guild.members.fetch(parsed.userId).catch(() => null);
  if (!target) {
    await message.reply('I could not find that member.').catch(() => {});
    return true;
  }

  const reminderId = `${Date.now()}-${message.id}`;
  const reminder = {
    id: reminderId,
    guildId: message.guild.id,
    channelId: message.channel.id,
    requesterId: message.author.id,
    targetId: target.id,
    text: parsed.text,
    dueAt: Date.now() + parsed.minutes * 60 * 1000,
    createdAt: Date.now(),
  };

  await updateGuildData(message.guild.id, (guildData) => {
    guildData.reminders[reminderId] = reminder;
  });
  scheduleReminder(message.client, message.guild.id, reminder);

  await sendLordWebhookReply(
    message,
    target,
    `Yes, My Lord! I will remind you in ${formatMinutes(parsed.minutes)}.`,
  );
  await logEvent(
    message.guild,
    'Lord Reminder Command',
    `${message.author.tag} made ${target.user.tag} schedule a reminder for **${parsed.text}** in ${formatMinutes(parsed.minutes)}.`,
  );
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
  await updateGuildData(interaction.guildId, (data) => {
    data.economy.shopPurchases ||= [];
    data.economy.shopPurchases.unshift({
      id: crypto.randomUUID(),
      userId: interaction.user.id,
      roleId,
      price: item.price,
      at: Date.now(),
    });
    data.economy.shopPurchases.splice(200);
  });
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

async function sendConfessionAudit(interaction, text) {
  if (!config.confessionLogWebhookUrl) return;
  const response = await fetch(config.confessionLogWebhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'S.A.I Confession Audit',
      embeds: [
        {
          title: 'Confession Submitted',
          color: 0x9b59b6,
          fields: [
            {
              name: 'Author',
              value: `${interaction.user.tag} (${interaction.user.id})`,
              inline: false,
            },
            {
              name: 'Server',
              value: `${interaction.guild?.name || 'Unknown'} (${interaction.guildId})`,
              inline: false,
            },
            {
              name: 'Confession',
              value: text.slice(0, 1024),
              inline: false,
            },
          ],
          timestamp: new Date().toISOString(),
        },
      ],
      allowed_mentions: { parse: [] },
    }),
  });
  if (!response.ok) throw new Error(`Webhook returned ${response.status}.`);
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

async function recordVoiceTime(guild, userId, now, options = {}) {
  const key = `${guild.id}:${userId}`;
  const joinedAt = voiceJoinTimes.get(key);
  if (!joinedAt) return;
  voiceJoinTimes.delete(key);

  const seconds = Math.max(0, Math.floor((now - joinedAt) / 1000));
  if (seconds < 30) return;
  const member = await guild.members.fetch(userId).catch(() => null);
  const multiplier = rewardMultiplierForMember(member) * voiceCompanionMultiplierForMember(member, options.voiceChannel);
  let levelUpNotice = null;
  let milestoneNotice = null;
  let earned = { xp: 0, coins: 0 };

  await updateGuildData(guild.id, (guildData) => {
    resetActivityBuckets(guildData);
    guildData.analytics.voiceSeconds += seconds;
    const progress = getUserProgress(guildData, userId);
    progress.voiceSeconds += seconds;
    addVoiceBucketSeconds(guildData, userId, seconds);
    milestoneNotice = getNewVoiceMilestone(guildData, userId, progress.voiceSeconds);
    if (guildData.config.voiceRewardsEnabled) {
      const result = addUserProgress(
        guildData,
        userId,
        Math.floor(seconds / 30),
        guildData.config.economyEnabled ? Math.floor(seconds / 120) : 0,
        multiplier,
      );
      earned = { xp: result.xpAdded, coins: result.coinsAdded };
      if (result.leveledUp) {
        levelUpNotice = { userId, level: result.level };
      }
      queueRankPassAnnouncement(guild, guildData, userId, result);
    }
  });
  const session = voiceSessionStats.get(key) || { startedAt: joinedAt, seconds: 0, xp: 0, coins: 0 };
  session.seconds += seconds;
  session.xp += earned.xp;
  session.coins += earned.coins;
  voiceSessionStats.set(key, session);
  if (levelUpNotice) {
    await sendLevelUpMessage(guild, userId, levelUpNotice.level).catch(() => {});
  }
  if (milestoneNotice) {
    await sendVoiceMilestoneMessage(guild, userId, milestoneNotice).catch(() => {});
  }
  if (options.final) {
    voiceSessionStats.delete(key);
    await sendVoiceSessionSummary(member, session).catch(() => {});
  }
}

function seedActiveVoiceMembers(client) {
  const now = Date.now();
  for (const guild of client.guilds.cache.values()) {
    for (const channel of guild.channels.cache.values()) {
      if (!channel?.isVoiceBased?.()) continue;
      for (const member of channel.members.values()) {
        if (!member.user.bot) voiceJoinTimes.set(`${guild.id}:${member.id}`, now);
      }
    }
  }
}

async function rewardActiveVoiceMembers(client) {
  const now = Date.now();
  for (const guild of client.guilds.cache.values()) {
    for (const channel of guild.channels.cache.values()) {
      if (!channel?.isVoiceBased?.()) continue;
      for (const member of channel.members.values()) {
        if (member.user.bot) continue;
        const key = `${guild.id}:${member.id}`;
        if (!voiceJoinTimes.has(key)) voiceJoinTimes.set(key, now);
        await recordVoiceTime(guild, member.id, now);
        voiceJoinTimes.set(key, now);
      }
    }
  }
}

async function sendLevelUpMessage(guild, userId, level, preferredChannel = null) {
  const channel = await getActivityChannel(guild) || (preferredChannel?.isTextBased?.() ? preferredChannel : await getPublicTextChannel(guild));
  if (!channel) return;
  await channel.send({
    content: `🆙 <@${userId}> reached **Level ${level}**.`,
    allowedMentions: { users: [userId] },
  });
}

async function sendVoiceMilestoneMessage(guild, userId, hours) {
  const channel = await getActivityChannel(guild) || await getPublicTextChannel(guild);
  if (!channel) return;
  await channel.send({
    content: `🎙️ <@${userId}> reached **${hours} hour${hours === 1 ? '' : 's'}** in voice chat.`,
    allowedMentions: { users: [userId] },
  });
}

async function sendRankPassMessage(guild, userId, passedUserId, rank) {
  const channel = await getActivityChannel(guild);
  if (!channel) return;
  await channel.send({
    content: `📈 <@${userId}> passed <@${passedUserId}> and moved to **#${rank}** on the XP leaderboard.`,
    allowedMentions: { users: [userId, passedUserId] },
  });
}

async function sendVoiceSessionSummary(member, session) {
  if (!member || !session?.seconds) return;
  await member.send(
    `Voice session summary: ${formatDuration(session.seconds)}, +${session.xp} XP, +${session.coins} coins.`,
  ).catch(() => {});
}

async function getActivityChannel(guild) {
  const guildData = await getGuildData(guild.id);
  const channelId = guildData.config.activityChannelId;
  if (!channelId) return null;
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased?.()) return null;
  const permissions = channel.permissionsFor(guild.members.me);
  return permissions?.has(PermissionFlagsBits.ViewChannel) && permissions.has(PermissionFlagsBits.SendMessages)
    ? channel
    : null;
}

async function getPublicTextChannel(guild) {
  const candidates = [
    guild.systemChannel,
    ...guild.channels.cache
      .filter((channel) => channel.type === ChannelType.GuildText)
      .sort((a, b) => a.rawPosition - b.rawPosition)
      .values(),
  ].filter(Boolean);

  for (const channel of candidates) {
    const permissions = channel.permissionsFor(guild.members.me);
    if (permissions?.has(PermissionFlagsBits.ViewChannel) && permissions.has(PermissionFlagsBits.SendMessages)) {
      return channel;
    }
  }
  return null;
}

function resetActivityBuckets(guildData, now = Date.now()) {
  guildData.activity ||= {};
  const day = dayKey(now);
  const week = weekKey(now);
  if (guildData.activity.currentDay !== day) {
    guildData.activity.currentDay = day;
    guildData.activity.voiceDaily = {};
  }
  if (guildData.activity.currentWeek !== week) {
    guildData.activity.currentWeek = week;
    guildData.activity.voiceWeekly = {};
  }
  guildData.activity.voiceDaily ||= {};
  guildData.activity.voiceWeekly ||= {};
  guildData.activity.voiceMilestones ||= {};
  guildData.activity.rankPassCooldowns ||= {};
}

function addVoiceBucketSeconds(guildData, userId, seconds) {
  guildData.activity.voiceDaily[userId] = (guildData.activity.voiceDaily[userId] || 0) + seconds;
  guildData.activity.voiceWeekly[userId] = (guildData.activity.voiceWeekly[userId] || 0) + seconds;
}

function getNewVoiceMilestone(guildData, userId, totalSeconds) {
  const totalHours = Math.floor(totalSeconds / 3600);
  guildData.activity.voiceMilestones[userId] ||= [];
  const reached = guildData.activity.voiceMilestones[userId];
  const next = voiceMilestoneHours.find((hours) => totalHours >= hours && !reached.includes(hours));
  if (!next) return null;
  reached.push(next);
  return next;
}

function voiceLeaderboardRows(guildData, period) {
  const source = period === 'daily'
    ? guildData.activity?.voiceDaily || {}
    : period === 'weekly'
      ? guildData.activity?.voiceWeekly || {}
      : Object.fromEntries(Object.entries(guildData.levels || {}).map(([userId, progress]) => [userId, Number(progress.voiceSeconds || 0)]));
  return Object.entries(source)
    .sort(([, a], [, b]) => Number(b) - Number(a))
    .slice(0, 10)
    .map(([userId, seconds], index) => `${index + 1}. <@${userId}> — ${formatDuration(Number(seconds || 0))}`);
}

function queueRankPassAnnouncement(guild, guildData, userId, progressResult) {
  if (!progressResult?.passedUserId) return;
  resetActivityBuckets(guildData);
  const key = `${userId}:${progressResult.passedUserId}`;
  const last = Number(guildData.activity.rankPassCooldowns[key] || 0);
  if (Date.now() - last < rankPassCooldownMs) return;
  guildData.activity.rankPassCooldowns[key] = Date.now();
  setTimeout(() => sendRankPassMessage(guild, userId, progressResult.passedUserId, progressResult.rank).catch(() => {}), 0);
}

function dayKey(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function weekKey(timestamp) {
  const date = new Date(timestamp);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

async function refreshInviteCache(guild) {
  const invites = await guild.invites.fetch().catch(() => null);
  if (!invites) return;

  await updateGuildData(guild.id, (guildData) => {
    guildData.inviteUses = Object.fromEntries(invites.map((invite) => [invite.code, invite.uses || 0]));
  });
}

async function scheduleGuildReminders(client, guildId) {
  const guildData = await getGuildData(guildId);
  for (const reminder of Object.values(guildData.reminders || {})) {
    scheduleReminder(client, guildId, reminder);
  }
}

function scheduleReminder(client, guildId, reminder) {
  const timerKey = `${guildId}:${reminder.id}`;
  if (reminderTimers.has(timerKey)) clearTimeout(reminderTimers.get(timerKey));

  const delay = Math.max(0, reminder.dueAt - Date.now());
  const maxDelay = 2_147_483_647;
  const timer = setTimeout(async () => {
    if (delay > maxDelay) {
      scheduleReminder(client, guildId, reminder);
      return;
    }

    reminderTimers.delete(timerKey);
    await sendReminder(client, guildId, reminder);
  }, Math.min(delay, maxDelay));

  reminderTimers.set(timerKey, timer);
}

async function sendReminder(client, guildId, reminder) {
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  const channel = guild
    ? await guild.channels.fetch(reminder.channelId).catch(() => null)
    : null;
  const target = guild
    ? await guild.members.fetch(reminder.targetId).catch(() => null)
    : null;
  const content = `<@${reminder.requesterId}>, reminder: ${reminder.text}`;

  if (channel?.isTextBased()) {
    if (target && channel.createWebhook) {
      const webhook = await channel
        .createWebhook({
          name: (target.displayName || target.user.username).slice(0, 80),
          avatar: target.displayAvatarURL({ size: 256 }) || target.user.displayAvatarURL({ size: 256 }),
          reason: 'S.A.I lord reminder delivery.',
        })
        .catch(() => null);

      if (webhook) {
        await webhook
          .send({
            content,
            allowedMentions: { users: [reminder.requesterId] },
          })
          .catch(() => {});
        await webhook.delete('S.A.I lord reminder delivered.').catch(() => {});
      } else {
        await channel
          .send({ content, allowedMentions: { users: [reminder.requesterId] } })
          .catch(() => {});
      }
    } else {
      await channel
        .send({ content, allowedMentions: { users: [reminder.requesterId] } })
        .catch(() => {});
    }
  }

  await updateGuildData(guildId, (guildData) => {
    delete guildData.reminders?.[reminder.id];
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
  return {
    inviterId: usedInvite.inviter.id,
    inviterTag: usedInvite.inviter.tag,
    code: usedInvite.code,
    joins: guildData.invites[usedInvite.inviter.id].joins,
  };
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

async function getOrCreateRole(guild, options) {
  const existing = guild.roles.cache.find((role) => role.name === options.name);
  if (existing) return existing;

  return guild.roles.create({
    name: options.name,
    color: options.color,
    reason: options.reason,
  });
}

async function getOrCreateCategory(guild, name, permissionOverwrites = []) {
  const existing = guild.channels.cache.find(
    (channel) => channel.type === ChannelType.GuildCategory && channel.name === name,
  );
  if (existing) {
    await existing.permissionOverwrites.set(permissionOverwrites).catch(() => {});
    return existing;
  }

  return guild.channels.create({
    name,
    type: ChannelType.GuildCategory,
    permissionOverwrites,
    reason: 'S.A.I server template category.',
  });
}

async function getOrCreateTextChannel(guild, name, parentId, permissionOverwrites = null) {
  const existing = guild.channels.cache.find(
    (channel) => channel.type === ChannelType.GuildText && channel.name === name,
  );
  const options = {
    parent: parentId,
    reason: 'S.A.I server template text channel.',
  };

  if (permissionOverwrites) options.permissionOverwrites = permissionOverwrites;

  if (existing) {
    await existing.setParent(parentId, { lockPermissions: !permissionOverwrites }).catch(() => {});
    if (permissionOverwrites) await existing.permissionOverwrites.set(permissionOverwrites).catch(() => {});
    return existing;
  }

  return guild.channels.create({
    name,
    type: ChannelType.GuildText,
    ...options,
  });
}

function allowRead(roleId) {
  return {
    id: roleId,
    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
  };
}

function allowReadOnly(roleId) {
  return {
    id: roleId,
    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
    deny: [
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.CreatePublicThreads,
      PermissionFlagsBits.CreatePrivateThreads,
    ],
  };
}

function allowReadDenyConnect(roleId) {
  return {
    id: roleId,
    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
    deny: [PermissionFlagsBits.Connect],
  };
}

function allowReadWrite(roleId) {
  return {
    id: roleId,
    allow: [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.AttachFiles,
      PermissionFlagsBits.EmbedLinks,
      PermissionFlagsBits.AddReactions,
    ],
  };
}

function allowVoice(roleId) {
  return {
    id: roleId,
    allow: [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.Connect,
      PermissionFlagsBits.Speak,
      PermissionFlagsBits.Stream,
      PermissionFlagsBits.UseVAD,
    ],
  };
}

function denyView(roleId) {
  return {
    id: roleId,
    deny: [PermissionFlagsBits.ViewChannel],
  };
}

function denySend(roleId) {
  return {
    id: roleId,
    deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.CreatePublicThreads, PermissionFlagsBits.CreatePrivateThreads],
  };
}

function denyConnect(roleId) {
  return {
    id: roleId,
    deny: [PermissionFlagsBits.Connect],
  };
}

function addUserProgress(guildData, userId, xp, coins, multiplier = 1) {
  const progress = getUserProgress(guildData, userId);
  const previousLevel = progress.level;
  const previousRanks = xpRanks(guildData);
  const xpAdded = applyRewardMultiplier(xp, multiplier);
  const coinsAdded = applyRewardMultiplier(coins, multiplier);
  progress.xp = Math.max(0, progress.xp + xpAdded);
  progress.coins = Math.max(0, progress.coins + coinsAdded);
  updateProgressLevel(progress);
  const nextRanks = xpRanks(guildData);
  const previousRank = previousRanks.indexOf(userId);
  const nextRank = nextRanks.indexOf(userId);
  const passedUserId = previousRank > -1 && nextRank > -1 && nextRank < previousRank
    ? nextRanks[nextRank + 1]
    : null;
  return {
    leveledUp: progress.level > previousLevel,
    level: progress.level,
    xpAdded,
    coinsAdded,
    passedUserId,
    rank: nextRank + 1,
  };
}

function applyRewardMultiplier(amount, multiplier = 1) {
  if (!amount) return 0;
  return Math.max(1, Math.floor(amount * multiplier));
}

function rewardMultiplierForMember(member) {
  return member?.premiumSince || member?.premiumSinceTimestamp ? boosterRewardMultiplier : 1;
}

function xpRanks(guildData) {
  return Object.entries(guildData.levels || {})
    .sort(([, a], [, b]) => Number(b.xp || 0) - Number(a.xp || 0))
    .map(([rankedUserId]) => rankedUserId);
}

function voiceCompanionMultiplierForMember(member, channel = member?.voice?.channel) {
  if (!channel) return 1;
  const nonBotCount = channel.members.filter((channelMember) => !channelMember.user.bot).size;
  return nonBotCount >= 2 ? voiceCompanionRewardMultiplier : 1;
}

async function adjustMemberProgress(guildId, userId, action, amount) {
  let result;
  await updateGuildData(guildId, (guildData) => {
    const progress = getUserProgress(guildData, userId);
    if (action === 'add-xp') progress.xp += amount;
    if (action === 'add-coins') progress.coins += amount;
    if (action === 'set-xp') progress.xp = amount;
    if (action === 'set-coins') progress.coins = amount;
    progress.xp = Math.max(0, progress.xp);
    progress.coins = Math.max(0, progress.coins);
    updateProgressLevel(progress);
    result = { ...progress };
  });
  return result;
}

function getUserProgress(guildData, userId) {
  guildData.levels[userId] ||= { xp: 0, level: 1, coins: 0, voiceSeconds: 0 };
  guildData.levels[userId].coins ||= 0;
  guildData.levels[userId].voiceSeconds ||= 0;
  updateProgressLevel(guildData.levels[userId]);
  return guildData.levels[userId];
}

function getGambleStats(guildData, userId) {
  guildData.gambling ||= {};
  guildData.gambling[userId] ||= {
    plays: 0,
    wins: 0,
    losses: 0,
    wagered: 0,
    payout: 0,
    profit: 0,
    biggestWin: 0,
  };
  return guildData.gambling[userId];
}

function weightedPick(items, weights) {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let roll = Math.random() * total;
  for (let index = 0; index < items.length; index += 1) {
    roll -= weights[index];
    if (roll <= 0) return items[index];
  }
  return items[items.length - 1];
}

function updateProgressLevel(progress) {
  progress.level = Math.floor(Math.sqrt(Math.max(0, progress.xp) / 100)) + 1;
}

function shouldAutoMod(content) {
  return /(discord\.gg\/|discord\.com\/invite\/|@everyone|@here)/i.test(content);
}

function getAutoModReason(message, guildData) {
  const content = message.content || '';
  const settings = guildData.config;
  if (settings.automodInviteLinks && /(discord\.gg\/|discord\.com\/invite\/)/i.test(content)) return 'Invite link';
  if (settings.automodMassMentions && /@everyone|@here/i.test(content)) return 'Mass mention';
  if ((message.mentions.users.size + message.mentions.roles.size) > Number(settings.automodMaxMentions || 5)) return 'Too many mentions';
  if ((settings.automodBlockedWords || []).some((word) => word && content.toLowerCase().includes(word.toLowerCase()))) return 'Blocked word';
  if (settings.automodSpam) {
    const key = `${message.guild.id}:${message.author.id}`;
    const now = Date.now();
    const times = (recentMessageTimes.get(key) || []).filter((time) => now - time < 6000);
    times.push(now);
    recentMessageTimes.set(key, times);
    if (times.length >= 5) return 'Message spam';
  }
  return null;
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

function parseAdminSayCommand(content) {
  const normalized = content.trim();
  const sayMatch = normalized.match(/^(?:s\.?a\.?i|sai)\s+say\s+(?<text>[\s\S]+)$/i);
  if (sayMatch?.groups?.text) {
    return {
      type: 'text',
      text: sanitizeBotMessage(sayMatch.groups.text),
    };
  }

  const embedMatch = normalized.match(/^(?:s\.?a\.?i|sai)\s+embed\s+(?<payload>[\s\S]+)$/i);
  if (embedMatch?.groups?.payload) {
    const parts = embedMatch.groups.payload.split('|').map((part) => part.trim()).filter(Boolean);
    if (parts.length < 2) return null;
    return {
      type: 'embed',
      title: sanitizeBotMessage(parts[0], 256),
      body: sanitizeBotMessage(parts[1], 2000),
      color: parts[2],
    };
  }

  return null;
}

function sanitizeBotMessage(text, max = 1000) {
  return trim(text.replace(/@everyone/gi, '@ everyone').replace(/@here/gi, '@ here'), max);
}

function parseHexColor(value) {
  const match = value?.trim().match(/^#?([0-9a-f]{6})$/i);
  return match ? Number.parseInt(match[1], 16) : null;
}

function parseLordNicknameCommand(message) {
  const content = message.content.trim().replace(/\s+/g, ' ');
  const patterns = [
    /^(?:i\s+)?(?:sai\s+)?command(?:\s+you)?\s+<@!?(?<userId>\d{17,20})>\s+to\s+nick\s+(?:your\s*self|yourself|them|him|her)\s+(?<nickname>.+)$/i,
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

function parseLordReminderCommand(message) {
  const content = message.content.trim().replace(/\s+/g, ' ');
  const match = content.match(
    /^(?:i\s+)?(?:sai\s+)?command(?:\s+you)?\s+<@!?(?<userId>\d{17,20})>\s+to\s+remind\s+me\s+to\s+(?<text>.+?)\s+in\s+(?<minutes>\d{1,5})\s*(?:m|min|mins|minute|minutes)?$/i,
  );

  if (!match?.groups) return null;

  const minutes = Number.parseInt(match.groups.minutes, 10);
  const text = match.groups.text.trim();
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 43200 || !text) return null;

  return {
    userId: match.groups.userId,
    text: text.slice(0, 1000),
    minutes,
  };
}

async function sendLordWebhookReply(message, target, content = 'Yes, My Lord!') {
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
          content,
          allowedMentions: { parse: [] },
        })
        .catch(() => {});
      await webhook.delete('S.A.I lord nickname command response complete.').catch(() => {});
      return;
    }
  }

  await message.reply(content).catch(() => {});
}

function button(customId, label, style) {
  return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style);
}

function trim(value, max) {
  if (!value) return '[empty]';
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

function formatMinutes(minutes) {
  return minutes === 1 ? '1 minute' : `${minutes} minutes`;
}
