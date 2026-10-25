import { inflateRawSync } from "node:zlib";
import { randomUUID } from "node:crypto";
import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
import { syncPokegameIfInitialized } from "./pokegame";
import { habitLogs, habits, pokegameProfiles } from "@shared/schema";
import type { DataExportPayload } from "@shared/routes";
import {
  doesQuantifiableValueMeetGoal,
  parseQuantifiableValueToComparable,
  type HabitFrequencyPeriod,
  type HabitGoalType,
  type HabitQuantUnitPreset,
  type HabitTrackingType,
} from "@shared/habit-config";

const ZIP_LOCAL_FILE_HEADER_SIG = 0x04034b50;
const ZIP_CENTRAL_DIR_HEADER_SIG = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIR_SIG = 0x06054b50;
const MAX_IMPORT_FILE_BYTES = 20 * 1024 * 1024;
const SQLITE_FILE_HEADER = "SQLite format 3\u0000";

const internalImportSchema = z.object({
  format: z.literal("pixel-heart-export-v1"),
  habits: z.array(
    z.object({
      id: z.number().int().positive(),
      title: z.string().min(1).max(100),
      description: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
      trackingType: z.enum(["yes_no", "quantifiable"]).optional(),
      frequencyCount: z.number().int().positive().optional(),
      frequencyPeriod: z.enum(["day", "week", "month", "quarter", "year"]).optional(),
      quantUnitPreset: z.enum(["count", "km", "hours", "minutes", "time_of_day", "custom"]).nullable().optional(),
      quantUnitCustom: z.string().nullable().optional(),
      quantTargetValue: z.string().nullable().optional(),
      quantGoalType: z.enum(["at_least", "at_most"]).nullable().optional(),
      color: z.string().min(1).max(32),
      icon: z.string().min(1).max(128).optional(),
      sortOrder: z.number().int().optional(),
      createdAt: z.string().optional(),
    }),
  ),
  habitLogs: z.array(
    z.object({
      habitId: z.number().int().positive(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      completed: z.boolean(),
      status: z.enum(["clear", "done", "skipped", "recorded"]).optional(),
      valueText: z.string().nullable().optional(),
      updatedAt: z.string().optional(),
    }),
  ),
  pokegameProfile: z.record(z.any()).nullable().optional(),
});

type ImportHabitDraft = {
  sourceKey: string;
  title: string;
  description: string | null;
  notes: string | null;
  trackingType: "yes_no" | "quantifiable";
  frequencyCount: number;
  frequencyPeriod: "day" | "week" | "month" | "quarter" | "year";
  quantUnitPreset: "count" | "km" | "hours" | "minutes" | "time_of_day" | "custom" | null;
  quantUnitCustom: string | null;
  quantTargetValue: string | null;
  quantGoalType: "at_least" | "at_most" | null;
  color: string;
  icon: string;
  sortOrder: number;
  createdAt?: Date;
};

type ImportHabitLogDraft = {
  sourceHabitKey: string;
  date: string;
  completed: boolean;
  status: "clear" | "done" | "skipped" | "recorded";
  valueText: string | null;
  updatedAt?: Date;
};

type ImportReplacePayload = {
  habits: ImportHabitDraft[];
  habitLogs: ImportHabitLogDraft[];
  pokegameProfile?: Record<string, unknown> | null;
};

type ImportSummary = {
  format: "pixel-heart-json" | "loop-habitudes-csv-zip";
  habitsImported: number;
  logsImported: number;
  pokegameImported: boolean;
};

type ImportReviewFrequencyConfidence = "high" | "medium" | "low";

type ImportReviewHabitItem = {
  sourceKey: string;
  title: string;
  trackingType: "yes_no" | "quantifiable";
  frequencyCount: number;
  frequencyPeriod: HabitFrequencyPeriod;
  frequencyConfidence: ImportReviewFrequencyConfidence;
  frequencyOriginalNumerator: number | null;
  frequencyOriginalDenominator: number | null;
  frequencyReviewReason: string | null;
  quantUnitPreset: HabitQuantUnitPreset | null;
  quantUnitCustom: string | null;
  quantTargetValue: string | null;
  quantGoalType: HabitGoalType | null;
  sampleValues: string[];
  requiresReview: boolean;
};

type ImportParseResult = {
  format: ImportSummary["format"];
  payload: ImportReplacePayload;
  reviewItems: ImportReviewHabitItem[];
};

type ImportStage = {
  userId: number;
  expiresAtMs: number;
  replaceExisting: boolean;
  parsed: ImportParseResult;
};

const IMPORT_STAGE_TTL_MS = 30 * 60 * 1000;
const importStageStore = new Map<string, ImportStage>();

const IMPORT_COLOR_CYCLE = [
  "#f87171",
  "#fb923c",
  "#facc15",
  "#4ade80",
  "#22d3ee",
  "#60a5fa",
  "#c084fc",
];

function parseDateSafe(value?: string | null) {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function decodeImportFileBuffer(fileBase64: string) {
  const fileBuffer = Buffer.from(fileBase64, "base64");
  if (!fileBuffer.length) {
    throw new Error("Import file is empty");
  }
  if (fileBuffer.length > MAX_IMPORT_FILE_BYTES) {
    throw new Error("Import file is too large");
  }
  return fileBuffer;
}

function normalizeLoopHabitTitle(folderName: string) {
  const withoutIndex = folderName.replace(/^\d+\s+/, "").trim();
  return withoutIndex || folderName.trim() || "Imported Habit";
}

function normalizeLoopText(value?: string | null) {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeLoopNumberString(value?: string | null) {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(",", ".");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return trimmed;
  if (Number.isInteger(parsed)) return String(parsed);
  return String(parsed);
}

function parseLoopInt(value?: string | null) {
  const parsed = Number.parseInt((value ?? "").trim(), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapLoopFrequencyToHabitGoal(
  numeratorRaw?: string | null,
  denominatorRaw?: string | null,
): {
  frequencyCount: number;
  frequencyPeriod: HabitFrequencyPeriod;
  confidence: ImportReviewFrequencyConfidence;
  numerator: number;
  denominator: number;
  reviewReason: string | null;
} {
  const numerator = Math.max(1, parseLoopInt(numeratorRaw) ?? 1);
  const denominator = Math.max(1, parseLoopInt(denominatorRaw) ?? 1);

  if (denominator === 1) {
    return {
      frequencyCount: numerator,
      frequencyPeriod: "day",
      confidence: "high",
      numerator,
      denominator,
      reviewReason: null,
    };
  }
  if (denominator === 7) {
    return {
      frequencyCount: numerator,
      frequencyPeriod: "week",
      confidence: "high",
      numerator,
      denominator,
      reviewReason: null,
    };
  }
  if ([28, 29, 30, 31].includes(denominator)) {
    return {
      frequencyCount: numerator,
      frequencyPeriod: "month",
      confidence: "high",
      numerator,
      denominator,
      reviewReason: null,
    };
  }
  if ([90, 91, 92].includes(denominator)) {
    return {
      frequencyCount: numerator,
      frequencyPeriod: "quarter",
      confidence: "high",
      numerator,
      denominator,
      reviewReason: null,
    };
  }
  if ([365, 366].includes(denominator)) {
    return {
      frequencyCount: numerator,
      frequencyPeriod: "year",
      confidence: "high",
      numerator,
      denominator,
      reviewReason: null,
    };
  }

  const canonicalTargets: Array<{ period: HabitFrequencyPeriod; days: number }> = [
    { period: "day", days: 1 },
    { period: "week", days: 7 },
    { period: "month", days: 30 },
    { period: "quarter", days: 91 },
    { period: "year", days: 365 },
  ];

  const closest = canonicalTargets.reduce((best, candidate) => {
    const bestScore = Math.abs(best.days - denominator) / best.days;
    const candidateScore = Math.abs(candidate.days - denominator) / candidate.days;
    return candidateScore < bestScore ? candidate : best;
  });

  const scaledCount = Math.max(1, Math.round((numerator * closest.days) / denominator));
  const ratioError = Math.abs((scaledCount / closest.days) - (numerator / denominator));
  const confidence: ImportReviewFrequencyConfidence = ratioError <= 0.03
    ? "medium"
    : "low";

  return {
    frequencyCount: Math.min(999, scaledCount),
    frequencyPeriod: closest.period,
    confidence,
    numerator,
    denominator,
    reviewReason:
      confidence === "high"
        ? null
        : `Mapped ${numerator}/${denominator} days to ${Math.min(999, scaledCount)}/${closest.period} (best effort)`,
  };
}

function mapLoopQuantUnitPreset(unitRaw?: string | null, targetValueRaw?: string | null): {
  quantUnitPreset: HabitQuantUnitPreset | null;
  quantUnitCustom: string | null;
} {
  const unit = (unitRaw ?? "").trim();
  if (!unit) return { quantUnitPreset: "count", quantUnitCustom: null };

  const unitLower = unit.toLowerCase();
  if (["km", "kilometer", "kilometers", "kilomètre", "kilomètres"].includes(unitLower)) {
    return { quantUnitPreset: "km", quantUnitCustom: null };
  }
  if (["h", "hr", "hrs", "hour", "hours", "heure", "heures"].includes(unitLower)) {
    const target = (targetValueRaw ?? "").trim();
    if (/^\d{1,2}:\d{2}$/.test(target)) {
      return { quantUnitPreset: "time_of_day", quantUnitCustom: null };
    }
    return { quantUnitPreset: "hours", quantUnitCustom: null };
  }
  if (["min", "mins", "minute", "minutes"].includes(unitLower)) {
    return { quantUnitPreset: "minutes", quantUnitCustom: null };
  }
  if (/^hh:mm$/i.test(unitLower) || unitLower.includes("heure") && unitLower.includes("jour")) {
    return { quantUnitPreset: "time_of_day", quantUnitCustom: null };
  }

  return {
    quantUnitPreset: "custom",
    quantUnitCustom: unit.slice(0, 30),
  };
}

function mapLoopGoalType(targetTypeRaw?: string | null): HabitGoalType | null {
  const normalized = (targetTypeRaw ?? "").trim().toUpperCase();
  if (!normalized) return null;
  if (normalized === "AT_MOST") return "at_most";
  if (normalized === "AT_LEAST") return "at_least";
  return null;
}

function mapLoopTrackingType(typeRaw?: string | null): HabitTrackingType {
  const normalized = (typeRaw ?? "").trim().toUpperCase();
  return normalized === "NUMERICAL" ? "quantifiable" : "yes_no";
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        value += '"';
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && char === ",") {
      row.push(value);
      value = "";
      continue;
    }

    if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(value);
      value = "";
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      continue;
    }

    value += char;
  }

  if (value.length > 0 || row.length > 0) {
    row.push(value);
    if (row.some((cell) => cell.length > 0)) rows.push(row);
  }

  return rows;
}

function normalizeImportedDate(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  if (/^\d{8}$/.test(trimmed)) {
    return `${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6, 8)}`;
  }

  if (/^\d+$/.test(trimmed)) {
    const numeric = Number(trimmed);
    if (!Number.isFinite(numeric)) return null;
    const asMs = numeric > 1_000_000_000_000 ? numeric : numeric * 1000;
    const d = new Date(asMs);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function isLoopCompletedStatus(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized === "2" || normalized === "true" || normalized === "yes" || normalized === "x";
}

function isLoopSkippedStatus(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "skip" || normalized === "skipped";
}

function isLikelyLoopHeaderRow(row: string[]) {
  const first = row[0]?.trim().toLowerCase() ?? "";
  const second = row[1]?.trim().toLowerCase() ?? "";
  return (
    first.includes("date") ||
    first.includes("timestamp") ||
    second.includes("check") ||
    second.includes("value") ||
    second.includes("status")
  );
}

function findZipEndOfCentralDirectory(buffer: Buffer) {
  const minOffset = Math.max(0, buffer.length - 0xffff - 22);
  for (let i = buffer.length - 22; i >= minOffset; i -= 1) {
    if (buffer.readUInt32LE(i) === ZIP_END_OF_CENTRAL_DIR_SIG) {
      return i;
    }
  }
  throw new Error("Invalid ZIP: end of central directory not found");
}

function parseZipEntries(buffer: Buffer) {
  const eocdOffset = findZipEndOfCentralDirectory(buffer);
  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirSize = buffer.readUInt32LE(eocdOffset + 12);
  const centralDirOffset = buffer.readUInt32LE(eocdOffset + 16);

  const entries = new Map<string, Buffer>();
  let offset = centralDirOffset;
  const centralDirEnd = centralDirOffset + centralDirSize;

  for (let entryIndex = 0; entryIndex < totalEntries && offset < centralDirEnd; entryIndex += 1) {
    if (buffer.readUInt32LE(offset) !== ZIP_CENTRAL_DIR_HEADER_SIG) {
      throw new Error("Invalid ZIP: corrupted central directory");
    }

    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);

    const fileName = buffer
      .subarray(offset + 46, offset + 46 + fileNameLength)
      .toString("utf8")
      .replace(/\\/g, "/");

    offset += 46 + fileNameLength + extraLength + commentLength;
    if (!fileName || fileName.endsWith("/")) continue;

    if (buffer.readUInt32LE(localHeaderOffset) !== ZIP_LOCAL_FILE_HEADER_SIG) {
      throw new Error(`Invalid ZIP: local header missing for ${fileName}`);
    }

    const localFileNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localFileNameLength + localExtraLength;
    const compressedData = buffer.subarray(dataStart, dataStart + compressedSize);

    let content: Buffer;
    if (compressionMethod === 0) {
      content = Buffer.from(compressedData);
    } else if (compressionMethod === 8) {
      content = inflateRawSync(compressedData);
    } else {
      throw new Error(`Unsupported ZIP compression method (${compressionMethod}) for ${fileName}`);
    }

    entries.set(fileName, content);
  }

  return entries;
}

function parseLoopCsvZipImport(fileBuffer: Buffer): ImportParseResult {
  const zipEntries = parseZipEntries(fileBuffer);
  const habitsCsvEntry = Array.from(zipEntries.entries()).find(([path]) => /(^|\/)Habits\.csv$/i.test(path));
  const checkmarkEntries = Array.from(zipEntries.entries())
    .filter(([path]) => /(^|\/)Checkmarks\.csv$/i.test(path) && path.split("/").filter(Boolean).length >= 2)
    .sort(([a], [b]) => a.localeCompare(b));

  if (!habitsCsvEntry && checkmarkEntries.length === 0) {
    throw new Error("No Loop/Habitudes Habits.csv or per-habit Checkmarks.csv files found in ZIP");
  }

  type LoopHabitMeta = {
    position: string | null;
    name: string;
    question: string | null;
    description: string | null;
    type: HabitTrackingType;
    frequencyCount: number;
    frequencyPeriod: HabitFrequencyPeriod;
    frequencyConfidence: ImportReviewFrequencyConfidence;
    frequencyOriginalNumerator: number;
    frequencyOriginalDenominator: number;
    frequencyReviewReason: string | null;
    color: string | null;
    quantUnitPreset: HabitQuantUnitPreset | null;
    quantUnitCustom: string | null;
    quantTargetValue: string | null;
    quantGoalType: HabitGoalType | null;
    archived: boolean;
    sortOrder: number;
  };

  const loopHabitsByPosition = new Map<string, LoopHabitMeta>();
  const loopHabitsByName = new Map<string, LoopHabitMeta>();
  const rootHabitsInOrder: LoopHabitMeta[] = [];

  if (habitsCsvEntry) {
    const [, habitsCsvContent] = habitsCsvEntry;
    const rows = parseCsv(habitsCsvContent.toString("utf8"));
    const [headerRow, ...bodyRows] = rows;
    const headers = (headerRow ?? []).map((h) => h.trim().toLowerCase());
    const headerIndex = (name: string) => headers.findIndex((h) => h === name.toLowerCase());

    for (const [index, row] of bodyRows.entries()) {
      const position = normalizeLoopText(row[headerIndex("Position")]) ?? String(index + 1).padStart(3, "0");
      const name = normalizeLoopText(row[headerIndex("Name")]) ?? `Imported Habit ${position}`;
      const question = normalizeLoopText(row[headerIndex("Question")]);
      const description = normalizeLoopText(row[headerIndex("Description")]);
      const trackingType = mapLoopTrackingType(row[headerIndex("Type")]);
      const frequencyMapping = mapLoopFrequencyToHabitGoal(
        row[headerIndex("FrequencyNumerator")],
        row[headerIndex("FrequencyDenominator")],
      );
      const targetValue = normalizeLoopNumberString(row[headerIndex("Target Value")]);
      const unitMapping = mapLoopQuantUnitPreset(row[headerIndex("Unit")], targetValue);
      const goalType = mapLoopGoalType(row[headerIndex("Target Type")]);
      const archivedRaw = (row[headerIndex("Archived?")] ?? "").trim().toLowerCase();
      const colorRaw = normalizeLoopText(row[headerIndex("Color")]);

      const meta: LoopHabitMeta = {
        position,
        name,
        question,
        description,
        type: trackingType,
        frequencyCount: frequencyMapping.frequencyCount,
        frequencyPeriod: frequencyMapping.frequencyPeriod,
        frequencyConfidence: frequencyMapping.confidence,
        frequencyOriginalNumerator: frequencyMapping.numerator,
        frequencyOriginalDenominator: frequencyMapping.denominator,
        frequencyReviewReason: frequencyMapping.reviewReason,
        color: colorRaw && /^#[0-9a-f]{6}$/i.test(colorRaw) ? colorRaw : null,
        quantUnitPreset: trackingType === "quantifiable" ? unitMapping.quantUnitPreset : null,
        quantUnitCustom: trackingType === "quantifiable" ? unitMapping.quantUnitCustom : null,
        quantTargetValue: trackingType === "quantifiable" ? targetValue : null,
        quantGoalType: trackingType === "quantifiable" ? goalType : null,
        archived: archivedRaw === "true",
        sortOrder: index,
      };

      loopHabitsByPosition.set(position, meta);
      loopHabitsByName.set(name.trim().toLowerCase(), meta);
      rootHabitsInOrder.push(meta);
    }
  }

  const habitsDrafts: ImportHabitDraft[] = [];
  const logsDrafts: ImportHabitLogDraft[] = [];
  const habitDraftBySourceKey = new Map<string, ImportHabitDraft>();
  const reviewBySourceKey = new Map<string, ImportReviewHabitItem>();

  const ensureHabitDraft = (
    sourceKey: string,
    fallbackIndex: number,
    fallbackFolderName: string,
    meta?: LoopHabitMeta | null,
  ) => {
    const existing = habitDraftBySourceKey.get(sourceKey);
    if (existing) return existing;

    const title = meta?.name ?? normalizeLoopHabitTitle(fallbackFolderName);
    const habitDraft: ImportHabitDraft = {
      sourceKey,
      title,
      description: meta?.question ?? (meta?.description ? meta.description.slice(0, 100) : "Imported from Habitudes (Loop CSV)"),
      notes: meta?.description ?? null,
      trackingType: meta?.type ?? "yes_no",
      frequencyCount: meta?.frequencyCount ?? 1,
      frequencyPeriod: meta?.frequencyPeriod ?? "day",
      quantUnitPreset: meta?.type === "quantifiable" ? (meta.quantUnitPreset ?? "count") : null,
      quantUnitCustom: meta?.type === "quantifiable" ? (meta.quantUnitCustom ?? null) : null,
      quantTargetValue: meta?.type === "quantifiable" ? (meta.quantTargetValue ?? null) : null,
      quantGoalType: meta?.type === "quantifiable" ? (meta.quantGoalType ?? "at_least") : null,
      color: meta?.color ?? IMPORT_COLOR_CYCLE[fallbackIndex % IMPORT_COLOR_CYCLE.length] ?? "#60a5fa",
      icon: "White.png",
      sortOrder: meta?.sortOrder ?? fallbackIndex,
    };

    habitDraftBySourceKey.set(sourceKey, habitDraft);
    habitsDrafts.push(habitDraft);

    reviewBySourceKey.set(sourceKey, {
      sourceKey,
      title,
      trackingType: habitDraft.trackingType,
      frequencyCount: habitDraft.frequencyCount,
      frequencyPeriod: habitDraft.frequencyPeriod,
      frequencyConfidence: meta?.frequencyConfidence ?? "high",
      frequencyOriginalNumerator: meta?.frequencyOriginalNumerator ?? null,
      frequencyOriginalDenominator: meta?.frequencyOriginalDenominator ?? null,
      frequencyReviewReason: meta?.frequencyReviewReason ?? null,
      quantUnitPreset: habitDraft.quantUnitPreset,
      quantUnitCustom: habitDraft.quantUnitCustom,
      quantTargetValue: habitDraft.quantTargetValue,
      quantGoalType: habitDraft.quantGoalType,
      sampleValues: [],
      requiresReview:
        habitDraft.trackingType === "quantifiable" ||
        (meta?.frequencyConfidence != null && meta.frequencyConfidence !== "high"),
    });

    return habitDraft;
  };

  for (const [index, [entryPath, content]] of checkmarkEntries.entries()) {
    const pathParts = entryPath.split("/").filter(Boolean);
    const folderName = pathParts[pathParts.length - 2] ?? `Habit ${index + 1}`;
    const folderPositionMatch = folderName.match(/^(\d{1,4})\b/);
    const folderPosition = folderPositionMatch?.[1] ?? null;
    const folderHabitName = normalizeLoopHabitTitle(folderName);
    const matchedMeta =
      (folderPosition ? loopHabitsByPosition.get(folderPosition) : null) ??
      loopHabitsByName.get(folderHabitName.trim().toLowerCase()) ??
      null;
    const sourceKey = matchedMeta?.position ? `loop:${matchedMeta.position}` : `loop:${entryPath}`;
    const habitDraft = ensureHabitDraft(sourceKey, index, folderName, matchedMeta);

    const csvRows = parseCsv(content.toString("utf8"));
    const rows = csvRows.length > 0 && isLikelyLoopHeaderRow(csvRows[0] ?? []) ? csvRows.slice(1) : csvRows;
    for (const row of rows) {
      const dateKey = normalizeImportedDate(row[0] ?? "");
      if (!dateKey) continue;
      const valueRaw = (row[1] ?? "").trim();
      if (!valueRaw) continue;

      if (habitDraft.trackingType === "quantifiable") {
        if (isLoopSkippedStatus(valueRaw)) {
          logsDrafts.push({
            sourceHabitKey: sourceKey,
            date: dateKey,
            completed: false,
            status: "skipped",
            valueText: null,
          });
          continue;
        }

        const normalizedValue = normalizeLoopNumberString(valueRaw) ?? valueRaw;
        const reviewItem = reviewBySourceKey.get(sourceKey);
        if (reviewItem && reviewItem.sampleValues.length < 5 && !reviewItem.sampleValues.includes(normalizedValue)) {
          reviewItem.sampleValues.push(normalizedValue);
        }
        const completed = doesQuantifiableValueMeetGoal(habitDraft, normalizedValue);
        logsDrafts.push({
          sourceHabitKey: sourceKey,
          date: dateKey,
          completed,
          status: completed ? "done" : "recorded",
          valueText: normalizedValue,
        });
        continue;
      }

      if (isLoopSkippedStatus(valueRaw)) {
        logsDrafts.push({
          sourceHabitKey: sourceKey,
          date: dateKey,
          completed: false,
          status: "skipped",
          valueText: null,
        });
        continue;
      }
      if (!isLoopCompletedStatus(valueRaw)) continue;

      logsDrafts.push({
        sourceHabitKey: sourceKey,
        date: dateKey,
        completed: true,
        status: "done",
        valueText: null,
      });
    }
  }

  // Import habits present in Habits.csv even if they currently have no per-habit Checkmarks.csv rows.
  rootHabitsInOrder.forEach((meta, index) => {
    const sourceKey = `loop:${meta.position ?? String(index + 1)}`;
    ensureHabitDraft(sourceKey, index, meta.name, meta);
  });

  habitsDrafts.sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));

  return {
    format: "loop-habitudes-csv-zip",
    payload: {
      habits: habitsDrafts,
      habitLogs: logsDrafts,
    },
    reviewItems: Array.from(reviewBySourceKey.values()).sort(
      (a, b) => Number(b.requiresReview) - Number(a.requiresReview) || a.title.localeCompare(b.title),
    ),
  };
}

function parsePixelHeartJsonImport(fileBuffer: Buffer): ImportParseResult {
  const rawText = fileBuffer.toString("utf8");
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawText);
  } catch {
    throw new Error("Invalid JSON file");
  }

  const parsed = internalImportSchema.parse(parsedJson);

  const habitKeyByLegacyId = new Map<number, string>();
  const habitsDrafts: ImportHabitDraft[] = parsed.habits
    .slice()
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id)
    .map((habit, index) => {
      const sourceKey = `json:${habit.id}`;
      habitKeyByLegacyId.set(habit.id, sourceKey);
      return {
        sourceKey,
        title: habit.title,
        description: habit.description ?? null,
        notes: habit.notes ?? null,
        trackingType: habit.trackingType ?? "yes_no",
        frequencyCount: habit.frequencyCount ?? 1,
        frequencyPeriod: habit.frequencyPeriod ?? "day",
        quantUnitPreset: habit.quantUnitPreset ?? null,
        quantUnitCustom: habit.quantUnitCustom ?? null,
        quantTargetValue: habit.quantTargetValue ?? null,
        quantGoalType: habit.quantGoalType ?? null,
        color: habit.color,
        icon: habit.icon ?? "White.png",
        sortOrder: habit.sortOrder ?? index,
        createdAt: parseDateSafe(habit.createdAt),
      };
    });

  const logsDrafts: ImportHabitLogDraft[] = [];
  for (const log of parsed.habitLogs) {
    const sourceHabitKey = habitKeyByLegacyId.get(log.habitId);
    if (!sourceHabitKey) continue;
    logsDrafts.push({
      sourceHabitKey,
      date: log.date,
      completed: log.completed,
      status: log.status ?? (log.completed ? "done" : "clear"),
      valueText: log.valueText ?? null,
      updatedAt: parseDateSafe(log.updatedAt),
    });
  }

  return {
    format: "pixel-heart-json",
    payload: {
      habits: habitsDrafts,
      habitLogs: logsDrafts,
      pokegameProfile: parsed.pokegameProfile ?? null,
    },
    reviewItems: [],
  };
}

