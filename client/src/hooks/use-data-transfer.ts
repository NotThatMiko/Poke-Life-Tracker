import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type DataImportCommitInput, type DataImportInput } from "@shared/routes";

export function useExportData() {
  return useMutation({
    mutationFn: async (mode: "tracker-only" | "tracker-and-pokegame" = "tracker-and-pokegame") => {
      const route = mode === "tracker-only" ? api.data.exportTrackerOnly : api.data.export;
      const res = await fetch(route.path, {
        method: route.method,
        credentials: "include",
      });
      if (!res.ok) {
        let message = "Failed to export data";
        try {
          const body = await res.json();
          message = body?.message || message;
        } catch {
          // ignore
        }
        throw new Error(message);
      }

      const filename = res.headers
        .get("content-disposition")
        ?.match(/filename="?([^"]+)"?/)?.[1];
      const payload = route.responses[200].parse(await res.json());
      return {
        payload,
        mode,
        filename: filename || `pixel-heart-export-${new Date().toISOString().slice(0, 10)}.json`,
      };
    },
  });
}

export function usePreviewImportData() {
  return useMutation({
    mutationFn: async (input: DataImportInput) => {
      const res = await fetch(api.data.importPreview.path, {
        method: api.data.importPreview.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        credentials: "include",
      });

      if (!res.ok) {
        let message = "Import preview failed";
        try {
          const body = await res.json();
          message = body?.message || message;
        } catch {
          // ignore
        }
        throw new Error(message);
      }

      return api.data.importPreview.responses[200].parse(await res.json());
    },
  });
}

export function useCommitImportStage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: DataImportCommitInput) => {
      const res = await fetch(api.data.importCommit.path, {
        method: api.data.importCommit.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        credentials: "include",
      });

      if (!res.ok) {
        let message = "Import commit failed";
        try {
          const body = await res.json();
          message = body?.message || message;
        } catch {
          // ignore
        }
        throw new Error(message);
      }

      return api.data.importCommit.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === "string" && key.startsWith("/api/habits");
        },
      });
      queryClient.invalidateQueries({ queryKey: [api.pokegame.state.path] });
    },
  });
}
