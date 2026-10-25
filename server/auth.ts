import type { Express, NextFunction, Request, Response } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import crypto from "node:crypto";
import { promisify } from "node:util";
import { eq, isNull, sql } from "drizzle-orm";
import { db, pool } from "./db";
import { habitLogs, habits, pokegameProfiles, users, type User } from "@shared/schema";

const scryptAsync = promisify(crypto.scrypt);
const SESSION_COOKIE_NAME = "pixel-heart-session";
const SESSION_STANDARD_TTL_MS = 1000 * 60 * 60 * 24; // 1 day
const SESSION_REMEMBER_ME_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 1 week
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_BLOCK_MS = 10 * 60 * 1000;
const MAX_TOTAL_USERS = Number.parseInt(process.env.MAX_TOTAL_USERS ?? "3", 10);

type PublicAuthUser = {
  id: number;
  username: string;
  isAdmin: boolean;
};

type ActiveSessionInfo = {
  sid: string;
  isCurrent: boolean;
  expiresAt: string | null;
  createdAt: string | null;
  lastSeenAt: string | null;
  ip: string | null;
  browser: string | null;
  os: string | null;
  userAgent: string | null;
};

type SessionClientMeta = {
  createdAt: string;
  lastSeenAt: string;
  ip: string | null;
  userAgent: string | null;
  browser: string | null;
  os: string | null;
};

const SESSION_ACTIVITY_UPDATE_MS = 60 * 1000;

type LoginAttemptState = {
  attempts: number[];
  blockedUntil?: number;
};

const loginAttemptsByKey = new Map<string, LoginAttemptState>();

let bootstrapAdminUserCache: PublicAuthUser | null = null;

function nowMs() {
  return Date.now();
}

function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

function toPublicUser(user: Pick<User, "id" | "username" | "isAdmin">): PublicAuthUser {
  return {
    id: user.id,
    username: user.username,
    isAdmin: Boolean(user.isAdmin),
  };
}

function getLoginKey(req: Request) {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0]?.trim() || req.ip || "unknown";
  }
  if (Array.isArray(forwardedFor) && forwardedFor.length > 0) {
    return forwardedFor[0] || req.ip || "unknown";
  }
  return req.ip || "unknown";
}

function getClientIp(req: Request) {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0]?.trim() || req.ip || null;
  }
  if (Array.isArray(forwardedFor) && forwardedFor.length > 0) {
    return forwardedFor[0]?.trim() || req.ip || null;
  }
  return req.ip || null;
}

function parseUserAgentLabel(userAgentRaw: string | null) {
  const ua = (userAgentRaw || "").toLowerCase();

  let browser: string | null = null;
  if (ua.includes("edg/")) browser = "Edge";
  else if (ua.includes("chrome/") && !ua.includes("edg/")) browser = "Chrome";
  else if (ua.includes("safari/") && ua.includes("version/") && !ua.includes("chrome/")) browser = "Safari";
  else if (ua.includes("firefox/")) browser = "Firefox";
  else if (ua.includes("samsungbrowser/")) browser = "Samsung Internet";
  else if (ua.includes("opr/") || ua.includes("opera")) browser = "Opera";

  let os: string | null = null;
  if (ua.includes("iphone") || ua.includes("ipad")) os = "iOS";
  else if (ua.includes("android")) os = "Android";
  else if (ua.includes("mac os x") || ua.includes("macintosh")) os = "macOS";
  else if (ua.includes("windows nt")) os = "Windows";
  else if (ua.includes("linux")) os = "Linux";

  return { browser, os };
}

function buildSessionClientMeta(req: Request, existing?: SessionClientMeta | null): SessionClientMeta {
  const nowIso = new Date().toISOString();
  const userAgent = typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : null;
  const labels = parseUserAgentLabel(userAgent);

  return {
    createdAt: existing?.createdAt ?? nowIso,
    lastSeenAt: nowIso,
    ip: getClientIp(req) ?? existing?.ip ?? null,
    userAgent: userAgent ?? existing?.userAgent ?? null,
    browser: labels.browser ?? existing?.browser ?? null,
    os: labels.os ?? existing?.os ?? null,
  };
}

function pruneLoginAttempts(state: LoginAttemptState, at = nowMs()) {
  state.attempts = state.attempts.filter((ts) => at - ts <= LOGIN_WINDOW_MS);
  if (state.blockedUntil && state.blockedUntil <= at) {
    delete state.blockedUntil;
  }
}