async function replaceUserTrackerData(userId: number, payload: ImportReplacePayload, replaceExisting = true) {
  const uniqueHabits = payload.habits;
  const importableLogs = payload.habitLogs.filter((log) => log.status !== "clear");
  let insertedLogCount = 0;

  await db.transaction(async (tx) => {
    let sortOrderOffset = 0;
    if (replaceExisting) {
      await tx.delete(habitLogs).where(eq(habitLogs.userId, userId));
      await tx.delete(habits).where(eq(habits.userId, userId));
    } else {
      const [maxRow] = await tx
        .select({ maxSortOrder: sql<number>`coalesce(max(${habits.sortOrder}), -1)` })
        .from(habits)
        .where(eq(habits.userId, userId));
      sortOrderOffset = (maxRow?.maxSortOrder ?? -1) + 1;
    }

    const newHabitIdBySourceKey = new Map<string, number>();
    for (const habit of uniqueHabits) {
      const [inserted] = await tx
        .insert(habits)
        .values({
          userId,
          title: habit.title,
          description: habit.description,
          notes: habit.notes,
          trackingType: habit.trackingType,
          frequencyCount: habit.frequencyCount,
          frequencyPeriod: habit.frequencyPeriod,
          quantUnitPreset: habit.quantUnitPreset,
          quantUnitCustom: habit.quantUnitCustom,
          quantTargetValue: habit.quantTargetValue,
          quantGoalType: habit.quantGoalType,
          color: habit.color,
          icon: habit.icon,
          sortOrder: habit.sortOrder + sortOrderOffset,
          createdAt: habit.createdAt ?? new Date(),
        })
        .returning();
      newHabitIdBySourceKey.set(habit.sourceKey, inserted.id);
    }

    const dedupeLogs = new Map<string, ImportHabitLogDraft>();
    for (const log of importableLogs) {
      const habitId = newHabitIdBySourceKey.get(log.sourceHabitKey);
      if (!habitId) continue;
      dedupeLogs.set(`${habitId}:${log.date}`, log);
    }

    for (const [compoundKey, log] of dedupeLogs.entries()) {
      const habitId = Number(compoundKey.split(":")[0]);
      await tx.insert(habitLogs).values({
        userId,
        habitId,
        date: log.date,
        completed: log.completed,
        status: log.status,
        valueText: log.valueText ?? null,
        updatedAt: log.updatedAt ?? new Date(),
      });
      insertedLogCount += 1;
    }

    if (replaceExisting && payload.pokegameProfile) {
      await tx.delete(pokegameProfiles).where(eq(pokegameProfiles.userId, userId));
      const profile = payload.pokegameProfile;
      const sanitizedProfile = {
        ...profile,
        userId,
        id: undefined,
        createdAt: undefined,
        updatedAt: undefined,
      } as any;
      delete sanitizedProfile.id;
      delete sanitizedProfile.createdAt;
      delete sanitizedProfile.updatedAt;
      await tx.insert(pokegameProfiles).values(sanitizedProfile);
    }
  });

  return {
    habitsImported: uniqueHabits.length,
    logsImported: insertedLogCount,
    pokegameImported: Boolean(replaceExisting && payload.pokegameProfile),
  };
}

