import { asc, eq } from "drizzle-orm";
import { db } from "./db";
import {
  getAvailableCreatureIds,
  getAvailableDexStageIds,
  getCreatureDexStageIds,
  getCreatureLevelCap,
  getCreatureStageCount,
  getCurrentDexStageIdForCreature,
} from "./pokegame-assets";
import { habitLogs, habits, pokegameProfiles, type Habit, type HabitLog, type PokegameProfile } from "@shared/schema";
import { getHabitFrequencyCount, getHabitFrequencyPeriod } from "@shared/habit-config";
import { computeBestPeriodStreak, countCompletedPeriodsForDates } from "@shared/habit-periods";

const XP_PER_HABIT_CHECK = 5;
const PO_PER_HABIT_CHECK = 5;
const XP_PER_PERFECT_WEEK = 100;
const PO_CAP = 999_999;
const LEVEL_MAX = 100;
const LEVEL_XP_MIN = 100; // 0 -> 1
const LEVEL_XP_MAX = 1000; // 99 -> 100
const LEVEL_REWARD_PO = 20;
const RARE_CANDY_COST = 1000;
const RARE_CANDY_ITEM_ID = "rare_candy";
const SHINY_POTION_COST = 10000;
const SHINY_POTION_ITEM_ID = "shiny_potion";
const PURIFYING_RUNE_COST = 100;
const PURIFYING_RUNE_ITEM_ID = "purifying_rune";

const LEVEL_XP_RATIO = Math.pow(LEVEL_XP_MAX / LEVEL_XP_MIN, 1 / 99);

type PokegameAchievementId =
  | "create_first_habit"
  | "first_habit_check"
  | "streak_7"
  | "streak_30"
  | "streak_365"
  | "hatch_1"
  | "hatch_5"
  | "hatch_10"
  | "hatch_25"
  | "hatch_50"
  | "hatch_100"
  | "level_5"
  | "level_10"
  | "level_50"
  | "level_100"
  | "dex_5"
  | "dex_10"
  | "dex_50"
  | "dex_100"
  | "dex_150"
  | "dex_200"
  | "dex_250"
  | "dex_300"
  | "dex_400"
  | "dex_all";

type SyncNotice =
  | { type: "level_up"; fromLevel: number; toLevel: number; poReward: number }
  | { type: "achievement"; achievementId: PokegameAchievementId; title: string; xpReward: number; poReward: number }
  | { type: "shop_purchase"; itemId: string; label: string; costPo: number }
  | { type: "new_egg"; creatureId: string | null };

type DerivedHabitProgress = {
  cycleHabitCheckXp: number;
  cyclePerfectWeekXp: number;
  cycleStreakBonusXp: number;
  globalHabitCheckPo: number;
  bestStreakSinceActivation: number;
  bestStreakThisCycle: number;
  hasAnyCompletedSinceActivation: boolean;
  hasHabitCreatedSinceActivation: boolean;
};

type LevelInfo = {
  level: number;
  totalXp: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  levelStartXp: number;
  nextLevelXpTotal: number;
  progressRatio: number;
};

type PokegameStateResponse = {
  profile: {
    id: number;
    activatedAt: string;
    currentCycleStartedAt: string;
    moneyPo: number;
    cycleBonusXp: number;
    currentCreatureId: string | null;
    currentCreatureNickname: string | null;
    currentCreatureIsShiny: boolean;
    currentLevelCap: number;
    discoveredCreatureIds: string[];
    discoveredDexStageIds: string[];
    discoveredShinyDexStageIds: string[];
    dexStageNicknames: Record<string, string>;
    favoritePassiveDexStageIds: string[];
    completedCreatureIds: string[];
    completedShinyCreatureIds: string[];
    completedCreatureHatchDates: Record<string, string>;
    completedCreatureNicknames: Record<string, string>;
    unlockedAchievementIds: string[];
    eggHatchesCount: number;
    highestLevelEver: number;
    highestLevelRewardedThisCycle: number;
    canGetNewEgg: boolean;
  };
  level: LevelInfo;
  derived: DerivedHabitProgress & {
    cycleTotalDerivedXp: number;
    cycleTotalXp: number;
  };
  achievements: Array<{
    id: PokegameAchievementId;
    title: string;
    subtitle: string;
    conditionText: string;
    rewardXp: number;
    rewardPo: number;
    unlocked: boolean;
    claimed: boolean;
    claimable: boolean;
  }>;
  shop: {
    rareCandy: {
      itemId: typeof RARE_CANDY_ITEM_ID;
      costPo: number;
      canBuy: boolean;
    };
    shinyPotion: {
      itemId: typeof SHINY_POTION_ITEM_ID;
      costPo: number;
      canAfford: boolean;
      blockMessage: string | null;
    };
    purifyingRune: {
      itemId: typeof PURIFYING_RUNE_ITEM_ID;
      costPo: number;
      canAfford: boolean;
      blockMessage: string | null;
    };
  };
  creatures: {
    availableCreatureIds: string[];
    availableDexStageIds: string[];
  };
  notices: SyncNotice[];
};

type AchievementDefinition = {
  id: PokegameAchievementId;
  title: string;
  subtitle: string;
  conditionText: string;
  rewardXp: number;
  rewardPo: number;
  isUnlocked: (ctx: AchievementEvalContext) => boolean;
};

type AchievementEvalContext = {
  derived: DerivedHabitProgress;
  eggHatchesCount: number;
  highestLevelEver: number;
  dexDiscoveredCount: number;
  dexTotalCount: number;
};

