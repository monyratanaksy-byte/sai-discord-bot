import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
} from 'discord.js';
import { config } from './config.js';
import { createTemporaryTextChannel } from './server-features.js';
import { getGuildData, updateGuildData } from './storage.js';

const temporaryRooms = new Map();
const roomNameCooldowns = new Map();
const roomEmojiPool = ['🌸', '☁️', '✨', '🌷', '🫧', '⭐', '🍓', '🌙', '🧸', '🎧'];
const standardRoomPrefix = '🌿 Lounge';
const roomNameCooldownMs = 90_000;

export const voiceCommands = [
  new SlashCommandBuilder()
    .setName('roomtrust')
    .setDescription('Manage users who are always allowed into your temporary voice rooms.')
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Always allow a user into your future rooms.')
        .addUserOption((option) => option.setName('user').setDescription('User to trust.').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Remove a user from your trusted room list.')
        .addUserOption((option) => option.setName('user').setDescription('User to remove.').setRequired(true)),
    )
    .addSubcommand((sub) => sub.setName('list').setDescription('Show your trusted room list.')),
  new SlashCommandBuilder()
    .setName('roomban')
    .setDescription('Manage users who are blocked from your temporary voice rooms.')
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Always block a user from your future rooms.')
        .addUserOption((option) => option.setName('user').setDescription('User to block.').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Remove a user from your room ban list.')
        .addUserOption((option) => option.setName('user').setDescription('User to remove.').setRequired(true)),
    )
    .addSubcommand((sub) => sub.setName('list').setDescription('Show your room ban list.')),
].map((command) => command.toJSON());

export async function handleVoiceStateUpdate(oldState, newState) {
  if (
    newState.channelId &&
    newState.channelId === config.joinToCreateChannelId &&
    newState.member
  ) {
    await handleJoinToCreate(newState);
  }

  if (
    newState.channelId &&
    temporaryRooms.has(newState.channelId) &&
    newState.member
  ) {
    const room = temporaryRooms.get(newState.channelId);
    if (room.textChannelId) {
      const textChannel = await newState.guild.channels.fetch(room.textChannelId).catch(() => null);
      await textChannel?.permissionOverwrites
        .edit(newState.member.id, {
          ViewChannel: true,
          SendMessages: true,
        })
        .catch(() => {});
    }
  }

  if (
    oldState.channelId &&
    oldState.channelId !== newState.channelId &&
    temporaryRooms.has(oldState.channelId) &&
    oldState.member
  ) {
    const room = temporaryRooms.get(oldState.channelId);
    if (room.textChannelId && oldState.member.id !== room.ownerId) {
      const textChannel = await oldState.guild.channels.fetch(room.textChannelId).catch(() => null);
      await textChannel?.permissionOverwrites.delete(oldState.member.id).catch(() => {});
    }
  }

  if (
    oldState.channelId &&
    temporaryRooms.has(oldState.channelId) &&
    oldState.channel?.members.size === 0
  ) {
    const room = temporaryRooms.get(oldState.channelId);
    if (room?.textChannelId && !room.isBoosterRoom) {
      const textChannel = await oldState.guild.channels.fetch(room.textChannelId).catch(() => null);
      await textChannel?.delete('S.A.I temporary voice room text channel is empty.').catch(() => {});
    }

    if (room?.isBoosterRoom) {
      return;
    }

    temporaryRooms.delete(oldState.channelId);
    await updateGuildData(oldState.guild.id, (guildData) => {
      delete guildData.voiceRooms[oldState.channelId];
    });
    await oldState.channel.delete('S.A.I temporary voice room is empty.').catch(() => {});
  }
}

