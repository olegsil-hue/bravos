import type { Expression, HeroEdit, HeroId, HeroUpgrade, PerkId, StudioState, UpgradeState } from "./types";

export const STORAGE_STUDIO = "unmapped-peninsula-studio";
export const STORAGE_SESSION = "unmapped-peninsula-session";
export const STORAGE_UPGRADE = "unmapped-peninsula-upgrade";

export const HERO_ORDER: HeroId[] = ["kane", "simon", "mikari", "adena", "laska"];

export const DEFAULT_BIOS: Record<HeroId, string> = {
  kane: "Looks about twenty-two. Agreed to the trip, then regretted the crowd. Wants a private room and silence.",
  simon: "Homebody who left the house anyway. Noticed a few people who stand out. Opened a book beside an unfriendly seatmate of similar age — the post never names that neighbor.",
  mikari: "Tsuji. Japanese bookworm, exhausted and angry: the company answered none of her questions. Hair tips turned orange-red on boarding. Dates in her own notes (16.05 / 17.05) do not match the opening date 17.07.2025 — unresolved.",
  adena: "Adena / Deni. Short red-orange hair, lion ears, heterochromia (right black with white broken lines; left red with an orange pupil). One earbud, headache, stuffy bus. Brought her weasel familiar because it was allowed.",
  laska: "White weasel familiar with a peach diamond on the forehead. A piece of Adena's soul — and her nerves. Yawns, pokes, hides in the hoodie.",
};

export const DEFAULT_NAMES: Record<HeroId, string> = {
  kane: "Kane Avis",
  simon: "Simon Harrison",
  mikari: "Mikari / Tsuji",
  adena: "Adena / Deni",
  laska: "Laska",
};

export const DEFAULT_COLORS: Record<HeroId, string> = {
  kane: "#6b7288",
  simon: "#c4a574",
  mikari: "#c45c32",
  adena: "#d45a3a",
  laska: "#f3d5b8",
};

export const PERKS: Record<PerkId, { label: string; hero: HeroId; blurb: string }> = {
  "quiet-window": {
    label: "Quiet window",
    hero: "kane",
    blurb: "Suggested: keep eyes on the glass. Crowd noise drops a notch in play.",
  },
  "folded-page": {
    label: "Folded page",
    hero: "simon",
    blurb: "Suggested: a book as a door that is not. Seatmate still unnamed.",
  },
  unanswered: {
    label: "Unanswered",
    hero: "mikari",
    blurb: "Suggested: the company still owes her names. Dates 16.05 / 17.05 stay open.",
  },
  "glass-look": {
    label: "Glass look",
    hero: "adena",
    blurb: "Suggested: watch the cabin in the window so no one calls it staring.",
  },
  "hoodie-nest": {
    label: "Hoodie nest",
    hero: "laska",
    blurb: "Suggested: Laska may hide, poke, or ride the collar — allowed familiar.",
  },
};

export function defaultHero(id: HeroId): HeroEdit {
  return {
    displayName: DEFAULT_NAMES[id],
    color: DEFAULT_COLORS[id],
    outfit: id === "adena" ? "hoodie" : id === "simon" ? "knit" : id === "kane" ? "jacket" : "travel",
    hair: "canon",
    expression: id === "kane" || id === "adena" || id === "mikari" ? "tired" : "neutral",
    accessory: id === "simon" || id === "mikari" || id === "adena",
    bio: DEFAULT_BIOS[id],
  };
}

export function defaultStudio(): StudioState {
  return {
    kane: defaultHero("kane"),
    simon: defaultHero("simon"),
    mikari: defaultHero("mikari"),
    adena: defaultHero("adena"),
    laska: defaultHero("laska"),
  };
}

export function defaultUpgradeFor(id: HeroId): HeroUpgrade {
  const fatigue = id === "mikari" || id === "adena" ? 4 : id === "kane" ? 3 : 2;
  const nerve = id === "kane" ? 4 : id === "mikari" ? 3 : 2;
  return { nerve, fatigue, perk: null };
}

export function defaultUpgrade(): UpgradeState {
  return {
    kane: defaultUpgradeFor("kane"),
    simon: defaultUpgradeFor("simon"),
    mikari: defaultUpgradeFor("mikari"),
    adena: defaultUpgradeFor("adena"),
    laska: defaultUpgradeFor("laska"),
  };
}

export function loadStudio(): StudioState {
  try {
    const raw = localStorage.getItem(STORAGE_STUDIO);
    if (!raw) return defaultStudio();
    return { ...defaultStudio(), ...JSON.parse(raw) };
  } catch {
    return defaultStudio();
  }
}

export function saveStudio(state: StudioState) {
  localStorage.setItem(STORAGE_STUDIO, JSON.stringify(state));
}

export function loadUpgrade(): UpgradeState {
  try {
    const raw = localStorage.getItem(STORAGE_UPGRADE);
    if (!raw) return defaultUpgrade();
    return { ...defaultUpgrade(), ...JSON.parse(raw) };
  } catch {
    return defaultUpgrade();
  }
}

export function saveUpgrade(state: UpgradeState) {
  localStorage.setItem(STORAGE_UPGRADE, JSON.stringify(state));
}

export function portraitSrc(id: HeroId, expression: Expression, kind: "bust" | "full" = "bust") {
  if (id === "laska") {
    return kind === "full" ? "assets/characters/laska-fullbody.png" : "assets/characters/laska-bust.png";
  }
  if (kind === "full") return `assets/characters/${id}-fullbody.png`;
  return `assets/characters/${id}-expr-${expression}.png`;
}

export function bustSrc(id: HeroId) {
  return `assets/characters/${id}-bust.png`;
}

export function activePerks(up: UpgradeState): { hero: HeroId; label: string }[] {
  return HERO_ORDER.flatMap((id) => {
    const p = up[id].perk;
    if (!p) return [];
    return [{ hero: id, label: PERKS[p].label }];
  });
}
