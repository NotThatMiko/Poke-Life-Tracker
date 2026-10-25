import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import {
  buildAuthSessionResponse,
  changeUsernameForAuthenticatedUser,
  changePasswordForAuthenticatedUser,
  createUserAccount,
  deleteAuthenticatedUserAccount,
  getBootstrapAdminUser,
  listActiveSessionsForAuthenticatedUser,
  loginWithPassword,
  logoutOtherSessionsForAuthenticatedUser,
  logoutSession,
  requireAdminApi,
  requireAuthApi,
  signUpWithPassword,
} from "./auth";
import {
  buyPurifyingRune,
  buyShinyPotion,
  buyRareCandy,
  claimPokegameAchievement,
  getNewEgg,
  getPokegameState,
  pokegameDevAddLevels,
  pokegameDevAddPo,
  pokegameDevClearLevels,
  pokegameDevClearMoney,
  pokegameDevEmptyDex,
  pokegameDevFillDex,
  pokegameDevFillShinyDex,
  pokegameDevResetAchievements,
  pokegameDevResetOnly,
  pokegameDevResetAll,
  renameCurrentCreature,
  syncPokegameIfInitialized,
  toggleDexFavorite,
} from "./pokegame";
import {
  buildUserDataExport,
  commitUserDataImportStage,
  importUserDataFromBase64,
  previewUserDataImportFromBase64,
} from "./data-transfer";
import { api } from "@shared/routes";
import { z } from "zod";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.use("/api/auth", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  // Auth (public)
  app.get(api.auth.me.path, async (req, res) => {
    res.json(buildAuthSessionResponse(req));
  });

  app.post(api.auth.login.path, async (req, res) => {
    try {
      const input = api.auth.login.input.parse(req.body);
      const user = await loginWithPassword(req, input.username, input.password, { rememberMe: input.rememberMe });
      if (!user) {
        return res.status(400).json({ message: "Invalid username or password" });
      }
      res.json({ authenticated: true, user });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      const status = err instanceof Error && "status" in err && typeof (err as any).status === "number"
        ? (err as any).status
        : 400;
      return res.status(status).json({ message: err instanceof Error ? err.message : "Login failed" });
    }
  });

  app.post(api.auth.signup.path, async (req, res) => {
    try {
      const input = api.auth.signup.input.parse(req.body);
      const user = await signUpWithPassword(req, input);
      res.json({ authenticated: true, user });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      const status = err instanceof Error && "status" in err && typeof (err as any).status === "number"
        ? (err as any).status
        : 400;
      return res.status(status).json({ message: err instanceof Error ? err.message : "Signup failed" });
    }
  });

  app.post(api.auth.logout.path, async (req, res) => {
    await logoutSession(req, res);
    res.json({ authenticated: false, user: null });
  });

  app.post(api.auth.createUser.path, requireAdminApi, async (req, res) => {
    try {
      const input = api.auth.createUser.input.parse(req.body);
      const user = await createUserAccount(input);
      res.status(201).json(user);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      const status = err instanceof Error && "status" in err && typeof (err as any).status === "number"
        ? (err as any).status
        : 400;
      return res.status(status).json({ message: err instanceof Error ? err.message : "Failed to create user" });
    }
  });

  app.post(api.auth.changePassword.path, requireAuthApi, async (req, res) => {
    try {
      const input = api.auth.changePassword.input.parse(req.body);
      await changePasswordForAuthenticatedUser(req, input);
      res.json(buildAuthSessionResponse(req));
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      const status = err instanceof Error && "status" in err && typeof (err as any).status === "number"
        ? (err as any).status
        : 400;
      return res.status(status).json({ message: err instanceof Error ? err.message : "Failed to change password" });
    }
  });

  app.post(api.auth.changeUsername.path, requireAuthApi, async (req, res) => {
    try {
      const input = api.auth.changeUsername.input.parse(req.body);
      await changeUsernameForAuthenticatedUser(req, input);
      res.json(buildAuthSessionResponse(req));
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      const status = err instanceof Error && "status" in err && typeof (err as any).status === "number"
        ? (err as any).status
        : 400;
      return res.status(status).json({ message: err instanceof Error ? err.message : "Failed to change username" });
    }
  });

  app.get(api.auth.sessions.path, requireAuthApi, async (req, res) => {
    try {
      const sessions = await listActiveSessionsForAuthenticatedUser(req);
      res.json({ sessions });
    } catch (err) {
      const status = err instanceof Error && "status" in err && typeof (err as any).status === "number"
        ? (err as any).status
        : 400;
      return res.status(status).json({ message: err instanceof Error ? err.message : "Failed to list sessions" });
    }
  });

  app.post(api.auth.logoutOtherSessions.path, requireAuthApi, async (req, res) => {
    try {
      const result = await logoutOtherSessionsForAuthenticatedUser(req);
      res.json(result);
    } catch (err) {
      const status = err instanceof Error && "status" in err && typeof (err as any).status === "number"
        ? (err as any).status
        : 400;
      return res.status(status).json({ message: err instanceof Error ? err.message : "Failed to logout other sessions" });
    }
  });

  app.post(api.auth.deleteAccount.path, requireAuthApi, async (req, res) => {
    try {
      const input = api.auth.deleteAccount.input.parse(req.body);
      await deleteAuthenticatedUserAccount(req, res, input);
      res.json({ authenticated: false, user: null });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      const status = err instanceof Error && "status" in err && typeof (err as any).status === "number"
        ? (err as any).status
        : 400;
      return res.status(status).json({ message: err instanceof Error ? err.message : "Failed to delete account" });
    }
  });

  // All remaining API routes require auth
  app.use("/api", requireAuthApi);

  app.get(api.data.export.path, async (req, res) => {
    const exportPayload = await buildUserDataExport(req.authUser!.id, {
      username: req.authUser!.username,
      isAdmin: req.authUser!.isAdmin,
    }, true);
    const safeUsername = req.authUser!.username.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
    const datePart = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Disposition", `attachment; filename="pixel-heart-${safeUsername || "user"}-${datePart}.json"`);
    res.json(exportPayload);
  });

  app.get(api.data.exportTrackerOnly.path, async (req, res) => {
    const exportPayload = await buildUserDataExport(req.authUser!.id, {
      username: req.authUser!.username,
      isAdmin: req.authUser!.isAdmin,
    }, false);

    const safeUsername = req.authUser!.username.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
    const datePart = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Disposition", `attachment; filename="pixel-heart-tracker-${safeUsername || "user"}-${datePart}.json"`);
    res.json(exportPayload);
  });

  app.post(api.data.import.path, async (req, res) => {
    try {
      const input = api.data.import.input.parse(req.body);
      const summary = await importUserDataFromBase64({
        userId: req.authUser!.id,
        fileName: input.fileName,
        fileBase64: input.fileBase64,
        replaceExisting: input.replaceExisting ?? true,
      });
      res.json(summary);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      const message = err instanceof Error ? err.message : "Import failed";
      return res.status(400).json({ message });
    }
  });

  app.post(api.data.importPreview.path, async (req, res) => {
    try {
      const input = api.data.importPreview.input.parse(req.body);
      const preview = await previewUserDataImportFromBase64({
        userId: req.authUser!.id,
        fileName: input.fileName,
        fileBase64: input.fileBase64,
        replaceExisting: input.replaceExisting ?? true,
      });
      res.json(preview);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      const message = err instanceof Error ? err.message : "Import preview failed";
      return res.status(400).json({ message });
    }
  });

  app.post(api.data.importCommit.path, async (req, res) => {
    try {
      const input = api.data.importCommit.input.parse(req.body);
      const summary = await commitUserDataImportStage({
        userId: req.authUser!.id,
        stageToken: input.stageToken,
        overrides: input.overrides,
      });
      res.json(summary);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      const message = err instanceof Error ? err.message : "Import commit failed";
      return res.status(400).json({ message });
    }
  });

  // Habits
  app.get(api.habits.list.path, async (req, res) => {
    const userId = req.authUser!.id;
    const allHabits = await storage.getHabits(userId);
    res.json(allHabits);
  });

  app.post(api.habits.create.path, async (req, res) => {
    try {
      const userId = req.authUser!.id;
      const input = api.habits.create.input.parse(req.body);
      const habit = await storage.createHabit(userId, input);
      void syncPokegameIfInitialized(userId).catch((syncErr) => {
        console.error("Failed to sync Pokegame after habit creation", syncErr);
      });
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

  app.post(api.habits.reorder.path, async (req, res) => {
    try {
      const userId = req.authUser!.id;
      const input = api.habits.reorder.input.parse(req.body);
      await storage.reorderHabits(userId, input.orderedIds);
      res.status(204).end();
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
      const userId = req.authUser!.id;
      const id = Number(req.params.id);
      const input = api.habits.update.input.parse(req.body);
      const updated = await storage.updateHabit(userId, id, input);
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
    const userId = req.authUser!.id;
    const id = Number(req.params.id);
    await storage.deleteHabit(userId, id);
    void syncPokegameIfInitialized(userId).catch((syncErr) => {
      console.error("Failed to sync Pokegame after habit deletion", syncErr);
    });
    res.status(204).end();
  });

  // Habit Logs
  app.get(api.habitLogs.list.path, async (req, res) => {
    const userId = req.authUser!.id;
    const habitId = Number(req.params.habitId);
    const logs = await storage.getHabitLogs(userId, habitId);
    res.json(logs);
  });

  app.post(api.habitLogs.toggle.path, async (req, res) => {
    try {
      const userId = req.authUser!.id;
      const habitId = Number(req.params.habitId);
      const input = api.habitLogs.toggle.input.parse(req.body);
      const log = await storage.setHabitLog(userId, habitId, input);
      void syncPokegameIfInitialized(userId).catch((syncErr) => {
        console.error("Failed to sync Pokegame after habit log toggle", syncErr);
      });
      res.json(log);
    } catch (err) {
      if (err instanceof Error && "status" in err && (err as any).status === 404) {
        return res.status(404).json({ message: "Habit not found" });
      }
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  // Pokegame
  app.get(api.pokegame.state.path, async (req, res) => {
    const state = await getPokegameState(req.authUser!.id);
    res.json(state);
  });

  app.post(api.pokegame.buyRareCandy.path, async (req, res) => {
    try {
      const state = await buyRareCandy(req.authUser!.id);
      res.json(state);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to buy rare candy";
      res.status(400).json({ message });
    }
  });

  app.post(api.pokegame.buyShinyPotion.path, async (req, res) => {
    try {
      const state = await buyShinyPotion(req.authUser!.id);
      res.json(state);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to use shiny potion";
      res.status(400).json({ message });
    }
  });

  app.post(api.pokegame.buyPurifyingRune.path, async (req, res) => {
    try {
      const state = await buyPurifyingRune(req.authUser!.id);
      res.json(state);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to use purifying rune";
      res.status(400).json({ message });
    }
  });

  app.post(api.pokegame.newEgg.path, async (req, res) => {
    try {
      const state = await getNewEgg(req.authUser!.id);
      res.json(state);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to get new egg";
      res.status(400).json({ message });
    }
  });

  app.post(api.pokegame.claimAchievement.path, async (req, res) => {
    try {
      const input = api.pokegame.claimAchievement.input.parse(req.body);
      const state = await claimPokegameAchievement(req.authUser!.id, input.achievementId);
      res.json(state);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      const message = err instanceof Error ? err.message : "Failed to claim achievement";
      res.status(400).json({ message });
    }
  });

  app.post(api.pokegame.renameCreature.path, async (req, res) => {
    try {
      const input = api.pokegame.renameCreature.input.parse(req.body);
      const state = await renameCurrentCreature(req.authUser!.id, input.nickname);
      res.json(state);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      const message = err instanceof Error ? err.message : "Failed to rename creature";
      res.status(400).json({ message });
    }
  });

  app.post(api.pokegame.toggleDexFavorite.path, async (req, res) => {
    try {
      const input = api.pokegame.toggleDexFavorite.input.parse(req.body);
      const state = await toggleDexFavorite(req.authUser!.id, input.dexStageId, input.favorite);
      res.json(state);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      const message = err instanceof Error ? err.message : "Failed to update Dex favorite";
      res.status(400).json({ message });
    }
  });

  app.post(api.pokegame.devAction.path, requireAdminApi, async (req, res) => {
    try {
      const userId = req.authUser!.id;
      const input = api.pokegame.devAction.input.parse(req.body);

      let state;
      switch (input.action) {
        case "add_po_99999":
          state = await pokegameDevAddPo(userId, 99_999);
          break;
        case "add_level_1":
          state = await pokegameDevAddLevels(userId, 1);
          break;
        case "add_level_10":
          state = await pokegameDevAddLevels(userId, 10);
          break;
        case "fill_dex":
          state = await pokegameDevFillDex(userId);
          break;
        case "fill_shiny_dex":
          state = await pokegameDevFillShinyDex(userId);
          break;
        case "empty_dex":
          state = await pokegameDevEmptyDex(userId);
          break;
        case "clear_money":
          state = await pokegameDevClearMoney(userId);
          break;
        case "clear_levels":
          state = await pokegameDevClearLevels(userId);
          break;
        case "reset_achievements":
          state = await pokegameDevResetAchievements(userId);
          break;
        case "reset_pokegame":
          state = await pokegameDevResetOnly(userId);
          break;
        case "reset_all":
          state = await pokegameDevResetAll(userId);
          break;
        default:
          return res.status(400).json({ message: "Unknown dev action" });
      }

      res.json(state);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      const message = err instanceof Error ? err.message : "Pokegame dev action failed";
      res.status(400).json({ message });
    }
  });

  // Seed demo data only in development (or when explicitly enabled)
  if (shouldSeedDemoData()) {
    const admin = getBootstrapAdminUser();
    if (admin) {
      await seedDatabase(admin.id);
    }
  }

  return httpServer;
}

function shouldSeedDemoData() {
  if (typeof process.env.SEED_DEMO_DATA === "string") {
    return process.env.SEED_DEMO_DATA.toLowerCase() === "true";
  }

  return process.env.NODE_ENV !== "production";
}

async function seedDatabase(userId: number) {
  const existingHabits = await storage.getHabits(userId);
  if (existingHabits.length === 0) {
    const habit1 = await storage.createHabit(userId, {
      title: "Drink Water",
      description: "8 glasses a day!",
      color: "#93c5fd", // pastel blue
      icon: "White.png",
    });
    
    const habit2 = await storage.createHabit(userId, {
      title: "Read a Book",
      description: "15 minutes before bed",
      color: "#fdba74", // pastel orange
      icon: "White.png",
    });

    const habit3 = await storage.createHabit(userId, {
      title: "Go for a Walk",
      description: "Get some fresh air",
      color: "#86efac", // pastel green
      icon: "White.png",
    });

    // Add a few logs for the past few days
    const today = new Date();
    for (let i = 0; i < 3; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      
      // Drink water every day
      await storage.toggleHabitLog(userId, habit1.id, dateStr, true);
      
      // Read a book only 1 day ago
      if (i === 1) {
        await storage.toggleHabitLog(userId, habit2.id, dateStr, true);
      }
    }
  }
}