export async function handleVoiceButton(interaction) {
  try {
    const room = await getRoomForInteraction(interaction);
    if (!room) {
      await interaction.reply({
        content: 'This control panel is no longer connected to an active S.A.I voice room. Create a new room to get a fresh panel.',
        ephemeral: true,
      });
      return;
    }

    if (interaction.customId === 'voice_claim') {
      await claimRoom(interaction, room);
      return;
    }

    if (interaction.customId === 'voice_coowner') {
      if (interaction.user.id !== room.ownerId) {
        await interaction.reply({
          content: 'Only the room owner can choose a co-owner.',
          ephemeral: true,
        });
        return;
      }
      await showCoOwnerPicker(interaction, room);
      return;
    }

    if (!(await isRoomManager(interaction, room))) {
      await interaction.reply({
        content: 'Only the room owner or co-owner can use this control.',
        ephemeral: true,
      });
      return;
    }

  if (interaction.customId === 'voice_lock') {
    await interaction.deferReply({ ephemeral: true });
    await room.channel.permissionOverwrites.edit(interaction.guild.id, {
      Connect: false,
    });
    await interaction.editReply('Room locked.');
    return;
  }

  if (interaction.customId === 'voice_unlock') {
    await interaction.deferReply({ ephemeral: true });
    await room.channel.permissionOverwrites.edit(interaction.guild.id, {
      Connect: null,
    });
    await interaction.editReply('Room unlocked.');
    return;
  }

  if (interaction.customId === 'voice_hide') {
    await interaction.deferReply({ ephemeral: true });
    await room.channel.permissionOverwrites.edit(interaction.guild.id, {
      ViewChannel: false,
    });
    await interaction.editReply('Room hidden.');
    return;
  }

  if (interaction.customId === 'voice_show') {
    await interaction.deferReply({ ephemeral: true });
    await room.channel.permissionOverwrites.edit(interaction.guild.id, {
      ViewChannel: null,
    });
    await interaction.editReply('Room visible again.');
    return;
  }

  if (interaction.customId === 'voice_delete') {
    await interaction.deferReply({ ephemeral: true });
    temporaryRooms.delete(room.channel.id);
    await interaction.editReply('Deleting your room.');
    await room.channel.delete('S.A.I room owner deleted the temporary room.');
    return;
  }

  if (interaction.customId === 'voice_rename') {
    await interaction.showModal(
      new ModalBuilder()
        .setCustomId(`voice_rename_modal:${room.channel.id}`)
        .setTitle('Rename Voice Room')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('name')
              .setLabel('New voice channel name')
              .setStyle(TextInputStyle.Short)
              .setMinLength(1)
              .setMaxLength(80)
              .setRequired(true)
              .setValue(room.channel.name),
          ),
        ),
    );
    return;
  }

  if (interaction.customId === 'voice_limit') {
    await interaction.showModal(
      new ModalBuilder()
        .setCustomId(`voice_limit_modal:${room.channel.id}`)
        .setTitle('Set User Limit')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('limit')
              .setLabel('User limit, 0 for unlimited')
              .setStyle(TextInputStyle.Short)
              .setMinLength(1)
              .setMaxLength(2)
              .setRequired(true)
              .setValue(String(room.channel.userLimit || 0)),
          ),
        ),
    );
    return;
  }

  if (interaction.customId === 'voice_invite') {
    await showInvitePicker(interaction, room);
    return;
  }

  if (interaction.customId === 'voice_transfer') {
    await showTransferPicker(interaction, room);
    return;
  }

  if (interaction.customId === 'voice_permit') {
    await showUserPicker(interaction, room, 'permit');
    return;
  }

  if (interaction.customId === 'voice_kick') {
    await showKickPicker(interaction, room);
    return;
  }

  if (interaction.customId === 'voice_deny') {
    await showUserPicker(interaction, room, 'deny');
  }
  } catch (error) {
    console.error('Voice button interaction failed:', error);
    await replyVoiceFailure(interaction);
  }
}

