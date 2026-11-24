import type { Entry, Kind, Review } from "../../app/model";

export type Person = { id: string; name: string };
export type NewEntry = { id: string; name: string; key: string; kind: Kind; note: string };
export type EntryRow = Omit<Entry, "reviews" | "mine"> & { mine: boolean | number };
export type NoteRow = Omit<Review, "mine"> & { entry_id: string; mine: boolean | number };
export type ReviewField = "note" | "rating" | "vote";

export interface BoardStore {
  findPerson(hash: string): Promise<Person | null>;
  read(viewer: string): Promise<{ entries: EntryRow[]; notes: NoteRow[] }>;
  renamePerson(id: string, name: string): Promise<void>;
  addPerson(id: string, name: string, hash: string, now: number): Promise<void>;
  addEntries(rows: NewEntry[], author: string, now: number): Promise<number>;
  moveEntry(id: string, author: string, kind: Kind): Promise<boolean>;
  deleteEntry(id: string, author: string): Promise<boolean>;
  writeReview(id: string, author: string, field: ReviewField, value: string | number | null, now: number): Promise<boolean>;
}
