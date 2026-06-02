import { REST, Routes } from 'discord.js';
import { config, requireConfig } from '../src/config.js';
import { userInstallCommands } from '../src/user-utilities.js';

requireConfig(['token', 'clientId']);

const rest = new REST({ version: '10' }).setToken(config.token);

await rest.put(Routes.applicationCommands(config.clientId), {
  body: userInstallCommands,
});

console.log(`Registered ${userInstallCommands.length} global user-installable utility commands.`);