const ACHIEVEMENTS: AchievementDefinition[] = [
  {
    id: "create_first_habit",
    title: "Je pars à l'aventure",
    subtitle: "Créer un nouvel Habit",
    conditionText: "Créer un nouvel Habit",
    rewardXp: 10,
    rewardPo: 10,
    isUnlocked: ({ derived }) => derived.hasHabitCreatedSinceActivation,
  },
  {
    id: "first_habit_check",
    title: "C'est de la que ça part !",
    subtitle: "Valider un Habit pour la première fois",
    conditionText: "Valider un habit pour la première fois",
    rewardXp: 10,
    rewardPo: 10,
    isUnlocked: ({ derived }) => derived.hasAnyCompletedSinceActivation,
  },
  {
    id: "streak_7",
    title: "Sur la bonne route !",
    subtitle: "Valider une streak de Habits de 7 jours",
    conditionText: "Valider une streak de Habits de 7 jours",
    rewardXp: 50,
    rewardPo: 100,
    isUnlocked: ({ derived }) => derived.bestStreakSinceActivation >= 7,
  },
  {
    id: "streak_30",
    title: "Surfer sur la vague",
    subtitle: "Valider une streak de Habits de 30 jours",
    conditionText: "Valider une streak de Habits de 30 jours",
    rewardXp: 500,
    rewardPo: 1000,
    isUnlocked: ({ derived }) => derived.bestStreakSinceActivation >= 30,
  },
  {
    id: "streak_365",
    title: "Golden Boy",
    subtitle: "Valider une streak de Habits de 365 jours",
    conditionText: "Valider une streak de Habits de 365 jours",
    rewardXp: 5000,
    rewardPo: 10000,
    isUnlocked: ({ derived }) => derived.bestStreakSinceActivation >= 365,
  },
  {
    id: "hatch_1",
    title: "Jeune Poussin",
    subtitle: "Faire éclore un Oeuf pour la première fois",
    conditionText: "Passer du niveau 0 à 1 une fois",
    rewardXp: 20,
    rewardPo: 20,
    isUnlocked: ({ eggHatchesCount }) => eggHatchesCount >= 1,
  },
  {
    id: "hatch_5",
    title: "Jeune poule",
    subtitle: "Faire éclore 5 Oeufs",
    conditionText: "Passer du niveau 0 à 1, 5 fois",
    rewardXp: 50,
    rewardPo: 50,
    isUnlocked: ({ eggHatchesCount }) => eggHatchesCount >= 5,
  },
  {
    id: "hatch_10",
    title: "Poule Pondeuse",
    subtitle: "Faire éclore 10 Oeufs",
    conditionText: "Passer du niveau 0 à 1, 10 fois",
    rewardXp: 100,
    rewardPo: 100,
    isUnlocked: ({ eggHatchesCount }) => eggHatchesCount >= 10,
  },
  {
    id: "hatch_25",
    title: "Poule aguerrie",
    subtitle: "Faire éclore 25 Oeufs",
    conditionText: "Passer du niveau 0 à 1, 25 fois",
    rewardXp: 150,
    rewardPo: 500,
    isUnlocked: ({ eggHatchesCount }) => eggHatchesCount >= 25,
  },
  {
    id: "hatch_50",
    title: "Poule aux oeufs d'or",
    subtitle: "Faire éclore 50 Oeufs",
    conditionText: "Passer du niveau 0 à 1, 50 fois",
    rewardXp: 500,
    rewardPo: 1000,
    isUnlocked: ({ eggHatchesCount }) => eggHatchesCount >= 50,
  },
  {
    id: "hatch_100",
    title: "Maitre des Oeufs",
    subtitle: "Faire éclore 100 Oeufs",
    conditionText: "Passer du niveau 0 à 1, 100 fois",
    rewardXp: 1000,
    rewardPo: 10000,
    isUnlocked: ({ eggHatchesCount }) => eggHatchesCount >= 100,
  },
  {
    id: "level_5",
    title: "Noob",
    subtitle: "Passer un Pokémon au niveau 5",
    conditionText: "Passer au niveau 5 pour la première fois",
    rewardXp: 10,
    rewardPo: 20,
    isUnlocked: ({ highestLevelEver }) => highestLevelEver >= 5,
  },
  {
    id: "level_10",
    title: "Dresseur débutant",
    subtitle: "Passer une Pokemon au niveau 10",
    conditionText: "Passer au niveau 10 pour la première fois",
    rewardXp: 50,
    rewardPo: 50,
    isUnlocked: ({ highestLevelEver }) => highestLevelEver >= 10,
  },
  {
    id: "level_50",
    title: "Dresseur aguérri",
    subtitle: "Passer une Pokemon au niveau 50",
    conditionText: "Passer au niveau 50 pour la première fois",
    rewardXp: 100,
    rewardPo: 100,
    isUnlocked: ({ highestLevelEver }) => highestLevelEver >= 50,
  },
  {
    id: "level_100",
    title: "Maître de la Ligue",
    subtitle: "Passer une Pokemon au niveau 100",
    conditionText: "Passer au niveau 100 pour la première fois",
    rewardXp: 1000,
    rewardPo: 1000,
    isUnlocked: ({ highestLevelEver }) => highestLevelEver >= 100,
  },
  {
    id: "dex_5",
    title: "Carnet ouvert",
    subtitle: "Découvrir 5 créatures du Dex",
    conditionText: "Découvrir 5 paliers de créatures",
    rewardXp: 500,
    rewardPo: 500,
    isUnlocked: ({ dexDiscoveredCount }) => dexDiscoveredCount >= 5,
  },
  {
    id: "dex_10",
    title: "Collection naissante",
    subtitle: "Découvrir 10 créatures du Dex",
    conditionText: "Découvrir 10 paliers de créatures",
    rewardXp: 700,
    rewardPo: 700,
    isUnlocked: ({ dexDiscoveredCount }) => dexDiscoveredCount >= 10,
  },
  {
    id: "dex_50",
    title: "Chercheur de traces",
    subtitle: "Découvrir 50 créatures du Dex",
    conditionText: "Découvrir 50 paliers de créatures",
    rewardXp: 1000,
    rewardPo: 1000,
    isUnlocked: ({ dexDiscoveredCount }) => dexDiscoveredCount >= 50,
  },
  {
    id: "dex_100",
    title: "Naturaliste junior",
    subtitle: "Découvrir 100 créatures du Dex",
    conditionText: "Découvrir 100 paliers de créatures",
    rewardXp: 1500,
    rewardPo: 1500,
    isUnlocked: ({ dexDiscoveredCount }) => dexDiscoveredCount >= 100,
  },
  {
    id: "dex_150",
    title: "Archiviste du terrain",
    subtitle: "Découvrir 150 créatures du Dex",
    conditionText: "Découvrir 150 paliers de créatures",
    rewardXp: 2000,
    rewardPo: 2000,
    isUnlocked: ({ dexDiscoveredCount }) => dexDiscoveredCount >= 150,
  },
  {
    id: "dex_200",
    title: "Chasseur de silhouettes",
    subtitle: "Découvrir 200 créatures du Dex",
    conditionText: "Découvrir 200 paliers de créatures",
    rewardXp: 2500,
    rewardPo: 3000,
    isUnlocked: ({ dexDiscoveredCount }) => dexDiscoveredCount >= 200,
  },
  {
    id: "dex_250",
    title: "Connaisseur du Pokédex",
    subtitle: "Découvrir 250 créatures du Dex",
    conditionText: "Découvrir 250 paliers de créatures",
    rewardXp: 3000,
    rewardPo: 4000,
    isUnlocked: ({ dexDiscoveredCount }) => dexDiscoveredCount >= 250,
  },
  {
    id: "dex_300",
    title: "Sage des habitats",
    subtitle: "Découvrir 300 créatures du Dex",
    conditionText: "Découvrir 300 paliers de créatures",
    rewardXp: 3500,
    rewardPo: 5000,
    isUnlocked: ({ dexDiscoveredCount }) => dexDiscoveredCount >= 300,
  },
  {
    id: "dex_400",
    title: "Légende du Dex",
    subtitle: "Découvrir 400 créatures du Dex",
    conditionText: "Découvrir 400 paliers de créatures",
    rewardXp: 4500,
    rewardPo: 8000,
    isUnlocked: ({ dexDiscoveredCount }) => dexDiscoveredCount >= 400,
  },
  {
    id: "dex_all",
    title: "Dex Complet",
    subtitle: "Découvrir toutes les créatures du Dex",
    conditionText: "Découvrir tous les paliers disponibles",
    rewardXp: 5000,
    rewardPo: 10000,
    isUnlocked: ({ dexDiscoveredCount, dexTotalCount }) => dexTotalCount > 0 && dexDiscoveredCount >= dexTotalCount,
  },
];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function toDate(value: Date | string | null | undefined, fallback = new Date()) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? fallback : value;
  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? fallback : d;
  }
  return fallback;
}

function dateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function xpRequiredForNextLevel(level: number, levelCap = LEVEL_MAX) {
  if (level >= levelCap) return 0;
  return Math.round(LEVEL_XP_MIN * Math.pow(LEVEL_XP_RATIO, level));
}

function totalXpRequiredForLevel(level: number, levelCap = LEVEL_MAX) {
  let total = 0;
  for (let l = 0; l < clamp(level, 0, levelCap); l++) {
    total += xpRequiredForNextLevel(l, levelCap);
  }
  return total;
}

function getLevelInfo(totalXpInput: number, levelCap = LEVEL_MAX): LevelInfo {
  const cappedXp = Math.max(0, totalXpInput);
  let level = 0;
  let remaining = cappedXp;

  while (level < levelCap) {
    const stepCost = xpRequiredForNextLevel(level, levelCap);
    if (stepCost <= 0 || remaining < stepCost) break;
    remaining -= stepCost;
    level += 1;
  }

  const levelStart = totalXpRequiredForLevel(level, levelCap);
  const nextCost = xpRequiredForNextLevel(level, levelCap);
  const nextTotal = level >= levelCap ? levelStart : levelStart + nextCost;
  const xpIntoLevel = level >= levelCap ? 0 : cappedXp - levelStart;
  const progressRatio = level >= levelCap || nextCost === 0 ? 1 : clamp(xpIntoLevel / nextCost, 0, 1);

  return {
    level,
    totalXp: cappedXp,
    xpIntoLevel,
    xpForNextLevel: nextCost,
    levelStartXp: levelStart,
    nextLevelXpTotal: nextTotal,
    progressRatio,
  };
}

function computeStreakMilestoneXp(bestStreak: number) {
  let xp = 0;
  for (let milestone = 10; milestone <= Math.min(bestStreak, 100); milestone += 10) {
    xp += milestone;
  }
  for (let milestone = 200; milestone <= bestStreak; milestone += 100) {
    xp += 100;
  }
  return xp;
}

function deriveHabitProgress(profile: PokegameProfile, allHabits: Habit[], allLogs: HabitLog[]): DerivedHabitProgress {
  const now = new Date();
  const activatedAt = toDate(profile.activatedAt, now);
  const cycleStartedAt = toDate(profile.currentCycleStartedAt, activatedAt);

  const createdAfterActivation = allHabits.some((habit) => toDate(habit.createdAt, now) >= activatedAt);

  const completedLogsSinceActivation = allLogs.filter(
    (log) => log.completed && toDate(log.updatedAt, now) >= activatedAt,
  );
  const completedLogsThisCycle = allLogs.filter(
    (log) => log.completed && toDate(log.updatedAt, now) >= cycleStartedAt,
  );

  const byHabitActivation = new Map<number, string[]>();
  for (const log of completedLogsSinceActivation) {
    const list = byHabitActivation.get(log.habitId) ?? [];
    list.push(log.date);
    byHabitActivation.set(log.habitId, list);
  }

  const byHabitCycle = new Map<number, string[]>();
  for (const log of completedLogsThisCycle) {
    const list = byHabitCycle.get(log.habitId) ?? [];
    list.push(log.date);
    byHabitCycle.set(log.habitId, list);
  }

  let bestStreakSinceActivation = 0;
  let bestStreakThisCycle = 0;
  let cyclePerfectWeeks = 0;
  let cycleStreakMilestoneXp = 0;

  for (const habit of allHabits) {
    const activationDates = Array.from(new Set(byHabitActivation.get(habit.id) ?? []));
    const cycleDates = Array.from(new Set(byHabitCycle.get(habit.id) ?? []));
    const frequencyPeriod = getHabitFrequencyPeriod(habit);
    const frequencyCount = getHabitFrequencyCount(habit);
    const bestActivationStreak = computeBestPeriodStreak(activationDates, frequencyPeriod, frequencyCount, now);
    const bestCycleStreak = computeBestPeriodStreak(cycleDates, frequencyPeriod, frequencyCount, now);

    bestStreakSinceActivation = Math.max(bestStreakSinceActivation, bestActivationStreak);
    bestStreakThisCycle = Math.max(bestStreakThisCycle, bestCycleStreak);
    const perfectWeekTarget =
      frequencyPeriod === "week"
        ? Math.min(7, frequencyCount)
        : frequencyPeriod === "day"
          ? Math.min(7, frequencyCount * 7)
          : null;

    if (perfectWeekTarget != null) {
      cyclePerfectWeeks += countCompletedPeriodsForDates(cycleDates, "week", perfectWeekTarget);
    }
    cycleStreakMilestoneXp += computeStreakMilestoneXp(bestCycleStreak);
  }

  return {
    cycleHabitCheckXp: completedLogsThisCycle.length * XP_PER_HABIT_CHECK,
    cyclePerfectWeekXp: cyclePerfectWeeks * XP_PER_PERFECT_WEEK,
    cycleStreakBonusXp: cycleStreakMilestoneXp,
    globalHabitCheckPo: completedLogsSinceActivation.length * PO_PER_HABIT_CHECK,
    bestStreakSinceActivation,
    bestStreakThisCycle,
    hasAnyCompletedSinceActivation: completedLogsSinceActivation.length > 0,
    hasHabitCreatedSinceActivation: createdAfterActivation,
  };
}

function pickNextCreatureId(discoveredCreatureIds: string[], seenShinyCreatureIds: string[]) {
  const all = getAvailableCreatureIds();
  if (all.length === 0) return null;
  if (discoveredCreatureIds.length === 0) {
    const starters = all.filter((id) => id === "001" || id === "004" || id === "007");
    if (starters.length > 0) {
      const starterIndex = Math.floor(Math.random() * starters.length);
      return starters[starterIndex] ?? null;
    }
  }
  const discovered = new Set(discoveredCreatureIds);
  const seenShiny = new Set(seenShinyCreatureIds);
  const pool = all.filter((id) => !discovered.has(id));

  let source = pool.length > 0 ? pool : all;
  if (pool.length === 0) {
    const neverSeenShinyPool = all.filter((id) => !seenShiny.has(id));
    if (neverSeenShinyPool.length > 0) {
      source = neverSeenShinyPool;
    }
  }

  const oneStage: string[] = [];
  const twoStages: string[] = [];
  const threeStagesOrMore: string[] = [];

  for (const creatureId of source) {
    const stageCount = getCreatureStageCount(creatureId);
    if (stageCount <= 1) {
      oneStage.push(creatureId);
    } else if (stageCount === 2) {
      twoStages.push(creatureId);
    } else {
      threeStagesOrMore.push(creatureId);
    }
  }

  const buckets = [
    { ids: threeStagesOrMore, weight: 80 },
    { ids: twoStages, weight: 15 },
    { ids: oneStage, weight: 5 },
  ].filter((bucket) => bucket.ids.length > 0);

  if (buckets.length === 0) {
    const index = Math.floor(Math.random() * source.length);
    return source[index] ?? null;
  }

  const totalWeight = buckets.reduce((sum, bucket) => sum + bucket.weight, 0);
  let roll = Math.random() * totalWeight;

  for (const bucket of buckets) {
    if (roll < bucket.weight) {
      const index = Math.floor(Math.random() * bucket.ids.length);
      return bucket.ids[index] ?? null;
    }
    roll -= bucket.weight;
  }

  const fallbackBucket = buckets[buckets.length - 1];
  const fallbackIndex = Math.floor(Math.random() * fallbackBucket.ids.length);
  return fallbackBucket.ids[fallbackIndex] ?? null;
}