export async function handleVoiceSelect(interaction) {
  await interaction.deferUpdate();

  try {
    const [selectAction, channelId] = interaction.customId.split(':');
    const room = await getRoomById(interaction.guild, channelId);

    if (!room) {
      await finishVoiceSelect(interaction, 'That voice room no longer exists.');
      return;
    }

    if (selectAction === 'voice_coowner_select' && interaction.user.id !== room.ownerId) {
      await finishVoiceSelect(interaction, 'Only the room owner can choose a co-owner.');
      return;
    }

    if (selectAction !== 'voice_coowner_select' && !(await isRoomManager(interaction, room))) {
      await finishVoiceSelect(interaction, 'Only the room owner or co-owner can update this room.');
      return;
    }

    const selectedUserId = interaction.values?.[0];
    const member = selectedUserId
      ? await interaction.guild.members.fetch(selectedUserId).catch(() => null)
      : null;

    if (!member) {
      await finishVoiceSelect(interaction, 'Could not find that user.');
      return;
    }

    if (selectAction === 'voice_permit_select') {
      await permitMember(room, member);
      await finishVoiceSelect(interaction, `${member} can now see and join this room.`);
      return;
    }

    if (selectAction === 'voice_kick_select') {
      if (member.voice.channelId !== room.channel.id) {
        await finishVoiceSelect(interaction, `${member} is no longer in this room.`);
        return;
      }

      await member.voice.disconnect('S.A.I room owner kicked this member from the temporary room.');
      await finishVoiceSelect(interaction, `${member} was kicked from this room.`);
      return;
    }

    if (selectAction === 'voice_invite_select') {
      await sendRoomInvite(interaction, room, member);
      return;
    }

    if (selectAction === 'voice_coowner_select') {
      if (member.id === room.ownerId || member.user.bot) {
        await finishVoiceSelect(interaction, 'Choose a non-bot friend who is not already the owner.');
        return;
      }

      await setRoomCoOwner(interaction.guild.id, room, member);
      await finishVoiceSelect(interaction, `${member} is now co-owner and can manage this room.`);
      return;
    }

    if (selectAction === 'voice_transfer_select') {
      if (!room.channel.members.has(member.id)) {
        await finishVoiceSelect(interaction, `${member} needs to be inside this room before ownership can be transferred.`);
        return;
      }

      await transferRoomOwnership(interaction.guild.id, room, member.id);
      await finishVoiceSelect(interaction, `${member} now owns this room.`);
      return;
    }

    if (selectAction === 'voice_deny_select') {
      await denyMember(room, member);
      await finishVoiceSelect(interaction, `${member} can no longer join this room.`);
      return;
    }

    await finishVoiceSelect(interaction, 'That voice control is not available anymore.');
  } catch (error) {
    console.error('Voice select interaction failed:', error);
    await finishVoiceSelect(interaction, 'I could not apply that room change. Check that S.A.I has Manage Channels and Move Members permissions.').catch(() => {});
  }
}

async function finishVoiceSelect(interaction, content) {
  await interaction.editReply({
    content,
    components: [],
    allowedMentions: { parse: [] },
  });
  scheduleDeleteInteractionReply(interaction, 8_000);
}

export async function runVoiceSlashCommand(interaction) {
  if (interaction.commandName !== 'roomtrust' && interaction.commandName !== 'roomban') return false;

  const listType = interaction.commandName === 'roomtrust' ? 'trusted' : 'banned';
  const subcommand = interaction.options.getSubcommand();
  const target = interaction.options.getUser('user');

  if (target?.bot) {
    await interaction.reply({ content: 'Bot accounts do not need room access rules.', ephemeral: true });
    return true;
  }

  if (target?.id === interaction.user.id) {
    await interaction.reply({ content: 'You cannot add yourself to your own room list.', ephemeral: true });
    return true;
  }

  if (subcommand === 'add' || subcommand === 'remove') {
    await updateGuildData(interaction.guild.id, (guildData) => {
      const list = getRoomAccessList(guildData, listType, interaction.user.id);
      const otherList = getRoomAccessList(guildData, listType === 'trusted' ? 'banned' : 'trusted', interaction.user.id);

      if (subcommand === 'add') {
        if (!list.includes(target.id)) list.push(target.id);
        const otherIndex = otherList.indexOf(target.id);
        if (otherIndex >= 0) otherList.splice(otherIndex, 1);
      } else {
        const index = list.indexOf(target.id);
        if (index >= 0) list.splice(index, 1);
      }
    });

    const label = listType === 'trusted' ? 'trusted room list' : 'room ban list';
    await interaction.reply({
      content: subcommand === 'add'
        ? `${target} was added to your ${label}.`
        : `${target} was removed from your ${label}.`,
      ephemeral: true,
    });
    return true;
  }

  const guildData = await getGuildData(interaction.guild.id);
  const ids = getRoomAccessList(guildData, listType, interaction.user.id);
  const label = listType === 'trusted' ? 'Trusted users' : 'Banned users';
  await interaction.reply({
    content: ids.length ? `**${label}:**\n${ids.map((id) => `<@${id}>`).join('\n')}` : `Your ${label.toLowerCase()} list is empty.`,
    ephemeral: true,
    allowedMentions: { parse: [] },
  });
  return true;
}