function cleanupExpiredImportStages() {
  const now = Date.now();
  for (const [token, stage] of importStageStore.entries()) {
    if (stage.expiresAtMs <= now) {
      importStageStore.delete(token);
    }
  }
}

function buildImportSummaryFromParsed(parsed: ImportParseResult, replaceExisting: boolean): ImportSummary {
  const importableLogs = parsed.payload.habitLogs.filter((log) => log.status !== "clear");
  return {
    format: parsed.format,
    habitsImported: parsed.payload.habits.length,
    logsImported: importableLogs.length,
    pokegameImported: Boolean(replaceExisting && parsed.payload.pokegameProfile),
  };
}

function parseImportBuffer(fileBuffer: Buffer): ImportParseResult {
  if (
    fileBuffer.length >= SQLITE_FILE_HEADER.length &&
    fileBuffer.subarray(0, SQLITE_FILE_HEADER.length).toString("utf8") === SQLITE_FILE_HEADER
  ) {
    throw new Error("Loop/Habitudes full backup (.db) import is not supported yet. Please export/import the CSV ZIP file instead.");
  }

  if (
    fileBuffer.length >= 4 &&
    (fileBuffer.readUInt32LE(0) === ZIP_LOCAL_FILE_HEADER_SIG || fileBuffer.readUInt32LE(0) === ZIP_END_OF_CENTRAL_DIR_SIG)
  ) {
    return parseLoopCsvZipImport(fileBuffer);
  }

  return parsePixelHeartJsonImport(fileBuffer);
}