function clampPo(value: number) {
  return clamp(Math.round(value), 0, PO_CAP);
}

function clampSignedInt(value: number, limit = 9_999_999) {
  return clamp(Math.round(value), -limit, limit);
}

function sanitizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value.filter((item): item is string => typeof item === "string");
}

function sanitizeStringRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {} as Record<string, string>;
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[0] === "string" && typeof entry[1] === "string"),
  );
}

function sanitizeNickname(value: string | null | undefined) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 32);
}

function sanitizeBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeLogs(logs: HabitLog[]) {
  const latestByHabitDate = new Map<string, HabitLog>();

  for (const log of logs) {
    const key = `${log.habitId}:${log.date}`;
    const existing = latestByHabitDate.get(key);
    if (!existing) {
      latestByHabitDate.set(key, log);
      continue;
    }

    const existingUpdatedAt = toDate(existing.updatedAt).getTime();
    const nextUpdatedAt = toDate(log.updatedAt).getTime();
    if (nextUpdatedAt > existingUpdatedAt || (nextUpdatedAt === existingUpdatedAt && log.id > existing.id)) {
      latestByHabitDate.set(key, log);
    }
  }

  return Array.from(latestByHabitDate.values());
}

async function getPokegameProfile(userId: number) {
  const [profile] = await db
    .select()
    .from(pokegameProfiles)
    .where(eq(pokegameProfiles.userId, userId))
    .orderBy(asc(pokegameProfiles.id))
    .limit(1);
  return profile;
}

async function ensurePokegameProfile(userId: number) {
  const existing = await getPokegameProfile(userId);
  if (existing) return existing;
  const now = new Date();
  const [inserted] = await db
    .insert(pokegameProfiles)
    .values({
      userId,
      activatedAt: now,
      currentCycleStartedAt: now,
      currentCreatureIsShiny: false,
      currentCreatureHatchedAt: null,
      discoveredCreatureIds: [],
      seenShinyCreatureIds: [],
      discoveredDexStageIds: [],
      discoveredShinyDexStageIds: [],
      dexStageNicknames: {},
      favoritePassiveDexStageIds: [],
      completedCreatureIds: [],
      completedShinyCreatureIds: [],
      completedCreatureHatchDates: {},
      completedCreatureNicknames: {},
      unlockedAchievementIds: [],
      currentCreatureId: null,
      currentCreatureNickname: null,
      updatedAt: now,
    })
    .returning();
  return inserted;
}

async function persistProfile(profile: PokegameProfile) {
  const [updated] = await db
    .update(pokegameProfiles)
    .set({
      activatedAt: toDate(profile.activatedAt),
      currentCycleStartedAt: toDate(profile.currentCycleStartedAt),
      currentCreatureId: profile.currentCreatureId,
      currentCreatureNickname: profile.currentCreatureNickname ?? null,
      currentCreatureIsShiny: sanitizeBoolean(profile.currentCreatureIsShiny, false),
      currentCreatureHatchedAt: profile.currentCreatureHatchedAt ? toDate(profile.currentCreatureHatchedAt) : null,
      discoveredCreatureIds: sanitizeStringArray(profile.discoveredCreatureIds),
      seenShinyCreatureIds: sanitizeStringArray(profile.seenShinyCreatureIds),
      discoveredDexStageIds: sanitizeStringArray(profile.discoveredDexStageIds),
      discoveredShinyDexStageIds: sanitizeStringArray(profile.discoveredShinyDexStageIds),
      dexStageNicknames: sanitizeStringRecord(profile.dexStageNicknames),
      favoritePassiveDexStageIds: sanitizeStringArray(profile.favoritePassiveDexStageIds),
      completedCreatureIds: sanitizeStringArray(profile.completedCreatureIds),
      completedShinyCreatureIds: sanitizeStringArray(profile.completedShinyCreatureIds),
      completedCreatureHatchDates: sanitizeStringRecord(profile.completedCreatureHatchDates),
      completedCreatureNicknames: sanitizeStringRecord(profile.completedCreatureNicknames),
      unlockedAchievementIds: sanitizeStringArray(profile.unlockedAchievementIds),
      cycleBonusXp: profile.cycleBonusXp,
      poAdjustment: profile.poAdjustment,
      eggHatchesCount: profile.eggHatchesCount,
      highestLevelRewardedThisCycle: profile.highestLevelRewardedThisCycle,
      highestLevelEver: profile.highestLevelEver,
      lastComputedLevel: profile.lastComputedLevel,
      lastComputedTotalXp: profile.lastComputedTotalXp,
      updatedAt: new Date(),
    })
    .where(eq(pokegameProfiles.id, profile.id))
    .returning();
  return updated;
}

function buildAchievementsResponse(unlockedIds: Set<string>, ctx: AchievementEvalContext) {
  return ACHIEVEMENTS.map((achievement) => {
    const conditionMet = achievement.isUnlocked(ctx);
    const claimed = unlockedIds.has(achievement.id);

    return {
      id: achievement.id,
      title: achievement.title,
      subtitle: achievement.subtitle,
      conditionText: achievement.conditionText,
      rewardXp: achievement.rewardXp,
      rewardPo: achievement.rewardPo,
      unlocked: conditionMet,
      claimed,
      claimable: conditionMet && !claimed,
    };
  });
}

async function getAllHabitData(userId: number) {
  const [allHabits, allLogs] = await Promise.all([
    db.select().from(habits).where(eq(habits.userId, userId)),
    db.select().from(habitLogs).where(eq(habitLogs.userId, userId)),
  ]);
  return { allHabits, allLogs: normalizeLogs(allLogs) };
}

function getCurrentCreatureStage(level: number) {
  if (level <= 0) return "egg";
  if (level <= 33) return 1;
  if (level <= 66) return 2;
  return 3;
}

function getAchievementDefinitionById(id: string) {
  return ACHIEVEMENTS.find((achievement) => achievement.id === id);
}

