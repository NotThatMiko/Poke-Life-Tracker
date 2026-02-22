import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Habits
  app.get(api.habits.list.path, async (_req, res) => {
    const allHabits = await storage.getHabits();
    res.json(allHabits);
  });

  app.post(api.habits.create.path, async (req, res) => {
    try {
      const input = api.habits.create.input.parse(req.body);
      const habit = await storage.createHabit(input);
      res.status(201).json(habit);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.patch(api.habits.update.path, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const input = api.habits.update.input.parse(req.body);
      const updated = await storage.updateHabit(id, input);
      if (!updated) {
         return res.status(404).json({ message: "Habit not found" });
      }
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.delete(api.habits.delete.path, async (req, res) => {
    const id = Number(req.params.id);
    await storage.deleteHabit(id);
    res.status(204).end();
  });

  // Habit Logs
  app.get(api.habitLogs.list.path, async (req, res) => {
    const habitId = Number(req.params.habitId);
    const logs = await storage.getHabitLogs(habitId);
    res.json(logs);
  });

  app.post(api.habitLogs.toggle.path, async (req, res) => {
    try {
      const habitId = Number(req.params.habitId);
      const input = api.habitLogs.toggle.input.parse(req.body);
      const log = await storage.toggleHabitLog(habitId, input.date, input.completed);
      res.json(log);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  // Seed data
  await seedDatabase();

  return httpServer;
}

async function seedDatabase() {
  const existingHabits = await storage.getHabits();
  if (existingHabits.length === 0) {
    const habit1 = await storage.createHabit({
      title: "Drink Water",
      description: "8 glasses a day!",
      color: "#93c5fd" // pastel blue
    });
    
    const habit2 = await storage.createHabit({
      title: "Read a Book",
      description: "15 minutes before bed",
      color: "#fdba74" // pastel orange
    });

    const habit3 = await storage.createHabit({
      title: "Go for a Walk",
      description: "Get some fresh air",
      color: "#86efac" // pastel green
    });

    // Add a few logs for the past few days
    const today = new Date();
    for (let i = 0; i < 3; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      
      // Drink water every day
      await storage.toggleHabitLog(habit1.id, dateStr, true);
      
      // Read a book only 1 day ago
      if (i === 1) {
        await storage.toggleHabitLog(habit2.id, dateStr, true);
      }
    }
  }
}
