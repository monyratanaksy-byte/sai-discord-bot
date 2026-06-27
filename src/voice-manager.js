import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
} from 'discord.js';
import { config } from './config.js';
import { createTemporaryTextChannel } from './server-features.js';
import { getGuildData, updateGuildData } from './storage.js';

const temporaryRooms = new Map();
const roomEmojiPool = ['🌸', '☁️', '✨', '🌷', '🫧', '⭐', '🍓', '🌙', '🧸', '🎧'];

export async function handleVoiceStateUpdate(oldState, newState) {
  if (
    newState.channelId &&
    newState.channelId === config.joinToCreateChannelId &&
    newState.member
  ) {
    await createTemporaryRoom(newState);
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
    temporaryRooms.delete(oldState.channelId);
    await updateGuildData(oldState.guild.id, (guildData) => {
      delete guildData.voiceRooms[oldState.channelId];
    });
    if (room?.textChannelId) {
      const textChannel = await oldState.guild.channels.fetch(room.textChannelId).catch(() => null);
      await textChannel?.delete('S.A.I temporary voice room text channel is empty.').catch(() => {});
    }
    await oldState.channel.delete('S.A.I temporary voice room is empty.').catch(() => {});
  }
}

export async function handleVoiceButton(interaction) {
  const room = await getRoomForInteraction(interaction);
  if (!room) {
    await interaction.reply({
      content: 'This control panel is only for active S.A.I voice rooms.',
      ephemeral: true,
    });
    return;
  }

  if (interaction.customId === 'voice_claim') {
    await claimRoom(interaction, room);
    return;
  }

  if (!(await isRoomOwner(interaction, room))) {
    await interaction.reply({
      content: 'Only the room owner can use this control.',
      ephemeral: true,
    });
    return;
  }

  if (interaction.customId === 'voice_lock') {
    await room.channel.permissionOverwrites.edit(interaction.guild.id, {
      Connect: false,
    });
    await interaction.reply({ content: 'Room locked.', ephemeral: true });
    return;
  }

  if (interaction.customId === 'voice_unlock') {
    await room.channel.permissionOverwrites.edit(interaction.guild.id, {
      Connect: null,
    });
    await interaction.reply({ content: 'Room unlocked.', ephemeral: true });
    return;
  }

  if (interaction.customId === 'voice_hide') {
    await room.channel.permissionOverwrites.edit(interaction.guild.id, {
      ViewChannel: false,
    });
    await interaction.reply({ content: 'Room hidden.', ephemeral: true });
    return;
  }

  if (interaction.customId === 'voice_show') {
    await room.channel.permissionOverwrites.edit(interaction.guild.id, {
      ViewChannel: null,
    });
    await interaction.reply({ content: 'Room visible again.', ephemeral: true });
    return;
  }

  if (interaction.customId === 'voice_delete') {
    temporaryRooms.delete(room.channel.id);
    await interaction.reply({ content: 'Deleting your room.', ephemeral: true });
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
}

export async function handleVoiceSelect(interaction) {
  const [selectAction, channelId] = interaction.customId.split(':');
  const room = await getRoomById(interaction.guild, channelId);

  if (!room) {
    await interaction.reply({
      content: 'That voice room no longer exists.',
      ephemeral: true,
    });
    return;
  }

  if (!(await isRoomOwner(interaction, room))) {
    await interaction.reply({
      content: 'Only the room owner can update this room.',
      ephemeral: true,
    });
    return;
  }

  const selectedUserId = interaction.values?.[0];
  const member = selectedUserId
    ? await interaction.guild.members.fetch(selectedUserId).catch(() => null)
    : null;

  if (!member) {
    await interaction.reply({
      content: 'Could not find that user.',
      ephemeral: true,
    });
    return;
  }

  if (selectAction === 'voice_permit_select') {
    await permitMember(room, member);
    await interaction.reply({
      content: `${member} can now see and join this room.`,
      ephemeral: true,
    });
    return;
  }

  if (selectAction === 'voice_kick_select') {
    if (member.voice.channelId !== room.channel.id) {
      await interaction.reply({
        content: `${member} is no longer in this room.`,
        ephemeral: true,
      });
      return;
    }

    await member.voice.disconnect('S.A.I room owner kicked this member from the temporary room.');
    await interaction.reply({
      content: `${member} was kicked from this room.`,
      ephemeral: true,
    });
    return;
  }

  if (selectAction === 'voice_deny_select') {
    await denyMember(room, member);
    await interaction.reply({
      content: `${member} can no longer join this room.`,
      ephemeral: true,
    });
  }
}

export async function handleVoiceModal(interaction) {
  const [modalAction, channelId] = interaction.customId.split(':');
  const room = await getRoomById(interaction.guild, channelId);

  if (!room) {
    await interaction.reply({
      content: 'That voice room no longer exists.',
      ephemeral: true,
    });
    return;
  }

  if (!(await isRoomOwner(interaction, room))) {
    await interaction.reply({
      content: 'Only the room owner can update this room.',
      ephemeral: true,
    });
    return;
  }

  if (modalAction === 'voice_rename_modal') {
    const name = interaction.fields.getTextInputValue('name').trim();
    await room.channel.setName(name, 'S.A.I room owner renamed the room.');
    await interaction.reply({ content: `Room renamed to **${name}**.`, ephemeral: true });
    return;
  }

  if (modalAction === 'voice_limit_modal') {
    const rawLimit = interaction.fields.getTextInputValue('limit').trim();
    const limit = Number.parseInt(rawLimit, 10);

    if (!Number.isInteger(limit) || limit < 0 || limit > 99) {
      await interaction.reply({
        content: 'Please enter a number from 0 to 99.',
        ephemeral: true,
      });
      return;
    }

    await room.channel.setUserLimit(limit, 'S.A.I room owner changed the limit.');
    await interaction.reply({
      content: limit === 0 ? 'User limit removed.' : `User limit set to ${limit}.`,
      ephemeral: true,
    });
    return;
  }

  if (modalAction === 'voice_permit_modal' || modalAction === 'voice_deny_modal') {
    const rawUser = interaction.fields.getTextInputValue('user').trim();
    const userId = extractUserId(rawUser);
    const member = userId
      ? await interaction.guild.members.fetch(userId).catch(() => null)
      : null;

    if (!member) {
      await interaction.reply({
        content: 'Could not find that user. Use a mention or user ID.',
        ephemeral: true,
      });
      return;
    }

    if (modalAction === 'voice_permit_modal') {
      await permitMember(room, member);
      await interaction.reply({
        content: `${member} can now see and join this room.`,
        ephemeral: true,
      });
      return;
    }

    await denyMember(room, member);

    await interaction.reply({
      content: `${member} can no longer join this room.`,
      ephemeral: true,
    });
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

async function createTemporaryRoom(newState) {
  const { guild, member, channel: joinChannel } = newState;
  const roomEmoji = roomEmojiPool[Math.floor(Math.random() * roomEmojiPool.length)];
  const room = await guild.channels.create({
    name: `${roomEmoji} ${member.displayName}'s Room`,
    type: ChannelType.GuildVoice,
    parent: joinChannel?.parentId || null,
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
    ],
    reason: 'S.A.I join-to-create voice room.',
  });

  temporaryRooms.set(room.id, {
    channel: room,
    ownerId: member.id,
    createdAt: Date.now(),
  });
  await updateGuildData(guild.id, (guildData) => {
    guildData.voiceRooms[room.id] = {
      channelId: room.id,
      ownerId: member.id,
      createdAt: Date.now(),
      textChannelId: null,
    };
  });

  await member.voice.setChannel(room, 'S.A.I moved member to temporary room.');
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
  }
  await sendControlPanel(room, member.id);
}

async function sendControlPanel(channel, ownerId) {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('S.A.I Voice Control Panel')
    .setDescription(
      [
        `<@${ownerId}> owns this temporary voice room.`,
        'Use the buttons below to manage access, visibility, name, user limit, or deletion.',
      ].join('\n'),
    );

  const rows = [
    new ActionRowBuilder().addComponents(
      button('voice_lock', 'Lock', ButtonStyle.Secondary),
      button('voice_unlock', 'Unlock', ButtonStyle.Secondary),
      button('voice_hide', 'Hide', ButtonStyle.Secondary),
      button('voice_show', 'Show', ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      button('voice_rename', 'Rename', ButtonStyle.Primary),
      button('voice_limit', 'Limit', ButtonStyle.Primary),
      button('voice_claim', 'Claim', ButtonStyle.Success),
      button('voice_delete', 'Delete', ButtonStyle.Danger),
    ),
    new ActionRowBuilder().addComponents(
      button('voice_permit', 'Allow User', ButtonStyle.Success),
      button('voice_kick', 'Kick User', ButtonStyle.Danger),
      button('voice_deny', 'Deny User', ButtonStyle.Danger),
    ),
  ];

  if (typeof channel.send === 'function') {
    await channel.send({ embeds: [embed], components: rows }).catch(() => {});
  }
}

function button(customId, label, style) {
  return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style);
}

async function showUserPicker(interaction, room, action) {
  const select = new UserSelectMenuBuilder()
    .setCustomId(`voice_${action}_select:${room.channel.id}`)
    .setPlaceholder(action === 'permit' ? 'Choose a user to allow' : 'Choose a user to deny')
    .setMinValues(1)
    .setMaxValues(1);

  await interaction.reply({
    content: action === 'permit'
      ? 'Pick the user you want to allow into this room.'
      : 'Pick the user you want to block from this room.',
    components: [new ActionRowBuilder().addComponents(select)],
    ephemeral: true,
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

  await interaction.reply({
    content: 'Pick the user you want to kick from this room.',
    components: [new ActionRowBuilder().addComponents(select)],
    ephemeral: true,
  });
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
  if (cached) return cached;

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
    createdAt: saved.createdAt,
    textChannelId: saved.textChannelId,
  };
  temporaryRooms.set(channelId, room);
  return room;
}

async function isRoomOwner(interaction, room) {
  if (interaction.user.id === room.ownerId) return true;

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