function syncProfileStateMutable(
  profile: PokegameProfile,
  allHabits: Habit[],
  allLogs: HabitLog[],
): { profile: PokegameProfile; derived: DerivedHabitProgress; level: LevelInfo; notices: SyncNotice[] } {
  const notices: SyncNotice[] = [];
  const mutable: PokegameProfile = {
    ...profile,
    currentCreatureNickname: sanitizeNickname(profile.currentCreatureNickname),
    currentCreatureIsShiny: sanitizeBoolean(profile.currentCreatureIsShiny, false),
      currentCreatureHatchedAt: profile.currentCreatureHatchedAt ? toDate(profile.currentCreatureHatchedAt) : null,
      discoveredCreatureIds: sanitizeStringArray(profile.discoveredCreatureIds),
      seenShinyCreatureIds: sanitizeStringArray(profile.seenShinyCreatureIds),
      discoveredDexStageIds: sanitizeStringArray(profile.discoveredDexStageIds),
      discoveredShinyDexStageIds: sanitizeStringArray(profile.discoveredShinyDexStageIds),
      dexStageNicknames: sanitizeStringRecord(profile.dexStageNicknames),
      favoritePassiveDexStageIds: sanitizeStringArray(profile.favoritePassiveDexStageIds),
      completedCreatureIds: sanitizeStringArray(profile.completedCreatureIds),
    completedShinyCreatureIds: sanitizeStringArray(profile.completedShinyCreatureIds),
    completedCreatureHatchDates: sanitizeStringRecord(profile.completedCreatureHatchDates),
    completedCreatureNicknames: sanitizeStringRecord(profile.completedCreatureNicknames),
    unlockedAchievementIds: sanitizeStringArray(profile.unlockedAchievementIds),
  };
  mutable.discoveredCreatureIds = Array.from(
    new Set([...mutable.discoveredCreatureIds, ...mutable.completedCreatureIds]),
  );
  mutable.seenShinyCreatureIds = Array.from(
    new Set([...mutable.seenShinyCreatureIds, ...mutable.completedShinyCreatureIds]),
  );
  const availableDexStageIdsForFavorites = new Set(getAvailableDexStageIds());
  mutable.favoritePassiveDexStageIds = Array.from(
    new Set(mutable.favoritePassiveDexStageIds.filter((id) => availableDexStageIdsForFavorites.has(id))),
  );
  const discoveredDexStageSet = new Set(mutable.discoveredDexStageIds);
  for (const completedCreatureId of mutable.completedCreatureIds) {
    for (const dexStageId of getCreatureDexStageIds(completedCreatureId)) {
      discoveredDexStageSet.add(dexStageId);
    }
  }
  mutable.discoveredDexStageIds = Array.from(discoveredDexStageSet);

  const discoveredShinyDexStageSet = new Set(mutable.discoveredShinyDexStageIds);
  for (const completedShinyCreatureId of mutable.completedShinyCreatureIds) {
    const dexStages = getCreatureDexStageIds(completedShinyCreatureId);
    const finalStageDexId = dexStages[dexStages.length - 1];
    if (finalStageDexId) discoveredShinyDexStageSet.add(finalStageDexId);
  }
  mutable.discoveredShinyDexStageIds = Array.from(discoveredShinyDexStageSet);
  const discoveredFavoriteEligibleDexIds = new Set([
    ...discoveredDexStageSet,
    ...discoveredShinyDexStageSet,
  ]);
  mutable.favoritePassiveDexStageIds = mutable.favoritePassiveDexStageIds.filter((id) =>
    discoveredFavoriteEligibleDexIds.has(id),
  );

  for (let iteration = 0; iteration < 8; iteration++) {
    const derived = deriveHabitProgress(mutable, allHabits, allLogs);
    const cycleTotalDerivedXp = derived.cycleHabitCheckXp + derived.cyclePerfectWeekXp + derived.cycleStreakBonusXp;
    const totalXp = Math.max(0, cycleTotalDerivedXp + mutable.cycleBonusXp);
    const level = getLevelInfo(totalXp, getCreatureLevelCap(mutable.currentCreatureId));

    let changed = false;

    const previousLevel = mutable.lastComputedLevel ?? 0;
    if (level.level > previousLevel) {
      const newlyReachedLevels = Math.max(0, level.level - Math.max(previousLevel, mutable.highestLevelRewardedThisCycle));
      if (newlyReachedLevels > 0) {
        mutable.poAdjustment += newlyReachedLevels * LEVEL_REWARD_PO;
        mutable.highestLevelRewardedThisCycle = Math.max(mutable.highestLevelRewardedThisCycle, level.level);
        notices.push({
          type: "level_up",
          fromLevel: previousLevel,
          toLevel: level.level,
          poReward: newlyReachedLevels * LEVEL_REWARD_PO,
        });
        changed = true;
      }

      if (previousLevel === 0 && level.level >= 1 && !mutable.currentCreatureId) {
        const nextCreatureId = pickNextCreatureId(mutable.discoveredCreatureIds, mutable.seenShinyCreatureIds);
        mutable.currentCreatureId = nextCreatureId;
        mutable.currentCreatureNickname = null;
        mutable.currentCreatureIsShiny = false;
        mutable.currentCreatureHatchedAt = new Date();
        if (nextCreatureId) {
          const discoveredSet = new Set(mutable.discoveredCreatureIds);
          discoveredSet.add(nextCreatureId);
          mutable.discoveredCreatureIds = Array.from(discoveredSet);
        }
        mutable.eggHatchesCount += 1;
        notices.push({ type: "new_egg", creatureId: nextCreatureId });
        changed = true;
      }

      if (level.level > mutable.highestLevelEver) {
        mutable.highestLevelEver = level.level;
        changed = true;
      }
    } else if (level.level > mutable.highestLevelEver) {
      mutable.highestLevelEver = level.level;
      changed = true;
    }

    const currentDexStageId = getCurrentDexStageIdForCreature(mutable.currentCreatureId, level.level);
    if (currentDexStageId) {
      const beforeDexSize = discoveredDexStageSet.size;
      discoveredDexStageSet.add(currentDexStageId);
      if (discoveredDexStageSet.size !== beforeDexSize) {
        mutable.discoveredDexStageIds = Array.from(discoveredDexStageSet);
        changed = true;
      }

      if (mutable.currentCreatureIsShiny) {
        const beforeShinyDexSize = discoveredShinyDexStageSet.size;
        discoveredShinyDexStageSet.add(currentDexStageId);
        if (discoveredShinyDexStageSet.size !== beforeShinyDexSize) {
          mutable.discoveredShinyDexStageIds = Array.from(discoveredShinyDexStageSet);
          changed = true;
        }
      }

      const nickname = sanitizeNickname(mutable.currentCreatureNickname);
      if (nickname && mutable.dexStageNicknames[currentDexStageId] !== nickname) {
        mutable.dexStageNicknames = {
          ...mutable.dexStageNicknames,
          [currentDexStageId]: nickname,
        };
        changed = true;
      }
    }

    mutable.poAdjustment = clampSignedInt(mutable.poAdjustment);
    mutable.lastComputedLevel = level.level;
    mutable.lastComputedTotalXp = level.totalXp;

    if (!changed) {
      return { profile: mutable, derived, level, notices };
    }
  }

  const derived = deriveHabitProgress(mutable, allHabits, allLogs);
  const cycleTotalDerivedXp = derived.cycleHabitCheckXp + derived.cyclePerfectWeekXp + derived.cycleStreakBonusXp;
  const level = getLevelInfo(
    Math.max(0, cycleTotalDerivedXp + mutable.cycleBonusXp),
    getCreatureLevelCap(mutable.currentCreatureId),
  );
  mutable.lastComputedLevel = level.level;
  mutable.lastComputedTotalXp = level.totalXp;
  return { profile: mutable, derived, level, notices };
}

