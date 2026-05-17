import 'dotenv/config';

export const config = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  guildId: process.env.GUILD_ID,
  joinToCreateChannelId: process.env.JOIN_TO_CREATE_CHANNEL_ID,
  prefix: process.env.PREFIX || 's!',
};

export function requireConfig(keys) {
  const missing = keys.filter((key) => !config[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required .env value(s): ${missing.join(', ')}`);
  }
}
