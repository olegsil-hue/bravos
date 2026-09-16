export type HeroId = "kane" | "simon" | "mikari" | "adena" | "laska";
export type Expression = "neutral" | "tired" | "annoyed" | "smile";
export type OutfitId = "travel" | "hoodie" | "knit" | "jacket";
export type HairId = "canon" | "darker" | "lighter" | "dusk";
export type PerkId =
  | "quiet-window"
  | "folded-page"
  | "unanswered"
  | "glass-look"
  | "hoodie-nest";

export type HeroEdit = {
  displayName: string;
  color: string;
  outfit: OutfitId;
  hair: HairId;
  expression: Expression;
  accessory: boolean;
  bio: string;
};

export type StudioState = Record<HeroId, HeroEdit>;

export type HeroUpgrade = {
  nerve: number;
  fatigue: number;
  perk: PerkId | null;
};

export type UpgradeState = Record<HeroId, HeroUpgrade>;

export type Session = {
  code: string;
  guestName: string;
};

export type Flags = {
  hook: "tape" | "window" | "book" | null;
  organizer: "kane" | "simon" | "mikari" | "adena" | "none" | null;
  attention: "pairs-girls" | "pairs-unfriendly" | "window" | null;
  arrival: "rooms" | "gate" | "laska" | null;
};

export type Choice = {
  id: string;
  label: string;
  next: string;
  set?: Partial<Flags>;
};

export type Beat = {
  id: string;
  kind?: "scene" | "chat";
  title?: string;
  speaker?: HeroId | "narrator";
  expression?: Expression;
  bg: string;
  sprite?: HeroId;
  sprites?: HeroId[];
  eta?: string;
  text: string;
  choices?: Choice[];
  next?: string;
};