function registerLoginFailure(req: Request) {
  const key = getLoginKey(req);
  const state = loginAttemptsByKey.get(key) ?? { attempts: [] };
  const at = nowMs();
  pruneLoginAttempts(state, at);
  state.attempts.push(at);
  if (state.attempts.length >= LOGIN_MAX_ATTEMPTS) {
    state.blockedUntil = at + LOGIN_BLOCK_MS;
    state.attempts = [];
  }
  loginAttemptsByKey.set(key, state);
}

function clearLoginFailures(req: Request) {
  loginAttemptsByKey.delete(getLoginKey(req));
}

function getLoginBlockRemainingMs(req: Request) {
  const state = loginAttemptsByKey.get(getLoginKey(req));
  if (!state) return 0;
  const at = nowMs();
  pruneLoginAttempts(state, at);
  if (!state.blockedUntil) {
    if (state.attempts.length === 0) loginAttemptsByKey.delete(getLoginKey(req));
    else loginAttemptsByKey.set(getLoginKey(req), state);
    return 0;
  }
  loginAttemptsByKey.set(getLoginKey(req), state);
  return Math.max(0, state.blockedUntil - at);
}

async function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${derivedKey.toString("hex")}`;
}

async function verifyPassword(password: string, passwordHash: string) {
  const [algo, salt, storedHex] = passwordHash.split(":");
  if (algo !== "scrypt" || !salt || !storedHex) return false;
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  const stored = Buffer.from(storedHex, "hex");
  if (stored.length !== derivedKey.length) return false;
  return crypto.timingSafeEqual(stored, derivedKey);
}

async function findUserById(userId: number) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return user ?? null;
}

async function findUserByNormalizedUsername(usernameNormalized: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.usernameNormalized, usernameNormalized))
    .limit(1);
  return user ?? null;
}

async function countUsers() {
  const [row] = await db.select({ count: sql<number>`count(*)` }).from(users);
  return Number(row?.count ?? 0);
}

async function setSessionUser(req: Request, userId: number, options?: { rememberMe?: boolean }) {
  await new Promise<void>((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.authUserId = userId;
      req.session.clientMeta = buildSessionClientMeta(req);
      req.session.cookie.maxAge = options?.rememberMe ? SESSION_REMEMBER_ME_TTL_MS : SESSION_STANDARD_TTL_MS;
      req.session.save((saveErr) => {
        if (saveErr) return reject(saveErr);
        resolve();
      });
    });
  });
}

async function ensureAdminUser() {
  const adminUsername = process.env.ADMIN_USERNAME ?? "admiko";
  const adminPassword = process.env.ADMIN_PASSWORD ?? "mikorazon";
  const adminUsernameNormalized = normalizeUsername(adminUsername);

  let user = await findUserByNormalizedUsername(adminUsernameNormalized);
  if (!user) {
    const passwordHash = await hashPassword(adminPassword);
    const [inserted] = await db
      .insert(users)
      .values({
        username: adminUsername,
        usernameNormalized: adminUsernameNormalized,
        passwordHash,
        isAdmin: true,
      })
      .returning();
    user = inserted;
  } else if (!user.isAdmin || user.username !== adminUsername) {
    const [updated] = await db
      .update(users)
      .set({
        username: adminUsername,
        usernameNormalized: adminUsernameNormalized,
        isAdmin: true,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id))
      .returning();
    user = updated;
  }

  bootstrapAdminUserCache = toPublicUser(user);
  return user;
}

async function ensureSecondarySeedUser() {
  const username = process.env.DEFAULT_USER_USERNAME ?? "miko";
  const password = process.env.DEFAULT_USER_PASSWORD ?? "mikokoro";
  const usernameNormalized = normalizeUsername(username);

  if (!usernameNormalized) return null;

  let user = await findUserByNormalizedUsername(usernameNormalized);
  if (!user) {
    const passwordHash = await hashPassword(password);
    const [inserted] = await db
      .insert(users)
      .values({
        username,
        usernameNormalized,
        passwordHash,
        isAdmin: false,
      })
      .returning();
    user = inserted;
  } else if (user.isAdmin) {
    // Never silently demote an admin account seeded with the same username.
    return user;
  } else if (user.username !== username) {
    const [updated] = await db
      .update(users)
      .set({
        username,
        usernameNormalized,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id))
      .returning();
    user = updated;
  }

  return user;
}

async function migrateLegacyDataToAdmin(adminUserId: number) {
  await db.transaction(async (tx) => {
    await tx.update(habits).set({ userId: adminUserId }).where(isNull(habits.userId));
    await tx.update(habitLogs).set({ userId: adminUserId }).where(isNull(habitLogs.userId));
    await tx.update(pokegameProfiles).set({ userId: adminUserId }).where(isNull(pokegameProfiles.userId));

    // If a habit/log/profile somehow references a non-existent user, leave it untouched here.
    // We only migrate legacy NULL rows created before multi-user auth existed.
  });
}

export async function bootstrapAuthData() {
  const adminUser = await ensureAdminUser();
  await migrateLegacyDataToAdmin(adminUser.id);
  await ensureSecondarySeedUser();
  bootstrapAdminUserCache = toPublicUser(adminUser);
  return bootstrapAdminUserCache;
}

export function getBootstrapAdminUser() {
  return bootstrapAdminUserCache;
}

export function setupAuth(app: Express) {
  const PgStore = connectPgSimple(session);
  const trustProxy = (process.env.TRUST_PROXY ?? "true").toLowerCase() === "true";
  if (trustProxy) {
    app.set("trust proxy", 1);
  }

  app.use(
    session({
      name: SESSION_COOKIE_NAME,
      store: new PgStore({
        pool,
        createTableIfMissing: true,
      }),
      secret: process.env.SESSION_SECRET || "change-me-session-secret",
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: (process.env.SESSION_COOKIE_SECURE ?? "false").toLowerCase() === "true",
        maxAge: SESSION_STANDARD_TTL_MS,
      },
    }),
  );

  app.use(async (req, _res, next) => {
    const userId = req.session?.authUserId;
    if (!userId) {
      req.authUser = null;
      return next();
    }

    try {
      const user = await findUserById(userId);
      if (!user) {
        req.authUser = null;
        if (req.session) {
          delete req.session.authUserId;
          delete req.session.clientMeta;
        }
        return next();
      }
      if (req.session) {
        maybeRefreshSessionClientMeta(req);
      }
      req.authUser = toPublicUser(user);
      return next();
    } catch (error) {
      return next(error);
    }
  });
}

export function buildAuthSessionResponse(req: Request) {
  return {
    authenticated: Boolean(req.authUser),
    user: req.authUser ?? null,
  };
}

export async function loginWithPassword(
  req: Request,
  username: string,
  password: string,
  options?: { rememberMe?: boolean },
) {
  const blockRemainingMs = getLoginBlockRemainingMs(req);
  if (blockRemainingMs > 0) {
    const seconds = Math.max(1, Math.ceil(blockRemainingMs / 1000));
    const error = new Error(`Too many login attempts. Try again in ${seconds}s.`);
    (error as Error & { status?: number }).status = 429;
    throw error;
  }

  const usernameNormalized = normalizeUsername(username);
  const user = await findUserByNormalizedUsername(usernameNormalized);
  const isValid = user ? await verifyPassword(password, user.passwordHash) : false;

  if (!user || !isValid) {
    registerLoginFailure(req);
    return null;
  }

  clearLoginFailures(req);
  await setSessionUser(req, user.id, { rememberMe: Boolean(options?.rememberMe) });

  const publicUser = toPublicUser(user);
  req.authUser = publicUser;
  return publicUser;
}

export async function logoutSession(req: Request, res: Response) {
  req.authUser = null;
  await new Promise<void>((resolve) => {
    if (!req.session) {
      res.clearCookie(SESSION_COOKIE_NAME);
      resolve();
      return;
    }
    req.session.destroy(() => {
      res.clearCookie(SESSION_COOKIE_NAME);
      resolve();
    });
  });
}

export async function createUserAccount(input: { username: string; password: string; isAdmin?: boolean }) {
  const existingCount = await countUsers();
  if (Number.isFinite(MAX_TOTAL_USERS) && existingCount >= MAX_TOTAL_USERS) {
    const err = new Error("Maximum number of users reached for this instance");
    (err as Error & { status?: number }).status = 403;
    throw err;
  }

  const username = input.username.trim();
  const usernameNormalized = normalizeUsername(username);
  if (!usernameNormalized) {
    const err = new Error("Username is required");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }

  const existing = await findUserByNormalizedUsername(usernameNormalized);
  if (existing) {
    const err = new Error("Username is already taken");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }

  const passwordHash = await hashPassword(input.password);
  const [created] = await db
    .insert(users)
    .values({
      username,
      usernameNormalized,
      passwordHash,
      isAdmin: Boolean(input.isAdmin),
    })
    .returning();

  return toPublicUser(created);
}

export async function signUpWithPassword(req: Request, input: { username: string; password: string }) {
  const existingCount = await countUsers();
  if (Number.isFinite(MAX_TOTAL_USERS) && existingCount >= MAX_TOTAL_USERS) {
    const err = new Error("Registration is closed for this instance");
    (err as Error & { status?: number }).status = 403;
    throw err;
  }

  const username = input.username.trim();
  const usernameNormalized = normalizeUsername(username);
  if (!usernameNormalized) {
    const err = new Error("Username is required");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }

  const existing = await findUserByNormalizedUsername(usernameNormalized);
  if (existing) {
    const err = new Error("Username is already taken");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }

  const passwordHash = await hashPassword(input.password);
  const [created] = await db
    .insert(users)
    .values({
      username,
      usernameNormalized,
      passwordHash,
      isAdmin: false,
    })
    .returning();

  await setSessionUser(req, created.id);
  const publicUser = toPublicUser(created);
  req.authUser = publicUser;
  clearLoginFailures(req);
  return publicUser;
}

export async function changePasswordForAuthenticatedUser(
  req: Request,
  input: { currentPassword: string; newPassword: string },
) {
  const authUser = req.authUser;
  if (!authUser) {
    const err = new Error("Authentication required");
    (err as Error & { status?: number }).status = 401;
    throw err;
  }

  const user = await findUserById(authUser.id);
  if (!user) {
    const err = new Error("User not found");
    (err as Error & { status?: number }).status = 404;
    throw err;
  }

  const valid = await verifyPassword(input.currentPassword, user.passwordHash);
  if (!valid) {
    const err = new Error("Current password is incorrect");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }

  const passwordHash = await hashPassword(input.newPassword);
  const [updated] = await db
    .update(users)
    .set({
      passwordHash,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id))
    .returning();

  req.authUser = toPublicUser(updated);
  return req.authUser;
}

export async function changeUsernameForAuthenticatedUser(
  req: Request,
  input: { username: string },
) {
  const authUser = req.authUser;
  if (!authUser) {
    const err = new Error("Authentication required");
    (err as Error & { status?: number }).status = 401;
    throw err;
  }

  const nextUsername = input.username.trim();
  const nextUsernameNormalized = normalizeUsername(nextUsername);
  if (!nextUsernameNormalized) {
    const err = new Error("Username is required");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }

  const existing = await findUserByNormalizedUsername(nextUsernameNormalized);
  if (existing && existing.id !== authUser.id) {
    const err = new Error("Username is already taken");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }

  const [updated] = await db
    .update(users)
    .set({
      username: nextUsername,
      usernameNormalized: nextUsernameNormalized,
      updatedAt: new Date(),
    })
    .where(eq(users.id, authUser.id))
    .returning();

  const publicUser = toPublicUser(updated);
  req.authUser = publicUser;
  return publicUser;
}

function readSessionClientMeta(sess: unknown): SessionClientMeta | null {
  if (typeof sess === "string") {
    try {
      return readSessionClientMeta(JSON.parse(sess));
    } catch {
      return null;
    }
  }
  if (!sess || typeof sess !== "object") return null;
  const raw = (sess as Record<string, unknown>).clientMeta;
  if (!raw || typeof raw !== "object") return null;

  const object = raw as Record<string, unknown>;
  const createdAt = typeof object.createdAt === "string" ? object.createdAt : null;
  const lastSeenAt = typeof object.lastSeenAt === "string" ? object.lastSeenAt : null;
  const ip = typeof object.ip === "string" ? object.ip : null;
  const userAgent = typeof object.userAgent === "string" ? object.userAgent : null;
  const browser = typeof object.browser === "string" ? object.browser : null;
  const os = typeof object.os === "string" ? object.os : null;

  if (!createdAt || !lastSeenAt) return null;
  return { createdAt, lastSeenAt, ip, userAgent, browser, os };
}

function maybeRefreshSessionClientMeta(req: Request) {
  if (!req.session) return;
  const existing = req.session.clientMeta ?? null;
  if (!existing) {
    req.session.clientMeta = buildSessionClientMeta(req);
    return;
  }

  const lastSeenMs = Date.parse(existing.lastSeenAt);
  const shouldRefreshTimestamp =
    !Number.isFinite(lastSeenMs) || Date.now() - lastSeenMs >= SESSION_ACTIVITY_UPDATE_MS;
  const missingIdentityBits =
    !existing.ip || !existing.userAgent || !existing.browser || !existing.os;

  if (!shouldRefreshTimestamp && !missingIdentityBits) return;
  req.session.clientMeta = buildSessionClientMeta(req, existing);
}

export async function listActiveSessionsForAuthenticatedUser(req: Request): Promise<ActiveSessionInfo[]> {
  const authUser = req.authUser;
  if (!authUser) {
    const err = new Error("Authentication required");
    (err as Error & { status?: number }).status = 401;
    throw err;
  }

  const result = await pool.query<{ sid: string; sess: unknown; expire: Date | string | null }>(
    'select sid, sess, expire from "session" where (sess->>\'authUserId\') = $1 order by expire desc nulls last',
    [String(authUser.id)],
  );

  return result.rows
    .map((row) => {
      const expireDate =
        row.expire instanceof Date ? row.expire : row.expire ? new Date(row.expire) : null;
      const clientMeta = readSessionClientMeta(row.sess);
      return {
        sid: row.sid,
        isCurrent: row.sid === req.sessionID,
        expiresAt: expireDate && !Number.isNaN(expireDate.getTime()) ? expireDate.toISOString() : null,
        createdAt: clientMeta?.createdAt ?? null,
        lastSeenAt: clientMeta?.lastSeenAt ?? null,
        ip: clientMeta?.ip ?? null,
        browser: clientMeta?.browser ?? null,
        os: clientMeta?.os ?? null,
        userAgent: clientMeta?.userAgent ?? null,
      };
    })
    .sort((a, b) => {
      if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
      const aLast = a.lastSeenAt ? Date.parse(a.lastSeenAt) : 0;
      const bLast = b.lastSeenAt ? Date.parse(b.lastSeenAt) : 0;
      return (Number.isFinite(bLast) ? bLast : 0) - (Number.isFinite(aLast) ? aLast : 0);
    });
}

export async function logoutOtherSessionsForAuthenticatedUser(req: Request) {
  const authUser = req.authUser;
  if (!authUser) {
    const err = new Error("Authentication required");
    (err as Error & { status?: number }).status = 401;
    throw err;
  }

  const currentSid = req.sessionID;
  const result = await pool.query(
    'delete from "session" where (sess->>\'authUserId\') = $1 and sid <> $2',
    [String(authUser.id), currentSid],
  );

  return {
    removedSessions: result.rowCount ?? 0,
  };
}

export async function deleteAuthenticatedUserAccount(
  req: Request,
  res: Response,
  input: { password: string; confirmPhrase: string },
) {
  const authUser = req.authUser;
  if (!authUser) {
    const err = new Error("Authentication required");
    (err as Error & { status?: number }).status = 401;
    throw err;
  }

  if (input.confirmPhrase.trim().toUpperCase() !== "SUPPRIMER") {
    const err = new Error('Type "SUPPRIMER" to confirm account deletion');
    (err as Error & { status?: number }).status = 400;
    throw err;
  }

  const user = await findUserById(authUser.id);
  if (!user) {
    const err = new Error("User not found");
    (err as Error & { status?: number }).status = 404;
    throw err;
  }

  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) {
    const err = new Error("Password is incorrect");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }

  await db.transaction(async (tx) => {
    await tx.delete(habitLogs).where(eq(habitLogs.userId, authUser.id));
    await tx.delete(habits).where(eq(habits.userId, authUser.id));
    await tx.delete(pokegameProfiles).where(eq(pokegameProfiles.userId, authUser.id));
    await tx.delete(users).where(eq(users.id, authUser.id));
  });

  await pool.query('delete from "session" where (sess->>\'authUserId\') = $1', [String(authUser.id)]);
  await logoutSession(req, res);
}

export function requireAuthApi(req: Request, res: Response, next: NextFunction) {
  if (!req.authUser) {
    return res.status(401).json({ message: "Authentication required" });
  }
  return next();
}

export function requireAdminApi(req: Request, res: Response, next: NextFunction) {
  if (!req.authUser) {
    return res.status(401).json({ message: "Authentication required" });
  }
  if (!req.authUser.isAdmin) {
    return res.status(403).json({ message: "Admin access required" });
  }
  return next();
}

declare module "express-session" {
  interface SessionData {
    authUserId?: number;
    clientMeta?: SessionClientMeta;
  }
}

declare global {
  namespace Express {
    interface Request {
      authUser?: PublicAuthUser | null;
    }
  }
}
