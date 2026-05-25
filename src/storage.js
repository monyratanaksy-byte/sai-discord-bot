import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const dataDir = path.resolve(process.cwd(), 'data');
const dataFile = path.join(dataDir, 'sai-data.json');

const defaultData = {
  guilds: {},
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

export function createGuildData() {
  return {
    config: {
      welcomeChannelId: null,
      verifiedRoleId: null,
      rulesText: null,
      ticketCategoryId: null,
      supportRoleId: null,
      logChannelId: null,
      statsCategoryId: null,
      boosterRoleId: null,
      boosterChannelId: null,
      confessionChannelId: null,
      automodEnabled: false,
      levelingEnabled: true,
      economyEnabled: true,
      tempTextEnabled: false,
      voiceRewardsEnabled: true,
      raidMode: false,
    },
    roleMenus: {},
    voiceRooms: {},
    tickets: {},
    warnings: {},
    levels: {},
    economy: {},
    afk: {},
    invites: {},
    inviteUses: {},
    analytics: {
      joins: 0,
      leaves: 0,
      messages: 0,
      voiceSeconds: 0,
    },
    shops: {},
    backups: {},
  };
}

function mergeDefaults(data) {
  const merged = structuredClone(defaultData);
  merged.guilds = data.guilds || {};

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
    };
  }

  return merged;
}