export async function handleVoiceModal(interaction) {
  try {
    await interaction.deferReply({ ephemeral: true });
    const [modalAction, channelId] = interaction.customId.split(':');
    const room = await getRoomById(interaction.guild, channelId);

    if (!room) {
      await interaction.editReply('That voice room no longer exists. Create a new room to get a fresh panel.');
      return;
    }

    if (!(await isRoomManager(interaction, room))) {
      await interaction.editReply('Only the room owner or co-owner can update this room.');
      return;
    }

  if (modalAction === 'voice_rename_modal') {
    const name = interaction.fields.getTextInputValue('name').trim();
    const cooldown = getRoomNameCooldown(room.channel.id);
    if (cooldown > 0) {
      await interaction.editReply(`Room name changes are cooling down. Try again in ${cooldown} seconds.`);
      return;
    }

    if (room.channel.name !== name) {
      await room.channel.setName(name, 'S.A.I room owner renamed the room.');
      markRoomNameChanged(room.channel.id);
    }
    await interaction.editReply(`Room renamed to **${name}**.`);
    return;
  }

  if (modalAction === 'voice_limit_modal') {
    const rawLimit = interaction.fields.getTextInputValue('limit').trim();
    const limit = Number.parseInt(rawLimit, 10);

    if (!Number.isInteger(limit) || limit < 0 || limit > 99) {
      await interaction.editReply('Please enter a number from 0 to 99.');
      return;
    }

    await room.channel.setUserLimit(limit, 'S.A.I room owner changed the limit.');
    await interaction.editReply(limit === 0 ? 'User limit removed.' : `User limit set to ${limit}.`);
    return;
  }

  if (modalAction === 'voice_permit_modal' || modalAction === 'voice_deny_modal') {
    const rawUser = interaction.fields.getTextInputValue('user').trim();
    const userId = extractUserId(rawUser);
    const member = userId
      ? await interaction.guild.members.fetch(userId).catch(() => null)
      : null;

    if (!member) {
      await interaction.editReply('Could not find that user. Use a mention or user ID.');
      return;
    }

    if (modalAction === 'voice_permit_modal') {
      await permitMember(room, member);
      await interaction.editReply(`${member} can now see and join this room.`);
      return;
    }

    await denyMember(room, member);

    await interaction.editReply(`${member} can no longer join this room.`);
  }
  } catch (error) {
    console.error('Voice modal interaction failed:', error);
    await replyVoiceFailure(interaction);
  }
}

async function replyVoiceFailure(interaction) {
  const payload = {
    content: 'That voice room control is stale or Discord blocked the action. Create a new room panel and try again.',
    ephemeral: true,
  };

  if (interaction.deferred || interaction.replied) {
    await interaction.followUp(payload).catch(() => {});
  } else {
    await interaction.reply(payload).catch(() => {});
  }
}

async function permitMember(room, member) {
  await room.channel.permissionOverwrites.edit(member.id, {
    ViewChannel: true,
    Connect: true,
  });
}

async function denyMember(room, member) {
  await room.channel.permissionOverwrites.edit(member.id, {
    Connect: false,
  });

  if (member.voice.channelId === room.channel.id) {
    await member.voice.disconnect('S.A.I room owner removed access.').catch(() => {});
  }
}

async function transferRoomOwnership(guildId, room, newOwnerId) {
  const oldOwnerId = room.ownerId;
  room.ownerId = newOwnerId;

  await room.channel.permissionOverwrites.edit(newOwnerId, {
    ViewChannel: true,
    Connect: true,
    ManageChannels: true,
    MoveMembers: true,
  });

  if (oldOwnerId && oldOwnerId !== newOwnerId) {
    await room.channel.permissionOverwrites.edit(oldOwnerId, {
      ManageChannels: null,
      MoveMembers: null,
    }).catch(() => {});
  }

  await updateGuildData(guildId, (guildData) => {
    if (guildData.voiceRooms[room.channel.id]) {
      guildData.voiceRooms[room.channel.id].ownerId = newOwnerId;
    }
  });
}

