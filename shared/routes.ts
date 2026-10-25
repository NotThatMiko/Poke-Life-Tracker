import { z } from 'zod';
import { habitInputSchema, habits, habitLogs, setHabitLogSchema } from './schema';
import {
  habitFrequencyPeriodSchema,
  habitGoalTypeSchema,
  habitLogStatusSchema,
  habitQuantUnitPresetSchema,
  habitTrackingTypeSchema,
} from './habit-config';

// Shared Error Schemas
export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

const pokegameNoticeSchema = z
  .object({
    type: z.string(),
  })
  .passthrough();

const pokegameAchievementSchema = z.object({
  id: z.string(),
  title: z.string(),
  subtitle: z.string(),
  conditionText: z.string(),
  rewardXp: z.number(),
  rewardPo: z.number(),
  unlocked: z.boolean(),
  claimed: z.boolean(),
  claimable: z.boolean(),
});

const pokegameLevelSchema = z.object({
  level: z.number(),
  totalXp: z.number(),
  xpIntoLevel: z.number(),
  xpForNextLevel: z.number(),
  levelStartXp: z.number(),
  nextLevelXpTotal: z.number(),
  progressRatio: z.number(),
});

const pokegameStateSchema = z.object({
  profile: z.object({
    id: z.number(),
    activatedAt: z.string(),
    currentCycleStartedAt: z.string(),
    moneyPo: z.number(),
    cycleBonusXp: z.number(),
    currentCreatureId: z.string().nullable(),
    currentCreatureNickname: z.string().nullable(),
    currentCreatureIsShiny: z.boolean(),
    currentLevelCap: z.number(),
    discoveredCreatureIds: z.array(z.string()),
    completedCreatureIds: z.array(z.string()),
    discoveredDexStageIds: z.array(z.string()),
    discoveredShinyDexStageIds: z.array(z.string()),
    dexStageNicknames: z.record(z.string()),
    favoritePassiveDexStageIds: z.array(z.string()),
    completedShinyCreatureIds: z.array(z.string()),
    completedCreatureHatchDates: z.record(z.string()),
    completedCreatureNicknames: z.record(z.string()),
    unlockedAchievementIds: z.array(z.string()),
    eggHatchesCount: z.number(),
    highestLevelEver: z.number(),
    highestLevelRewardedThisCycle: z.number(),
    canGetNewEgg: z.boolean(),
  }),
  level: pokegameLevelSchema,
  derived: z.object({
    cycleHabitCheckXp: z.number(),
    cyclePerfectWeekXp: z.number(),
    cycleStreakBonusXp: z.number(),
    globalHabitCheckPo: z.number(),
    bestStreakSinceActivation: z.number(),
    bestStreakThisCycle: z.number(),
    hasAnyCompletedSinceActivation: z.boolean(),
    hasHabitCreatedSinceActivation: z.boolean(),
    cycleTotalDerivedXp: z.number(),
    cycleTotalXp: z.number(),
  }),
  achievements: z.array(pokegameAchievementSchema),
  shop: z.object({
    rareCandy: z.object({
      itemId: z.literal('rare_candy'),
      costPo: z.number(),
      canBuy: z.boolean(),
    }),
    shinyPotion: z.object({
      itemId: z.literal('shiny_potion'),
      costPo: z.number(),
      canAfford: z.boolean(),
      blockMessage: z.string().nullable(),
    }),
    purifyingRune: z.object({
      itemId: z.literal('purifying_rune'),
      costPo: z.number(),
      canAfford: z.boolean(),
      blockMessage: z.string().nullable(),
    }),
  }),
  creatures: z.object({
    availableCreatureIds: z.array(z.string()),
    availableDexStageIds: z.array(z.string()),
  }),
  notices: z.array(pokegameNoticeSchema),
});

const pokegameDevActionSchema = z.object({
  action: z.enum([
    'add_po_99999',
    'add_level_1',
    'add_level_10',
    'fill_dex',
    'fill_shiny_dex',
    'empty_dex',
    'clear_money',
    'clear_levels',
    'reset_achievements',
    'reset_pokegame',
    'reset_all',
  ]),
});

const pokegameClaimAchievementSchema = z.object({
  achievementId: z.string(),
});

const pokegameCreatureNicknameSchema = z.object({
  nickname: z.string().max(32).nullable(),
});

const pokegameDexFavoriteSchema = z.object({
  dexStageId: z.string(),
  favorite: z.boolean().optional(),
});

const authUserSchema = z.object({
  id: z.number(),
  username: z.string(),
  isAdmin: z.boolean(),
});

const authSessionSchema = z.object({
  authenticated: z.boolean(),
  user: authUserSchema.nullable(),
});

const authLoginSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(256),
  rememberMe: z.boolean().optional(),
});

const authCreateUserSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(8).max(256),
  isAdmin: z.boolean().optional(),
});

const authSignupSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(8).max(256),
});

const authChangePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: z.string().min(8).max(256),
});

const authChangeUsernameSchema = z.object({
  username: z.string().min(1).max(64),
});

const authSessionItemSchema = z.object({
  sid: z.string(),
  isCurrent: z.boolean(),
  expiresAt: z.string().nullable(),
  createdAt: z.string().nullable(),
  lastSeenAt: z.string().nullable(),
  ip: z.string().nullable(),
  browser: z.string().nullable(),
  os: z.string().nullable(),
  userAgent: z.string().nullable(),
});

const authSessionsListSchema = z.object({
  sessions: z.array(authSessionItemSchema),
});

const authLogoutOtherSessionsResultSchema = z.object({
  removedSessions: z.number().int().nonnegative(),
});

const authDeleteAccountSchema = z.object({
  password: z.string().min(1).max(256),
  confirmPhrase: z.string().min(1).max(64),
});

const dataImportSchema = z.object({
  fileName: z.string().min(1).max(255),
  fileBase64: z.string().min(1),
  replaceExisting: z.boolean().optional(),
});

const dataImportReviewFrequencyConfidenceSchema = z.enum(["high", "medium", "low"]);

const dataImportReviewItemSchema = z.object({
  sourceKey: z.string(),
  title: z.string(),
  trackingType: habitTrackingTypeSchema,
  frequencyCount: z.number().int().positive(),
  frequencyPeriod: habitFrequencyPeriodSchema,
  frequencyConfidence: dataImportReviewFrequencyConfidenceSchema,
  frequencyOriginalNumerator: z.number().int().positive().nullable(),
  frequencyOriginalDenominator: z.number().int().positive().nullable(),
  frequencyReviewReason: z.string().nullable(),
  quantUnitPreset: habitQuantUnitPresetSchema.nullable(),
  quantUnitCustom: z.string().nullable(),
  quantTargetValue: z.string().nullable(),
  quantGoalType: habitGoalTypeSchema.nullable(),
  sampleValues: z.array(z.string()),
  requiresReview: z.boolean(),
});

const dataImportPreviewSummarySchema = z.object({
  totalHabits: z.number().int().nonnegative(),
  totalReviewItems: z.number().int().nonnegative(),
  quantifiableCount: z.number().int().nonnegative(),
  lowConfidenceCount: z.number().int().nonnegative(),
});

const dataImportPreviewResponseSchema = z.object({
  stageToken: z.string(),
  format: z.enum(["pixel-heart-json", "loop-habitudes-csv-zip"]),
  expiresAt: z.string(),
  summary: z.object({
    format: z.enum(["pixel-heart-json", "loop-habitudes-csv-zip"]),
    habitsImported: z.number().int().nonnegative(),
    logsImported: z.number().int().nonnegative(),
    pokegameImported: z.boolean(),
  }),
  reviewSummary: dataImportPreviewSummarySchema,
  reviewItems: z.array(dataImportReviewItemSchema),
});

const dataImportReviewOverrideSchema = z.object({
  sourceKey: z.string(),
  frequencyCount: z.number().int().positive().max(999).optional(),
  frequencyPeriod: habitFrequencyPeriodSchema.optional(),
  quantUnitPreset: habitQuantUnitPresetSchema.nullable().optional(),
  quantUnitCustom: z.string().max(30).nullable().optional(),
  quantTargetValue: z.string().max(32).nullable().optional(),
  quantGoalType: habitGoalTypeSchema.nullable().optional(),
});

const dataImportCommitSchema = z.object({
  stageToken: z.string().min(1),
  overrides: z.array(dataImportReviewOverrideSchema).max(1000).optional(),
});

const dataImportSummarySchema = z.object({
  format: z.enum(["pixel-heart-json", "loop-habitudes-csv-zip"]),
  habitsImported: z.number().int().nonnegative(),
  logsImported: z.number().int().nonnegative(),
  pokegameImported: z.boolean(),
});

const dataExportPayloadSchema = z.object({
  format: z.literal("pixel-heart-export-v1"),
  exportedAt: z.string(),
  user: z.object({
    username: z.string(),
    isAdmin: z.boolean(),
  }),
  habits: z.array(
    z.object({
      id: z.number().int().positive(),
      title: z.string(),
      description: z.string().nullable(),
      notes: z.string().nullable().optional(),
      trackingType: habitTrackingTypeSchema.optional(),
      frequencyCount: z.number().int().positive().optional(),
      frequencyPeriod: habitFrequencyPeriodSchema.optional(),
      quantUnitPreset: habitQuantUnitPresetSchema.nullable().optional(),
      quantUnitCustom: z.string().nullable().optional(),
      quantTargetValue: z.string().nullable().optional(),
      quantGoalType: habitGoalTypeSchema.nullable().optional(),
      color: z.string(),
      icon: z.string(),
      sortOrder: z.number().int(),
      createdAt: z.string(),
    }),
  ),
  habitLogs: z.array(
    z.object({
      habitId: z.number().int().positive(),
      date: z.string(),
      completed: z.boolean(),
      status: habitLogStatusSchema.optional(),
      valueText: z.string().nullable().optional(),
      updatedAt: z.string(),
    }),
  ),
  pokegameProfile: z.record(z.any()).nullable(),
});