type ImportReviewOverrideInput = {
  sourceKey: string;
  frequencyCount?: number;
  frequencyPeriod?: HabitFrequencyPeriod;
  quantUnitPreset?: HabitQuantUnitPreset | null;
  quantUnitCustom?: string | null;
  quantTargetValue?: string | null;
  quantGoalType?: HabitGoalType | null;
};

function cloneImportPayload(payload: ImportReplacePayload): ImportReplacePayload {
  return {
    habits: payload.habits.map((habit) => ({ ...habit })),
    habitLogs: payload.habitLogs.map((log) => ({ ...log })),
    pokegameProfile: payload.pokegameProfile ? { ...payload.pokegameProfile } : payload.pokegameProfile,
  };
}

function applyImportReviewOverrides(payload: ImportReplacePayload, overrides: ImportReviewOverrideInput[] | undefined) {
  if (!overrides || overrides.length === 0) return payload;

  const nextPayload = cloneImportPayload(payload);
  const overrideBySourceKey = new Map(overrides.map((override) => [override.sourceKey, override]));
  const habitBySourceKey = new Map<string, ImportHabitDraft>();

  for (const habit of nextPayload.habits) {
    const override = overrideBySourceKey.get(habit.sourceKey);
    if (!override) {
      habitBySourceKey.set(habit.sourceKey, habit);
      continue;
    }

    if (override.frequencyCount != null) {
      habit.frequencyCount = Math.max(1, Math.min(999, Math.floor(override.frequencyCount)));
    }
    if (override.frequencyPeriod) {
      habit.frequencyPeriod = override.frequencyPeriod;
    }
    if (habit.trackingType === "quantifiable") {
      if (override.quantUnitPreset !== undefined) {
        habit.quantUnitPreset = override.quantUnitPreset;
      }
      if (override.quantUnitCustom !== undefined) {
        habit.quantUnitCustom = override.quantUnitCustom?.trim() ? override.quantUnitCustom.trim().slice(0, 30) : null;
      }
      if (override.quantTargetValue !== undefined) {
        habit.quantTargetValue = override.quantTargetValue?.trim() ? override.quantTargetValue.trim().slice(0, 32) : null;
      }
      if (override.quantGoalType !== undefined) {
        habit.quantGoalType = override.quantGoalType;
      }
    }

    habitBySourceKey.set(habit.sourceKey, habit);
  }

  for (const log of nextPayload.habitLogs) {
    const habit = habitBySourceKey.get(log.sourceHabitKey);
    if (!habit || habit.trackingType !== "quantifiable") continue;
    if (log.status === "skipped") continue;
    if (!log.valueText) continue;
    const completed = doesQuantifiableValueMeetGoal(habit, log.valueText);
    log.completed = completed;
    log.status = completed ? "done" : "recorded";
  }

  return nextPayload;
}

