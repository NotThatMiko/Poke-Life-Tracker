import fs from "node:fs";
import path from "node:path";

let creatureIdsCache: string[] | null = null;
let creatureStageCountsCache: Record<string, number> | null = null;
let creatureDexStageIdsCache: Record<string, string[]> | null = null;
let availableDexStageIdsCache: string[] | null = null;

function getPokegameDir() {
  return path.resolve(process.cwd(), "attached_assets", "Pokegame");
}

function normalizeDexStageIdFromFileName(fileName: string) {
  const digits = fileName.replace(/\.[^.]+$/, "").match(/\d+/)?.[0];
  if (!digits) return null;
  const asInt = Number.parseInt(digits, 10);
  if (!Number.isFinite(asInt) || asInt <= 0) return null;
  return String(asInt).padStart(3, "0");
}

function loadCreatureDirCaches() {
  if (creatureIdsCache && creatureStageCountsCache && creatureDexStageIdsCache && availableDexStageIdsCache) {
    return {
      creatureIds: creatureIdsCache,
      stageCounts: creatureStageCountsCache,
      dexStageIdsByCreature: creatureDexStageIdsCache,
      allDexStageIds: availableDexStageIdsCache,
    };
  }

  try {
    const dir = getPokegameDir();
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const creatureIds = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b, "en"));

    const stageCounts: Record<string, number> = {};
    const dexStageIdsByCreature: Record<string, string[]> = {};
    const allDexStageIds = new Set<string>();

    for (const creatureId of creatureIds) {
      try {
        const files = fs.readdirSync(path.join(dir, creatureId), { withFileTypes: true });
        const gifFileNames = files
          .filter((file) => file.isFile() && file.name.toLowerCase().endsWith(".gif"))
          .map((file) => file.name)
          .sort((a, b) => {
            const aNum = Number.parseInt(a.replace(/\D+/g, "") || "0", 10);
            const bNum = Number.parseInt(b.replace(/\D+/g, "") || "0", 10);
            return aNum - bNum;
          });

        stageCounts[creatureId] = gifFileNames.length;
        dexStageIdsByCreature[creatureId] = gifFileNames
          .map((name) => normalizeDexStageIdFromFileName(name))
          .filter((id): id is string => Boolean(id));

        for (const dexStageId of dexStageIdsByCreature[creatureId]) {
          allDexStageIds.add(dexStageId);
        }
      } catch {
        stageCounts[creatureId] = 0;
        dexStageIdsByCreature[creatureId] = [];
      }
    }

    creatureIdsCache = creatureIds;
    creatureStageCountsCache = stageCounts;
    creatureDexStageIdsCache = dexStageIdsByCreature;
    availableDexStageIdsCache = Array.from(allDexStageIds).sort((a, b) => Number(a) - Number(b));

    return {
      creatureIds,
      stageCounts,
      dexStageIdsByCreature,
      allDexStageIds: availableDexStageIdsCache,
    };
  } catch {
    creatureIdsCache = [];
    creatureStageCountsCache = {};
    creatureDexStageIdsCache = {};
    availableDexStageIdsCache = [];

    return {
      creatureIds: creatureIdsCache,
      stageCounts: creatureStageCountsCache,
      dexStageIdsByCreature: creatureDexStageIdsCache,
      allDexStageIds: availableDexStageIdsCache,
    };
  }
}

export function getAvailableCreatureIds() {
  return loadCreatureDirCaches().creatureIds;
}

export function getCreatureStageCount(creatureId: string | null | undefined) {
  if (!creatureId) return 0;
  return loadCreatureDirCaches().stageCounts[creatureId] ?? 0;
}

export function getCreatureDexStageIds(creatureId: string | null | undefined) {
  if (!creatureId) return [] as string[];
  return loadCreatureDirCaches().dexStageIdsByCreature[creatureId] ?? [];
}

export function getAvailableDexStageIds() {
  return loadCreatureDirCaches().allDexStageIds;
}

export function getCurrentDexStageIdForCreature(creatureId: string | null | undefined, level: number) {
  if (!creatureId || level <= 0) return null;
  const dexIds = getCreatureDexStageIds(creatureId);
  if (dexIds.length === 0) return null;
  const stageIndex = level <= 33 ? 0 : level <= 66 ? 1 : 2;
  return dexIds[Math.min(stageIndex, dexIds.length - 1)] ?? null;
}

export function getCreatureLevelCap(creatureId: string | null | undefined, maxLevel = 100) {
  const stageCount = getCreatureStageCount(creatureId);
  if (stageCount <= 0) return maxLevel;
  if (stageCount <= 1) return 30;
  if (stageCount === 2) return 50;
  return maxLevel;
}

