import {
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
} from 'discord.js';
import { config, requireConfig } from './config.js';
import { handleHelpComponent, runPrefixCommand, runSlashCommand, slashCommands } from './commands.js';
import {
  handleFeatureButton,
  handleFeatureGuildMemberAdd,
  handleFeatureGuildMemberRemove,
  handleFeatureGuildMemberUpdate,
  handleFeatureMessageCreate,
  handleFeatureMessageDelete,
  handleFeatureMessageUpdate,
  handleFeatureModal,
  handleFeatureVoiceStateUpdate,
  initFeatures,
} from './server-features.js';
import {
  handleVoiceButton,
  handleVoiceModal,
  handleVoiceSelect,
  handleVoiceStateUpdate,
  refreshPersistentVoicePanels,
} from './voice-manager.js';
import {
  initUserUtilities,
  isUserInstallCommandName,
  runMessageContextCommand,
  runUserContextCommand,
  runUserUtilityChatInput,
} from './user-utilities.js';

requireConfig(['token', 'joinToCreateChannelId']);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildPresences,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.GuildMember, Partials.User],
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`S.A.I is online as ${readyClient.user.tag}`);
  initFeatures(readyClient).catch((error) => {
    console.error('Feature initialization failed:', error);
  });
  refreshPersistentVoicePanels(readyClient).catch((error) => {
    console.error('Voice panel refresh failed:', error);
  });
  initUserUtilities(readyClient).catch((error) => {
    console.error('User utility initialization failed:', error);
  });
  console.log('S.A.I dashboard sync disabled.');
  registerGuildCommands().catch((error) => {
    console.error('Slash command auto-registration failed:', error);
  });
});

client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  await handleVoiceStateUpdate(oldState, newState);
  await handleFeatureVoiceStateUpdate(oldState, newState);
});

client.on(Events.MessageCreate, async (message) => {
  await handleFeatureMessageCreate(message).catch((error) => {
    console.error('Feature message handler failed:', error);
  });

  await runPrefixCommand(message, config.prefix).catch((error) => {
    console.error('Prefix command failed:', error);
  });
});

client.on(Events.MessageDelete, async (message) => {
  await handleFeatureMessageDelete(message).catch((error) => {
    console.error('Message delete handler failed:', error);
  });
});

client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
  await handleFeatureMessageUpdate(oldMessage, newMessage).catch((error) => {
    console.error('Message update handler failed:', error);
  });
});

client.on(Events.GuildMemberAdd, async (member) => {
  await handleFeatureGuildMemberAdd(member).catch((error) => {
    console.error('Guild member add handler failed:', error);
  });
});

client.on(Events.GuildMemberRemove, async (member) => {
  await handleFeatureGuildMemberRemove(member).catch((error) => {
    console.error('Guild member remove handler failed:', error);
  });
});

client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
  await handleFeatureGuildMemberUpdate(oldMember, newMember).catch((error) => {
    console.error('Guild member update handler failed:', error);
  });
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (isUserInstallCommandName(interaction.commandName)) {
        await runUserUtilityChatInput(interaction);
        return;
      }

      await runSlashCommand(interaction);
      return;
    }

    if (interaction.isUserContextMenuCommand()) {
      await runUserContextCommand(interaction);
      return;
    }

    if (interaction.isMessageContextMenuCommand()) {
      await runMessageContextCommand(interaction);
      return;
    }

    if ((interaction.isButton() || interaction.isStringSelectMenu()) && interaction.customId.startsWith('help:')) {
      await handleHelpComponent(interaction);
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('voice_')) {
      await handleVoiceButton(interaction);
      return;
    }

    if ((interaction.isStringSelectMenu() || interaction.isUserSelectMenu()) && interaction.customId.startsWith('voice_')) {
      await handleVoiceSelect(interaction);
      return;
    }

    if ((interaction.isButton() || interaction.isStringSelectMenu()) && interaction.customId.startsWith('feature:')) {
      await handleFeatureButton(interaction);
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('voice_')) {
      await handleVoiceModal(interaction);
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('feature_')) {
      await handleFeatureModal(interaction);
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

async function registerGuildCommands() {
  if (!config.clientId || !config.guildId) {
    console.log('Slash command auto-registration skipped: CLIENT_ID or GUILD_ID missing.');
    return;
  }

  const rest = new REST({ version: '10' }).setToken(config.token);
  await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), {
    body: slashCommands,
  });
  console.log(`Registered ${slashCommands.length} slash commands for guild ${config.guildId}.`);
}