async function setRoomCoOwner(guildId, room, member) {
  room.coOwnerId = member.id;

  await room.channel.permissionOverwrites.edit(member.id, {
    ViewChannel: true,
    Connect: true,
    ManageChannels: true,
    MoveMembers: true,
  });

  if (room.textChannelId) {
    const textChannel = await room.channel.guild.channels.fetch(room.textChannelId).catch(() => null);
    await textChannel?.permissionOverwrites.edit(member.id, {
      ViewChannel: true,
      SendMessages: true,
    }).catch(() => {});
  }

  await updateGuildData(guildId, (guildData) => {
    if (guildData.voiceRooms[room.channel.id]) {
      guildData.voiceRooms[room.channel.id].coOwnerId = member.id;
    }
  });
}

function getRoomNameCooldown(channelId) {
  const readyAt = roomNameCooldowns.get(channelId) || 0;
  const remaining = readyAt - Date.now();
  if (remaining <= 0) {
    roomNameCooldowns.delete(channelId);
    return 0;
  }

  return Math.ceil(remaining / 1000);
}

function markRoomNameChanged(channelId) {
  roomNameCooldowns.set(channelId, Date.now() + roomNameCooldownMs);
}

function getRoomAccessList(guildData, listType, ownerId) {
  guildData.roomAccess ||= { trusted: {}, banned: {} };
  guildData.roomAccess.trusted ||= {};
  guildData.roomAccess.banned ||= {};
  guildData.roomAccess[listType][ownerId] ||= [];
  return guildData.roomAccess[listType][ownerId];
}

function isBooster(member, guildData) {
  if (member?.premiumSince || member?.premiumSinceTimestamp) return true;
  const boosterRoleId = guildData.config?.boosterRoleId;
  return Boolean(boosterRoleId && member?.roles?.cache?.has(boosterRoleId));
}

async function getBoosterRoomForOwner(guild, ownerId, guildData) {
  const entry = Object.values(guildData.voiceRooms || {}).find((room) =>
    room?.isBoosterRoom && room.ownerId === ownerId,
  );
  if (!entry?.channelId) return null;

  const channel = await guild.channels.fetch(entry.channelId).catch(() => null);
  if (!channel) {
    await updateGuildData(guild.id, (data) => {
      delete data.voiceRooms[entry.channelId];
    });
    return null;
  }

  const room = {
    channel,
    ownerId: entry.ownerId,
    coOwnerId: entry.coOwnerId || null,
    createdAt: entry.createdAt,
    textChannelId: entry.textChannelId,
    isBoosterRoom: true,
  };
  temporaryRooms.set(channel.id, room);
  return room;
}

function nextGardenRoomName(guild) {
  const usedNumbers = new Set();
  for (const channel of guild.channels.cache.values()) {
    const match = channel.name.match(/^🌿 Lounge (\d+)$/i) || channel.name.match(/^Lounge (\d+)$/i);
    if (match) usedNumbers.add(Number(match[1]));
  }

  let number = 1;
  while (usedNumbers.has(number)) number += 1;
  return `${standardRoomPrefix} ${number}`;
}

async function handleJoinToCreate(newState) {
  const { guild, member, channel: joinChannel } = newState;
  const guildData = await getGuildData(guild.id);

  if (isBooster(member, guildData)) {
    const existingRoom = await getBoosterRoomForOwner(guild, member.id, guildData);
    if (existingRoom) {
      await member.voice.setChannel(existingRoom.channel, 'S.A.I moved booster to their permanent room.');
      return;
    }

    await createBoosterRoom(newState, guildData);
    return;
  }

  await createStandardGardenRoom(newState);
}

async function createStandardGardenRoom(newState) {
  const { guild, member, channel: joinChannel } = newState;
  const guildData = await getGuildData(guild.id);
  const room = await guild.channels.create({
    name: nextGardenRoomName(guild),
    type: ChannelType.GuildVoice,
    parent: guildData.config.normalVoiceCategoryId || joinChannel?.parentId || null,
    permissionOverwrites: [
      {
        id: guild.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
      },
      {
        id: member.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
      },
    ],
    reason: 'S.A.I standard join-to-create voice room.',
  });

  temporaryRooms.set(room.id, {
    channel: room,
    ownerId: member.id,
    coOwnerId: null,
    createdAt: Date.now(),
    textChannelId: null,
    isBoosterRoom: false,
  });
  await updateGuildData(guild.id, (guildData) => {
    guildData.voiceRooms[room.id] = {
      channelId: room.id,
      ownerId: member.id,
      coOwnerId: null,
      createdAt: Date.now(),
      textChannelId: null,
      isBoosterRoom: false,
    };
  });

  await member.voice.setChannel(room, 'S.A.I moved member to standard temporary room.');
}

