import crypto from 'node:crypto';
import {
  ApplicationCommandType,
  EmbedBuilder,
} from 'discord.js';
import { getUserData, updateUserData } from './storage.js';

const GUILD_INSTALL = 0;
const USER_INSTALL = 1;
const GUILD = 0;
const BOT_DM = 1;
const PRIVATE_CHANNEL = 2;
const STRING = 3;
const INTEGER = 4;
const BOOLEAN = 5;
const USER = 6;
const globalReminderTimers = new Map();
const maxTimeoutMs = 2_147_483_647;

const installContexts = {
  integration_types: [GUILD_INSTALL, USER_INSTALL],
  contexts: [GUILD, BOT_DM, PRIVATE_CHANNEL],
};

export const userInstallCommands = [
  slash('talk', 'Repeat a safe message.', [
    stringOption('message', 'Message to send.', true, 1, 2000),
  ]),
  slash('embed', 'Create a simple embed.', [
    stringOption('title', 'Embed title.', true, 1, 256),
    stringOption('body', 'Embed body.', true, 1, 2000),
    stringOption('color', 'Hex color, like #57f287.', false, 3, 7),
    publicOption(),
  ]),
  slash('announce', 'Create an announcement embed.', [
    stringOption('title', 'Announcement title.', true, 1, 256),
    stringOption('body', 'Announcement body.', true, 1, 2000),
    publicOption(),
  ]),
  slash('remind', 'Save a personal reminder.', [
    stringOption('text', 'Reminder text.', true, 1, 1000),
    intOption('minutes', 'Minutes from now.', true, 1, 43200),
  ]),
  slash('note', 'Personal notes.', [
    sub('save', 'Save a note.', [stringOption('text', 'Note text.', true, 1, 1000)]),
    sub('list', 'List your notes.'),
    sub('delete', 'Delete a note.', [stringOption('id', 'Note ID.', true, 1, 40)]),
  ]),
  slash('todo', 'Personal todos.', [
    sub('add', 'Add a todo.', [stringOption('text', 'Todo text.', true, 1, 1000)]),
    sub('list', 'List your todos.'),
    sub('done', 'Mark a todo done.', [stringOption('id', 'Todo ID.', true, 1, 40)]),
  ]),
  slash('choose', 'Choose from comma-separated options.', [
    stringOption('options', 'Options separated by commas or |.', true, 1, 1000),
    publicOption(),
  ]),
  slash('8ball', 'Ask the magic 8-ball.', [
    stringOption('question', 'Question.', true, 1, 500),
    publicOption(),
  ]),
  slash('coinflip', 'Flip a coin.', [publicOption()]),
  slash('dice', 'Roll a die.', [intOption('sides', 'Number of sides.', false, 2, 1000000), publicOption()]),
  slash('avatar', 'View a user avatar.', [userOption(), publicOption()]),
  slash('banner', 'View a user banner.', [userOption(), publicOption()]),
  slash('userinfo-lite', 'View light user info.', [userOption(), publicOption()]),
  slash('avatar-link', 'Get avatar link.', [userOption(), publicOption()]),
  slash('profile-card', 'View a small profile card.', [userOption(), publicOption()]),
  slash('timezone', 'Personal timezone settings.', [
    sub('set', 'Set your timezone.', [stringOption('timezone', 'IANA timezone, like Australia/Melbourne.', true, 1, 80)]),
  ]),
  slash('time', 'Show the time.', [stringOption('timezone', 'IANA timezone. Defaults to your saved timezone.', false, 1, 80)]),
  slash('timer', 'Start a personal timer.', [intOption('minutes', 'Minutes from now.', true, 1, 43200)]),
  slash('math', 'Calculate safe arithmetic.', [stringOption('expression', 'Example: (2 + 3) * 4.', true, 1, 200), publicOption()]),
  slash('color', 'Preview a hex color.', [stringOption('hex', 'Hex color, like #57f287.', true, 3, 7), publicOption()]),
  slash('password', 'Generate a password.', [intOption('length', 'Password length.', false, 8, 64)]),
  slash('roll', 'Roll from 1 to max.', [intOption('max', 'Maximum roll.', false, 2, 1000000), publicOption()]),
  slash('random-number', 'Random number in a range.', [
    intOption('min', 'Minimum.', true, -1000000, 1000000),
    intOption('max', 'Maximum.', true, -1000000, 1000000),
    publicOption(),
  ]),
  contextUser('View Avatar'),
  contextUser('View Banner'),
  contextUser('User Info Lite'),
  contextUser('Profile Card'),
  contextUser('Compliment'),
  contextUser('Rate Avatar'),
  contextMessage('Quote Message'),
  contextMessage('Save To Notes'),
  contextMessage('Make Embed From Message'),
  contextMessage('Count Words'),
];

