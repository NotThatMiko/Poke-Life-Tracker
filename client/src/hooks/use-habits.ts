import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl, type HabitInput, type HabitUpdateInput } from "@shared/routes";

export function useHabits() {
  return useQuery({
    queryKey: [api.habits.list.path],
    queryFn: async () => {
      const res = await fetch(api.habits.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch habits");
      return api.habits.list.responses[200].parse(await res.json());
    },
  });
}

export function useCreateHabit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: HabitInput) => {
      const res = await fetch(api.habits.create.path, {
        method: api.habits.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create habit");
      return api.habits.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.habits.list.path] });
    },
  });
}

export function useUpdateHabit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: number } & HabitUpdateInput) => {
      const url = buildUrl(api.habits.update.path, { id });
      const res = await fetch(url, {
        method: api.habits.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update habit");
      return api.habits.update.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.habits.list.path] });
    },
  });
}

export function useDeleteHabit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.habits.delete.path, { id });
      const res = await fetch(url, {
        method: api.habits.delete.method,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete habit");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.habits.list.path] });
    },
  });
}
