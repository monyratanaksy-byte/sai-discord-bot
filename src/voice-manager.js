import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { config } from './config.js';

const temporaryRooms = new Map();

export async function handleVoiceStateUpdate(oldState, newState) {
  if (
    newState.channelId &&
    newState.channelId === config.joinToCreateChannelId &&
    newState.member
  ) {
    await createTemporaryRoom(newState);
  }

  if (
    oldState.channelId &&
    temporaryRooms.has(oldState.channelId) &&
    oldState.channel?.members.size === 0
  ) {
    temporaryRooms.delete(oldState.channelId);
    await oldState.channel.delete('S.A.I temporary voice room is empty.').catch(() => {});
  }
}

export async function handleVoiceButton(interaction) {
  const room = getRoomForInteraction(interaction);
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
    await showUserAccessModal(interaction, room, 'permit');
    return;
  }

  if (interaction.customId === 'voice_deny') {
    await showUserAccessModal(interaction, room, 'deny');
  }
}

export async function handleVoiceModal(interaction) {
  const [modalAction, channelId] = interaction.customId.split(':');
  const room = temporaryRooms.get(channelId);

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
      await room.channel.permissionOverwrites.edit(member.id, {
        ViewChannel: true,
        Connect: true,
      });
      await interaction.reply({
        content: `${member} can now see and join this room.`,
        ephemeral: true,
      });
      return;
    }

    await room.channel.permissionOverwrites.edit(member.id, {
      Connect: false,
    });

    if (member.voice.channelId === room.channel.id) {
      await member.voice.disconnect('S.A.I room owner removed access.').catch(() => {});
    }

    await interaction.reply({
      content: `${member} can no longer join this room.`,
      ephemeral: true,
    });
  }
}

async function createTemporaryRoom(newState) {
  const { guild, member, channel: joinChannel } = newState;
  const room = await guild.channels.create({
    name: `${member.displayName}'s room`,
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

  await member.voice.setChannel(room, 'S.A.I moved member to temporary room.');
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

function getRoomForInteraction(interaction) {
  const channelId = interaction.channel?.id;
  return channelId ? temporaryRooms.get(channelId) : null;
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
