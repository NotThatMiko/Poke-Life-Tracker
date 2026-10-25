import { db } from "./db";
import {
  habits,
  habitLogs,
  type Habit,
  type HabitLog,
  type CreateHabitRequest,
  type UpdateHabitRequest,
  type SetHabitLogRequest,
  type ToggleHabitLogRequest
} from "@shared/schema";
import { eq, and, asc, sql } from "drizzle-orm";
import { doesQuantifiableValueMeetGoal, getHabitTrackingType } from "@shared/habit-config";

export interface IStorage {
  getHabits(userId: number): Promise<Habit[]>;
  getHabit(userId: number, id: number): Promise<Habit | undefined>;
  createHabit(userId: number, habit: CreateHabitRequest): Promise<Habit>;
  reorderHabits(userId: number, orderedIds: number[]): Promise<void>;
  updateHabit(userId: number, id: number, updates: UpdateHabitRequest): Promise<Habit | undefined>;
  deleteHabit(userId: number, id: number): Promise<void>;
  
  getHabitLogs(userId: number, habitId: number): Promise<HabitLog[]>;
  setHabitLog(userId: number, habitId: number, input: SetHabitLogRequest): Promise<HabitLog>;
  toggleHabitLog(userId: number, habitId: number, date: string, completed: boolean): Promise<HabitLog>;
}

export class DatabaseStorage implements IStorage {
  async getHabits(userId: number): Promise<Habit[]> {
    return await db
      .select()
      .from(habits)
      .where(eq(habits.userId, userId))
      .orderBy(asc(habits.sortOrder), asc(habits.createdAt), asc(habits.id));
  }

  async getHabit(userId: number, id: number): Promise<Habit | undefined> {
    const [habit] = await db
      .select()
      .from(habits)
      .where(and(eq(habits.id, id), eq(habits.userId, userId)));
    return habit;
  }

  async createHabit(userId: number, habit: CreateHabitRequest): Promise<Habit> {
    const [currentMax] = await db
      .select({
        maxSortOrder: sql<number>`coalesce(max(${habits.sortOrder}), -1)`,
      })
      .from(habits)
      .where(eq(habits.userId, userId));

    const [newHabit] = await db
      .insert(habits)
      .values({ ...habit, userId, sortOrder: (currentMax?.maxSortOrder ?? -1) + 1 })
      .returning();
    return newHabit;
  }

  async reorderHabits(userId: number, orderedIds: number[]): Promise<void> {
    await db.transaction(async (tx) => {
      for (const [index, id] of orderedIds.entries()) {
        await tx
          .update(habits)
          .set({ sortOrder: index })
          .where(and(eq(habits.id, id), eq(habits.userId, userId)));
      }
    });
  }

  async updateHabit(userId: number, id: number, updates: UpdateHabitRequest): Promise<Habit | undefined> {
    const [updated] = await db
      .update(habits)
      .set(updates)
      .where(and(eq(habits.id, id), eq(habits.userId, userId)))
      .returning();
    return updated;
  }

  async deleteHabit(userId: number, id: number): Promise<void> {
    await db
      .delete(habitLogs)
      .where(and(eq(habitLogs.habitId, id), eq(habitLogs.userId, userId))); // delete logs first
    await db.delete(habits).where(and(eq(habits.id, id), eq(habits.userId, userId)));
  }

  async getHabitLogs(userId: number, habitId: number): Promise<HabitLog[]> {
    await this.assertHabitOwnership(userId, habitId);
    return await db
      .select()
      .from(habitLogs)
      .where(and(eq(habitLogs.habitId, habitId), eq(habitLogs.userId, userId)));
  }

  async setHabitLog(userId: number, habitId: number, input: SetHabitLogRequest): Promise<HabitLog> {
    const habit = await this.assertHabitOwnership(userId, habitId);

    const date = input.date;
    let status = input.status;
    let valueText = input.valueText ?? null;

    if (getHabitTrackingType(habit) === "quantifiable") {
      if (status === "done" || status === "recorded") {
        const meetsGoal = doesQuantifiableValueMeetGoal(habit, valueText);
        status = meetsGoal ? "done" : "recorded";
      } else {
        valueText = null;
      }
    } else {
      valueText = null;
      if (status === "recorded") {
        status = "done";
      }
    }

    const completed = status === "done";

    const [existing] = await db
      .select()
      .from(habitLogs)
      .where(and(eq(habitLogs.habitId, habitId), eq(habitLogs.userId, userId), eq(habitLogs.date, date)));

    if (existing) {
      const [updated] = await db
        .update(habitLogs)
        .set({ completed, status, valueText, updatedAt: new Date() })
        .where(eq(habitLogs.id, existing.id))
        .returning();
      return updated;
    } else {
      const [inserted] = await db
        .insert(habitLogs)
        .values({ userId, habitId, date, completed, status, valueText })
        .returning();
      return inserted;
    }
  }

  async toggleHabitLog(userId: number, habitId: number, date: string, completed: boolean): Promise<HabitLog> {
    return this.setHabitLog(userId, habitId, {
      date,
      status: completed ? "done" : "clear",
      valueText: null,
    });
  }

  private async assertHabitOwnership(userId: number, habitId: number) {
    const habit = await this.getHabit(userId, habitId);
    if (!habit) {
      const error = new Error("Habit not found");
      (error as Error & { status?: number }).status = 404;
      throw error;
    }
    return habit;
  }
}

export const storage = new DatabaseStorage();
