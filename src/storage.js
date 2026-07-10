import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const dataDir = path.resolve(process.cwd(), 'data');
const dataFile = path.join(dataDir, 'sai-data.json');

const defaultData = {
  guilds: {},
  users: {},
};

let cachedData;
let writeQueue = Promise.resolve();

export async function loadData() {
  if (cachedData) return cachedData;

  await mkdir(dataDir, { recursive: true });

  try {
    const raw = await readFile(dataFile, 'utf8');
    cachedData = mergeDefaults(JSON.parse(raw));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('Could not load S.A.I data file, starting with empty data:', error);
    }
    cachedData = structuredClone(defaultData);
    await saveData();
  }

  return cachedData;
}

export async function saveData() {
  if (!cachedData) cachedData = structuredClone(defaultData);

  writeQueue = writeQueue.then(async () => {
    await mkdir(dataDir, { recursive: true });
    await writeFile(dataFile, `${JSON.stringify(cachedData, null, 2)}\n`);
  });

  return writeQueue;
}

export async function getGuildData(guildId) {
  const data = await loadData();
  data.guilds[guildId] ||= createGuildData();
  return data.guilds[guildId];
}

export async function updateGuildData(guildId, updater) {
  const guildData = await getGuildData(guildId);
  await updater(guildData);
  await saveData();
  return guildData;
}

export async function getUserData(userId) {
  const data = await loadData();
  data.users[userId] ||= createUserData();
  return data.users[userId];
}

export async function updateUserData(userId, updater) {
  const userData = await getUserData(userId);
  await updater(userData);
  await saveData();
  return userData;
}

export function createGuildData() {
  return {
    config: {
      welcomeChannelId: null,
      autoRoleId: null,
      verifiedRoleId: null,
      verifyChannelId: null,
      rulesText: null,
      normalVoiceCategoryId: null,
      boosterVoiceCategoryId: null,
      ticketCategoryId: null,
      supportRoleId: null,
      logChannelId: null,
      statsCategoryId: null,
      boosterRoleId: null,
      boosterChannelId: null,
      confessionChannelId: null,
      activityChannelId: null,
      shopChannelId: null,
      shopMessageId: null,
      casinoPoolChannelId: null,
      casinoPoolMessageId: null,
      canvasChannelId: null,
      canvasMessageId: null,
      automodEnabled: false,
      automodInviteLinks: true,
      automodMassMentions: true,
      automodSpam: true,
      automodMaxMentions: 5,
      automodBlockedWords: [],
      automodExemptRoleIds: [],
      automodExemptChannelIds: [],
      levelingEnabled: true,
      economyEnabled: true,
      tempTextEnabled: false,
      voiceRewardsEnabled: true,
      raidMode: false,
    },
    roleMenus: {},
    voiceRooms: {},
    roomAccess: {
      trusted: {},
      banned: {},
    },
    tickets: {},
    reminders: {},
    warnings: {},
    moderationCases: [],
    nextCaseNumber: 1,
    moderatorNotes: {},
    autoresponders: {},
    scheduledAnnouncements: {},
    webhookTemplates: {},
    levels: {},
    economy: {},
    gambling: {},
    afk: {},
    invites: {},
    inviteUses: {},
    analytics: {
      joins: 0,
      leaves: 0,
      messages: 0,
      voiceSeconds: 0,
    },
    activity: {
      voiceDaily: {},
      voiceWeekly: {},
      voiceMilestones: {},
      rankPassCooldowns: {},
      currentDay: null,
      currentWeek: null,
    },
    shops: {},
    shopPrivileges: {},
    canvas: {
      size: 30,
      cost: 50,
      pixels: {},
      placements: [],
    },
    backups: {},
  };
}

export function createUserData() {
  return {
    notes: {},
    todos: {},
    reminders: {},
    timezone: null,
  };
}

function mergeDefaults(data) {
  const merged = structuredClone(defaultData);
  merged.guilds = data.guilds || {};
  merged.users = data.users || {};

  for (const [guildId, guildData] of Object.entries(merged.guilds)) {
    merged.guilds[guildId] = {
      ...createGuildData(),
      ...guildData,
      config: {
        ...createGuildData().config,
        ...(guildData.config || {}),
      },
      analytics: {
        ...createGuildData().analytics,
        ...(guildData.analytics || {}),
      },
      activity: {
        ...createGuildData().activity,
        ...(guildData.activity || {}),
      },
      roomAccess: {
        ...createGuildData().roomAccess,
        ...(guildData.roomAccess || {}),
      },
      canvas: {
        ...createGuildData().canvas,
        ...(guildData.canvas || {}),
      },
    };
  }

  for (const [userId, userData] of Object.entries(merged.users)) {
    merged.users[userId] = {
      ...createUserData(),
      ...userData,
    };
  }

  return merged;
}