async function createBoosterRoom(newState, guildData) {
  const { guild, member, channel: joinChannel } = newState;
  const trustedIds = getRoomAccessList(guildData, 'trusted', member.id);
  const bannedIds = getRoomAccessList(guildData, 'banned', member.id);
  const roomEmoji = roomEmojiPool[Math.floor(Math.random() * roomEmojiPool.length)];
  const room = await guild.channels.create({
    name: `${roomEmoji} ${member.displayName}'s Room`,
    type: ChannelType.GuildVoice,
    parent: guildData.config.boosterVoiceCategoryId || joinChannel?.parentId || null,
    permissionOverwrites: [
      {
        id: guild.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
      },
      {
        id: member.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.Connect,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.MoveMembers,
        ],
      },
      ...trustedIds
        .filter((userId) => userId !== member.id && !bannedIds.includes(userId))
        .slice(0, 50)
        .map((userId) => ({
          id: userId,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
        })),
      ...bannedIds
        .filter((userId) => userId !== member.id)
        .slice(0, 50)
        .map((userId) => ({
          id: userId,
          deny: [PermissionFlagsBits.Connect],
        })),
    ],
    reason: 'S.A.I booster permanent voice room.',
  });

  temporaryRooms.set(room.id, {
    channel: room,
    ownerId: member.id,
    coOwnerId: null,
    createdAt: Date.now(),
    textChannelId: null,
    isBoosterRoom: true,
  });
  await updateGuildData(guild.id, (guildData) => {
    guildData.voiceRooms[room.id] = {
      channelId: room.id,
      ownerId: member.id,
      coOwnerId: null,
      createdAt: Date.now(),
      textChannelId: null,
      isBoosterRoom: true,
    };
  });

  await member.voice.setChannel(room, 'S.A.I moved booster to permanent room.');
  const textChannel = await createTemporaryTextChannel(room, member.id).catch((error) => {
    console.error('Temporary text channel creation failed:', error);
    return null;
  });
  if (textChannel) {
    temporaryRooms.get(room.id).textChannelId = textChannel.id;
    await updateGuildData(guild.id, (guildData) => {
      if (guildData.voiceRooms[room.id]) {
        guildData.voiceRooms[room.id].textChannelId = textChannel.id;
      }
    });
    await sendBoosterRoomWelcome(textChannel, room, member);
  }
  await sendControlPanel(room, member.id);
}

async function sendControlPanel(channel, ownerId) {
  const room = temporaryRooms.get(channel.id);
  const coOwnerLine = room?.coOwnerId ? `\n<@${room.coOwnerId}> is co-owner and can help manage it.` : '';
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('S.A.I Voice Control Panel')
    .setDescription(
      [
        `<@${ownerId}> owns this voice room.${coOwnerLine}`,
        'Use the buttons below to manage access, visibility, name, user limit, or deletion.',
      ].join('\n'),
    );

  const rows = [
    new ActionRowBuilder().addComponents(
      button('voice_rename', 'Rename', ButtonStyle.Primary),
      button('voice_limit', 'Limit', ButtonStyle.Primary),
      button('voice_lock', 'Lock', ButtonStyle.Secondary),
      button('voice_unlock', 'Unlock', ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      button('voice_hide', 'Hide', ButtonStyle.Secondary),
      button('voice_show', 'Show', ButtonStyle.Secondary),
      button('voice_invite', 'Invite', ButtonStyle.Success),
      button('voice_claim', 'Claim', ButtonStyle.Success),
    ),
    new ActionRowBuilder().addComponents(
      button('voice_permit', 'Allow', ButtonStyle.Success),
      button('voice_kick', 'Kick', ButtonStyle.Danger),
      button('voice_deny', 'Deny', ButtonStyle.Danger),
    ),
    new ActionRowBuilder().addComponents(
      ...(room?.isBoosterRoom ? [button('voice_coowner', 'Co-owner', ButtonStyle.Primary)] : []),
      button('voice_delete', 'Delete Room', ButtonStyle.Danger),
    ),
  ];

  if (typeof channel.send === 'function') {
    await channel.send({ embeds: [embed], components: rows }).catch(() => {});
  }
}

function button(customId, label, style) {
  return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style);
}

