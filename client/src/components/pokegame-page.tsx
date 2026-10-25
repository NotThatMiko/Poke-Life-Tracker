import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { PokegameDevActionInput, PokegameStateResponse } from "@shared/routes";
import {
  Coins,
  Edit3,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import backgroundDayImg from "@assets/Background DAY.png";
import pokeballImg from "@assets/pokeball.png";
import sunImg from "@assets/sun.png";
import {
  useBuyPurifyingRune,
  useBuyRareCandy,
  useBuyShinyPotion,
  useClaimPokegameAchievement,
  useGetNewEgg,
  usePokegameDevAction,
  usePokegameState,
  useRenamePokegameCreature,
} from "@/hooks/use-pokegame";
import { useAuthSession } from "@/hooks/use-auth";
import { DexTab, ShopTab } from "@/components/pokegame-dex-shop";
import {
  AchievementsTab,
  CenterPopupOverlay,
  DevToolsTab,
  NicknamePromptModal,
  PokegameTabs,
  POKEGAME_TOOLTIP_PANEL_CLASS,
  type CenterPopupItem,
  type PokegameTab,
  type ToastItem,
  SmallHoverTooltip,
} from "@/components/pokegame-ui";

const POKEGAME_DEVTOOLS_ENABLED = true;
const FORCE_PASSIVE_POKEMON_STORAGE_KEY = "pokegame.dev.forcePassivePokemonNextOverview";

type BackgroundCompanion = {
  id: string;
  src: string;
  top: string;
  left: string;
  sizePx: number;
  opacity: number;
  flipX: boolean;
  rotateDeg: number;
  tooltipTitle: string;
};

const pokegameAssets = import.meta.glob("@assets/Pokegame/**/*.{gif,png,webp}", {
  eager: true,
  import: "default",
}) as Record<string, string>;
const pokegameShinyAssets = import.meta.glob("@assets/Pokegame Shiny/**/*.{gif,png,webp}", {
  eager: true,
  import: "default",
}) as Record<string, string>;
const shaderAssets = import.meta.glob("@assets/Shaders/*.png", {
  eager: true,
  import: "default",
}) as Record<string, string>;

type CreatureAssetMap = {
  eggSrc: string | null;
  rareCandySrc: string | null;
  shinyPotionSrc: string | null;
  purifyingRuneSrc: string | null;
  shaderSrcs: string[];
  creatureStagesById: Record<string, string[]>;
  shinyCreatureStagesById: Record<string, string[]>;
  dexStageSpriteById: Record<string, string>;
  shinyDexStageSpriteById: Record<string, string>;
};

function parseNumericFilename(name: string) {
  const digits = name.replace(/\.[^.]+$/, "").match(/\d+/)?.[0];
  return digits ? Number.parseInt(digits, 10) : Number.MAX_SAFE_INTEGER;
}

function normalizeDexStageId(name: string) {
  const digits = name.replace(/\.[^.]+$/, "").match(/\d+/)?.[0];
  if (!digits) return null;
  const value = Number.parseInt(digits, 10);
  if (!Number.isFinite(value) || value <= 0) return null;
  return String(value).padStart(3, "0");
}

function collectCreatureStages(
  assets: Record<string, string>,
  folderName: "Pokegame" | "Pokegame Shiny",
  options?: { normalizeShinyPrefix?: boolean },
) {
  const stageEntries: Array<{ creatureId: string; fileName: string; src: string }> = [];
  const marker = `/${folderName}/`;

  for (const [key, src] of Object.entries(assets)) {
    const normalizedKey = key.replace(/\\/g, "/");
    const markerIndex = normalizedKey.lastIndexOf(marker);
    if (markerIndex < 0) continue;

    const relativePath = normalizedKey.slice(markerIndex + marker.length);
    const stageMatch = relativePath.match(/^([^/]+)\/([^/]+)$/);
    if (!stageMatch) continue;

    const [, rawCreatureId, fileName] = stageMatch;
    if (!rawCreatureId || !fileName) continue;

    const creatureId = options?.normalizeShinyPrefix
      ? rawCreatureId.replace(/^s(?=\d+$)/i, "")
      : rawCreatureId;
    if (!creatureId) continue;

    stageEntries.push({ creatureId, fileName, src });
  }

  const creatureStagesById: Record<string, string[]> = {};
  for (const entry of stageEntries.sort((a, b) => {
    if (a.creatureId !== b.creatureId) return a.creatureId.localeCompare(b.creatureId, "en");
    return parseNumericFilename(a.fileName) - parseNumericFilename(b.fileName);
  })) {
    creatureStagesById[entry.creatureId] ??= [];
    creatureStagesById[entry.creatureId].push(entry.src);
  }

  return creatureStagesById;
}

function collectDexStageSprites(
  assets: Record<string, string>,
  folderName: "Pokegame" | "Pokegame Shiny",
) {
  const marker = `/${folderName}/`;
  const entries: Array<{ dexStageId: string; src: string; fileName: string }> = [];

  for (const [key, src] of Object.entries(assets)) {
    const normalizedKey = key.replace(/\\/g, "/");
    const markerIndex = normalizedKey.lastIndexOf(marker);
    if (markerIndex < 0) continue;
    const relativePath = normalizedKey.slice(markerIndex + marker.length);
    const parts = relativePath.split("/");
    if (parts.length !== 2) continue;
    const fileName = parts[1] ?? "";
    const dexStageId = normalizeDexStageId(fileName);
    if (!dexStageId) continue;
    entries.push({ dexStageId, src, fileName });
  }

  const map: Record<string, string> = {};
  for (const entry of entries.sort((a, b) => {
    const idDiff = Number(a.dexStageId) - Number(b.dexStageId);
    if (idDiff !== 0) return idDiff;
    return parseNumericFilename(a.fileName) - parseNumericFilename(b.fileName);
  })) {
    map[entry.dexStageId] = entry.src;
  }
  return map;
}

function buildCreatureAssetMap(): CreatureAssetMap {
  let eggSrc: string | null = null;
  let rareCandySrc: string | null = null;
  let shinyPotionSrc: string | null = null;
  let purifyingRuneSrc: string | null = null;
  const shaderSrcs = Object.entries(shaderAssets)
    .sort(([a], [b]) => a.localeCompare(b, "en"))
    .map(([, src]) => src);

  for (const [key, src] of Object.entries(pokegameAssets)) {
    const normalizedKey = key.replace(/\\/g, "/");
    const match = normalizedKey.match(/\/Pokegame\/(.+)$/);
    if (!match) continue;

    const relativePath = match[1] ?? "";
    if (relativePath === "egg.gif") {
      eggSrc = src;
      continue;
    }
    if (relativePath === "pixelmon_rare_candy.png") {
      rareCandySrc = src;
      continue;
    }
    if (relativePath === "potion.png") {
      shinyPotionSrc = src;
      continue;
    }
    if (relativePath === "Rune_Purifiante.png") {
      purifyingRuneSrc = src;
      continue;
    }
  }

  const creatureStagesById = collectCreatureStages(pokegameAssets, "Pokegame");
  const shinyCreatureStagesById = collectCreatureStages(pokegameShinyAssets, "Pokegame Shiny", {
    normalizeShinyPrefix: true,
  });
  const dexStageSpriteById = collectDexStageSprites(pokegameAssets, "Pokegame");
  const shinyDexStageSpriteById = collectDexStageSprites(pokegameShinyAssets, "Pokegame Shiny");

  return {
    eggSrc,
    rareCandySrc,
    shinyPotionSrc,
    purifyingRuneSrc,
    shaderSrcs,
    creatureStagesById,
    shinyCreatureStagesById,
    dexStageSpriteById,
    shinyDexStageSpriteById,
  };
}

const CREATURE_ASSETS = buildCreatureAssetMap();

function getStageIndexFromLevel(level: number) {
  if (level <= 0) return -1;
  if (level <= 33) return 0;
  if (level <= 66) return 1;
  return 2;
}

function formatPo(value: number) {
  return `${Math.max(0, value).toLocaleString("en-US")} Po`;
}

function formatHatchDateTooltip(value: string | undefined) {
  if (!value) return "Unknown";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Unknown";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function buildNoticeKey(notice: PokegameStateResponse["notices"][number], index: number) {
  return `${notice.type}:${JSON.stringify(notice)}:${index}`;
}

function noticeToToast(notice: PokegameStateResponse["notices"][number]): Omit<ToastItem, "id"> | null {
  if (notice.type === "level_up") {
    const fromLevel = typeof notice.fromLevel === "number" ? notice.fromLevel : 0;
    const toLevel = typeof notice.toLevel === "number" ? notice.toLevel : 0;
    const poReward = typeof notice.poReward === "number" ? notice.poReward : 0;
    return {
      title: `Level Up! ${fromLevel} -> ${toLevel}`,
      subtitle: `+${poReward} Po`,
    };
  }

  if (notice.type === "achievement") {
    const title = typeof notice.title === "string" ? notice.title : "Achievement claimed";
    const xpReward = typeof notice.xpReward === "number" ? notice.xpReward : 0;
    const poReward = typeof notice.poReward === "number" ? notice.poReward : 0;
    return {
      title: `Achievement claimed: ${title}`,
      subtitle: `+${xpReward} XP | +${poReward} Po`,
    };
  }

  if (notice.type === "new_egg") {
    return {
      title: "Egg hatched!",
      subtitle: "A new creature joined your adventure.",
    };
  }

  return null;
}

function hashString(input: string) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function buildCompletedCreatureBackgroundSprites(
  state: PokegameStateResponse | undefined,
  options?: { forceAtLeastOne?: boolean },
): BackgroundCompanion[] {
  if (!state) return [];
  if (state.level.level > 0) return [];

  const seedBase = `${state.profile.currentCycleStartedAt}|${state.profile.completedCreatureIds.join(",")}|${(
    state.profile.favoritePassiveDexStageIds ?? []
  ).join(",")}`;
  const rand = seededRandom(hashString(seedBase));
  const completedShinySet = new Set(state.profile.completedShinyCreatureIds ?? []);
  const completedHatchDates = state.profile.completedCreatureHatchDates ?? {};
  const completedNicknames = state.profile.completedCreatureNicknames ?? {};
  const discoveredShinyDexSet = new Set(state.profile.discoveredShinyDexStageIds ?? []);
  const favoriteDexStageIds = (state.profile.favoritePassiveDexStageIds ?? []).filter((dexStageId) => {
    const normalSprite = CREATURE_ASSETS.dexStageSpriteById[dexStageId];
    const shinySprite = CREATURE_ASSETS.shinyDexStageSpriteById[dexStageId];
    return Boolean(normalSprite || shinySprite);
  });

  // Prefer the lower half of the screen and spread companions apart (especially when there are 6).
  // Slots are biased toward lower corners/sides to avoid the central UI windows as much as possible.
  const lowerHalfSlots = [
    { top: 77, left: 4 },
    { top: 80, left: 19 },
    { top: 83, left: 87 },
    { top: 79, left: 72 },
    { top: 89, left: 10 },
    { top: 90, left: 83 },
    { top: 86, left: 2 },
    { top: 87, left: 92 },
  ];

  if (favoriteDexStageIds.length > 0) {
    let selectedFavorites = favoriteDexStageIds
      .filter(() => rand() < 1 / 3)
      .sort(() => rand() - 0.5)
      .slice(0, 6);

    if (options?.forceAtLeastOne && selectedFavorites.length === 0) {
      const pool = [...favoriteDexStageIds].sort(() => rand() - 0.5);
      if (pool[0]) {
        selectedFavorites = [pool[0]];
      }
    }

    return selectedFavorites.map((dexStageId, index) => {
      const shinySrc = CREATURE_ASSETS.shinyDexStageSpriteById[dexStageId] ?? null;
      const normalSrc = CREATURE_ASSETS.dexStageSpriteById[dexStageId] ?? null;
      const preferShiny = discoveredShinyDexSet.has(dexStageId) && shinySrc;
      const src = (preferShiny ? shinySrc : normalSrc) ?? shinySrc ?? normalSrc ?? CREATURE_ASSETS.eggSrc ?? "";
      const slot = lowerHalfSlots[index % lowerHalfSlots.length] ?? { top: 82, left: index % 2 ? 84 : 8 };
      const topJitter = (rand() - 0.5) * 3;
      const leftJitter = (rand() - 0.5) * 6;
      const top = Math.max(75, Math.min(92, slot.top + topJitter));
      const left = Math.max(2, Math.min(90, slot.left + leftJitter));
      const creatureLabel = (state.profile.dexStageNicknames?.[dexStageId] ?? "").trim() || `Pokémon #${dexStageId}`;
      const hatchDateLabel = formatHatchDateTooltip(state.profile.completedCreatureHatchDates?.[dexStageId]);
      return {
        id: `favorite-${dexStageId}-${index}`,
        src,
        top: `${top}%`,
        left: `${left}%`,
        sizePx: Math.round((72 + rand() * 56) * 1.5),
        opacity: 1,
        flipX: rand() < 0.5,
        rotateDeg: Math.round((rand() - 0.5) * 16),
        tooltipTitle: `${creatureLabel}\nHatch date: ${hatchDateLabel}`,
      };
    });
  }

  if (state.profile.completedCreatureIds.length === 0) return [];

  let selected = state.profile.completedCreatureIds
    .filter((creatureId) => (CREATURE_ASSETS.creatureStagesById[creatureId]?.length ?? 0) > 0)
    .filter(() => rand() < 1 / 3)
    .sort(() => rand() - 0.5)
    .slice(0, 6);

  if (options?.forceAtLeastOne && selected.length === 0) {
    const pool = state.profile.completedCreatureIds
      .filter((creatureId) => (CREATURE_ASSETS.creatureStagesById[creatureId]?.length ?? 0) > 0)
      .sort(() => rand() - 0.5);
    if (pool[0]) {
      selected = [pool[0]];
    }
  }

  return selected.map((creatureId, index) => {
    const shinyStages = CREATURE_ASSETS.shinyCreatureStagesById[creatureId] ?? [];
    const normalStages = CREATURE_ASSETS.creatureStagesById[creatureId] ?? [];
    const stages = completedShinySet.has(creatureId) && shinyStages.length > 0 ? shinyStages : normalStages;
    const src = stages[Math.max(0, stages.length - 1)] ?? CREATURE_ASSETS.eggSrc ?? "";
    const slot = lowerHalfSlots[index % lowerHalfSlots.length] ?? { top: 82, left: index % 2 ? 84 : 8 };
    const topJitter = (rand() - 0.5) * 3; // +/- 1.5%
    const leftJitter = (rand() - 0.5) * 6; // +/- 3%
    const top = Math.max(75, Math.min(92, slot.top + topJitter));
    const left = Math.max(2, Math.min(90, slot.left + leftJitter));
    const creatureLabel = (completedNicknames[creatureId] ?? "").trim() || `Pokémon #${creatureId}`;
    const hatchDateLabel = formatHatchDateTooltip(completedHatchDates[creatureId]);
    return {
      id: `${creatureId}-${index}`,
      src,
      top: `${top}%`,
      left: `${left}%`,
      sizePx: Math.round((72 + rand() * 56) * 1.5),
      opacity: 1,
      flipX: rand() < 0.5,
      rotateDeg: Math.round((rand() - 0.5) * 16),
      tooltipTitle: `${creatureLabel}\nHatch date: ${hatchDateLabel}`,
    };
  });
}

function CreatureOverviewCard({
  state,
  spriteShaderSrc,
  onRefresh,
  refreshing,
  onGetNewEgg,
  getNewEggPending,
  renameMutation,
}: {
  state: PokegameStateResponse;
  spriteShaderSrc: string | null;
  onRefresh: () => void;
  refreshing: boolean;
  onGetNewEgg: () => void;
  getNewEggPending: boolean;
  renameMutation: ReturnType<typeof useRenamePokegameCreature>;
}) {
  const [isEditingNickname, setIsEditingNickname] = useState(false);
  const [nicknameDraft, setNicknameDraft] = useState(state.profile.currentCreatureNickname ?? "");
  const spriteStageRef = useRef<HTMLDivElement | null>(null);
  const spriteImageRef = useRef<HTMLImageElement | null>(null);
  const [shaderAnchor, setShaderAnchor] = useState<{ leftPx: number; topPx: number } | null>(null);

  useEffect(() => {
    setNicknameDraft(state.profile.currentCreatureNickname ?? "");
  }, [state.profile.currentCreatureNickname, state.profile.currentCreatureId]);

  const level = state.level.level;
  const levelCap = state.profile.currentLevelCap ?? 100;
  const stageIndex = getStageIndexFromLevel(level);
  const creatureId = state.profile.currentCreatureId;
  const creatureStages = creatureId
    ? (
      state.profile.currentCreatureIsShiny && (CREATURE_ASSETS.shinyCreatureStagesById[creatureId]?.length ?? 0) > 0
        ? CREATURE_ASSETS.shinyCreatureStagesById[creatureId]
        : CREATURE_ASSETS.creatureStagesById[creatureId]
    ) ?? []
    : [];
  const creatureSrc =
    stageIndex < 0
      ? CREATURE_ASSETS.eggSrc
      : creatureStages[Math.min(stageIndex, Math.max(0, creatureStages.length - 1))] ?? CREATURE_ASSETS.eggSrc;

  useLayoutEffect(() => {
    if (!spriteShaderSrc) {
      setShaderAnchor(null);
      return;
    }
    if (typeof window === "undefined") return;

    const stageEl = spriteStageRef.current;
    const imgEl = spriteImageRef.current;
    if (!stageEl || !imgEl) return;

    let rafId = 0;
    let resizeObserver: ResizeObserver | null = null;

    const updateAnchor = () => {
      const stageRect = stageEl.getBoundingClientRect();
      const spriteRect = imgEl.getBoundingClientRect();
      if (stageRect.width <= 0 || stageRect.height <= 0 || spriteRect.width <= 0 || spriteRect.height <= 0) {
        return;
      }

      // Anchor shader to the sprite "feet" (bottom-center), with tiny offsets derived from sprite size.
      const leftPx = spriteRect.left - stageRect.left + spriteRect.width / 2 + spriteRect.width * 0.01;
      const topPx = spriteRect.bottom - stageRect.top - spriteRect.height * 0.01;

      setShaderAnchor((current) => {
        if (
          current &&
          Math.abs(current.leftPx - leftPx) < 0.5 &&
          Math.abs(current.topPx - topPx) < 0.5
        ) {
          return current;
        }
        return { leftPx, topPx };
      });
    };

    const scheduleUpdate = () => {
      window.cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(updateAnchor);
    };

    scheduleUpdate();

    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(scheduleUpdate);
      resizeObserver.observe(stageEl);
      resizeObserver.observe(imgEl);
    }
    window.addEventListener("resize", scheduleUpdate);

    return () => {
      window.cancelAnimationFrame(rafId);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [spriteShaderSrc, creatureSrc, stageIndex]);

  const isMax = level >= levelCap;
  const isEggSprite = stageIndex < 0;
  const displayName =
    state.profile.currentCreatureNickname?.trim() ||
    (level <= 0 ? "Mystery Egg" : `Creature ${creatureId ?? "???"}`);

  const xpHelpText =
    "+5 XP per checked habit (and -5 XP if you uncheck).\n" +
    "+100 XP when a habit has a full Monday->Sunday week completed (removed if broken).\n" +
    "Streak bonus XP at 10/20/30/.../100 days, then +100 XP every extra 100 days.\n" +
    "Achievements also grant XP when manually claimed.";

  const saveNickname = () => {
    renameMutation.mutate(
      { nickname: nicknameDraft.trim() ? nicknameDraft.trim() : null },
      {
        onSuccess: () => setIsEditingNickname(false),
      },
    );
  };

  return (
    <div className="relative w-full max-w-4xl mx-auto flex flex-col items-center">
      <div className="relative z-10 w-[320px] h-[320px] sm:w-[420px] sm:h-[420px] flex items-center justify-center overflow-visible mb-2 sm:mb-3">
        {creatureSrc ? (
          <div
            ref={spriteStageRef}
            className="relative w-[220px] h-[220px] sm:w-[300px] sm:h-[300px] flex items-center justify-center pointer-events-none"
            style={isEggSprite ? { transform: "translateY(-80px)" } : undefined}
          >
            {spriteShaderSrc ? (
              <img
                src={spriteShaderSrc}
                alt=""
                aria-hidden="true"
                className="absolute pointer-events-none object-contain max-w-none max-h-none w-[440px] h-[192px] sm:w-[600px] sm:h-[264px]"
                style={{
                  imageRendering: "pixelated",
                  left: shaderAnchor ? `${shaderAnchor.leftPx}px` : "50%",
                  top: shaderAnchor ? `${shaderAnchor.topPx}px` : "50%",
                  transform: "translate(-50%, -139px)",
                  opacity: 1,
                  zIndex: 0,
                }}
              />
            ) : null}
            <div
              className="relative z-10"
              style={{
                transform: "scale(4)",
                transformOrigin: "center",
              }}
            >
              <img
                ref={spriteImageRef}
                src={creatureSrc}
                alt={level <= 0 ? "Egg" : `Creature ${creatureId ?? ""}`}
                className="object-contain max-w-none max-h-none"
                style={{ imageRendering: "pixelated" }}
                onLoad={() => {
                  const stageEl = spriteStageRef.current;
                  const imgEl = spriteImageRef.current;
                  if (!stageEl || !imgEl) return;
                  const stageRect = stageEl.getBoundingClientRect();
                  const spriteRect = imgEl.getBoundingClientRect();
                  if (!stageRect.width || !spriteRect.width) return;
                  setShaderAnchor({
                    leftPx: spriteRect.left - stageRect.left + spriteRect.width / 2 + spriteRect.width * 0.01,
                    topPx: spriteRect.bottom - stageRect.top - spriteRect.height * 0.01,
                  });
                }}
              />
            </div>
          </div>
        ) : (
          <div className="w-full h-full border-4 border-border/70 bg-background/10 flex items-center justify-center">
            <span className="font-display text-white text-xs">No asset found</span>
          </div>
        )}
      </div>

      <div className="pixel-box self-stretch mx-[10px] px-5 pt-6 pb-7 sm:px-6 sm:pt-7 sm:pb-8 !bg-card/30 !border-[#486f79] !shadow-[4px_4px_0px_0px_hsl(var(--border-shadow)/0.2)] relative overflow-visible">
        <button
          type="button"
          onClick={onRefresh}
          className="absolute top-4 right-4 z-20 pixel-button px-3 py-2 !bg-card/20 !border-[#486f79] !shadow-[4px_4px_0px_0px_hsl(var(--border-shadow)/0.2)] hover:!border-cyan-300 hover:!text-white text-white/90 hover:!shadow-[0_0_18px_rgba(103,232,249,0.42),0_0_30px_rgba(103,232,249,0.22)]"
          disabled={refreshing}
          title="Refresh Pokegame"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
        </button>
        <div className="absolute inset-0 opacity-10 pointer-events-none bg-gradient-to-b from-primary/20 to-transparent" />
        <div className="relative z-10 flex flex-col items-center text-center gap-4">
          <div className="space-y-1 w-full max-w-2xl">
            <p className="font-display text-[10px] sm:text-xs text-white uppercase tracking-wide">
              {level > 0 && creatureId ? `#${creatureId}` : "???"}
            </p>
            <div className="w-full flex justify-center">
              <div className="relative inline-block max-w-full">
                <p
                  className="font-display text-xl sm:text-2xl text-white break-words text-center"
                  style={{ textShadow: "0 0 6px rgba(103,232,249,0.65), 0 0 14px rgba(103,232,249,0.35)" }}
                >
                  {displayName}
                </p>
                {level > 0 && !isEditingNickname && (
                  <button
                    type="button"
                    onClick={() => setIsEditingNickname(true)}
                    className="absolute left-full top-1/2 -translate-y-1/2 ml-2 bg-transparent border-0 p-0.5 text-white/90 hover:text-white transition-colors"
                    title="Rename creature"
                    aria-label="Rename creature"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
            {level <= 0 && (
              <p className="font-body text-lg text-white">Reach level 1 to hatch a random creature</p>
            )}

            {level > 0 && (
              <div className="pt-2 flex flex-wrap items-center justify-center gap-2">
                {isEditingNickname ? (
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <input
                      value={nicknameDraft}
                      onChange={(e) => setNicknameDraft(e.target.value.slice(0, 32))}
                      placeholder="Creature nickname"
                      className="pixel-input px-3 py-2 bg-card/60 !text-white placeholder:!text-white/50 min-w-[220px]"
                      maxLength={32}
                    />
                    <button
                      type="button"
                      onClick={saveNickname}
                      disabled={renameMutation.isPending}
                      className="pixel-button px-3 py-2 bg-primary/20 border-accent text-white disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setNicknameDraft(state.profile.currentCreatureNickname ?? "");
                        setIsEditingNickname(false);
                      }}
                      className="pixel-button px-3 py-2 bg-card/70 border-border/60 text-white"
                    >
                      Cancel
                    </button>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <div className="w-full max-w-3xl space-y-3 pt-2">
            {state.profile.canGetNewEgg && (
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={onGetNewEgg}
                  disabled={getNewEggPending}
                  className="pixel-button px-4 py-2 !bg-card/20 !border-[#486f79] !shadow-[4px_4px_0px_0px_hsl(var(--border-shadow)/0.2)] hover:!border-cyan-300 hover:!text-white text-white/90 hover:!shadow-[0_0_18px_rgba(103,232,249,0.42),0_0_30px_rgba(103,232,249,0.22)] disabled:opacity-60"
                >
                  <RotateCcw className="w-4 h-4 mr-2 inline-block" />
                  Get New Egg
                </button>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
              <p
                className="font-display text-sm sm:text-base text-white"
                style={{ textShadow: "0 0 6px rgba(103,232,249,0.65), 0 0 14px rgba(103,232,249,0.35)" }}
              >
                Level {level}
              </p>
            </div>

            <div className="h-5 border-2 border-[#486f79] bg-background/20 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-300/70 via-cyan-200/70 to-white/70 transition-all duration-500"
                style={{ width: `${Math.round((isMax ? 1 : state.level.progressRatio) * 100)}%` }}
              />
            </div>
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
              <p className="font-body text-lg text-white">
                {isMax ? "MAX LEVEL" : `${state.level.xpIntoLevel} / ${state.level.xpForNextLevel} XP`}
              </p>
              <div className="flex items-center gap-2">
                <p className="font-body text-lg text-white">
                  Total: {state.level.totalXp.toLocaleString("en-US")} XP
                </p>
                <SmallHoverTooltip text={xpHelpText} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function OverviewTab({
  state,
  spriteShaderSrc,
  onRefresh,
  refreshing,
  onGetNewEgg,
  getNewEggPending,
  renameMutation,
}: {
  state: PokegameStateResponse;
  spriteShaderSrc: string | null;
  onRefresh: () => void;
  refreshing: boolean;
  onGetNewEgg: () => void;
  getNewEggPending: boolean;
  renameMutation: ReturnType<typeof useRenamePokegameCreature>;
}) {
  return (
    <CreatureOverviewCard
      state={state}
      spriteShaderSrc={spriteShaderSrc}
      onRefresh={onRefresh}
      refreshing={refreshing}
      onGetNewEgg={onGetNewEgg}
      getNewEggPending={getNewEggPending}
      renameMutation={renameMutation}
    />
  );
}

export function PokegamePage({ onBack }: { onBack: () => void }) {
  const authSessionQuery = useAuthSession();
  const [activeTab, setActiveTab] = useState<PokegameTab>("overview");
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [centerPopups, setCenterPopups] = useState<CenterPopupItem[]>([]);
  const [showNicknamePrompt, setShowNicknamePrompt] = useState(false);
  const [nicknamePromptInitialValue, setNicknamePromptInitialValue] = useState("");
  const [forcePassiveOnCurrentOverview, setForcePassiveOnCurrentOverview] = useState(false);
  const toastIdRef = useRef(0);
  const centerPopupIdRef = useRef(0);
  const seenNoticeKeysRef = useRef<Set<string>>(new Set());
  const toastTimeoutsRef = useRef<number[]>([]);
  const prevLevelRef = useRef<number | null>(null);
  const promptedNicknameCycleKeysRef = useRef<Set<string>>(new Set());
  const seenClaimableAchievementIdsRef = useRef<Set<string>>(new Set());
  const shownCycleCapPopupKeysRef = useRef<Set<string>>(new Set());

  const pokegameQuery = usePokegameState();
  const buyPurifyingRune = useBuyPurifyingRune();
  const buyRareCandy = useBuyRareCandy();
  const buyShinyPotion = useBuyShinyPotion();
  const getNewEgg = useGetNewEgg();
  const devAction = usePokegameDevAction();
  const claimAchievement = useClaimPokegameAchievement();
  const renameCreature = useRenamePokegameCreature();

  useEffect(() => {
    return () => {
      toastTimeoutsRef.current.forEach((id) => window.clearTimeout(id));
      toastTimeoutsRef.current = [];
    };
  }, []);

  const enqueueCenterPopup = (title: string, body: string) => {
    const id = centerPopupIdRef.current++;
    setCenterPopups((current) => [...current, { id, title, body }]);
  };

  const state = pokegameQuery.data;
  const canUseDevtools = Boolean(POKEGAME_DEVTOOLS_ENABLED && authSessionQuery.data?.user?.isAdmin);

  useEffect(() => {
    if (activeTab === "devtools" && !canUseDevtools) {
      setActiveTab("overview");
    }
  }, [activeTab, canUseDevtools]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (activeTab !== "overview") {
      setForcePassiveOnCurrentOverview(false);
      return;
    }

    const armed = window.localStorage.getItem(FORCE_PASSIVE_POKEMON_STORAGE_KEY) === "1";
    if (!armed) return;

    window.localStorage.removeItem(FORCE_PASSIVE_POKEMON_STORAGE_KEY);
    setForcePassiveOnCurrentOverview(true);
  }, [activeTab]);

  useEffect(() => {
    if (!state || state.notices.length === 0) return;

    state.notices.forEach((notice, index) => {
      const key = buildNoticeKey(notice, index);
      if (seenNoticeKeysRef.current.has(key)) return;
      seenNoticeKeysRef.current.add(key);

      const toastData = noticeToToast(notice);
      if (toastData) {
        const id = toastIdRef.current++;
        setToasts((current) => [...current, { id, ...toastData }].slice(-5));

        const timeoutId = window.setTimeout(() => {
          setToasts((current) => current.filter((toast) => toast.id !== id));
          toastTimeoutsRef.current = toastTimeoutsRef.current.filter((tid) => tid !== timeoutId);
        }, 4200);
        toastTimeoutsRef.current.push(timeoutId);
      }
    });
  }, [state]);

  useEffect(() => {
    if (!state) return;

    const seen = seenClaimableAchievementIdsRef.current;
    const currentlyClaimable = state.achievements.filter((achievement) => achievement.claimable);

    for (const achievement of currentlyClaimable) {
      if (seen.has(achievement.id)) continue;
      seen.add(achievement.id);

      const id = toastIdRef.current++;
      setToasts((current) => [
        ...current,
        {
          id,
          title: `Achievement completed: ${achievement.title}`,
          subtitle: "Go to your Achievements tab to collect your reward!",
        },
      ].slice(-5));

      const timeoutId = window.setTimeout(() => {
        setToasts((current) => current.filter((toast) => toast.id !== id));
        toastTimeoutsRef.current = toastTimeoutsRef.current.filter((tid) => tid !== timeoutId);
      }, 5200);

      toastTimeoutsRef.current.push(timeoutId);
    }
  }, [state]);

  useEffect(() => {
    if (!state) return;
    const currentLevel = state.level.level;
    const prevLevel = prevLevelRef.current;

    if (prevLevel === null) {
      prevLevelRef.current = currentLevel;
      return;
    }

    const previousStage = getStageIndexFromLevel(prevLevel);
    const currentStage = getStageIndexFromLevel(currentLevel);
    if (currentLevel > prevLevel && previousStage >= 0 && currentStage > previousStage && currentLevel > 0) {
      enqueueCenterPopup(
        "Your Creature has evolved !",
        currentStage === 1
          ? "Let's see how big it can grow!"
          : currentStage >= 2
            ? "Let's see how far we can go!"
            : "",
      );
    }

    prevLevelRef.current = currentLevel;
  }, [state?.level.level]);

  useEffect(() => {
    if (!state) return;
    if (!state.profile.currentCreatureId || state.level.level <= 0) return;

    const levelCap = state.profile.currentLevelCap ?? 100;
    if (levelCap !== 30 && levelCap !== 50) return;
    if (state.level.level < levelCap) return;

    const cycleKey = `cap:${state.profile.currentCycleStartedAt}:${levelCap}`;
    const storageKey = `pokegame.cap.notice.${state.profile.currentCycleStartedAt}.${levelCap}`;
    if (shownCycleCapPopupKeysRef.current.has(cycleKey)) return;
    if (window.localStorage.getItem(storageKey) === "1") {
      shownCycleCapPopupKeysRef.current.add(cycleKey);
      return;
    }

    shownCycleCapPopupKeysRef.current.add(cycleKey);
    window.localStorage.setItem(storageKey, "1");
    enqueueCenterPopup(
      "Heads up!",
      levelCap === 30
        ? "Il semblerait que cette créature ne soit pas en capacité d'évoluer... On ferait mieux de passer à autre chose !"
        : "Il semblerait que cette créature ne soit pas en capacité d'évoluer plus... On ferait mieux de passer à autre chose !",
    );
  }, [
    state?.level.level,
    state?.profile.currentCreatureId,
    state?.profile.currentCycleStartedAt,
    state?.profile.currentLevelCap,
  ]);

  useEffect(() => {
    if (!state) return;
    if (state.level.level < 100 || !state.profile.currentCreatureId) return;

    const cycleKey = `lvl100:${state.profile.currentCycleStartedAt}`;
    const storageKey = `pokegame.level100.notice.${state.profile.currentCycleStartedAt}`;
    if (promptedNicknameCycleKeysRef.current.has(cycleKey)) return;
    if (window.localStorage.getItem(storageKey) === "1") {
      promptedNicknameCycleKeysRef.current.add(cycleKey);
      return;
    }

    promptedNicknameCycleKeysRef.current.add(cycleKey);
    window.localStorage.setItem(storageKey, "1");
    enqueueCenterPopup(
      "Félicitations !",
      "Votre créature est maintenant assez grande pour battre de ses propres ailes...\n\nVous pouvez la garder un moment, ou vous occuper d’une nouvelle créature grace au bouton \"new egg\" disponible sur votre page Pokegame :)",
    );
  }, [state?.level.level, state?.profile.currentCreatureId, state?.profile.currentCycleStartedAt]);

  useEffect(() => {
    if (!state) return;
    if (activeTab !== "overview") return;
    if (!state.profile.currentCreatureId || state.level.level <= 0) return;
    if (state.profile.currentCreatureNickname) return;

    const cycleKey = `nickname:${state.profile.currentCycleStartedAt}`;
    const storageKey = `pokegame.nickname.prompted.${state.profile.currentCycleStartedAt}`;
    if (promptedNicknameCycleKeysRef.current.has(cycleKey)) return;
    if (window.localStorage.getItem(storageKey) === "1") {
      promptedNicknameCycleKeysRef.current.add(cycleKey);
      return;
    }

    promptedNicknameCycleKeysRef.current.add(cycleKey);
    window.localStorage.setItem(storageKey, "1");
    setNicknamePromptInitialValue(state.profile.currentCreatureNickname ?? "");
    window.setTimeout(() => setShowNicknamePrompt(true), 700);
  }, [activeTab, state?.profile.currentCreatureId, state?.profile.currentCreatureNickname, state?.profile.currentCycleStartedAt, state?.level.level]);

  const topBarState = useMemo(() => {
    if (!state) return { moneyPo: 0 };
    return { moneyPo: state.profile.moneyPo };
  }, [state]);
  const hasClaimableAchievements = Boolean(state?.achievements.some((achievement) => achievement.claimable));
  const randomSpriteShaderSrc = useMemo(() => {
    const list = CREATURE_ASSETS.shaderSrcs;
    if (!list.length) return null;
    return list[Math.floor(Math.random() * list.length)] ?? null;
  }, []);

  const backgroundCompanions = useMemo(
    () =>
      buildCompletedCreatureBackgroundSprites(state, {
        forceAtLeastOne: activeTab === "overview" && forcePassiveOnCurrentOverview,
      }),
    [activeTab, forcePassiveOnCurrentOverview, state],
  );

  const handleDevAction = (action: PokegameDevActionInput["action"]) => {
    if (action === "reset_pokegame") {
      const confirmed = window.confirm("Reset Pokegame data only? Habits will be kept.");
      if (!confirmed) return;
    }
    if (action === "reset_all") {
      const confirmed = window.confirm("Reset all Pokegame data AND Habits? This cannot be undone.");
      if (!confirmed) return;
    }
    devAction.mutate(
      { action },
      {
        onSuccess: () => {
          if (action !== "reset_pokegame") return;
          const id = toastIdRef.current++;
          setToasts((current) => [
            ...current,
            { id, title: "Pokegame reset", subtitle: "All Pokegame data was reset. Habits were kept." },
          ].slice(-5));
        },
      },
    );
  };

  const handleForcePassivePokemon = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(FORCE_PASSIVE_POKEMON_STORAGE_KEY, "1");
    }
    const id = toastIdRef.current++;
    setToasts((current) => [
      ...current,
      {
        id,
        title: "Passive Pokemon armed",
        subtitle: "Enter Overview (egg state) to force one background Pokémon.",
      },
    ].slice(-5));
  };

  const handleBuyRareCandy = () => {
    buyRareCandy.mutate(undefined, {
      onError: (error) => {
        const id = toastIdRef.current++;
        setToasts((current) => [
          ...current,
          { id, title: "Purchase failed", subtitle: error instanceof Error ? error.message : "Unknown error" },
        ]);
      },
    });
  };

  const handleBuyShinyPotion = () => {
    buyShinyPotion.mutate(undefined, {
      onError: (error) => {
        const id = toastIdRef.current++;
        setToasts((current) => [
          ...current,
          { id, title: "Purchase failed", subtitle: error instanceof Error ? error.message : "Unknown error" },
        ]);
      },
    });
  };

  const handleBuyPurifyingRune = () => {
    if (state?.profile.currentCreatureId && state.level.level > 0 && state.level.level < 67) {
      const confirmed = window.confirm(
        "Attention, il reste au moins un stade d'évolution à cette créature ! Êtes-vous sûrs de vouloir lui dire de partir ?",
      );
      if (!confirmed) return;
    }

    buyPurifyingRune.mutate(undefined, {
      onSuccess: () => {
        const id = toastIdRef.current++;
        setToasts((current) => [
          ...current,
          { id, title: "Rune used", subtitle: "A new egg cycle can begin." },
        ].slice(-5));
      },
      onError: (error) => {
        const id = toastIdRef.current++;
        setToasts((current) => [
          ...current,
          { id, title: "Purchase failed", subtitle: error instanceof Error ? error.message : "Unknown error" },
        ]);
      },
    });
  };

  const handleGetNewEgg = () => {
    getNewEgg.mutate(undefined, {
      onSuccess: () => {
        const id = toastIdRef.current++;
        setToasts((current) => [...current, { id, title: "New egg obtained!", subtitle: "Level reset to 0." }]);
      },
      onError: (error) => {
        const id = toastIdRef.current++;
        setToasts((current) => [
          ...current,
          { id, title: "Cannot get new egg", subtitle: error instanceof Error ? error.message : "Unknown error" },
        ]);
      },
    });
  };

  const handleClaimAchievement = (achievement: PokegameStateResponse["achievements"][number]) => {
    if (!state) return;
    if (state.level.level >= 100 && achievement.rewardXp > 0) {
      const confirmed = window.confirm(
        "Attention, valider ce succès maintenant ne vous fera pas gagner d'XP pour cette créature (niveau 100). Êtes-vous sûr de vouloir continuer ?",
      );
      if (!confirmed) return;
    }

    claimAchievement.mutate(
      { achievementId: achievement.id },
      {
        onError: (error) => {
          const id = toastIdRef.current++;
          setToasts((current) => [
            ...current,
            { id, title: "Claim failed", subtitle: error instanceof Error ? error.message : "Unknown error" },
          ]);
        },
      },
    );
  };

  const handleClaimAllAchievements = async () => {
    if (!state) return;
    const claimableAchievements = state.achievements.filter((achievement) => achievement.claimable);
    if (claimableAchievements.length === 0) return;

    const hasXpRewards = claimableAchievements.some((achievement) => achievement.rewardXp > 0);
    if (state.level.level >= 100 && hasXpRewards) {
      const confirmed = window.confirm(
        "Attention, valider ces succès maintenant ne vous fera pas gagner d'XP pour cette créature (niveau 100). Êtes-vous sûr de vouloir continuer ?",
      );
      if (!confirmed) return;
    }

    try {
      for (const achievement of claimableAchievements) {
        // Sequential claims keep notices/popups ordered and avoid race conditions.
        // eslint-disable-next-line no-await-in-loop
        await claimAchievement.mutateAsync({ achievementId: achievement.id });
      }
    } catch (error) {
      const id = toastIdRef.current++;
      setToasts((current) => [
        ...current,
        { id, title: "Claim all failed", subtitle: error instanceof Error ? error.message : "Unknown error" },
      ]);
    }
  };

  const currentCenterPopup = centerPopups[0] ?? null;
  const dismissToast = (toastId: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== toastId));
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div
        className="absolute inset-0 z-0 animate-clouds-scroll"
        style={{ backgroundImage: `url(${backgroundDayImg})` }}
      />
      <div className="absolute inset-0 z-[1] bg-black/10 pointer-events-none" />

      {backgroundCompanions.length > 0 && (
        <div className="absolute inset-0 z-[2] pointer-events-none overflow-hidden">
          {backgroundCompanions.map((companion) => (
            <div
              key={companion.id}
              className="absolute group pointer-events-auto"
              style={{
                top: companion.top,
                left: companion.left,
                width: `${companion.sizePx}px`,
                height: `${companion.sizePx}px`,
              }}
            >
              <img
                src={companion.src}
                alt=""
                className="w-full h-full object-contain animate-float"
                style={{
                  opacity: companion.opacity,
                  imageRendering: "pixelated",
                  transform: `${companion.flipX ? "scaleX(-1)" : "scaleX(1)"} rotate(${companion.rotateDeg}deg)`,
                }}
              />
              <div
                className={`pointer-events-none absolute left-1/2 bottom-full mb-2 -translate-x-1/2 w-max max-w-[220px] px-3 py-2 opacity-0 translate-y-1 transition-all duration-150 group-hover:opacity-100 group-hover:translate-y-0 ${POKEGAME_TOOLTIP_PANEL_CLASS}`}
              >
                <p className="font-body text-base text-white whitespace-pre-line text-center leading-snug">
                  {companion.tooltipTitle}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={onBack}
        className="pokeball-standalone-button absolute top-4 left-4 sm:top-5 sm:left-5 z-30 bg-transparent border-0 p-0 m-0 cursor-pointer"
        title="Back to tracker"
        aria-label="Back to tracker"
      >
        <img
          src={pokeballImg}
          alt=""
          aria-hidden="true"
          className="w-10 h-10 object-contain quest-ball-icon"
        />
      </button>

      <div className="absolute top-4 right-4 sm:top-5 sm:right-5 z-30 pointer-events-none flex items-center gap-2 pixel-box px-3 py-2 !bg-card/30 !border-[#486f79] !shadow-[4px_4px_0px_0px_hsl(var(--border-shadow)/0.2)]">
        <Coins className="w-4 h-4 text-amber-300" />
        <span className="font-display text-xs sm:text-sm text-white">{formatPo(topBarState.moneyPo)}</span>
      </div>

      {toasts.length > 0 && (
        <div className="fixed top-20 right-4 sm:right-5 z-40 space-y-2 max-w-[340px]">
          {toasts.map((toast) => (
            <button
              key={toast.id}
              type="button"
              onClick={() => dismissToast(toast.id)}
              className="pixel-box w-full text-left px-3 py-3 !bg-card/30 !border-[#486f79] !shadow-[4px_4px_0px_0px_hsl(var(--border-shadow)/0.2)] cursor-pointer"
              title="Dismiss notification"
            >
              <p className="font-display text-xs text-white">{toast.title}</p>
              {toast.subtitle ? <p className="font-body text-lg text-white">{toast.subtitle}</p> : null}
            </button>
          ))}
        </div>
      )}

      <CenterPopupOverlay
        item={currentCenterPopup}
        onClose={() => setCenterPopups((current) => current.slice(1))}
      />

      <NicknamePromptModal
        open={showNicknamePrompt}
        initialValue={nicknamePromptInitialValue}
        pending={renameCreature.isPending}
        onSkip={() => setShowNicknamePrompt(false)}
        onSubmit={(nickname) => {
          renameCreature.mutate(
            { nickname: nickname.trim() ? nickname.trim() : null },
            {
              onSuccess: () => setShowNicknamePrompt(false),
              onError: (error) => {
                const id = toastIdRef.current++;
                setToasts((current) => [
                  ...current,
                  { id, title: "Nickname save failed", subtitle: error instanceof Error ? error.message : "Unknown error" },
                ]);
              },
            },
          );
        }}
      />

      <div className="relative z-20 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 sm:pt-14 pb-10">
        <header className="mb-10 sm:mb-12 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex items-center gap-6">
            {sunImg ? (
              <img
                src={sunImg}
                alt="Sun"
                className="w-24 h-24 object-contain animate-float drop-shadow-xl self-start mt-2 pointer-events-none"
                style={{
                  imageRendering: "pixelated",
                  filter:
                    "drop-shadow(0 0 8px rgba(255, 230, 120, 0.9)) drop-shadow(0 0 18px rgba(255, 230, 120, 0.65)) drop-shadow(0 0 34px rgba(255, 244, 194, 0.42)) drop-shadow(0 0 56px rgba(255, 250, 220, 0.25))",
                }}
              />
            ) : null}
            <div>
              <h1>
                <button
                  type="button"
                  onClick={() => setActiveTab("overview")}
                  className="font-display text-3xl sm:text-5xl text-foreground leading-tight bg-transparent border-0 p-0 m-0 cursor-pointer text-left"
                  style={{
                    textShadow:
                      "0 0 8px rgba(103,232,249,0.72), 0 0 18px rgba(103,232,249,0.42), 0 0 28px rgba(103,232,249,0.2)",
                  }}
                  title="Go to Overview"
                >
                  Pokegame
                </button>
              </h1>
              <p className="font-body text-lg sm:text-xl text-white mt-2 tracking-wide">
                Earn XP and Po by completing habits.
              </p>
            </div>
          </div>
        </header>

        <div className="relative z-30 mb-4 flex flex-wrap items-center justify-center gap-4">
          <PokegameTabs
            activeTab={activeTab}
            onChange={setActiveTab}
            hasClaimableAchievements={hasClaimableAchievements}
            showDevtools={canUseDevtools}
          />
        </div>

        {pokegameQuery.isLoading ? (
          <div className="pixel-box p-10 bg-card/85 text-center">
            <p className="font-display text-sm text-foreground animate-pulse">Loading Pokegame...</p>
          </div>
        ) : pokegameQuery.isError || !state ? (
          <div className="pixel-box p-6 bg-destructive/10 border-destructive/50">
            <p className="font-display text-sm text-destructive">Failed to load Pokegame</p>
            <p className="font-body text-lg text-muted-foreground mt-2">
              {pokegameQuery.error instanceof Error ? pokegameQuery.error.message : "Unknown error"}
            </p>
            <button
              type="button"
              onClick={() => pokegameQuery.refetch()}
              className="pixel-button mt-4 px-4 py-3 bg-card/70 border-border/70 text-foreground"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {activeTab === "overview" && (
              <OverviewTab
                state={state}
                spriteShaderSrc={randomSpriteShaderSrc}
                onRefresh={() => {
                  seenNoticeKeysRef.current.clear();
                  void pokegameQuery.refetch();
                }}
                refreshing={pokegameQuery.isFetching}
                onGetNewEgg={handleGetNewEgg}
                getNewEggPending={getNewEgg.isPending}
                renameMutation={renameCreature}
              />
            )}

            {activeTab === "achievements" && (
              <AchievementsTab
                state={state}
                onClaim={handleClaimAchievement}
                onClaimAll={handleClaimAllAchievements}
                claiming={claimAchievement.isPending}
              />
            )}

            {activeTab === "dex" && <DexTab state={state} assets={CREATURE_ASSETS} />}

            {activeTab === "shop" && (
              <ShopTab
                state={state}
                assets={CREATURE_ASSETS}
                onBuyRareCandy={handleBuyRareCandy}
                onBuyShinyPotion={handleBuyShinyPotion}
                onBuyPurifyingRune={handleBuyPurifyingRune}
                buyingRareCandy={buyRareCandy.isPending}
                buyingShinyPotion={buyShinyPotion.isPending}
                buyingPurifyingRune={buyPurifyingRune.isPending}
                onNotify={(title, subtitle) => {
                  const id = toastIdRef.current++;
                  setToasts((current) => [...current, { id, title, subtitle }].slice(-5));
                }}
              />
            )}

            {activeTab === "devtools" && canUseDevtools && (
              <DevToolsTab
                onAction={handleDevAction}
                onForcePassivePokemon={handleForcePassivePokemon}
                isPending={devAction.isPending}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
