import 'dotenv/config';

export const config = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  guildId: process.env.GUILD_ID,
  joinToCreateChannelId: process.env.JOIN_TO_CREATE_CHANNEL_ID,
  prefix: process.env.PREFIX || 's!',
  dashboardApiUrl: process.env.DASHBOARD_API_URL,
  dashboardBotSecret: process.env.DASHBOARD_BOT_SECRET,
  dashboardFastSync: ['1', 'true', 'yes', 'on'].includes(String(process.env.DASHBOARD_FAST_SYNC || '').toLowerCase()),
  confessionLogWebhookUrl: process.env.CONFESSION_LOG_WEBHOOK_URL,
  verifyRedirectUri: process.env.VERIFY_REDIRECT_URI,
  verifySiteUrl: process.env.VERIFY_SITE_URL,
  verifyApiSecret: process.env.VERIFY_API_SECRET,
};

export function requireConfig(keys) {
  const missing = keys.filter((key) => !config[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required .env value(s): ${missing.join(', ')}`);
  }
}
