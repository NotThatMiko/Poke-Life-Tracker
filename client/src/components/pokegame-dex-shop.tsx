import { useMemo, useState } from "react";
import type { PokegameStateResponse } from "@shared/routes";
import { SlidersHorizontal, Sparkles, Star } from "lucide-react";
import { useTogglePokegameDexFavorite } from "@/hooks/use-pokegame";
import { POKEGAME_TOOLTIP_PANEL_CLASS } from "@/components/pokegame-ui";

type PokegameDexShopAssets = {
  dexStageSpriteById: Record<string, string>;
  shinyDexStageSpriteById: Record<string, string>;
  rareCandySrc: string | null;
  shinyPotionSrc: string | null;
  purifyingRuneSrc: string | null;
};

export function DexTab({
  state,
  assets,
}: {
  state: PokegameStateResponse;
  assets: Pick<PokegameDexShopAssets, "dexStageSpriteById" | "shinyDexStageSpriteById">;
}) {
  const [shinyViewByStageId, setShinyViewByStageId] = useState<Record<string, boolean>>({});
  const [showFilters, setShowFilters] = useState(false);
  const [hideUndiscovered, setHideUndiscovered] = useState(false);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [shinyUnlockedOnly, setShinyUnlockedOnly] = useState(false);
  const [normalOnly, setNormalOnly] = useState(false);
  const [favoritesFirst, setFavoritesFirst] = useState(false);
  const toggleDexFavorite = useTogglePokegameDexFavorite();

  const discoveredSet = useMemo(
    () => new Set(state.profile.discoveredDexStageIds ?? []),
    [state.profile.discoveredDexStageIds],
  );
  const discoveredShinySet = useMemo(
    () => new Set(state.profile.discoveredShinyDexStageIds ?? []),
    [state.profile.discoveredShinyDexStageIds],
  );
  const favoriteSet = useMemo(
    () => new Set(state.profile.favoritePassiveDexStageIds ?? []),
    [state.profile.favoritePassiveDexStageIds],
  );

  const availableDexStageIds = state.creatures.availableDexStageIds ?? [];
  const discoveredCount = availableDexStageIds.filter(
    (id) => discoveredSet.has(id) || discoveredShinySet.has(id),
  ).length;

  const visibleDexStageIds = useMemo(() => {
    const filtered = availableDexStageIds.filter((dexStageId) => {
      const isNormalDiscovered = discoveredSet.has(dexStageId);
      const isShinyDiscovered = discoveredShinySet.has(dexStageId);
      const isDiscovered = isNormalDiscovered || isShinyDiscovered;
      const isFavorite = favoriteSet.has(dexStageId);

      if (hideUndiscovered && !isDiscovered) return false;
      if (favoritesOnly && !isFavorite) return false;
      if (shinyUnlockedOnly && !isShinyDiscovered) return false;
      if (normalOnly && !isNormalDiscovered) return false;
      return true;
    });

    if (favoritesFirst) {
      filtered.sort((a, b) => {
        const aFav = favoriteSet.has(a) ? 1 : 0;
        const bFav = favoriteSet.has(b) ? 1 : 0;
        if (aFav !== bFav) return bFav - aFav;
        return a.localeCompare(b);
      });
    }

    return filtered;
  }, [
    availableDexStageIds,
    discoveredSet,
    discoveredShinySet,
    favoriteSet,
    hideUndiscovered,
    favoritesOnly,
    shinyUnlockedOnly,
    normalOnly,
    favoritesFirst,
  ]);

  const activeFilterCount =
    Number(hideUndiscovered) +
    Number(favoritesOnly) +
    Number(shinyUnlockedOnly) +
    Number(normalOnly) +
    Number(favoritesFirst);

  return (
    <div className="space-y-4">
      <div className="pixel-box p-4 sm:p-5 !bg-card/30 !border-[#486f79] !shadow-[4px_4px_0px_0px_hsl(var(--border-shadow)/0.2)]">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <p className="font-display text-xs text-white">Dex</p>
            <p className="font-body text-lg text-white">
              {discoveredCount}/{availableDexStageIds.length} stages discovered
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowFilters((current) => !current)}
            className="pixel-button px-3 py-2 self-start !bg-card/30 !border-[#486f79] text-white hover:!border-cyan-300"
            aria-expanded={showFilters}
            aria-label="Toggle Dex filters"
          >
            <SlidersHorizontal className="w-4 h-4 mr-2 inline-block" />
            Filters
            {activeFilterCount > 0 ? (
              <span className="ml-2 inline-flex items-center justify-center min-w-5 h-5 rounded-full bg-cyan-300/20 text-cyan-200 text-[10px] px-1">
                {activeFilterCount}
              </span>
            ) : null}
          </button>
        </div>

        {showFilters ? (
          <div className="mt-3 pt-3 border-t border-[#486f79]/40 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
            <label className="inline-flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={favoritesOnly}
                onChange={(event) => setFavoritesOnly(event.target.checked)}
                className="w-4 h-4 shrink-0 accent-cyan-300 cursor-pointer"
              />
              <span className="font-display text-[10px] sm:text-xs text-white whitespace-nowrap">
                Favorites only
              </span>
            </label>

            <label className="inline-flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={shinyUnlockedOnly}
                onChange={(event) => setShinyUnlockedOnly(event.target.checked)}
                className="w-4 h-4 shrink-0 accent-cyan-300 cursor-pointer"
              />
              <span className="font-display text-[10px] sm:text-xs text-white whitespace-nowrap">
                Shiny unlocked only
              </span>
            </label>

            <label className="inline-flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={normalOnly}
                onChange={(event) => setNormalOnly(event.target.checked)}
                className="w-4 h-4 shrink-0 accent-cyan-300 cursor-pointer"
              />
              <span className="font-display text-[10px] sm:text-xs text-white whitespace-nowrap">
                Normal only
              </span>
            </label>

            <label className="inline-flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={hideUndiscovered}
                onChange={(event) => setHideUndiscovered(event.target.checked)}
                className="w-4 h-4 shrink-0 accent-cyan-300 cursor-pointer"
              />
              <span className="font-display text-[10px] sm:text-xs text-white whitespace-nowrap">
                Hide undiscovered
              </span>
            </label>

            <label className="inline-flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={favoritesFirst}
                onChange={(event) => setFavoritesFirst(event.target.checked)}
                className="w-4 h-4 shrink-0 accent-cyan-300 cursor-pointer"
              />
              <span className="font-display text-[10px] sm:text-xs text-white whitespace-nowrap">
                Favorites first
              </span>
            </label>
          </div>
        ) : null}
      </div>

      <div className="pixel-box p-3 sm:p-4 !bg-card/30 !border-[#486f79] !shadow-[4px_4px_0px_0px_hsl(var(--border-shadow)/0.2)]">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
          {visibleDexStageIds.map((dexStageId) => {
            const isNormalDiscovered = discoveredSet.has(dexStageId);
            const isShinyDiscovered = discoveredShinySet.has(dexStageId);
            const isDiscovered = isNormalDiscovered || isShinyDiscovered;
            const hasExplicitShinyView = Object.prototype.hasOwnProperty.call(shinyViewByStageId, dexStageId);
            const showShiny = hasExplicitShinyView ? Boolean(shinyViewByStageId[dexStageId]) : shinyUnlockedOnly;
            const spriteSrc = showShiny
              ? assets.shinyDexStageSpriteById[dexStageId] ?? null
              : assets.dexStageSpriteById[dexStageId] ?? null;
            const canShowSprite = showShiny ? isShinyDiscovered : isNormalDiscovered;
            const nickname = isDiscovered ? (state.profile.dexStageNicknames?.[dexStageId] ?? "") : "";
            const isFavorite = favoriteSet.has(dexStageId);

            return (
              <button
                key={dexStageId}
                type="button"
                onClick={() => {
                  if (!isDiscovered) return;
                  setShinyViewByStageId((current) => ({
                    ...current,
                    [dexStageId]: !current[dexStageId],
                  }));
                }}
                className={`relative pixel-box !bg-card/30 !border-[#486f79] !shadow-[4px_4px_0px_0px_hsl(var(--border-shadow)/0.2)] p-2 min-h-[126px] sm:min-h-[138px] flex flex-col items-center justify-center text-center ${
                  isDiscovered ? "cursor-pointer hover:!border-cyan-300" : "cursor-default"
                }`}
              >
                <span className="absolute top-1.5 left-1.5 font-display text-[10px] text-white/90">
                  {dexStageId}
                </span>
                {isDiscovered ? (
                  <span
                    role="checkbox"
                    aria-checked={isFavorite}
                    aria-label={isFavorite ? "Remove from passive favorites" : "Add to passive favorites"}
                    title={isFavorite ? "Remove from passive favorites" : "Add to passive favorites"}
                    tabIndex={0}
                    className={`absolute top-1 right-1 p-1 rounded-sm transition-colors cursor-pointer ${
                      isFavorite ? "text-amber-300" : "text-white/55 hover:text-white"
                    }`}
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleDexFavorite.mutate({
                        dexStageId,
                        favorite: !isFavorite,
                      });
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      event.stopPropagation();
                      toggleDexFavorite.mutate({
                        dexStageId,
                        favorite: !isFavorite,
                      });
                    }}
                  >
                    <Star className="w-3.5 h-3.5" fill={isFavorite ? "currentColor" : "none"} aria-hidden="true" />
                  </span>
                ) : null}

                <div className="flex-1 w-full flex items-center justify-center">
                  {canShowSprite && spriteSrc ? (
                    <img
                      src={spriteSrc}
                      alt={`Dex ${dexStageId}${showShiny ? " shiny" : ""}`}
                      className="w-14 h-14 sm:w-16 sm:h-16 object-contain"
                      style={{ imageRendering: "pixelated" }}
                    />
                  ) : (
                    <span className="font-display text-2xl sm:text-3xl leading-none text-white/90">?</span>
                  )}
                </div>

                {isDiscovered ? (
                  <div className="absolute left-2 right-2 -bottom-1">
                    <p className="font-body text-sm text-white min-h-[18px] truncate">{nickname}</p>
                    <p className="font-display text-[9px] text-white/40 mt-0.5">&nbsp;</p>
                  </div>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function ShopTab({
  state,
  assets,
  onBuyRareCandy,
  onBuyShinyPotion,
  onBuyPurifyingRune,
  buyingRareCandy,
  buyingShinyPotion,
  buyingPurifyingRune,
  onNotify,
}: {
  state: PokegameStateResponse;
  assets: Pick<PokegameDexShopAssets, "rareCandySrc" | "shinyPotionSrc" | "purifyingRuneSrc">;
  onBuyRareCandy: () => void;
  onBuyShinyPotion: () => void;
  onBuyPurifyingRune: () => void;
  buyingRareCandy: boolean;
  buyingShinyPotion: boolean;
  buyingPurifyingRune: boolean;
  onNotify: (title: string, subtitle?: string) => void;
}) {
  const rareCandy = state.shop.rareCandy;
  const shinyPotion = state.shop.shinyPotion;
  const purifyingRune = state.shop.purifyingRune;
  const canBuyRareCandy = rareCandy.canBuy && !buyingRareCandy;
  const canBuyShinyPotion = shinyPotion.canAfford && !buyingShinyPotion && !shinyPotion.blockMessage;
  const canBuyPurifyingRune =
    purifyingRune.canAfford && !buyingPurifyingRune && !purifyingRune.blockMessage;

  return (
    <div className="pixel-box p-4 sm:p-5 !bg-card/30 !border-[#486f79] !shadow-[4px_4px_0px_0px_hsl(var(--border-shadow)/0.2)] space-y-4">
      <div>
        <p className="font-display text-xs text-white">Shop</p>
        <p className="font-body text-lg text-white">Spend Po to help your creature grow.</p>
      </div>

      <div className="border-2 border-[#486f79] bg-background/15 p-4 shadow-[4px_4px_0px_0px_hsl(var(--border-shadow)/0.2)]">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="w-20 h-20 sm:w-24 sm:h-24 border-2 border-border/50 bg-background/10 flex items-center justify-center shrink-0">
            {assets.rareCandySrc ? (
              <img
                src={assets.rareCandySrc}
                alt="Super Bonbon"
                className="w-14 h-14 sm:w-16 sm:h-16 object-contain"
                style={{ imageRendering: "pixelated" }}
              />
            ) : (
              <Sparkles className="w-8 h-8 text-muted-foreground" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="font-display text-sm text-white">Super Bonbon</p>
            <p className="font-body text-lg text-white">Gain 1 level instantly (also grants the +20 Po level reward).</p>
            <p className="font-display text-[10px] text-white mt-1">Cost: {rareCandy.costPo} Po</p>
          </div>

          <button
            type="button"
            onClick={onBuyRareCandy}
            disabled={!canBuyRareCandy}
            className="pixel-button px-4 py-3 bg-primary/20 border-accent text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {buyingRareCandy ? "Buying..." : "Buy"}
          </button>
        </div>
      </div>

      <div className="border-2 border-[#486f79] bg-background/15 p-4 shadow-[4px_4px_0px_0px_hsl(var(--border-shadow)/0.2)]">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="w-20 h-20 sm:w-24 sm:h-24 border-2 border-border/50 bg-background/10 flex items-center justify-center shrink-0">
            {assets.shinyPotionSrc ? (
              <img
                src={assets.shinyPotionSrc}
                alt="Potion Brillante"
                className="w-14 h-14 sm:w-16 sm:h-16 object-contain"
                style={{ imageRendering: "pixelated" }}
              />
            ) : (
              <Sparkles className="w-8 h-8 text-muted-foreground" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="font-display text-sm text-white">Potion Brillante</p>
            <p className="font-body text-lg text-white">
              Turns your current creature shiny instantly. Its evolutions will stay shiny this cycle.
            </p>
            <p className="font-display text-[10px] text-white mt-1">Cost: {shinyPotion.costPo} Po</p>
          </div>

          <div className="relative group inline-flex">
            <button
              type="button"
              onClick={() => {
                if (shinyPotion.blockMessage) {
                  onNotify("Purchase failed", shinyPotion.blockMessage);
                  return;
                }
                onBuyShinyPotion();
              }}
              disabled={!canBuyShinyPotion}
              className="pixel-button px-4 py-3 bg-primary/20 border-accent text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {buyingShinyPotion ? "Buying..." : "Buy"}
            </button>
            {shinyPotion.blockMessage ? (
              <div
                className={`pointer-events-none absolute right-0 bottom-full mb-2 z-40 w-[280px] p-3 opacity-0 translate-y-1 transition-all duration-150 group-hover:opacity-100 group-hover:translate-y-0 ${POKEGAME_TOOLTIP_PANEL_CLASS}`}
              >
                <p className="font-body text-base text-white whitespace-pre-line">{shinyPotion.blockMessage}</p>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="border-2 border-[#486f79] bg-background/15 p-4 shadow-[4px_4px_0px_0px_hsl(var(--border-shadow)/0.2)]">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="w-20 h-20 sm:w-24 sm:h-24 border-2 border-border/50 bg-background/10 flex items-center justify-center shrink-0">
            {assets.purifyingRuneSrc ? (
              <img
                src={assets.purifyingRuneSrc}
                alt="Rune purifiante"
                className="w-14 h-14 sm:w-16 sm:h-16 object-contain"
                style={{ imageRendering: "pixelated" }}
              />
            ) : (
              <Sparkles className="w-8 h-8 text-muted-foreground" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="font-display text-sm text-white">Rune purifiante</p>
            <p className="font-body text-lg text-white">
              Release your current creature early and start a new egg cycle right away.
            </p>
            <p className="font-display text-[10px] text-white mt-1">Cost: {purifyingRune.costPo} Po</p>
          </div>

          <div className="relative group inline-flex">
            <button
              type="button"
              onClick={() => {
                if (purifyingRune.blockMessage) {
                  onNotify("Purchase failed", purifyingRune.blockMessage);
                  return;
                }
                onBuyPurifyingRune();
              }}
              disabled={!canBuyPurifyingRune}
              className="pixel-button px-4 py-3 bg-primary/20 border-accent text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {buyingPurifyingRune ? "Buying..." : "Buy"}
            </button>
            {purifyingRune.blockMessage ? (
              <div
                className={`pointer-events-none absolute right-0 bottom-full mb-2 z-40 w-[320px] p-3 opacity-0 translate-y-1 transition-all duration-150 group-hover:opacity-100 group-hover:translate-y-0 ${POKEGAME_TOOLTIP_PANEL_CLASS}`}
              >
                <p className="font-body text-base text-white whitespace-pre-line">{purifyingRune.blockMessage}</p>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