async function sendBoosterRoomWelcome(textChannel, voiceChannel, owner) {
  await textChannel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle('Booster Room Open')
        .setDescription(
          [
            `Welcome to ${voiceChannel}.`,
            `${owner} boosted the server and unlocked this permanent room.`,
            'Use the voice control panel here to manage access, limits, lock, hide, and invites.',
          ].join('\n'),
        ),
    ],
    allowedMentions: { users: [owner.id] },
  }).catch(() => {});
}

async function showInvitePicker(interaction, room) {
  const select = new UserSelectMenuBuilder()
    .setCustomId(`voice_invite_select:${room.channel.id}`)
    .setPlaceholder('Choose a friend to invite')
    .setMinValues(1)
    .setMaxValues(1);

  await sendTemporaryPicker(interaction, {
    content: 'Pick the friend you want S.A.I to DM with a join button.',
    components: [new ActionRowBuilder().addComponents(select)],
  });
}

async function showCoOwnerPicker(interaction, room) {
  if (!room.isBoosterRoom) {
    await interaction.reply({
      content: 'Co-owner is a booster room perk.',
      ephemeral: true,
    });
    return;
  }

  const select = new UserSelectMenuBuilder()
    .setCustomId(`voice_coowner_select:${room.channel.id}`)
    .setPlaceholder('Choose one co-owner friend')
    .setMinValues(1)
    .setMaxValues(1);

  await sendTemporaryPicker(interaction, {
    content: 'Pick one friend to co-own and manage this booster room.',
    components: [new ActionRowBuilder().addComponents(select)],
  });
}

async function sendRoomInvite(interaction, room, member) {
  if (member.user.bot) {
    await finishVoiceSelect(interaction, 'Bots cannot be invited by DM.');
    return;
  }

  const channelUrl = `https://discord.com/channels/${interaction.guild.id}/${room.channel.id}`;
  const inviteButton = new ButtonBuilder()
    .setLabel('Join Voice Room')
    .setStyle(ButtonStyle.Link)
    .setURL(channelUrl);

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle('Voice Room Invite')
    .setDescription(`${interaction.member.displayName} invited you to join ${room.channel} in **${interaction.guild.name}**.`);

  const sent = await member.send({
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(inviteButton)],
    allowedMentions: { parse: [] },
  }).then(() => true).catch(() => false);

  if (!sent) {
    await finishVoiceSelect(interaction, `I could not DM ${member}. They may have DMs closed.`);
    return;
  }

  await finishVoiceSelect(interaction, `Invite sent to ${member}.`);
}

