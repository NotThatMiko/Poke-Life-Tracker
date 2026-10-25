import { type ComponentType, useEffect, useState } from "react";
import type { PokegameDevActionInput, PokegameStateResponse } from "@shared/routes";
import {
  Award,
  BookOpen,
  Egg,
  Gift,
  HelpCircle,
  ShoppingBag,
  Wrench,
} from "lucide-react";

export const POKEGAME_TOOLTIP_PANEL_CLASS =
  "pixel-box !bg-card/30 !border-[#486f79] !shadow-[4px_4px_0px_0px_hsl(var(--border-shadow)/0.2)]";

export type PokegameTab = "overview" | "achievements" | "dex" | "shop" | "devtools";

export type ToastItem = {
  id: number;
  title: string;
  subtitle?: string;
};

export type CenterPopupItem = {
  id: number;
  title: string;
  body: string;
};

export function SmallHoverTooltip({ text }: { text: string }) {
  return (
    <div className="relative group inline-flex z-30">
      <HelpCircle className="w-4 h-4 text-white cursor-help" aria-hidden="true" />
      <div
        className={`pointer-events-none absolute right-0 bottom-full mb-2 z-40 w-[270px] p-3 opacity-0 translate-y-1 transition-all duration-150 group-hover:opacity-100 group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:translate-y-0 ${POKEGAME_TOOLTIP_PANEL_CLASS}`}
      >
        <p className="font-body text-base text-white whitespace-pre-line">{text}</p>
      </div>
    </div>
  );
}

