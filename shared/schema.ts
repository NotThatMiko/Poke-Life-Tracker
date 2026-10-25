import { pgTable, text, serial, boolean, timestamp, integer, jsonb, json, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import {
  habitFrequencyPeriodSchema,
  habitGoalTypeSchema,
  habitLogStatusSchema,
  habitQuantUnitPresetSchema,
  habitTrackingTypeSchema,
  type HabitLogStatus,
} from "./habit-config";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull(),
  usernameNormalized: text("username_normalized").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  isAdmin: boolean("is_admin").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Keep the connect-pg-simple session table in the Drizzle schema so `drizzle-kit push`
// doesn't treat it as an unknown table and abort on a destructive prompt in Docker startup.
export const sessions = pgTable("session", {
  sid: varchar("sid").primaryKey(),
  sess: json("sess").notNull(),
  expire: timestamp("expire").notNull(),
});

export const habits = pgTable("habits", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  title: text("title").notNull(),
  description: text("description"),
  notes: text("notes"),
  trackingType: text("tracking_type").notNull().default("yes_no"),
  frequencyCount: integer("frequency_count").notNull().default(1),
  frequencyPeriod: text("frequency_period").notNull().default("day"),
  quantUnitPreset: text("quant_unit_preset"),
  quantUnitCustom: text("quant_unit_custom"),
  quantTargetValue: text("quant_target_value"),
  quantGoalType: text("quant_goal_type"),
  color: text("color").notNull().default("#f87171"),
  icon: text("icon").notNull().default("White.png"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const habitLogs = pgTable("habit_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  habitId: integer("habit_id").notNull(),
  date: text("date").notNull(), // YYYY-MM-DD
  completed: boolean("completed").notNull().default(false),
  status: text("status").notNull().default("clear"),
  valueText: text("value_text"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const pokegameProfiles = pgTable("pokegame_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  activatedAt: timestamp("activated_at").defaultNow().notNull(),
  currentCycleStartedAt: timestamp("current_cycle_started_at").defaultNow().notNull(),
  currentCreatureId: text("current_creature_id"),
  currentCreatureNickname: text("current_creature_nickname"),
  currentCreatureIsShiny: boolean("current_creature_is_shiny").notNull().default(false),
  currentCreatureHatchedAt: timestamp("current_creature_hatched_at"),
  discoveredCreatureIds: jsonb("discovered_creature_ids").$type<string[]>().notNull().default([]),
  seenShinyCreatureIds: jsonb("seen_shiny_creature_ids").$type<string[]>().notNull().default([]),
  discoveredDexStageIds: jsonb("discovered_dex_stage_ids").$type<string[]>().notNull().default([]),
  discoveredShinyDexStageIds: jsonb("discovered_shiny_dex_stage_ids").$type<string[]>().notNull().default([]),
  dexStageNicknames: jsonb("dex_stage_nicknames").$type<Record<string, string>>().notNull().default({}),
  favoritePassiveDexStageIds: jsonb("favorite_passive_dex_stage_ids").$type<string[]>().notNull().default([]),
  completedCreatureIds: jsonb("completed_creature_ids").$type<string[]>().notNull().default([]),
  completedShinyCreatureIds: jsonb("completed_shiny_creature_ids").$type<string[]>().notNull().default([]),
  completedCreatureHatchDates: jsonb("completed_creature_hatch_dates").$type<Record<string, string>>().notNull().default({}),
  completedCreatureNicknames: jsonb("completed_creature_nicknames").$type<Record<string, string>>().notNull().default({}),
  unlockedAchievementIds: jsonb("unlocked_achievement_ids").$type<string[]>().notNull().default([]),
  cycleBonusXp: integer("cycle_bonus_xp").notNull().default(0),
  poAdjustment: integer("po_adjustment").notNull().default(0),
  eggHatchesCount: integer("egg_hatches_count").notNull().default(0),
  highestLevelRewardedThisCycle: integer("highest_level_rewarded_this_cycle").notNull().default(0),
  highestLevelEver: integer("highest_level_ever").notNull().default(0),
  lastComputedLevel: integer("last_computed_level").notNull().default(0),
  lastComputedTotalXp: integer("last_computed_total_xp").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertHabitSchema = createInsertSchema(habits).omit({ id: true, userId: true, createdAt: true, sortOrder: true });
export const insertHabitLogSchema = createInsertSchema(habitLogs).omit({ id: true, userId: true, updatedAt: true });

export const habitInputSchema = insertHabitSchema.extend({
  trackingType: habitTrackingTypeSchema.optional(),
  frequencyCount: z.coerce.number().int().min(1).max(999).optional(),
  frequencyPeriod: habitFrequencyPeriodSchema.optional(),
  quantUnitPreset: habitQuantUnitPresetSchema.nullable().optional(),
  quantUnitCustom: z.string().trim().max(30).nullable().optional(),
  quantTargetValue: z.string().trim().max(16).nullable().optional(),
  quantGoalType: habitGoalTypeSchema.nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  description: z.string().max(100).nullable().optional(),
});

const habitLogInputLegacySchema = z.object({
  date: z.string(),
  completed: z.boolean(),
});

const habitLogInputRichSchema = z.object({
  date: z.string(),
  status: habitLogStatusSchema,
  valueText: z.string().trim().max(32).nullable().optional(),
});

export const setHabitLogSchema = z
  .union([habitLogInputLegacySchema, habitLogInputRichSchema])
  .transform((input) => {
    if ("status" in input) {
      const status = input.status;
      return {
        date: input.date,
        status,
        valueText:
          status === "done" || status === "recorded"
            ? (input.valueText ?? null)
            : null,
      };
    }

    return {
      date: input.date,
      status: (input.completed ? "done" : "clear") as HabitLogStatus,
      valueText: null,
    };
  });

export type User = typeof users.$inferSelect;
export type Habit = typeof habits.$inferSelect;
export type InsertHabit = z.infer<typeof insertHabitSchema>;
export type HabitLog = typeof habitLogs.$inferSelect;
export type InsertHabitLog = z.infer<typeof insertHabitLogSchema>;
export type PokegameProfile = typeof pokegameProfiles.$inferSelect;

export type CreateHabitRequest = z.infer<typeof habitInputSchema>;
export type UpdateHabitRequest = Partial<z.infer<typeof habitInputSchema>>;
export type SetHabitLogRequest = z.infer<typeof setHabitLogSchema>;
export type ToggleHabitLogRequest = { date: string, completed: boolean };

export type HabitResponse = Habit;
export type HabitLogResponse = HabitLog;