async function showTransferPicker(interaction, room) {
  const members = room.channel.members
    .filter((member) => member.id !== interaction.user.id && !member.user.bot)
    .first(25);

  if (members.length === 0) {
    await interaction.reply({
      content: 'There is nobody else in this room to transfer ownership to.',
      ephemeral: true,
    });
    return;
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId(`voice_transfer_select:${room.channel.id}`)
    .setPlaceholder('Choose the new room owner')
    .addOptions(
      members.map((member) => ({
        label: member.displayName.slice(0, 100),
        description: member.user.tag.slice(0, 100),
        value: member.id,
      })),
    );

  await sendTemporaryPicker(interaction, {
    content: 'Pick who should own this room.',
    components: [new ActionRowBuilder().addComponents(select)],
  });
}

async function showUserPicker(interaction, room, action) {
  const select = new UserSelectMenuBuilder()
    .setCustomId(`voice_${action}_select:${room.channel.id}`)
    .setPlaceholder(action === 'permit' ? 'Choose a user to allow' : 'Choose a user to deny')
    .setMinValues(1)
    .setMaxValues(1);

  await sendTemporaryPicker(interaction, {
    content: action === 'permit'
      ? 'Pick the user you want to allow into this room.'
      : 'Pick the user you want to block from this room.',
    components: [new ActionRowBuilder().addComponents(select)],
  });
}

async function showKickPicker(interaction, room) {
  const members = room.channel.members
    .filter((member) => member.id !== interaction.user.id && !member.user.bot)
    .first(25);

  if (members.length === 0) {
    await interaction.reply({
      content: 'There is nobody else in this room to kick.',
      ephemeral: true,
    });
    return;
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId(`voice_kick_select:${room.channel.id}`)
    .setPlaceholder('Choose a user to kick')
    .addOptions(
      members.map((member) => ({
        label: member.displayName.slice(0, 100),
        description: member.user.tag.slice(0, 100),
        value: member.id,
      })),
    );

  await sendTemporaryPicker(interaction, {
    content: 'Pick the user you want to kick from this room.',
    components: [new ActionRowBuilder().addComponents(select)],
  });
}

async function sendTemporaryPicker(interaction, payload) {
  await interaction.reply({
    ...payload,
    allowedMentions: { parse: [] },
  });
  scheduleDeleteInteractionReply(interaction, 30_000);
}

function scheduleDeleteInteractionReply(interaction, delayMs) {
  setTimeout(() => {
    interaction.deleteReply().catch(() => {});
  }, delayMs).unref?.();
}

async function showUserAccessModal(interaction, room, action) {
  await interaction.showModal(
    new ModalBuilder()
      .setCustomId(`voice_${action}_modal:${room.channel.id}`)
      .setTitle(action === 'permit' ? 'Allow User To Join' : 'Deny User From Joining')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('user')
            .setLabel('User mention or user ID')
            .setStyle(TextInputStyle.Short)
            .setMinLength(2)
            .setMaxLength(40)
            .setRequired(true),
        ),
      ),
  );
}

function extractUserId(value) {
  const match = value.match(/\d{17,20}/);
  return match?.[0] || null;
}

async function getRoomForInteraction(interaction) {
  const channelId = interaction.channel?.id;
  return channelId ? getRoomById(interaction.guild, channelId) : null;
}

async function getRoomById(guild, channelId) {
  const cached = temporaryRooms.get(channelId);
  if (cached) {
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (channel) {
      cached.channel = channel;
      return cached;
    }

    temporaryRooms.delete(channelId);
    await updateGuildData(guild.id, (data) => {
      delete data.voiceRooms[channelId];
    });
    return null;
  }

  const guildData = await getGuildData(guild.id);
  const saved = guildData.voiceRooms[channelId];
  if (!saved) return null;

  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel) {
    await updateGuildData(guild.id, (data) => {
      delete data.voiceRooms[channelId];
    });
    return null;
  }

  const room = {
    channel,
    ownerId: saved.ownerId,
    coOwnerId: saved.coOwnerId || null,
    createdAt: saved.createdAt,
    textChannelId: saved.textChannelId,
    isBoosterRoom: Boolean(saved.isBoosterRoom),
  };
  temporaryRooms.set(channelId, room);
  return room;
}

async function isRoomOwner(interaction, room) {
  if (interaction.user.id === room.ownerId) return true;

  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  return member?.permissions.has(PermissionFlagsBits.Administrator) || false;
}

async function isRoomManager(interaction, room) {
  if (interaction.user.id === room.ownerId || interaction.user.id === room.coOwnerId) return true;

  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  return member?.permissions.has(PermissionFlagsBits.Administrator) || false;
}

async function claimRoom(interaction, room) {
  const ownerStillInside = room.channel.members.has(room.ownerId);
  if (ownerStillInside) {
    await interaction.reply({
      content: 'The current owner is still inside the room.',
      ephemeral: true,
    });
    return;
  }

  if (!room.channel.members.has(interaction.user.id)) {
    await interaction.reply({
      content: 'Join this voice room first, then claim it.',
      ephemeral: true,
    });
    return;
  }

  room.ownerId = interaction.user.id;
  await updateGuildData(interaction.guild.id, (guildData) => {
    if (guildData.voiceRooms[room.channel.id]) {
      guildData.voiceRooms[room.channel.id].ownerId = interaction.user.id;
    }
  });
  await room.channel.permissionOverwrites.edit(interaction.user.id, {
    ViewChannel: true,
    Connect: true,
    ManageChannels: true,
    MoveMembers: true,
  });
  await interaction.reply({
    content: `You now own ${room.channel}.`,
    ephemeral: true,
  });
}
