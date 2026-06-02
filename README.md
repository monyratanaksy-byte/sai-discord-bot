# S.A.I Discord Bot

S.A.I is a Discord.js bot with:

- Join-to-create temporary voice rooms
- Owner control panel buttons inside the new voice channel chat
- Slash commands and `s!` prefix commands
- User information and profile lookup commands
- Server setup, verification, tickets, moderation, logging, roles, and utility tools
- Safe Discord User Install utility commands that do not use AI, paid APIs, or external services

## Setup

1. Install Node.js 20 or newer.
2. In this folder, install dependencies:

```bash
pnpm install
```

3. Copy `.env.example` to `.env` and fill it in:

```bash
cp .env.example .env
```

Required values:

- `DISCORD_TOKEN`: your bot token from the Discord Developer Portal
- `CLIENT_ID`: the S.A.I application ID, currently `1505710039820927067`
- `GUILD_ID`: the Discord server ID where you want slash commands during testing
- `JOIN_TO_CREATE_CHANNEL_ID`: the voice channel users join to create their room
- `PREFIX`: defaults to `s!`

4. In the Discord Developer Portal, make sure these bot settings are enabled:

- Public Bot
- Presence Intent
- Server Members Intent
- Message Content Intent

5. Invite the bot with Administrator permission:

https://discord.com/oauth2/authorize?client_id=1505710039820927067&permissions=8&scope=bot%20applications.commands

6. Deploy slash commands:

```bash
pnpm run deploy:commands
```

7. Optional: deploy global User Install utility commands:

```bash
pnpm run deploy:global
```

In the Discord Developer Portal, open the S.A.I application, go to Installation,
and enable both Guild Install and User Install. Keep `applications.commands`
enabled for User Install.

8. Start the bot:

```bash
pnpm start
```

## BotHoster Setup

BotHoster can deploy this bot from GitHub.

Use these settings:

- Runtime: Node.js
- Install command: `pnpm install`
- Start command: `pnpm start`
- Main file: `src/index.js`

Add these secrets/environment variables in BotHoster:

```env
DISCORD_TOKEN=your_bot_token
CLIENT_ID=1505710039820927067
GUILD_ID=your_server_id
JOIN_TO_CREATE_CHANNEL_ID=your_join_to_create_voice_channel_id
PREFIX=s!
```

Never commit your real `.env` file to GitHub. Only `.env.example` should be public.

## Wispbyte Setup

Wispbyte can run this bot either from GitHub or from the prepared upload zip.

Recommended GitHub settings:

- Git repo address: `https://github.com/monyratanaksy-byte/sai-discord-bot`
- Branch: `main`
- User uploaded files: `0`
- Auto update: `1`
- Docker image: Node.js 24
- JS file: `src/index.js`

Working Wispbyte startup command:

```bash
if [ -f /home/container/package.json ]; then /usr/local/bin/npm install; fi; /usr/local/bin/npm start
```

Required Wispbyte environment variables:

```env
DISCORD_TOKEN=your_bot_token
CLIENT_ID=1505710039820927067
GUILD_ID=1481641949651013765
JOIN_TO_CREATE_CHANNEL_ID=1505717293823561870
PREFIX=s!
```

For manual uploads, rebuild the upload folder and zip:

```bash
pnpm run package:wispbyte
```

Then upload `/Users/monyratanaksy/Desktop/Project/sai-discord-bot-wisebyte.zip` and extract it so `package.json` is directly under `/home/container/`.

## Commands

Main guild slash commands:

- `/ping`
- `/userinfo [user]`
- `/profile [user]`
- `/coords from x y z`
- `/admin status`
- `/admin config`
- `/setup template`
- `/ticket panel`
- `/mod warn`
- `/poll create`
- `/role give-everyone`
- `/verification create`
- `/bot profile`

Global User Install utility commands include:

- `/talk`, `/embed`, `/announce`, `/remind`
- `/note`, `/todo`, `/timezone`, `/time`, `/timer`
- `/choose`, `/8ball`, `/coinflip`, `/dice`, `/math`, `/color`
- `/avatar`, `/banner`, `/userinfo-lite`, `/profile-card`
- `/password`, `/roll`, `/random-number`

`/talk` replies privately with `Sent.`, then tries to send the actual message
as a normal channel message from S.A.I. If Discord blocks normal channel sends
in that User Install context, S.A.I falls back to a public interaction follow-up;
that fallback may still show Discord's command attribution line.

`/embed` and `/announce` include a `private` option. Public slash command
responses can still show Discord's command attribution line.

User context menus include View Avatar, View Banner, User Info Lite, Profile
Card, Compliment, and Rate Avatar.

Message context menus include Quote Message, Save To Notes, Make Embed From
Message, and Count Words.

Admin-only hidden message triggers:

- `Sai say Your message here`
- `S.A.I say Your message here`
- `Sai embed Title | Body | #57f287`

These are normal message triggers. If S.A.I has Manage Messages and Send
Messages in the channel, it deletes the trigger message and sends the bot
message without storing the trigger in S.A.I snipe/log storage.

Prefix commands:

- `s!ping`
- `s!help`
- `s!userinfo [@user|user_id]`
- `s!profile [@user|user_id]`

## Join-To-Create Behavior

When a user joins the configured `JOIN_TO_CREATE_CHANNEL_ID`, S.A.I creates a temporary voice channel under the same category, moves the user into it, and posts a control panel.

Room owner controls:

- Lock
- Unlock
- Hide
- Show
- Rename
- Set user limit
- Allow a specific user to join
- Deny a specific user from joining
- Claim ownership if the old owner leaves
- Delete room

Temporary rooms are deleted automatically when empty.
