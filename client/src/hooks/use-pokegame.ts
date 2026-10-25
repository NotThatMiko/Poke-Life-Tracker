import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  api,
  type PokegameClaimAchievementInput,
  type PokegameDexFavoriteInput,
  type PokegameDevActionInput,
  type PokegameRenameCreatureInput,
} from "@shared/routes";

const POKEGAME_QUERY_KEY = [api.pokegame.state.path] as const;

export function usePokegameState() {
  return useQuery({
    queryKey: POKEGAME_QUERY_KEY,
    queryFn: async () => {
      const res = await fetch(api.pokegame.state.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch Pokegame state");
      return api.pokegame.state.responses[200].parse(await res.json());
    },
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
}

function usePokegameMutation<TVars>(
  mutationFn: (vars: TVars) => Promise<unknown>,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: (data) => {
      queryClient.setQueryData(POKEGAME_QUERY_KEY, data);
      queryClient.invalidateQueries({ queryKey: POKEGAME_QUERY_KEY });
    },
  });
}

export function useBuyRareCandy() {
  return usePokegameMutation(async () => {
    const res = await fetch(api.pokegame.buyRareCandy.path, {
      method: api.pokegame.buyRareCandy.method,
      credentials: "include",
    });
    if (!res.ok) throw new Error((await res.text()) || "Failed to buy rare candy");
    return api.pokegame.buyRareCandy.responses[200].parse(await res.json());
  });
}

export function useBuyShinyPotion() {
  return usePokegameMutation(async () => {
    const res = await fetch(api.pokegame.buyShinyPotion.path, {
      method: api.pokegame.buyShinyPotion.method,
      credentials: "include",
    });
    if (!res.ok) throw new Error((await res.text()) || "Failed to use shiny potion");
    return api.pokegame.buyShinyPotion.responses[200].parse(await res.json());
  });
}

export function useBuyPurifyingRune() {
  return usePokegameMutation(async () => {
    const res = await fetch(api.pokegame.buyPurifyingRune.path, {
      method: api.pokegame.buyPurifyingRune.method,
      credentials: "include",
    });
    if (!res.ok) throw new Error((await res.text()) || "Failed to use purifying rune");
    return api.pokegame.buyPurifyingRune.responses[200].parse(await res.json());
  });
}

export function useGetNewEgg() {
  return usePokegameMutation(async () => {
    const res = await fetch(api.pokegame.newEgg.path, {
      method: api.pokegame.newEgg.method,
      credentials: "include",
    });
    if (!res.ok) throw new Error((await res.text()) || "Failed to get new egg");
    return api.pokegame.newEgg.responses[200].parse(await res.json());
  });
}

export function usePokegameDevAction() {
  return usePokegameMutation(async (input: PokegameDevActionInput) => {
    const res = await fetch(api.pokegame.devAction.path, {
      method: api.pokegame.devAction.method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      credentials: "include",
    });
    if (!res.ok) throw new Error((await res.text()) || "Pokegame dev action failed");
    return api.pokegame.devAction.responses[200].parse(await res.json());
  });
}

export function useClaimPokegameAchievement() {
  return usePokegameMutation(async (input: PokegameClaimAchievementInput) => {
    const res = await fetch(api.pokegame.claimAchievement.path, {
      method: api.pokegame.claimAchievement.method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      credentials: "include",
    });
    if (!res.ok) throw new Error((await res.text()) || "Failed to claim achievement");
    return api.pokegame.claimAchievement.responses[200].parse(await res.json());
  });
}

export function useRenamePokegameCreature() {
  return usePokegameMutation(async (input: PokegameRenameCreatureInput) => {
    const res = await fetch(api.pokegame.renameCreature.path, {
      method: api.pokegame.renameCreature.method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      credentials: "include",
    });
    if (!res.ok) throw new Error((await res.text()) || "Failed to rename creature");
    return api.pokegame.renameCreature.responses[200].parse(await res.json());
  });
}

export function useTogglePokegameDexFavorite() {
  return usePokegameMutation(async (input: PokegameDexFavoriteInput) => {
    const res = await fetch(api.pokegame.toggleDexFavorite.path, {
      method: api.pokegame.toggleDexFavorite.method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      credentials: "include",
    });
    if (!res.ok) throw new Error((await res.text()) || "Failed to update Dex favorite");
    return api.pokegame.toggleDexFavorite.responses[200].parse(await res.json());
  });
}