export function isUserInstallCommandName(name) {
  return userInstallCommands.some((command) => command.name === name);
}

export async function initUserUtilities(client) {
  // Timers are scheduled lazily for users in the data file without requiring extra APIs.
  const { loadData } = await import('./storage.js');
  const data = await loadData();
  for (const [userId, userData] of Object.entries(data.users || {})) {
    for (const reminder of Object.values(userData.reminders || {})) {
      scheduleUserReminder(client, userId, reminder);
    }
  }
}

export async function runUserUtilityChatInput(interaction) {
  const name = interaction.commandName;
  if (!isUserInstallCommandName(name)) return false;

  if (name === 'talk') return runTalk(interaction);
  if (name === 'embed') return runEmbed(interaction);
  if (name === 'announce') return runAnnounce(interaction);
  if (name === 'remind') return runPersonalReminder(interaction, interaction.options.getString('text', true), interaction.options.getInteger('minutes', true));
  if (name === 'note') return runNote(interaction);
  if (name === 'todo') return runTodo(interaction);
  if (name === 'choose') return replyVisible(interaction, pick(splitOptions(interaction.options.getString('options', true))) || 'Give me at least one option.');
  if (name === '8ball') return replyVisible(interaction, pick(['Yes.', 'No.', 'Maybe.', 'Ask again later.', 'Absolutely.', 'Not looking good.']));
  if (name === 'coinflip') return replyVisible(interaction, pick(['Heads', 'Tails']));
  if (name === 'dice') return replyVisible(interaction, `You rolled **${randomInt(1, interaction.options.getInteger('sides') || 6)}**.`);
  if (['avatar', 'banner', 'userinfo-lite', 'avatar-link', 'profile-card'].includes(name)) return runUserView(interaction, name);
  if (name === 'timezone') return runTimezone(interaction);
  if (name === 'time') return runTime(interaction);
  if (name === 'timer') return runPersonalReminder(interaction, 'Timer finished.', interaction.options.getInteger('minutes', true));
  if (name === 'math') return runMath(interaction);
  if (name === 'color') return runColor(interaction);
  if (name === 'password') return replyPrivate(interaction, `\`${makePassword(interaction.options.getInteger('length') || 16)}\``);
  if (name === 'roll') return replyVisible(interaction, `You rolled **${randomInt(1, interaction.options.getInteger('max') || 100)}**.`);
  if (name === 'random-number') return runRandomNumber(interaction);
  return false;
}

export async function runUserContextCommand(interaction) {
  const user = interaction.targetUser;
  if (interaction.commandName === 'View Avatar') return sendAvatar(interaction, user);
  if (interaction.commandName === 'View Banner') return sendBanner(interaction, user);
  if (interaction.commandName === 'User Info Lite') return sendUserInfoLite(interaction, user);
  if (interaction.commandName === 'Profile Card') return sendProfileCard(interaction, user);
  if (interaction.commandName === 'Compliment') return replyPrivate(interaction, `${user} ${pick(compliments)}`);
  if (interaction.commandName === 'Rate Avatar') return replyPrivate(interaction, `${user}'s avatar: **${randomInt(7, 10)}/10**`);
  return false;
}

