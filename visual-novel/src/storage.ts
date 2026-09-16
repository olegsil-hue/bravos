import type { Expression, HeroEdit, HeroId, StudioState } from "./types";

export const STORAGE_STUDIO = "unmapped-peninsula-studio";
export const STORAGE_SESSION = "unmapped-peninsula-session";

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

export function loadStudio(): StudioState {
  try {
    const raw = localStorage.getItem(STORAGE_STUDIO);
    if (!raw) return defaultStudio();
    const parsed = JSON.parse(raw) as StudioState;
    return { ...defaultStudio(), ...parsed };
  } catch {
    return defaultStudio();
  }
}

export function saveStudio(state: StudioState) {
  localStorage.setItem(STORAGE_STUDIO, JSON.stringify(state));
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