export function PokegameTabs({
  activeTab,
  onChange,
  hasClaimableAchievements = false,
  showDevtools = false,
}: {
  activeTab: PokegameTab;
  onChange: (tab: PokegameTab) => void;
  hasClaimableAchievements?: boolean;
  showDevtools?: boolean;
}) {
  const items: Array<{ id: PokegameTab; label: string; icon: ComponentType<{ className?: string }> }> = [
    { id: "overview", label: "Overview", icon: Egg },
    { id: "achievements", label: "Achievements", icon: Award },
    { id: "dex", label: "Dex", icon: BookOpen },
    { id: "shop", label: "Shop", icon: ShoppingBag },
    ...(showDevtools ? [{ id: "devtools" as const, label: "Dev", icon: Wrench }] : []),
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {items.map(({ id, label, icon: Icon }) => {
        const isActive = activeTab === id;
        const shouldPulse = id === "achievements" && hasClaimableAchievements && !isActive;
        const refreshLikeBase =
          "relative pixel-button px-4 py-3 flex items-center gap-2 !bg-card/30 !border-[#486f79] !shadow-[4px_4px_0px_0px_hsl(var(--border-shadow)/0.2)] hover:!bg-card/30 hover:!border-cyan-300 hover:!text-white hover:!shadow-[0_0_18px_rgba(103,232,249,0.42),0_0_30px_rgba(103,232,249,0.22)]";

        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={`${refreshLikeBase} ${isActive ? "text-white" : "text-white/90"}`}
            aria-pressed={isActive}
          >
            <Icon className={`w-4 h-4 ${shouldPulse ? "animate-pulse" : ""}`} />
            <span className="text-[10px] sm:text-xs">{label}</span>
            {shouldPulse && (
              <span
                className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-400 opacity-90 animate-pulse shadow-[0_0_10px_rgba(248,113,113,0.98),0_0_18px_rgba(248,113,113,0.55)]"
                aria-hidden="true"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

export function AchievementsTab({
  state,
  onClaim,
  onClaimAll,
  claiming,
}: {
  state: PokegameStateResponse;
  onClaim: (achievement: PokegameStateResponse["achievements"][number]) => void;
  onClaimAll: () => void;
  claiming: boolean;
}) {
  const claimedCount = state.achievements.filter((achievement) => achievement.claimed).length;
  const claimableCount = state.achievements.filter((achievement) => achievement.claimable).length;
  const sortedAchievements = [...state.achievements]
    .map((achievement, index) => ({ achievement, index }))
    .sort((a, b) => {
      const bucket = (item: { achievement: PokegameStateResponse["achievements"][number] }) => {
        if (item.achievement.claimable) return 0;
        if (item.achievement.claimed) return 2;
        return 1;
      };

      const bucketDiff = bucket(a) - bucket(b);
      if (bucketDiff !== 0) return bucketDiff;
      return a.index - b.index;
    })
    .map((item) => item.achievement);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="pixel-box p-4 !bg-card/30 !border-[#486f79] !shadow-[4px_4px_0px_0px_hsl(var(--border-shadow)/0.2)]">
          <p className="font-display text-[10px] text-white">Eggs Hatched</p>
          <p className="font-display text-lg text-white">{state.profile.eggHatchesCount}</p>
        </div>
        <div className="pixel-box p-4 !bg-card/30 !border-[#486f79] !shadow-[4px_4px_0px_0px_hsl(var(--border-shadow)/0.2)]">
          <p className="font-display text-[10px] text-white">Highest Level</p>
          <p className="font-display text-lg text-white">{state.profile.highestLevelEver}</p>
        </div>
        <div className="pixel-box p-4 !bg-card/30 !border-[#486f79] !shadow-[4px_4px_0px_0px_hsl(var(--border-shadow)/0.2)]">
          <p className="font-display text-[10px] text-white">Achievements</p>
          <p className="font-display text-lg text-white">
            {claimedCount}/{state.achievements.length}
          </p>
        </div>
        <div className="pixel-box p-4 !bg-card/30 !border-[#486f79] !shadow-[4px_4px_0px_0px_hsl(var(--border-shadow)/0.2)]">
          <p className="font-display text-[10px] text-white">Completed Creatures</p>
          <p className="font-display text-lg text-white">{state.profile.completedCreatureIds.length}</p>
        </div>
      </div>

      <div className="pixel-box p-4 sm:p-5 !bg-card/30 !border-[#486f79] !shadow-[4px_4px_0px_0px_hsl(var(--border-shadow)/0.2)] space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-display text-xs text-white">Achievements</p>
          <button
            type="button"
            onClick={onClaimAll}
            disabled={claiming || claimableCount === 0}
            className="pixel-button px-3 py-2 bg-primary/20 border-accent text-white disabled:opacity-50 disabled:cursor-not-allowed"
            title={claimableCount === 0 ? "No achievements to claim" : `Claim ${claimableCount} achievement(s)`}
          >
            <Gift className="w-4 h-4 mr-2 inline-block" />
            Claim All
          </button>
        </div>

        <div className="space-y-2">
          {sortedAchievements.map((achievement) => (
            <div
              key={achievement.id}
              className={`border-2 px-3 py-3 sm:px-4 sm:py-4 transition-colors ${
                achievement.claimed
                  ? "border-border/30 bg-background/5 opacity-60"
                  : achievement.claimable
                    ? "border-accent/60 bg-background/15"
                    : "border-border/50 bg-background/10"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-display text-xs sm:text-sm text-white break-words">{achievement.title}</p>
                  <p className="font-body text-lg text-white">{achievement.subtitle}</p>
                  <p className="font-display text-[10px] text-white mt-1">
                    Reward: +{achievement.rewardXp} XP | +{achievement.rewardPo} Po
                  </p>
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  {achievement.claimed ? (
                    <div className="pixel-button px-3 py-2 bg-background/10 border-border/40 text-white opacity-70 cursor-default">
                      Claimed
                    </div>
                  ) : achievement.claimable ? (
                    <button
                      type="button"
                      disabled={claiming}
                      onClick={() => onClaim(achievement)}
                      className="pixel-button px-3 py-2 bg-primary/20 border-accent text-white disabled:opacity-50"
                    >
                      <Gift className="w-4 h-4 mr-2 inline-block" />
                      Claim
                    </button>
                  ) : (
                    <div className="pixel-button px-3 py-2 bg-background/10 border-border/40 text-white opacity-70 cursor-default">
                      Locked
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function DevToolsTab({
  onAction,
  onForcePassivePokemon,
  isPending,
}: {
  onAction: (action: PokegameDevActionInput["action"]) => void;
  onForcePassivePokemon: () => void;
  isPending: boolean;
}) {
  const buttons: Array<{ action: PokegameDevActionInput["action"]; label: string; destructive?: boolean }> = [
    { action: "add_po_99999", label: "Add 99999 Po" },
    { action: "add_level_1", label: "Add 1 lvl" },
    { action: "add_level_10", label: "Add 10 lvl" },
    { action: "fill_dex", label: "Fill Dex" },
    { action: "fill_shiny_dex", label: "Fill Shiny Dex" },
    { action: "empty_dex", label: "Empty Dex" },
    { action: "clear_money", label: "Clear Money" },
    { action: "clear_levels", label: "Clear Lvls" },
    { action: "reset_achievements", label: "Reset achievements" },
    { action: "reset_pokegame", label: "Reset Pokegame", destructive: true },
    { action: "reset_all", label: "Reset all", destructive: true },
  ];

  return (
    <div className="pixel-box p-4 sm:p-5 !bg-card/30 !border-[#486f79] !shadow-[4px_4px_0px_0px_hsl(var(--border-shadow)/0.2)] space-y-3">
      <div>
        <p className="font-display text-xs text-white">Dev Tools</p>
        <p className="font-body text-lg text-white">Enabled by code flag. Use only for testing progression / rewards.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {buttons.map((button) => (
          <button
            key={button.action}
            type="button"
            disabled={isPending}
            onClick={() => onAction(button.action)}
            className={`pixel-button px-4 py-3 text-left justify-start ${
              button.destructive
                ? "bg-destructive/10 border-destructive/60 text-white"
                : "bg-background/10 border-border/50 text-white"
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {button.label}
          </button>
        ))}
        <button
          type="button"
          disabled={isPending}
          onClick={onForcePassivePokemon}
          className="pixel-button px-4 py-3 text-left justify-start bg-background/10 border-border/50 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          title="Forces at least one passive Pokémon to appear the next time you enter Overview (egg state)"
        >
          Force Passive Pokemon
        </button>
      </div>
    </div>
  );
}

export function CenterPopupOverlay({
  item,
  onClose,
}: {
  item: CenterPopupItem | null;
  onClose: () => void;
}) {
  if (!item) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/35" role="dialog" aria-modal="true">
      <div className="pixel-box max-w-xl w-full p-5 sm:p-6 !bg-card/30 !border-[#486f79] !shadow-[4px_4px_0px_0px_hsl(var(--border-shadow)/0.2)]">
        <p
          className="font-display text-base sm:text-lg text-white"
          style={{ textShadow: "0 0 6px rgba(103,232,249,0.65), 0 0 14px rgba(103,232,249,0.35)" }}
        >
          {item.title}
        </p>
        <p className="font-body text-lg text-white mt-3 whitespace-pre-line">{item.body}</p>
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="pixel-button px-4 py-3 !bg-card/20 !border-[#486f79] !shadow-[4px_4px_0px_0px_hsl(var(--border-shadow)/0.2)] hover:!border-cyan-300 hover:!text-white text-white/90 hover:!shadow-[0_0_18px_rgba(103,232,249,0.42),0_0_30px_rgba(103,232,249,0.22)]"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

export function NicknamePromptModal({
  open,
  initialValue,
  pending,
  onSubmit,
  onSkip,
}: {
  open: boolean;
  initialValue: string;
  pending: boolean;
  onSubmit: (nickname: string) => void;
  onSkip: () => void;
}) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (open) setValue(initialValue);
  }, [open, initialValue]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4 bg-black/45" role="dialog" aria-modal="true">
      <div className="pixel-box max-w-lg w-full p-5 sm:p-6 !bg-card/30 !border-[#486f79] !shadow-[4px_4px_0px_0px_hsl(var(--border-shadow)/0.2)]">
        <p
          className="font-display text-base sm:text-lg text-white"
          style={{ textShadow: "0 0 6px rgba(103,232,249,0.65), 0 0 14px rgba(103,232,249,0.35)" }}
        >
          Your creature has hatched!
        </p>
        <p className="font-body text-lg text-white mt-3">Give it a nickname (you can change it later).</p>

        <div className="mt-4 space-y-2">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value.slice(0, 32))}
            placeholder="Creature nickname"
            className="pixel-input w-full px-3 py-3 bg-card/70 text-foreground"
            maxLength={32}
            autoFocus
          />
          <p className="font-body text-base text-white/80 text-right">{value.length}/32</p>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onSkip}
            className="pixel-button px-4 py-3 !bg-card/20 !border-[#486f79] !shadow-[4px_4px_0px_0px_hsl(var(--border-shadow)/0.2)] hover:!border-cyan-300 hover:!text-white text-white/90 hover:!shadow-[0_0_18px_rgba(103,232,249,0.42),0_0_30px_rgba(103,232,249,0.22)]"
            disabled={pending}
          >
            Skip
          </button>
          <button
            type="button"
            onClick={() => onSubmit(value)}
            className="pixel-button px-4 py-3 !bg-card/20 !border-[#486f79] !shadow-[4px_4px_0px_0px_hsl(var(--border-shadow)/0.2)] hover:!border-cyan-300 hover:!text-white text-white/90 hover:!shadow-[0_0_18px_rgba(103,232,249,0.42),0_0_30px_rgba(103,232,249,0.22)] disabled:opacity-50"
            disabled={pending}
          >
            Save nickname
          </button>
        </div>
      </div>
    </div>
  );
}
