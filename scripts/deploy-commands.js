import { REST, Routes } from 'discord.js';
import { slashCommands } from '../src/commands.js';
import { config, requireConfig } from '../src/config.js';

requireConfig(['token', 'clientId', 'guildId']);

const rest = new REST({ version: '10' }).setToken(config.token);

await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), {
  body: slashCommands,
});

console.log(`Registered ${slashCommands.length} slash commands for guild ${config.guildId}.`);
