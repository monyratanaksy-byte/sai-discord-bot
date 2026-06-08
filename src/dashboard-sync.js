import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
} from 'discord.js';
import { config } from './config.js';
import { getGuildData, updateGuildData } from './storage.js';

const syncIntervalMs = 15_000;
const allowedConfigKeys = new Set([
  'welcomeChannelId',
  'verifiedRoleId',
  'rulesText',
  'ticketCategoryId',
  'supportRoleId',
  'logChannelId',
  'statsCategoryId',
  'boosterRoleId',
  'boosterChannelId',
  'confessionChannelId',
  'automodEnabled',
  'levelingEnabled',
  'economyEnabled',
  'tempTextEnabled',
  'voiceRewardsEnabled',
  'raidMode',
]);

export function initDashboardSync(client) {
  if (!config.dashboardApiUrl || !config.dashboardBotSecret) {
    console.log('Dashboard sync disabled: DASHBOARD_API_URL or DASHBOARD_BOT_SECRET missing.');
    return;
  }

  const run = () => syncAllGuilds(client).catch((error) => {
    console.error('Dashboard sync failed:', error);
  });
  run();
  setInterval(run, syncIntervalMs).unref();
  console.log('S.A.I dashboard sync enabled.');
}

async function syncAllGuilds(client) {
  for (const guild of client.guilds.cache.values()) {
    await syncGuild(guild);
  }
}

async function syncGuild(guild) {
  const endpoint = `${config.dashboardApiUrl.replace(/\/+$/, '')}/api/bot-sync/${guild.id}`;
  const headers = {
    Authorization: `Bearer ${config.dashboardBotSecret}`,
    'Content-Type': 'application/json',
  };

  const desiredResponse = await fetch(endpoint, { headers });
  if (!desiredResponse.ok) {
    throw new Error(`Dashboard GET ${guild.id} failed with ${desiredResponse.status}.`);
  }

  const desired = await desiredResponse.json();
  if (desired.config) {
    await updateGuildData(guild.id, (guildData) => {
      for (const [key, value] of Object.entries(desired.config)) {
        if (allowedConfigKeys.has(key)) guildData.config[key] = value;
      }
    });
  }

  const acknowledgedActionIds = [];
  for (const action of desired.actions || []) {
    try {
      await processAction(guild, action);
      acknowledgedActionIds.push(action.id);
    } catch (error) {
      console.error(`Dashboard action ${action.type} failed for ${guild.id}:`, error);
    }
  }

  const snapshot = await buildSnapshot(guild);
  const updateResponse = await fetch(endpoint, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ snapshot, acknowledgedActionIds }),
  });
  if (!updateResponse.ok) {
    throw new Error(`Dashboard PUT ${guild.id} failed with ${updateResponse.status}.`);
  }
}

async function buildSnapshot(guild) {
  const [guildData, members] = await Promise.all([
    getGuildData(guild.id),
    guild.members.fetch().catch(() => guild.members.cache),
  ]);

  return {
    id: guild.id,
    name: guild.name,
    iconUrl: guild.iconURL({ size: 128 }),
    memberCount: members.size || guild.memberCount,
    latency: Math.max(0, Math.round(guild.client.ws.ping)),
    version: '1.1.0',
    config: guildData.config,
    channels: guild.channels.cache
      .filter((channel) => [
        ChannelType.GuildText,
        ChannelType.GuildAnnouncement,
        ChannelType.GuildVoice,
        ChannelType.GuildCategory,
      ].includes(channel.type))
      .sort((a, b) => a.rawPosition - b.rawPosition)
      .map((channel) => ({
        id: channel.id,
        name: channel.name,
        type: channel.type === ChannelType.GuildCategory
          ? 'category'
          : channel.type === ChannelType.GuildVoice
            ? 'voice'
            : 'text',
        parentId: channel.parentId,
      })),
    roles: guild.roles.cache
      .filter((role) => role.id !== guild.id)
      .sort((a, b) => b.position - a.position)
      .map((role) => ({ id: role.id, name: role.name, color: role.hexColor })),
  };
}

async function processAction(guild, action) {
  if (action.type === 'refresh-snapshot') return;
  if (action.type === 'create-backup') return createBackup(guild);
  if (action.type === 'post-verification') return postVerification(guild);
  throw new Error(`Unsupported dashboard action: ${action.type}`);
}

async function createBackup(guild) {
  const backup = {
    at: Date.now(),
    roles: guild.roles.cache
      .filter((role) => role.id !== guild.id)
      .map((role) => ({
        id: role.id,
        name: role.name,
        color: role.hexColor,
        position: role.position,
      })),
    channels: guild.channels.cache.map((channel) => ({
      id: channel.id,
      name: channel.name,
      type: channel.type,
      parentId: channel.parentId,
    })),
  };
  await updateGuildData(guild.id, (guildData) => {
    guildData.backups.latest = backup;
  });
}

async function postVerification(guild) {
  const guildData = await getGuildData(guild.id);
  const { welcomeChannelId, verifiedRoleId } = guildData.config;
  if (!welcomeChannelId || !verifiedRoleId) {
    throw new Error('Welcome channel and verified role must be configured.');
  }

  const [channel, role] = await Promise.all([
    guild.channels.fetch(welcomeChannelId).catch(() => null),
    guild.roles.fetch(verifiedRoleId).catch(() => null),
  ]);
  if (!channel?.isTextBased() || !role) {
    throw new Error('Configured verification channel or role no longer exists.');
  }

  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle('Server Verification')
        .setDescription('Click the button below to verify your account and unlock the rest of the server.')
        .addFields(
          { name: 'Before You Verify', value: 'Please read the rules and respect the community.' },
          { name: 'Access', value: `Verification gives you the ${role} role.` },
        ),
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('feature:verify')
          .setLabel('Accept Rules')
          .setStyle(ButtonStyle.Success),
      ),
    ],
  });
}
