import {
  Client,
  Events,
  GatewayIntentBits,
  Partials,
} from 'discord.js';
import { config, requireConfig } from './config.js';
import { runPrefixCommand, runSlashCommand } from './commands.js';
import {
  handleVoiceButton,
  handleVoiceModal,
  handleVoiceStateUpdate,
} from './voice-manager.js';

requireConfig(['token', 'joinToCreateChannelId']);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildPresences,
  ],
  partials: [Partials.Channel],
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`S.A.I is online as ${readyClient.user.tag}`);
});

client.on(Events.VoiceStateUpdate, handleVoiceStateUpdate);

client.on(Events.MessageCreate, async (message) => {
  await runPrefixCommand(message, config.prefix).catch((error) => {
    console.error('Prefix command failed:', error);
  });
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      await runSlashCommand(interaction);
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('voice_')) {
      await handleVoiceButton(interaction);
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('voice_')) {
      await handleVoiceModal(interaction);
    }
  } catch (error) {
    console.error('Interaction failed:', error);

    const message = {
      content: 'Something went wrong while S.A.I handled that action.',
      ephemeral: true,
    };

    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(message).catch(() => {});
    } else {
      await interaction.reply(message).catch(() => {});
    }
  }
});

client.login(config.token);
