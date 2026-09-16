export type HeroId = "kane" | "simon" | "mikari" | "adena" | "laska";
export type Expression = "neutral" | "tired" | "annoyed" | "smile";
export type OutfitId = "travel" | "hoodie" | "knit" | "jacket";
export type HairId = "canon" | "darker" | "lighter" | "dusk";

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

export type Session = {
  code: string;
  guestName: string;
};

export type Flags = {
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
  speaker?: HeroId | "narrator";
  expression?: Expression;
  bg: string;
  sprite?: HeroId;
  text: string;
  choices?: Choice[];
  next?: string;
};
