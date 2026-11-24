import type { Connection, Pool, PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { LIMIT } from "../../app/model";
import type { BoardStore, EntryRow, NoteRow, Person } from "./store";

export const mysqlClientOptions = {
  charset: "utf8mb4_unicode_ci",
  disableEval: true,
  connectTimeout: 8000,
};

export async function withMysqlBoard(
  database: Pool,
  handle: (store: BoardStore) => Promise<Response>,
): Promise<Response> {
  let connection: PoolConnection | undefined;
  try {
    connection = await database.getConnection();
    return await handle(mysqlBoard(connection));
  } catch (error) {
    const code = error instanceof Error && "code" in error ? error.code : "UNKNOWN";
    console.error("Board request failed", code);
    return Response.json({ error: "共享数据库暂时不可用" }, { status: 503 });
  } finally {
    connection?.release();
  }
}

function mysqlBoard(connection: Connection): BoardStore {
  async function inTransaction<T>(operation: () => Promise<T>): Promise<T> {
    await connection.beginTransaction();
    try {
      const result = await operation();
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  }

  return {
    async findPerson(hash) {
      const [rows] = await connection.execute<(RowDataPacket & Person)[]>(
        "SELECT id, name FROM people WHERE session_hash = ?", [hash],
      );
      const person = rows[0];
      return person ? { id: person.id, name: person.name } : null;
    },
    read(viewer) {
      return inTransaction(async () => {
        const [results] = await connection.execute<(RowDataPacket & EntryRow)[]>(`
          SELECT e.id, e.name, e.kind, e.created_at, p.name AS author, e.author_id = ? AS mine,
            COALESCE(SUM(r.vote = 1), 0) AS up, COALESCE(SUM(r.vote = -1), 0) AS down,
            AVG(r.rating) AS rating, COUNT(r.rating) AS ratingCount,
            COALESCE(MAX(CASE WHEN r.author_id = ? THEN r.vote END), 0) AS myVote,
            MAX(CASE WHEN r.author_id = ? THEN r.rating END) AS myRating,
            COALESCE(MAX(CASE WHEN r.author_id = ? THEN r.note END), '') AS myNote
          FROM entries e JOIN people p ON p.id = e.author_id LEFT JOIN reviews r ON r.entry_id = e.id
          GROUP BY e.id, e.name, e.kind, e.created_at, p.name, e.author_id
          ORDER BY e.created_at DESC, e.id DESC LIMIT ${LIMIT}
        `, [viewer, viewer, viewer, viewer]);
        const [notes] = await connection.execute<(RowDataPacket & NoteRow)[]>(`
          SELECT r.entry_id, p.name, r.note, r.updated_at, r.author_id = ? AS mine
          FROM reviews r JOIN people p ON p.id = r.author_id
          WHERE r.note <> '' ORDER BY r.updated_at DESC LIMIT 4000
        `, [viewer]);
        return {
          entries: results.map(row => ({
            ...row, created_at: Number(row.created_at), up: Number(row.up), down: Number(row.down),
            rating: row.rating === null ? null : Number(row.rating), ratingCount: Number(row.ratingCount),
            myVote: Number(row.myVote), myRating: row.myRating === null ? null : Number(row.myRating),
          })),
          notes: notes.map(row => ({ ...row, updated_at: Number(row.updated_at) })),
        };
      });
    },
    async renamePerson(id, name) {
      await connection.execute("UPDATE people SET name = ? WHERE id = ?", [name, id]);
    },
    async addPerson(id, name, hash, now) {
      await connection.execute("INSERT INTO people (id, name, session_hash, created_at) VALUES (?, ?, ?, ?)", [id, name, hash, now]);
    },
    addEntries(rows, author, now) {
      return inTransaction(async () => {
        const [lock] = await connection.query<RowDataPacket[]>("SELECT id FROM board_write_lock WHERE id = 1 FOR UPDATE");
        if (lock.length !== 1) throw new Error("Missing board write lock");
        const [count] = await connection.query<RowDataPacket[]>("SELECT COUNT(*) AS total FROM entries");
        const [duplicates] = await connection.execute<RowDataPacket[]>(
          `SELECT name_key FROM entries WHERE name_key IN (${rows.map(() => "?").join(", ")})`,
          rows.map(row => row.key),
        );
        const existing = new Set(duplicates.map(row => row.name_key));
        const accepted = rows.filter(row => !existing.has(row.key)).slice(0, Math.max(0, LIMIT - Number(count[0].total)));
        if (accepted.length === 0) return 0;
        await connection.execute(
          `INSERT INTO entries (id, name, name_key, kind, author_id, created_at)
           VALUES ${accepted.map(() => "(?, ?, ?, ?, ?, ?)").join(", ")}`,
          accepted.flatMap(row => [row.id, row.name, row.key, row.kind, author, now]),
        );
        const notes = accepted.filter(row => row.note);
        if (notes.length) {
          await connection.execute(
            `INSERT INTO reviews (entry_id, author_id, note, updated_at)
             VALUES ${notes.map(() => "(?, ?, ?, ?)").join(", ")}`,
            notes.flatMap(row => [row.id, author, row.note, now]),
          );
        }
        return accepted.length;
      });
    },
    async moveEntry(id, author, kind) {
      const [result] = await connection.execute<ResultSetHeader>("UPDATE entries SET kind = ? WHERE id = ? AND author_id = ?", [kind, id, author]);
      return Boolean(result.affectedRows);
    },
    async deleteEntry(id, author) {
      const [result] = await connection.execute<ResultSetHeader>("DELETE FROM entries WHERE id = ? AND author_id = ?", [id, author]);
      return Boolean(result.affectedRows);
    },
    async writeReview(id, author, field, value, now) {
      const [result] = await connection.execute<ResultSetHeader>(`
        INSERT INTO reviews (entry_id, author_id, ${field}, updated_at)
        SELECT id, ?, ?, ? FROM entries WHERE id = ?
        ON DUPLICATE KEY UPDATE ${field} = ?, updated_at = CASE WHEN ? = 'note' THEN ? ELSE reviews.updated_at END
      `, [author, value, now, id, value, field, now]);
      return Boolean(result.affectedRows);
    },
  };
}
