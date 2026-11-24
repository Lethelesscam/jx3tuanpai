import { LIMIT } from "../../model";
import type { BoardStore, EntryRow, NoteRow, Person } from "./store";

export function d1Board(db: D1Database): BoardStore {
  return {
    findPerson(hash) {
      return db.prepare("SELECT id, name FROM people WHERE session_hash = ?").bind(hash).first<Person>();
    },
    async read(viewer) {
      const [entries, notes] = await db.batch([
        db.prepare(`
          SELECT e.id, e.name, e.kind, e.created_at, p.name AS author, e.author_id = ? AS mine,
            COALESCE(SUM(r.vote = 1), 0) AS up, COALESCE(SUM(r.vote = -1), 0) AS down,
            AVG(r.rating) AS rating, COUNT(r.rating) AS ratingCount,
            COALESCE(MAX(CASE WHEN r.author_id = ? THEN r.vote END), 0) AS myVote,
            MAX(CASE WHEN r.author_id = ? THEN r.rating END) AS myRating,
            COALESCE(MAX(CASE WHEN r.author_id = ? THEN r.note END), '') AS myNote
          FROM entries e JOIN people p ON p.id = e.author_id LEFT JOIN reviews r ON r.entry_id = e.id
          GROUP BY e.id ORDER BY e.created_at DESC, e.id DESC LIMIT ${LIMIT}
        `).bind(viewer, viewer, viewer, viewer),
        db.prepare(`
          SELECT r.entry_id, p.name, r.note, r.updated_at, r.author_id = ? AS mine
          FROM reviews r JOIN people p ON p.id = r.author_id
          WHERE r.note <> '' ORDER BY r.updated_at DESC LIMIT 4000
        `).bind(viewer),
      ]);
      return { entries: entries.results as EntryRow[], notes: notes.results as NoteRow[] };
    },
    async renamePerson(id, name) {
      await db.prepare("UPDATE people SET name = ? WHERE id = ?").bind(name, id).run();
    },
    async addPerson(id, name, hash) {
      await db.prepare("INSERT INTO people (id, name, session_hash) VALUES (?, ?, ?)").bind(id, name, hash).run();
    },
    async addEntries(rows, author, now) {
      const batch = JSON.stringify(rows);
      const [inserted] = await db.batch([
        db.prepare(`
          INSERT INTO entries (id, name, name_key, kind, author_id, created_at)
          SELECT j.value ->> '$.id', j.value ->> '$.name', j.value ->> '$.key', j.value ->> '$.kind', ?, ?
          FROM json_each(?) j
          WHERE NOT EXISTS (SELECT 1 FROM entries e WHERE e.name_key = j.value ->> '$.key')
          ORDER BY j.key LIMIT MAX(0, ? - (SELECT COUNT(*) FROM entries))
          ON CONFLICT (name_key) DO NOTHING
        `).bind(author, now, batch, LIMIT),
        db.prepare(`
          INSERT INTO reviews (entry_id, author_id, note, updated_at)
          SELECT e.id, ?, j.value ->> '$.note', ?
          FROM json_each(?) j JOIN entries e ON e.id = j.value ->> '$.id'
          WHERE (j.value ->> '$.note') <> ''
        `).bind(author, now, batch),
      ]);
      return inserted.meta.changes;
    },
    async moveEntry(id, author, kind) {
      const result = await db.prepare("UPDATE entries SET kind = ? WHERE id = ? AND author_id = ?").bind(kind, id, author).run();
      return Boolean(result.meta.changes);
    },
    async deleteEntry(id, author) {
      const result = await db.prepare("DELETE FROM entries WHERE id = ? AND author_id = ?").bind(id, author).run();
      return Boolean(result.meta.changes);
    },
    async writeReview(id, author, field, value, now) {
      const result = await db.prepare(`
        INSERT INTO reviews (entry_id, author_id, ${field}, updated_at)
        SELECT id, ?, ?, ? FROM entries WHERE id = ?
        ON CONFLICT (entry_id, author_id) DO UPDATE SET ${field} = excluded.${field},
          updated_at = CASE WHEN ? = 'note' THEN excluded.updated_at ELSE reviews.updated_at END
      `).bind(author, value, now, id, field).run();
      return Boolean(result.meta.changes);
    },
  };
}