export async function runMessageContextCommand(interaction) {
  const message = interaction.targetMessage;
  if (interaction.commandName === 'Quote Message') {
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(0x5865f2).setAuthor({ name: message.author?.tag || 'Unknown' }).setDescription(message.content || '[no text]').setTimestamp()],
      ephemeral: true,
      allowedMentions: { parse: [] },
    });
  }
  if (interaction.commandName === 'Save To Notes') {
    const id = shortId();
    await updateUserData(interaction.user.id, (data) => {
      data.notes[id] = { id, text: message.content || '[no text]', createdAt: Date.now() };
    });
    return replyPrivate(interaction, `Saved note \`${id}\`.`);
  }
  if (interaction.commandName === 'Make Embed From Message') {
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x5865f2).setDescription(message.content || '[no text]')], ephemeral: true, allowedMentions: { parse: [] } });
  }
  if (interaction.commandName === 'Count Words') {
    const words = (message.content || '').trim().split(/\s+/).filter(Boolean).length;
    return replyPrivate(interaction, `Words: **${words}**`);
  }
  return false;
}

async function runTalk(interaction) {
  const message = interaction.options.getString('message', true);
  await interaction.reply({ content: 'Sent.', ephemeral: true });

  try {
    await interaction.channel.send({ content: message });
  } catch {
    await interaction.followUp({ content: message });
  }
  return true;
}

async function runEmbed(interaction) {
  const color = parseColor(interaction.options.getString('color')) ?? 0x5865f2;
  return interaction.reply({
    embeds: [new EmbedBuilder().setColor(color).setTitle(interaction.options.getString('title', true)).setDescription(interaction.options.getString('body', true))],
    ephemeral: !isPublic(interaction),
    allowedMentions: { parse: [] },
  });
}

async function runAnnounce(interaction) {
  return interaction.reply({
    embeds: [new EmbedBuilder().setColor(0x57f287).setTitle(interaction.options.getString('title', true)).setDescription(interaction.options.getString('body', true)).setTimestamp()],
    ephemeral: !isPublic(interaction),
    allowedMentions: { parse: [] },
  });
}

async function runNote(interaction) {
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === 'save') {
    const id = shortId();
    await updateUserData(interaction.user.id, (data) => {
      data.notes[id] = { id, text: interaction.options.getString('text', true), createdAt: Date.now() };
    });
    return replyPrivate(interaction, `Saved note \`${id}\`.`);
  }
  const data = await getUserData(interaction.user.id);
  if (subcommand === 'list') return replyPrivate(interaction, formatItems(data.notes, 'notes'));
  if (subcommand === 'delete') {
    const id = interaction.options.getString('id', true);
    await updateUserData(interaction.user.id, (userData) => delete userData.notes[id]);
    return replyPrivate(interaction, `Deleted note \`${id}\` if it existed.`);
  }
  return false;
}

async function runTodo(interaction) {
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === 'add') {
    const id = shortId();
    await updateUserData(interaction.user.id, (data) => {
      data.todos[id] = { id, text: interaction.options.getString('text', true), done: false, createdAt: Date.now() };
    });
    return replyPrivate(interaction, `Added todo \`${id}\`.`);
  }
  const data = await getUserData(interaction.user.id);
  if (subcommand === 'list') return replyPrivate(interaction, formatItems(data.todos, 'todos'));
  if (subcommand === 'done') {
    const id = interaction.options.getString('id', true);
    await updateUserData(interaction.user.id, (userData) => {
      if (userData.todos[id]) userData.todos[id].done = true;
    });
    return replyPrivate(interaction, `Marked todo \`${id}\` done if it existed.`);
  }
  return false;
}

async function runPersonalReminder(interaction, text, minutes) {
  const reminder = {
    id: shortId(),
    userId: interaction.user.id,
    channelId: interaction.channelId,
    text,
    dueAt: Date.now() + minutes * 60 * 1000,
    createdAt: Date.now(),
  };
  await updateUserData(interaction.user.id, (data) => {
    data.reminders[reminder.id] = reminder;
  });
  scheduleUserReminder(interaction.client, interaction.user.id, reminder);
  return replyPrivate(interaction, `Reminder saved for ${minutes === 1 ? '1 minute' : `${minutes} minutes`} from now.`);
}

function scheduleUserReminder(client, userId, reminder) {
  const key = `${userId}:${reminder.id}`;
  if (globalReminderTimers.has(key)) clearTimeout(globalReminderTimers.get(key));
  const delay = Math.max(0, reminder.dueAt - Date.now());
  if (delay > maxTimeoutMs) {
    const timer = setTimeout(() => scheduleUserReminder(client, userId, reminder), maxTimeoutMs);
    globalReminderTimers.set(key, timer);
    return;
  }
  const timer = setTimeout(async () => {
    globalReminderTimers.delete(key);
    const channel = await client.channels.fetch(reminder.channelId).catch(() => null);
    await channel?.send({ content: `<@${userId}>, reminder: ${reminder.text}`, allowedMentions: { users: [userId] } }).catch(() => {});
    await updateUserData(userId, (data) => delete data.reminders?.[reminder.id]);
  }, delay);
  globalReminderTimers.set(key, timer);
}