export async function previewUserDataImportFromBase64(input: {
  userId: number;
  fileName: string;
  fileBase64: string;
  replaceExisting?: boolean;
}) {
  const fileBuffer = decodeImportFileBuffer(input.fileBase64);

  cleanupExpiredImportStages();

  const parsed = parseImportBuffer(fileBuffer);
  const replaceExisting = input.replaceExisting ?? true;
  const token = randomUUID();
  const now = Date.now();
  const stage: ImportStage = {
    userId: input.userId,
    expiresAtMs: now + IMPORT_STAGE_TTL_MS,
    replaceExisting,
    parsed,
  };
  importStageStore.set(token, stage);

  const reviewItems = parsed.reviewItems;
  const reviewItemsNeedingAttention = reviewItems.filter((item) => item.requiresReview);
  const reviewSummary = {
    totalHabits: parsed.payload.habits.length,
    totalReviewItems: reviewItemsNeedingAttention.length,
    quantifiableCount: reviewItems.filter((item) => item.trackingType === "quantifiable").length,
    lowConfidenceCount: reviewItems.filter((item) => item.frequencyConfidence === "low").length,
  };

  return {
    stageToken: token,
    format: parsed.format,
    expiresAt: new Date(stage.expiresAtMs).toISOString(),
    summary: buildImportSummaryFromParsed(parsed, replaceExisting),
    reviewSummary,
    reviewItems,
  };
}

