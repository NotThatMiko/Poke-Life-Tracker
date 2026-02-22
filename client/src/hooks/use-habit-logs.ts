import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl, type HabitLogInput } from "@shared/routes";

export function useHabitLogs(habitId: number) {
  const url = buildUrl(api.habitLogs.list.path, { habitId });
  return useQuery({
    queryKey: [url],
    queryFn: async () => {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch habit logs");
      return api.habitLogs.list.responses[200].parse(await res.json());
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
        const exists = old.find(l => l.date === newLog.date);
        if (exists) {
          return old.map(l => l.date === newLog.date ? { ...l, completed: newLog.completed } : l);
        }
        return [...old, { habitId, date: newLog.date, completed: newLog.completed, id: Math.random() }];
      });

      return { previousLogs };
    },
    onError: (err, newLog, context) => {
      queryClient.setQueryData([listUrl], context?.previousLogs);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [listUrl] });
    },
  });
}