async function runUserView(interaction, name) {
  const user = interaction.options.getUser('user') || interaction.user;
  if (name === 'avatar') return sendAvatar(interaction, user);
  if (name === 'banner') return sendBanner(interaction, user);
  if (name === 'userinfo-lite') return sendUserInfoLite(interaction, user);
  if (name === 'avatar-link') return replyVisible(interaction, user.displayAvatarURL({ size: 4096 }));
  return sendProfileCard(interaction, user);
}

async function sendAvatar(interaction, user) {
  return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle(`${user.username}'s avatar`).setImage(user.displayAvatarURL({ size: 4096 }))], ephemeral: !isPublic(interaction) });
}

async function sendBanner(interaction, user) {
  const fullUser = await interaction.client.users.fetch(user.id, { force: true }).catch(() => user);
  const banner = fullUser.bannerURL?.({ size: 4096 });
  if (!banner) return replyPrivate(interaction, 'Banner unavailable for that user.');
  return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle(`${user.username}'s banner`).setImage(banner)], ephemeral: !isPublic(interaction) });
}

async function sendUserInfoLite(interaction, user) {
  return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle(user.username).setThumbnail(user.displayAvatarURL({ size: 256 })).addFields({ name: 'User ID', value: user.id }, { name: 'Created', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:F>` })], ephemeral: !isPublic(interaction) });
}

async function sendProfileCard(interaction, user) {
  const fullUser = await interaction.client.users.fetch(user.id, { force: true }).catch(() => user);
  return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x5865f2).setAuthor({ name: fullUser.globalName || fullUser.username, iconURL: fullUser.displayAvatarURL({ size: 256 }) }).setThumbnail(fullUser.displayAvatarURL({ size: 512 })).addFields({ name: 'Username', value: fullUser.tag }, { name: 'ID', value: fullUser.id })], ephemeral: !isPublic(interaction) });
}

async function runTimezone(interaction) {
  const timezone = interaction.options.getString('timezone', true);
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
  } catch {
    return replyPrivate(interaction, 'Invalid timezone. Use an IANA name like `Australia/Melbourne`.');
  }
  await updateUserData(interaction.user.id, (data) => {
    data.timezone = timezone;
  });
  return replyPrivate(interaction, `Timezone saved as \`${timezone}\`.`);
}

async function runTime(interaction) {
  const saved = await getUserData(interaction.user.id);
  const timezone = interaction.options.getString('timezone') || saved.timezone || 'UTC';
  try {
    return replyPrivate(interaction, new Intl.DateTimeFormat('en-AU', { timeZone: timezone, dateStyle: 'full', timeStyle: 'long' }).format(new Date()));
  } catch {
    return replyPrivate(interaction, 'Invalid timezone.');
  }
}

async function runMath(interaction) {
  try {
    return replyVisible(interaction, `\`${safeMath(interaction.options.getString('expression', true))}\``);
  } catch {
    return replyPrivate(interaction, 'Invalid expression. Allowed: numbers, +, -, *, /, %, ^, parentheses.');
  }
}

async function runColor(interaction) {
  const color = parseColor(interaction.options.getString('hex', true));
  if (color === null) return replyPrivate(interaction, 'Invalid hex color.');
  return interaction.reply({ embeds: [new EmbedBuilder().setColor(color).setTitle(`#${color.toString(16).padStart(6, '0').toUpperCase()}`)], ephemeral: !isPublic(interaction) });
}

async function runRandomNumber(interaction) {
  const min = interaction.options.getInteger('min', true);
  const max = interaction.options.getInteger('max', true);
  if (min > max) return replyPrivate(interaction, 'Minimum must be less than or equal to maximum.');
  return replyVisible(interaction, String(randomInt(min, max)));
}

async function runRps(interaction) {
  const user = interaction.options.getString('choice', true);
  const bot = pick(['rock', 'paper', 'scissors']);
  const result = user === bot ? 'Tie.' : (user === 'rock' && bot === 'scissors') || (user === 'paper' && bot === 'rock') || (user === 'scissors' && bot === 'paper') ? 'You win.' : 'You lose.';
  return replyPrivate(interaction, `You: ${user}\nS.A.I: ${bot}\n${result}`);
}

function slash(name, description, options = []) {
  return { type: ApplicationCommandType.ChatInput, name, description, options, ...installContexts };
}
function contextUser(name) { return { type: ApplicationCommandType.User, name, ...installContexts }; }
function contextMessage(name) { return { type: ApplicationCommandType.Message, name, ...installContexts }; }
function sub(name, description, options = []) { return { type: 1, name, description, options }; }
function stringOption(name, description, required, min_length, max_length) { return { type: STRING, name, description, required, min_length, max_length }; }
function intOption(name, description, required, min_value, max_value) { return { type: INTEGER, name, description, required, min_value, max_value }; }
function booleanOption(name, description, required) { return { type: BOOLEAN, name, description, required }; }
function publicOption() { return booleanOption('public', 'Post publicly instead of only showing you.', false); }
function userOption() { return { type: USER, name: 'user', description: 'User.', required: false }; }
function replyPrivate(interaction, content) { return interaction.reply({ content: limit(content), ephemeral: true, allowedMentions: { parse: [] } }); }
function replyVisible(interaction, content) { return interaction.reply({ content: limit(content), ephemeral: !isPublic(interaction), allowedMentions: { parse: [] } }); }
function isPublic(interaction) { return interaction.options.getBoolean('public') === true; }
function limit(text, max = 1900) { return String(text || '').slice(0, max); }
function splitOptions(text) { return text.split(/[|,]/).map((item) => item.trim()).filter(Boolean); }
function pick(items) { return items[Math.floor(Math.random() * items.length)]; }
function randomInt(min, max) { return crypto.randomInt(min, max + 1); }
function shortId() { return crypto.randomBytes(3).toString('hex'); }
function formatItems(items, label) { const rows = Object.values(items || {}).slice(0, 20).map((item) => `\`${item.id}\` ${item.done ? '[done] ' : ''}${item.text}`); return rows.length ? rows.join('\n') : `No ${label} saved.`; }
function parseColor(value) { if (!value) return null; const match = value.trim().match(/^#?([0-9a-f]{6})$/i); return match ? Number.parseInt(match[1], 16) : null; }
function makePassword(length) { const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*'; return Array.from({ length }, () => chars[randomInt(0, chars.length - 1)]).join(''); }

function safeMath(expression) {
  const tokens = expression.match(/\d+(?:\.\d+)?|[()+\-*/%^]/g);
  if (!tokens || tokens.join('').length !== expression.replace(/\s+/g, '').length) throw new Error('bad token');
  let i = 0;
  const parsePrimary = () => {
    const token = tokens[i++];
    if (token === '(') {
      const value = parseExpr();
      if (tokens[i++] !== ')') throw new Error('bad paren');
      return value;
    }
    if (token === '-') return -parsePrimary();
    const value = Number(token);
    if (!Number.isFinite(value)) throw new Error('bad number');
    return value;
  };
  const parsePow = () => { let value = parsePrimary(); while (tokens[i] === '^') { i++; value = value ** parsePrimary(); } return value; };
  const parseMul = () => { let value = parsePow(); while (['*', '/', '%'].includes(tokens[i])) { const op = tokens[i++]; const right = parsePow(); value = op === '*' ? value * right : op === '/' ? value / right : value % right; } return value; };
  const parseExpr = () => { let value = parseMul(); while (['+', '-'].includes(tokens[i])) { const op = tokens[i++]; const right = parseMul(); value = op === '+' ? value + right : value - right; } return value; };
  const result = parseExpr();
  if (i !== tokens.length || !Number.isFinite(result)) throw new Error('bad expression');
  return Number.isInteger(result) ? String(result) : String(Number(result.toFixed(8)));
}

const compliments = ['has elite energy.', 'looks like good vibes.', 'has a top-tier profile.', 'seems genuinely cool.'];