async function buildPokegameState(
  userId: number,
  profile: PokegameProfile,
  notices: SyncNotice[] = [],
): Promise<PokegameStateResponse> {
  const { allHabits, allLogs } = await getAllHabitData(userId);
  const derived = deriveHabitProgress(profile, allHabits, allLogs);
  const cycleTotalDerivedXp = derived.cycleHabitCheckXp + derived.cyclePerfectWeekXp + derived.cycleStreakBonusXp;
  const cycleTotalXp = Math.max(0, cycleTotalDerivedXp + profile.cycleBonusXp);
  const currentLevelCap = getCreatureLevelCap(profile.currentCreatureId);
  const level = getLevelInfo(cycleTotalXp, currentLevelCap);
  const moneyPo = clampPo(derived.globalHabitCheckPo + profile.poAdjustment);
  const unlockedSet = new Set(sanitizeStringArray(profile.unlockedAchievementIds));
  const currentCreatureIsShiny = sanitizeBoolean(profile.currentCreatureIsShiny, false);
  const discoveredCreatureIds = sanitizeStringArray(profile.discoveredCreatureIds);
  const discoveredDexStageIds = Array.from(new Set(sanitizeStringArray(profile.discoveredDexStageIds)));
  const discoveredShinyDexStageIds = Array.from(new Set(sanitizeStringArray(profile.discoveredShinyDexStageIds)));
  const dexStageNicknames = sanitizeStringRecord(profile.dexStageNicknames);
  const availableDexStageIds = getAvailableDexStageIds();
  const availableDexStageIdSet = new Set(availableDexStageIds);
  const favoritePassiveDexStageIds = Array.from(
    new Set(sanitizeStringArray(profile.favoritePassiveDexStageIds)),
  ).filter((id) => availableDexStageIdSet.has(id));
  const dexDiscoveredCount = discoveredDexStageIds.filter((id) => availableDexStageIdSet.has(id)).length;
  const dexTotalCount = availableDexStageIds.length;
  const completedShinyCreatureIds = sanitizeStringArray(profile.completedShinyCreatureIds);
  const completedCreatureHatchDates = sanitizeStringRecord(profile.completedCreatureHatchDates);
  const completedCreatureNicknames = sanitizeStringRecord(profile.completedCreatureNicknames);
  const achievements = buildAchievementsResponse(unlockedSet, {
    derived,
    eggHatchesCount: profile.eggHatchesCount,
    highestLevelEver: profile.highestLevelEver,
    dexDiscoveredCount,
    dexTotalCount,
  });
  const shinyPotionBlockMessage =
    level.level <= 0 || !profile.currentCreatureId
      ? "Giving a potion to an egg would be silly, wouldn't it?"
      : currentCreatureIsShiny
        ? "Can't you see it's shiny?"
        : null;
  const purifyingRuneBlockMessage =
    level.level <= 0 || !profile.currentCreatureId
      ? "Giving a rune to an egg would be silly, wouldn't it?"
      : level.level >= currentLevelCap
        ? "This creature is already ready to fly on its own."
        : null;

  return {
    profile: {
      id: profile.id,
      activatedAt: toDate(profile.activatedAt).toISOString(),
      currentCycleStartedAt: toDate(profile.currentCycleStartedAt).toISOString(),
      moneyPo,
      cycleBonusXp: profile.cycleBonusXp,
      currentCreatureId: profile.currentCreatureId,
      currentCreatureNickname: sanitizeNickname(profile.currentCreatureNickname),
      currentCreatureIsShiny,
      currentLevelCap,
      discoveredCreatureIds,
      discoveredDexStageIds,
      discoveredShinyDexStageIds,
      dexStageNicknames,
      favoritePassiveDexStageIds,
      completedCreatureIds: sanitizeStringArray(profile.completedCreatureIds),
      completedShinyCreatureIds,
      completedCreatureHatchDates,
      completedCreatureNicknames,
      unlockedAchievementIds: sanitizeStringArray(profile.unlockedAchievementIds),
      eggHatchesCount: profile.eggHatchesCount,
      highestLevelEver: profile.highestLevelEver,
      highestLevelRewardedThisCycle: profile.highestLevelRewardedThisCycle,
      canGetNewEgg: level.level >= currentLevelCap,
    },
    level,
    derived: {
      ...derived,
      cycleTotalDerivedXp,
      cycleTotalXp,
    },
    achievements,
    shop: {
      rareCandy: {
        itemId: RARE_CANDY_ITEM_ID,
        costPo: RARE_CANDY_COST,
        canBuy: moneyPo >= RARE_CANDY_COST && level.level < currentLevelCap,
      },
      shinyPotion: {
        itemId: SHINY_POTION_ITEM_ID,
        costPo: SHINY_POTION_COST,
        canAfford: moneyPo >= SHINY_POTION_COST,
        blockMessage: shinyPotionBlockMessage,
      },
      purifyingRune: {
        itemId: PURIFYING_RUNE_ITEM_ID,
        costPo: PURIFYING_RUNE_COST,
        canAfford: moneyPo >= PURIFYING_RUNE_COST,
        blockMessage: purifyingRuneBlockMessage,
      },
    },
    creatures: {
      availableCreatureIds: getAvailableCreatureIds(),
      availableDexStageIds,
    },
    notices,
  };
}

export async function getPokegameState(userId: number) {
  const existing = await ensurePokegameProfile(userId);
  const { allHabits, allLogs } = await getAllHabitData(userId);
  const sync = syncProfileStateMutable(existing, allHabits, allLogs);
  const saved = await persistProfile(sync.profile);
  return buildPokegameState(userId, saved, sync.notices);
}

export async function syncPokegameIfInitialized(userId: number) {
  const existing = await getPokegameProfile(userId);
  if (!existing) return null;
  const { allHabits, allLogs } = await getAllHabitData(userId);
  const sync = syncProfileStateMutable(existing, allHabits, allLogs);
  await persistProfile(sync.profile);
  return sync;
}

