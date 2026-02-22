import { db } from "./db";
import {
  habits,
  habitLogs,
  type Habit,
  type HabitLog,
  type CreateHabitRequest,
  type UpdateHabitRequest,
  type ToggleHabitLogRequest
} from "@shared/schema";
import { eq, and } from "drizzle-orm";

export interface IStorage {
  getHabits(): Promise<Habit[]>;
  getHabit(id: number): Promise<Habit | undefined>;
  createHabit(habit: CreateHabitRequest): Promise<Habit>;
  updateHabit(id: number, updates: UpdateHabitRequest): Promise<Habit>;
  deleteHabit(id: number): Promise<void>;
  
  getHabitLogs(habitId: number): Promise<HabitLog[]>;
  toggleHabitLog(habitId: number, date: string, completed: boolean): Promise<HabitLog>;
}

export class DatabaseStorage implements IStorage {
  async getHabits(): Promise<Habit[]> {
    return await db.select().from(habits);
  }

  async getHabit(id: number): Promise<Habit | undefined> {
    const [habit] = await db.select().from(habits).where(eq(habits.id, id));
    return habit;
  }

  async createHabit(habit: CreateHabitRequest): Promise<Habit> {
    const [newHabit] = await db.insert(habits).values(habit).returning();
    return newHabit;
  }

  async updateHabit(id: number, updates: UpdateHabitRequest): Promise<Habit> {
    const [updated] = await db.update(habits).set(updates).where(eq(habits.id, id)).returning();
    return updated;
  }

  async deleteHabit(id: number): Promise<void> {
    await db.delete(habitLogs).where(eq(habitLogs.habitId, id)); // delete logs first
    await db.delete(habits).where(eq(habits.id, id));
  }

  async getHabitLogs(habitId: number): Promise<HabitLog[]> {
    return await db.select().from(habitLogs).where(eq(habitLogs.habitId, habitId));
  }

  async toggleHabitLog(habitId: number, date: string, completed: boolean): Promise<HabitLog> {
    const [existing] = await db
      .select()
      .from(habitLogs)
      .where(and(eq(habitLogs.habitId, habitId), eq(habitLogs.date, date)));

    if (existing) {
      const [updated] = await db
        .update(habitLogs)
        .set({ completed })
        .where(eq(habitLogs.id, existing.id))
        .returning();
      return updated;
    } else {
      const [inserted] = await db
        .insert(habitLogs)
        .values({ habitId, date, completed })
        .returning();
      return inserted;
    }
  }
}

export const storage = new DatabaseStorage();
