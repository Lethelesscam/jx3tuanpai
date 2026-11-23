export type Kind = "red" | "black";
export type Review = { name: string; note: string; updated_at: number; mine: boolean };
export type Entry = {
  id: string; name: string; kind: Kind; author: string; created_at: number; mine: boolean;
  up: number; down: number; rating: number | null; ratingCount: number;
  myVote: number; myRating: number | null; myNote: string; reviews: Review[];
};
export type BoardData = { entries: Entry[]; identity: { name: string } | null };
export type Draft = { name: string; kind: Kind | ""; note: string; needsReview?: boolean };
export const LIMIT = 600;
export const IMPORT_LIMIT = 50;
export const NAME_LIMIT = 40;
export const NOTE_LIMIT = 300;
export const nameKey = (value: string) => value.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
export const isKind = (value: unknown): value is Kind => value === "red" || value === "black";