async function mutateProfile(
  userId: number,
  mutator: (profile: PokegameProfile, currentState: PokegameStateResponse) => Promise<PokegameProfile> | PokegameProfile,
) {
  await ensurePokegameProfile(userId);
  const syncedState = await getPokegameState(userId);
  const freshProfile = await getPokegameProfile(userId);
  if (!freshProfile) throw new Error("Pokegame profile not found after sync");
  const mutated = await mutator(freshProfile, syncedState);
  const saved = await persistProfile(mutated);
  return getPokegameStateFromSaved(userId, saved);
}

async function getPokegameStateFromSaved(userId: number, profile: PokegameProfile, notices: SyncNotice[] = []) {
  const { allHabits, allLogs } = await getAllHabitData(userId);
  const sync = syncProfileStateMutable(profile, allHabits, allLogs);
  const saved = await persistProfile(sync.profile);
  return buildPokegameState(userId, saved, [...notices, ...sync.notices]);
}

export async function claimPokegameAchievement(userId: number, achievementId: string) {
  const definition = getAchievementDefinitionById(achievementId);
  if (!definition) {
    throw new Error("Unknown achievement");
  }

  return mutateProfile(userId, async (profile) => {
    const { allHabits, allLogs } = await getAllHabitData(userId);
    const derived = deriveHabitProgress(profile, allHabits, allLogs);
    const availableDexStageIds = getAvailableDexStageIds();
    const availableDexStageSet = new Set(availableDexStageIds);
    const dexDiscoveredCount = Array.from(new Set(sanitizeStringArray(profile.discoveredDexStageIds))).filter((id) =>
      availableDexStageSet.has(id),
    ).length;
    const ctx: AchievementEvalContext = {
      derived,
      eggHatchesCount: profile.eggHatchesCount,
      highestLevelEver: profile.highestLevelEver,
      dexDiscoveredCount,
      dexTotalCount: availableDexStageIds.length,
    };

    const claimedSet = new Set(sanitizeStringArray(profile.unlockedAchievementIds));
    if (claimedSet.has(definition.id)) {
      throw new Error("Achievement already claimed");
    }
    if (!definition.isUnlocked(ctx)) {
      throw new Error("Achievement is not unlocked yet");
    }

    claimedSet.add(definition.id);
    return {
      ...profile,
      unlockedAchievementIds: Array.from(claimedSet),
      cycleBonusXp: Math.max(0, profile.cycleBonusXp + definition.rewardXp),
      poAdjustment: clampSignedInt(profile.poAdjustment + definition.rewardPo),
    };
  }).then((state) => ({
    ...state,
    notices: [
      {
        type: "achievement",
        achievementId: definition.id,
        title: definition.title,
        xpReward: definition.rewardXp,
        poReward: definition.rewardPo,
      } satisfies SyncNotice,
      ...state.notices,
    ],
  }));
}

export async function renameCurrentCreature(userId: number, nickname: string | null) {
  return mutateProfile(userId, (profile, state) => {
    if (!state.profile.currentCreatureId || state.level.level <= 0) {
      throw new Error("No hatched creature to rename yet");
    }
    return {
      ...profile,
      currentCreatureNickname: sanitizeNickname(nickname),
    };
  });
}

export async function toggleDexFavorite(userId: number, dexStageId: string, favorite?: boolean) {
  const normalizedDexStageId = dexStageId.trim();
  if (!normalizedDexStageId) {
    throw new Error("Dex stage id is required");
  }

  return mutateProfile(userId, (profile, state) => {
    const availableDexStageIds = new Set(state.creatures.availableDexStageIds ?? []);
    if (!availableDexStageIds.has(normalizedDexStageId)) {
      throw new Error("Unknown Dex stage");
    }

    const discoveredDexStageIds = new Set([
      ...(state.profile.discoveredDexStageIds ?? []),
      ...(state.profile.discoveredShinyDexStageIds ?? []),
    ]);
    if (!discoveredDexStageIds.has(normalizedDexStageId)) {
      throw new Error("Dex stage not discovered yet");
    }

    const favorites = new Set(sanitizeStringArray(profile.favoritePassiveDexStageIds));
    const nextFavorite = favorite ?? !favorites.has(normalizedDexStageId);
    if (nextFavorite) {
      favorites.add(normalizedDexStageId);
    } else {
      favorites.delete(normalizedDexStageId);
    }

    return {
      ...profile,
      favoritePassiveDexStageIds: Array.from(favorites),
    };
  });
}

export async function buyRareCandy(userId: number) {
  return mutateProfile(userId, (profile, state) => {
    if (!state.shop.rareCandy.canBuy) {
      throw new Error("Cannot buy rare candy right now");
    }

    const currentLevel = state.level.level;
    if (currentLevel >= state.profile.currentLevelCap) {
      throw new Error("Creature is already max level");
    }

    const xpNeeded = Math.max(1, state.level.nextLevelXpTotal - state.level.totalXp);
    const nextPoAdjustment = profile.poAdjustment - RARE_CANDY_COST;

    return {
      ...profile,
      cycleBonusXp: Math.max(0, profile.cycleBonusXp + xpNeeded),
      poAdjustment: clampSignedInt(nextPoAdjustment),
    };
  });
}

export async function buyShinyPotion(userId: number) {
  return mutateProfile(userId, (profile, state) => {
    if (!state.shop.shinyPotion.canAfford) {
      throw new Error("Not enough Po");
    }
    if (state.shop.shinyPotion.blockMessage) {
      throw new Error(state.shop.shinyPotion.blockMessage);
    }
    if (!state.profile.currentCreatureId || state.level.level <= 0) {
      throw new Error("Giving a potion to an egg would be silly, wouldn't it?");
    }
    if (state.profile.currentCreatureIsShiny) {
      throw new Error("Can't you see it's shiny?");
    }

    const seenShinySet = new Set(sanitizeStringArray(profile.seenShinyCreatureIds));
    if (state.profile.currentCreatureId) {
      seenShinySet.add(state.profile.currentCreatureId);
    }

    return {
      ...profile,
      currentCreatureIsShiny: true,
      seenShinyCreatureIds: Array.from(seenShinySet),
      poAdjustment: clampSignedInt(profile.poAdjustment - SHINY_POTION_COST),
    };
  });
}

export async function buyPurifyingRune(userId: number) {
  return mutateProfile(userId, (profile, state) => {
    const rune = state.shop.purifyingRune;
    if (!rune.canAfford) {
      throw new Error("Not enough Po");
    }
    if (rune.blockMessage) {
      throw new Error(rune.blockMessage);
    }

    if (!state.profile.currentCreatureId || state.level.level <= 0) {
      throw new Error("Giving a rune to an egg would be silly, wouldn't it?");
    }
    if (state.profile.canGetNewEgg) {
      throw new Error("This creature is already ready to fly on its own.");
    }

    const discoveredSet = new Set(sanitizeStringArray(profile.discoveredCreatureIds));
    discoveredSet.add(state.profile.currentCreatureId);

    const now = new Date();
    return {
      ...profile,
      currentCycleStartedAt: now,
      currentCreatureId: null,
      currentCreatureNickname: null,
      currentCreatureIsShiny: false,
      currentCreatureHatchedAt: null,
      discoveredCreatureIds: Array.from(discoveredSet),
      cycleBonusXp: 0,
      highestLevelRewardedThisCycle: 0,
      lastComputedLevel: 0,
      lastComputedTotalXp: 0,
      poAdjustment: clampSignedInt(profile.poAdjustment - PURIFYING_RUNE_COST),
      updatedAt: now,
    };
  });
}

