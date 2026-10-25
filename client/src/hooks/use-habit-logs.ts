import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl, type HabitLogInput } from "@shared/routes";
import {
  getHabitLogStatus as getSharedHabitLogStatus,
  hasHabitLogValue as hasSharedHabitLogValue,
  isHabitLogDone as isSharedHabitLogDone,
  isHabitLogRecordedOnly as isSharedHabitLogRecordedOnly,
  isHabitLogSkipped as isSharedHabitLogSkipped,
} from "@shared/habit-config";

function normalizeLogsByDate<T extends { date: string; id?: number }>(logs: T[]): T[] {
  const latestByDate = new Map<string, T>();

  for (const log of logs) {
    const existing = latestByDate.get(log.date);
    const logId = typeof log.id === "number" ? log.id : -1;
    const existingId = typeof existing?.id === "number" ? existing.id : -1;

    // If duplicates exist for a date, keep the most recent row (highest id) as source of truth.
    if (!existing || logId >= existingId) {
      latestByDate.set(log.date, log);
    }
  }

  return Array.from(latestByDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export function getHabitLogStatus(log: { status?: string | null; completed?: boolean | null } | null | undefined) {
  return getSharedHabitLogStatus(log);
}

export function isHabitLogDone(log: { status?: string | null; completed?: boolean | null } | null | undefined) {
  return isSharedHabitLogDone(log);
}

export function isHabitLogSkipped(log: { status?: string | null; completed?: boolean | null } | null | undefined) {
  return isSharedHabitLogSkipped(log);
}

export function isHabitLogRecordedOnly(log: { status?: string | null; completed?: boolean | null } | null | undefined) {
  return isSharedHabitLogRecordedOnly(log);
}

export function hasHabitLogValue(log: { valueText?: string | null } | null | undefined) {
  return hasSharedHabitLogValue(log);
}

export function useHabitLogs(habitId: number) {
  const url = buildUrl(api.habitLogs.list.path, { habitId });
  return useQuery({
    queryKey: [url],
    queryFn: async () => {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch habit logs");
      const parsed = api.habitLogs.list.responses[200].parse(await res.json());
      return normalizeLogsByDate(parsed);
    },
    enabled: !!habitId,
  });
}

export function useToggleHabitLog(habitId: number) {
  const queryClient = useQueryClient();
  const listUrl = buildUrl(api.habitLogs.list.path, { habitId });
  const toggleUrl = buildUrl(api.habitLogs.toggle.path, { habitId });

  return useMutation({
    mutationFn: async (data: HabitLogInput) => {
      const res = await fetch(toggleUrl, {
        method: api.habitLogs.toggle.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to toggle habit log");
      return api.habitLogs.toggle.responses[200].parse(await res.json());
    },
    // Optimistic update for snappier UI
    onMutate: async (newLog) => {
      await queryClient.cancelQueries({ queryKey: [listUrl] });
      const previousLogs = queryClient.getQueryData<any[]>([listUrl]);

      queryClient.setQueryData([listUrl], (old: any[] = []) => {
        const normalizedOld = normalizeLogsByDate(old);
        const exists = normalizedOld.find(l => l.date === newLog.date);
        const normalizedPatch =
          "status" in newLog
            ? {
                status: newLog.status,
                valueText: newLog.valueText ?? null,
                completed: newLog.status === "done",
              }
            : {
                completed: newLog.completed,
                status: newLog.completed ? "done" : "clear",
                valueText: null,
              };
        if (exists) {
          return normalizeLogsByDate(
            normalizedOld.map((l) => (l.date === newLog.date ? { ...l, ...normalizedPatch } : l)),
          );
        }
        return normalizeLogsByDate([
          ...normalizedOld,
          { habitId, date: newLog.date, id: Date.now() + Math.random(), ...normalizedPatch },
        ]);
      });

      return { previousLogs };
    },
    onError: (err, newLog, context) => {
      queryClient.setQueryData([listUrl], context?.previousLogs);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [listUrl] });
      queryClient.invalidateQueries({ queryKey: [api.pokegame.state.path] });
    },
  });
}