// API Contract
export const api = {
  auth: {
    me: {
      method: 'GET' as const,
      path: '/api/auth/me' as const,
      responses: {
        200: authSessionSchema,
      },
    },
    login: {
      method: 'POST' as const,
      path: '/api/auth/login' as const,
      input: authLoginSchema,
      responses: {
        200: authSessionSchema,
        400: errorSchemas.validation,
      },
    },
    signup: {
      method: 'POST' as const,
      path: '/api/auth/signup' as const,
      input: authSignupSchema,
      responses: {
        200: authSessionSchema,
        400: errorSchemas.validation,
      },
    },
    logout: {
      method: 'POST' as const,
      path: '/api/auth/logout' as const,
      responses: {
        200: authSessionSchema,
      },
    },
    createUser: {
      method: 'POST' as const,
      path: '/api/auth/users' as const,
      input: authCreateUserSchema,
      responses: {
        201: authUserSchema,
        400: errorSchemas.validation,
      },
    },
    changePassword: {
      method: 'POST' as const,
      path: '/api/auth/change-password' as const,
      input: authChangePasswordSchema,
      responses: {
        200: authSessionSchema,
        400: errorSchemas.validation,
      },
    },
    changeUsername: {
      method: 'POST' as const,
      path: '/api/auth/change-username' as const,
      input: authChangeUsernameSchema,
      responses: {
        200: authSessionSchema,
        400: errorSchemas.validation,
      },
    },
    sessions: {
      method: 'GET' as const,
      path: '/api/auth/sessions' as const,
      responses: {
        200: authSessionsListSchema,
      },
    },
    logoutOtherSessions: {
      method: 'POST' as const,
      path: '/api/auth/logout-other-sessions' as const,
      responses: {
        200: authLogoutOtherSessionsResultSchema,
      },
    },
    deleteAccount: {
      method: 'POST' as const,
      path: '/api/auth/delete-account' as const,
      input: authDeleteAccountSchema,
      responses: {
        200: authSessionSchema,
        400: errorSchemas.validation,
      },
    },
  },
  data: {
    export: {
      method: 'GET' as const,
      path: '/api/data/export' as const,
      responses: {
        200: dataExportPayloadSchema,
      },
    },
    exportTrackerOnly: {
      method: 'GET' as const,
      path: '/api/data/export/tracker-only' as const,
      responses: {
        200: dataExportPayloadSchema,
      },
    },
    import: {
      method: 'POST' as const,
      path: '/api/data/import' as const,
      input: dataImportSchema,
      responses: {
        200: dataImportSummarySchema,
        400: errorSchemas.validation,
      },
    },
    importPreview: {
      method: 'POST' as const,
      path: '/api/data/import/preview' as const,
      input: dataImportSchema,
      responses: {
        200: dataImportPreviewResponseSchema,
        400: errorSchemas.validation,
      },
    },
    importCommit: {
      method: 'POST' as const,
      path: '/api/data/import/commit' as const,
      input: dataImportCommitSchema,
      responses: {
        200: dataImportSummarySchema,
        400: errorSchemas.validation,
      },
    },
  },
  habits: {
    list: {
      method: 'GET' as const,
      path: '/api/habits' as const,
      responses: {
        200: z.array(z.custom<typeof habits.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/habits' as const,
      input: habitInputSchema,
      responses: {
        201: z.custom<typeof habits.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    reorder: {
      method: 'POST' as const,
      path: '/api/habits/reorder' as const,
      input: z.object({
        orderedIds: z.array(z.number().int().positive()).min(1),
      }),
      responses: {
        204: z.void(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/habits/:id' as const,
      input: habitInputSchema.partial(),
      responses: {
        200: z.custom<typeof habits.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/habits/:id' as const,
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  habitLogs: {
    list: {
      method: 'GET' as const,
      path: '/api/habits/:habitId/logs' as const,
      responses: {
        200: z.array(z.custom<typeof habitLogs.$inferSelect>()),
      },
    },
    toggle: {
      method: 'POST' as const,
      path: '/api/habits/:habitId/logs' as const,
      input: setHabitLogSchema,
      responses: {
        200: z.custom<typeof habitLogs.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
  },
  pokegame: {
    state: {
      method: 'GET' as const,
      path: '/api/pokegame' as const,
      responses: {
        200: pokegameStateSchema,
      },
    },
    buyRareCandy: {
      method: 'POST' as const,
      path: '/api/pokegame/shop/rare-candy' as const,
      responses: {
        200: pokegameStateSchema,
        400: errorSchemas.validation,
      },
    },
    buyShinyPotion: {
      method: 'POST' as const,
      path: '/api/pokegame/shop/shiny-potion' as const,
      responses: {
        200: pokegameStateSchema,
        400: errorSchemas.validation,
      },
    },
    buyPurifyingRune: {
      method: 'POST' as const,
      path: '/api/pokegame/shop/purifying-rune' as const,
      responses: {
        200: pokegameStateSchema,
        400: errorSchemas.validation,
      },
    },
    newEgg: {
      method: 'POST' as const,
      path: '/api/pokegame/new-egg' as const,
      responses: {
        200: pokegameStateSchema,
        400: errorSchemas.validation,
      },
    },
    devAction: {
      method: 'POST' as const,
      path: '/api/pokegame/dev/action' as const,
      input: pokegameDevActionSchema,
      responses: {
        200: pokegameStateSchema,
        400: errorSchemas.validation,
      },
    },
    claimAchievement: {
      method: 'POST' as const,
      path: '/api/pokegame/achievements/claim' as const,
      input: pokegameClaimAchievementSchema,
      responses: {
        200: pokegameStateSchema,
        400: errorSchemas.validation,
      },
    },
    renameCreature: {
      method: 'POST' as const,
      path: '/api/pokegame/creature/nickname' as const,
      input: pokegameCreatureNicknameSchema,
      responses: {
        200: pokegameStateSchema,
        400: errorSchemas.validation,
      },
    },
    toggleDexFavorite: {
      method: 'POST' as const,
      path: '/api/pokegame/dex/favorite' as const,
      input: pokegameDexFavoriteSchema,
      responses: {
        200: pokegameStateSchema,
        400: errorSchemas.validation,
      },
    },
  },
};

// URL Builder Helper
export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}

// Type Helpers
export type HabitInput = z.infer<typeof api.habits.create.input>;
export type HabitResponse = z.infer<typeof api.habits.create.responses[201]>;
export type HabitUpdateInput = z.infer<typeof api.habits.update.input>;
export type HabitListResponse = z.infer<typeof api.habits.list.responses[200]>;
export type HabitReorderInput = z.infer<typeof api.habits.reorder.input>;
export type HabitLogInput = z.infer<typeof api.habitLogs.toggle.input>;
export type HabitLogResponse = z.infer<typeof api.habitLogs.toggle.responses[200]>;
export type HabitLogListResponse = z.infer<typeof api.habitLogs.list.responses[200]>;
export type Habit = HabitResponse;
export type HabitLog = HabitLogResponse;
export type AuthUser = z.infer<typeof authUserSchema>;
export type AuthSessionResponse = z.infer<typeof authSessionSchema>;
export type AuthLoginInput = z.infer<typeof authLoginSchema>;
export type AuthCreateUserInput = z.infer<typeof authCreateUserSchema>;
export type AuthSignupInput = z.infer<typeof authSignupSchema>;
export type AuthChangePasswordInput = z.infer<typeof authChangePasswordSchema>;
export type AuthChangeUsernameInput = z.infer<typeof authChangeUsernameSchema>;
export type AuthSessionsListResponse = z.infer<typeof authSessionsListSchema>;
export type AuthDeleteAccountInput = z.infer<typeof authDeleteAccountSchema>;
export type DataImportInput = z.infer<typeof dataImportSchema>;
export type DataImportPreviewResponse = z.infer<typeof dataImportPreviewResponseSchema>;
export type DataImportReviewItem = z.infer<typeof dataImportReviewItemSchema>;
export type DataImportCommitInput = z.infer<typeof dataImportCommitSchema>;
export type DataImportReviewOverride = z.infer<typeof dataImportReviewOverrideSchema>;
export type DataImportSummary = z.infer<typeof dataImportSummarySchema>;
export type DataExportPayload = z.infer<typeof dataExportPayloadSchema>;
export type PokegameStateResponse = z.infer<typeof pokegameStateSchema>;
export type PokegameDevActionInput = z.infer<typeof pokegameDevActionSchema>;
export type PokegameClaimAchievementInput = z.infer<typeof pokegameClaimAchievementSchema>;
export type PokegameRenameCreatureInput = z.infer<typeof pokegameCreatureNicknameSchema>;
export type PokegameDexFavoriteInput = z.infer<typeof pokegameDexFavoriteSchema>;