export async function commitUserDataImportStage(input: {
  userId: number;
  stageToken: string;
  overrides?: ImportReviewOverrideInput[];
}) {
  cleanupExpiredImportStages();
  const stage = importStageStore.get(input.stageToken);
  if (!stage || stage.userId !== input.userId) {
    throw new Error("Import preview expired or not found");
  }
  if (stage.expiresAtMs <= Date.now()) {
    importStageStore.delete(input.stageToken);
    throw new Error("Import preview expired or not found");
  }

  const payload = applyImportReviewOverrides(stage.parsed.payload, input.overrides);
  const importResult = await replaceUserTrackerData(input.userId, payload, stage.replaceExisting);
  await syncPokegameIfInitialized(input.userId);
  importStageStore.delete(input.stageToken);

  return {
    format: stage.parsed.format,
    ...importResult,
  } satisfies ImportSummary;
}

export async function buildUserDataExport(
  userId: number,
  userMeta: { username: string; isAdmin: boolean },
  includePokegame = true,
): Promise<DataExportPayload> {
  const userHabits = await db
    .select()
    .from(habits)
    .where(eq(habits.userId, userId))
    .orderBy(asc(habits.sortOrder), asc(habits.createdAt), asc(habits.id));

  const userHabitLogs = await db
    .select()
    .from(habitLogs)
    .where(eq(habitLogs.userId, userId))
    .orderBy(asc(habitLogs.habitId), asc(habitLogs.date), asc(habitLogs.id));

  const [profile] = includePokegame
    ? await db.select().from(pokegameProfiles).where(eq(pokegameProfiles.userId, userId)).limit(1)
    : [null];

  return {
    format: "pixel-heart-export-v1",
    exportedAt: new Date().toISOString(),
    user: userMeta,
    habits: userHabits.map((habit) => ({
      id: habit.id,
      title: habit.title,
      description: habit.description ?? null,
      notes: (habit as typeof habit & { notes?: string | null }).notes ?? null,
      trackingType: (habit as typeof habit & { trackingType?: string | null }).trackingType ?? "yes_no",
      frequencyCount: (habit as typeof habit & { frequencyCount?: number | null }).frequencyCount ?? 1,
      frequencyPeriod: (habit as typeof habit & { frequencyPeriod?: string | null }).frequencyPeriod ?? "day",
      quantUnitPreset: (habit as typeof habit & { quantUnitPreset?: string | null }).quantUnitPreset ?? null,
      quantUnitCustom: (habit as typeof habit & { quantUnitCustom?: string | null }).quantUnitCustom ?? null,
      quantTargetValue: (habit as typeof habit & { quantTargetValue?: string | null }).quantTargetValue ?? null,
      quantGoalType: (habit as typeof habit & { quantGoalType?: string | null }).quantGoalType ?? null,
      color: habit.color,
      icon: habit.icon,
      sortOrder: habit.sortOrder,
      createdAt: habit.createdAt.toISOString(),
    })),
    habitLogs: userHabitLogs.map((log) => ({
      habitId: log.habitId,
      date: log.date,
      completed: log.completed,
      status: (log as typeof log & { status?: string | null }).status ?? (log.completed ? "done" : "clear"),
      valueText: (log as typeof log & { valueText?: string | null }).valueText ?? null,
      updatedAt: log.updatedAt.toISOString(),
    })),
    pokegameProfile: includePokegame && profile
      ? {
          ...profile,
          id: undefined,
          userId: undefined,
          createdAt: profile.createdAt.toISOString(),
          updatedAt: profile.updatedAt.toISOString(),
          activatedAt: profile.activatedAt.toISOString(),
          currentCycleStartedAt: profile.currentCycleStartedAt.toISOString(),
          currentCreatureHatchedAt: profile.currentCreatureHatchedAt?.toISOString() ?? null,
        }
      : null,
  };
}

export async function importUserDataFromBase64(input: {
  userId: number;
  fileName: string;
  fileBase64: string;
  replaceExisting?: boolean;
}) {
  const fileBuffer = decodeImportFileBuffer(input.fileBase64);

  const parsed = parseImportBuffer(fileBuffer);

  const replaceExisting = input.replaceExisting ?? true;
  const importResult = await replaceUserTrackerData(input.userId, parsed.payload, replaceExisting);
  await syncPokegameIfInitialized(input.userId);

  return {
    format: parsed.format,
    ...importResult,
  } satisfies ImportSummary;
}
