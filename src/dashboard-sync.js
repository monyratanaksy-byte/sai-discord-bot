import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
} from 'discord.js';
import { config } from './config.js';
import { getGuildData, updateGuildData } from './storage.js';

const syncIntervalMs = 15_000;
const recentGuildMessages = new Map();
const recentDirectMessages = [];
let applicationOwnerIds = [];
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

  refreshApplicationOwners(client).catch((error) => {
    console.error('Could not load Discord application owners:', error);
  });
  const run = () => syncAllGuilds(client).catch((error) => {
    console.error('Dashboard sync failed:', error);
  });
  run();
  setInterval(run, syncIntervalMs).unref();
  console.log('S.A.I dashboard sync enabled.');
}

export function recordDashboardMessage(message) {
  if (message.author?.bot) return;

  const entry = {
    id: message.id,
    authorId: message.author.id,
    authorName: message.member?.displayName || message.author.globalName || message.author.username,
    username: message.author.username,
    avatarUrl: message.author.displayAvatarURL({ size: 64 }),
    content: String(message.content || '').slice(0, 2000),
    attachmentCount: message.attachments?.size || 0,
    createdAt: message.createdAt.toISOString(),
  };

  if (!message.guild) {
    recentDirectMessages.unshift(entry);
    recentDirectMessages.splice(50);
    return;
  }

  const messages = recentGuildMessages.get(message.guild.id) || [];
  messages.unshift({
    ...entry,
    channelId: message.channelId,
    channelName: message.channel?.name || 'unknown-channel',
  });
  messages.splice(80);
  recentGuildMessages.set(message.guild.id, messages);
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
  const botMember = guild.members.me;
  const memberMap = new Map(members.map((member) => [member.id, member]));
  const leaderboard = Object.entries(guildData.levels || {})
    .map(([userId, progress]) => {
      const member = memberMap.get(userId);
      if (!member) return null;
      return {
        userId,
        displayName: member.displayName,
        username: member.user.username,
        avatarUrl: member.displayAvatarURL({ size: 64 }),
        xp: Number(progress.xp || 0),
        level: Number(progress.level || 1),
        coins: Number(progress.coins || 0),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.xp - a.xp)
    .slice(0, 250);

  return {
    id: guild.id,
    name: guild.name,
    iconUrl: guild.iconURL({ size: 128 }),
    memberCount: members.size || guild.memberCount,
    latency: Math.max(0, Math.round(guild.client.ws.ping)),
    version: '1.1.0',
    applicationOwnerIds,
    config: guildData.config,
    recentMessages: recentGuildMessages.get(guild.id) || [],
    recentDms: recentDirectMessages,
    leaderboard,
    channels: guild.channels.cache
      .filter((channel) => [
        ChannelType.GuildText,
        ChannelType.GuildAnnouncement,
        ChannelType.GuildVoice,
        ChannelType.GuildCategory,
      ].includes(channel.type))
      .sort((a, b) => a.rawPosition - b.rawPosition)
      .map((channel) => ({
        ...channelPermissions(channel, botMember),
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
  if (action.type === 'send-message') return sendMessage(guild, action.payload);
  if (action.type === 'send-embed') return sendEmbed(guild, action.payload);
  throw new Error(`Unsupported dashboard action: ${action.type}`);
}

async function refreshApplicationOwners(client) {
  const application = await client.application.fetch();
  if (application.owner?.members) {
    applicationOwnerIds = [...application.owner.members.values()].map((member) => member.user.id);
  } else if (application.owner?.id) {
    applicationOwnerIds = [application.owner.id];
  }
}

function channelPermissions(channel, botMember) {
  if (!botMember) {
    return { canView: false, canReadHistory: false, canSend: false, canEmbed: false };
  }
  const permissions = channel.permissionsFor(botMember);
  return {
    canView: Boolean(permissions?.has(PermissionFlagsBits.ViewChannel)),
    canReadHistory: Boolean(permissions?.has(PermissionFlagsBits.ReadMessageHistory)),
    canSend: Boolean(permissions?.has(PermissionFlagsBits.SendMessages)),
    canEmbed: Boolean(permissions?.has(PermissionFlagsBits.EmbedLinks)),
  };
}

async function getWritableChannel(guild, channelId, requireEmbeds = false) {
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased() || channel.isThread()) {
    throw new Error('The selected channel is not a supported server text channel.');
  }
  const permissions = channel.permissionsFor(guild.members.me);
  if (!permissions?.has(PermissionFlagsBits.ViewChannel) || !permissions.has(PermissionFlagsBits.SendMessages)) {
    throw new Error('S.A.I cannot view or send messages in the selected channel.');
  }
  if (requireEmbeds && !permissions.has(PermissionFlagsBits.EmbedLinks)) {
    throw new Error('S.A.I does not have Embed Links permission in the selected channel.');
  }
  return channel;
}

async function sendMessage(guild, payload = {}) {
  const content = String(payload.content || '').trim();
  if (!content || content.length > 2000) throw new Error('Message must be between 1 and 2000 characters.');
  const channel = await getWritableChannel(guild, String(payload.channelId || ''));
  await channel.send({ content, allowedMentions: { parse: [] } });
}

async function sendEmbed(guild, payload = {}) {
  const channel = await getWritableChannel(guild, String(payload.channelId || ''), true);
  const title = String(payload.title || '').trim();
  const description = String(payload.description || '').trim();
  if (!title && !description) throw new Error('An embed title or description is required.');

  const embed = new EmbedBuilder().setColor(normalizeColor(payload.color));
  if (title) embed.setTitle(title.slice(0, 256));
  if (description) embed.setDescription(description.slice(0, 4096));
  if (payload.authorName) embed.setAuthor({ name: String(payload.authorName).slice(0, 256) });
  if (payload.footer) embed.setFooter({ text: String(payload.footer).slice(0, 2048) });
  if (isHttpUrl(payload.imageUrl)) embed.setImage(payload.imageUrl);
  if (isHttpUrl(payload.thumbnailUrl)) embed.setThumbnail(payload.thumbnailUrl);

  const fields = Array.isArray(payload.fields) ? payload.fields.slice(0, 25) : [];
  const validFields = fields
    .map((field) => ({
      name: String(field?.name || '').trim().slice(0, 256),
      value: String(field?.value || '').trim().slice(0, 1024),
      inline: Boolean(field?.inline),
    }))
    .filter((field) => field.name && field.value);
  if (validFields.length) embed.addFields(validFields);

  await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
}

function normalizeColor(value) {
  const normalized = String(value || '#5865f2').replace(/^#/, '');
  return /^[0-9a-f]{6}$/i.test(normalized) ? Number.parseInt(normalized, 16) : 0x5865f2;
}

function isHttpUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
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