export async function getNewEgg(userId: number) {
  return mutateProfile(userId, (profile, state) => {
    if (!state.profile.canGetNewEgg) {
      throw new Error("Current creature is not level 100 yet");
    }

    const discoveredSet = new Set(sanitizeStringArray(profile.discoveredCreatureIds));
    const completedSet = new Set(sanitizeStringArray(profile.completedCreatureIds));
    const completedShinySet = new Set(sanitizeStringArray(profile.completedShinyCreatureIds));
    const completedHatchDates = {
      ...sanitizeStringRecord(profile.completedCreatureHatchDates),
    };
    const completedNicknames = {
      ...sanitizeStringRecord(profile.completedCreatureNicknames),
    };
    if (profile.currentCreatureId) {
      discoveredSet.add(profile.currentCreatureId);
      completedSet.add(profile.currentCreatureId);
      if (sanitizeBoolean(profile.currentCreatureIsShiny, false)) {
        completedShinySet.add(profile.currentCreatureId);
      }
      completedHatchDates[profile.currentCreatureId] = toDate(
        profile.currentCreatureHatchedAt ?? profile.currentCycleStartedAt,
      ).toISOString();
      const nickname = sanitizeNickname(profile.currentCreatureNickname);
      if (nickname) {
        completedNicknames[profile.currentCreatureId] = nickname;
      }
    }

    const now = new Date();
    return {
      ...profile,
      currentCycleStartedAt: now,
      currentCreatureId: null,
      currentCreatureNickname: null,
      currentCreatureIsShiny: false,
      currentCreatureHatchedAt: null,
      discoveredCreatureIds: Array.from(discoveredSet),
      completedCreatureIds: Array.from(completedSet),
      completedShinyCreatureIds: Array.from(completedShinySet),
      completedCreatureHatchDates: completedHatchDates,
      completedCreatureNicknames: completedNicknames,
      cycleBonusXp: 0,
      highestLevelRewardedThisCycle: 0,
      lastComputedLevel: 0,
      lastComputedTotalXp: 0,
      updatedAt: now,
    };
  });
}

export async function pokegameDevAddPo(userId: number, amount: number) {
  return mutateProfile(userId, (profile) => ({
    ...profile,
    poAdjustment: clampSignedInt(profile.poAdjustment + amount),
  }));
}

export async function pokegameDevAddLevels(userId: number, levels: number) {
  return mutateProfile(userId, (profile, state) => {
    if (levels <= 0) return profile;
    const currentLevel = state.level.level;
    const targetLevel = clamp(currentLevel + levels, 0, state.profile.currentLevelCap);
    if (targetLevel <= currentLevel) return profile;
    const targetXpTotal = totalXpRequiredForLevel(targetLevel, state.profile.currentLevelCap);
    const xpDelta = Math.max(0, targetXpTotal - state.level.totalXp);
    return {
      ...profile,
      cycleBonusXp: profile.cycleBonusXp + xpDelta,
    };
  });
}

export async function pokegameDevFillDex(userId: number) {
  return mutateProfile(userId, (profile) => {
    const allDexStageIds = getAvailableDexStageIds();
    const discoveredDex = new Set(sanitizeStringArray(profile.discoveredDexStageIds));
    for (const dexStageId of allDexStageIds) {
      discoveredDex.add(dexStageId);
    }
    return {
      ...profile,
      discoveredDexStageIds: Array.from(discoveredDex),
    };
  });
}

export async function pokegameDevFillShinyDex(userId: number) {
  return mutateProfile(userId, (profile) => {
    const allDexStageIds = getAvailableDexStageIds();
    const discoveredShinyDex = new Set(sanitizeStringArray(profile.discoveredShinyDexStageIds));
    for (const dexStageId of allDexStageIds) {
      discoveredShinyDex.add(dexStageId);
    }
    return {
      ...profile,
      discoveredShinyDexStageIds: Array.from(discoveredShinyDex),
    };
  });
}

export async function pokegameDevEmptyDex(userId: number) {
  return mutateProfile(userId, (profile) => ({
    ...profile,
    discoveredDexStageIds: [],
    discoveredShinyDexStageIds: [],
    dexStageNicknames: {},
    favoritePassiveDexStageIds: [],
    discoveredCreatureIds: [],
    seenShinyCreatureIds: [],
    completedCreatureIds: [],
    completedShinyCreatureIds: [],
    completedCreatureHatchDates: {},
    completedCreatureNicknames: {},
  }));
}

export async function pokegameDevClearMoney(userId: number) {
  return mutateProfile(userId, (profile, state) => {
    const rawMoney = state.derived.globalHabitCheckPo + profile.poAdjustment;
    return {
      ...profile,
      poAdjustment: clampSignedInt(profile.poAdjustment - rawMoney),
    };
  });
}

export async function pokegameDevClearLevels(userId: number) {
  return mutateProfile(userId, (profile) => {
    const now = new Date();
    return {
      ...profile,
      currentCycleStartedAt: now,
      currentCreatureId: null,
      currentCreatureNickname: null,
      currentCreatureIsShiny: false,
      currentCreatureHatchedAt: null,
      cycleBonusXp: 0,
      highestLevelRewardedThisCycle: 0,
      lastComputedLevel: 0,
      lastComputedTotalXp: 0,
    };
  });
}

export async function pokegameDevResetAchievements(userId: number) {
  return mutateProfile(userId, (profile) => ({
    ...profile,
    unlockedAchievementIds: [],
  }));
}

export async function pokegameDevResetOnly(userId: number) {
  await db.delete(pokegameProfiles).where(eq(pokegameProfiles.userId, userId));
  return getPokegameState(userId);
}

export async function pokegameDevResetAll(userId: number) {
  await db.delete(habitLogs).where(eq(habitLogs.userId, userId));
  await db.delete(habits).where(eq(habits.userId, userId));
  await db.delete(pokegameProfiles).where(eq(pokegameProfiles.userId, userId));
  return getPokegameState(userId);
}

export function getPokegameStaticConfig() {
  return {
    levelMax: LEVEL_MAX,
    xpPerHabitCheck: XP_PER_HABIT_CHECK,
    poPerHabitCheck: PO_PER_HABIT_CHECK,
    xpPerPerfectWeek: XP_PER_PERFECT_WEEK,
    poCap: PO_CAP,
    levelRewardPo: LEVEL_REWARD_PO,
    rareCandyCostPo: RARE_CANDY_COST,
    stageFromLevel: getCurrentCreatureStage,
  };
}
