import { IMPORT_LIMIT, isKind, LIMIT, NAME_LIMIT, nameKey, NOTE_LIMIT } from "../../model";
import type { BoardData, Entry, Kind } from "../../model";

type Person = { id: string; name: string };
const clean = (value: unknown) => typeof value === "string" ? value.trim() : "";
const fail = (error: string, status = 400) => Response.json({ error }, { status });

async function digest(token: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function personFor(db: D1Database, request: Request, crossOrigin: boolean) {
  const token = crossOrigin
    ? request.headers.get("Authorization")?.match(/^Bearer ([a-f0-9-]{36})$/)?.[1]
    : request.headers.get("cookie")?.match(/(?:^|;\s*)tuanpai_session=([a-f0-9-]{36})(?:;|$)/)?.[1];
  if (!token) return null;
  return db.prepare("SELECT id, name FROM people WHERE session_hash = ?").bind(await digest(token)).first<Person>();
}

export async function readBoard(request: Request, db?: D1Database, crossOrigin = false) {
  if (!db) return fail("共享数据库暂时不可用", 503);
  const person = await personFor(db, request, crossOrigin);
  const viewer = person?.id ?? "";
  const [list, notes] = await db.batch([
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
  const entries: Entry[] = (list.results as Omit<Entry, "reviews">[])
    .map(row => ({ ...row, mine: Boolean(row.mine), reviews: [] }));
  const byId = new Map(entries.map(entry => [entry.id, entry]));
  for (const row of notes.results as (Entry["reviews"][number] & { entry_id: string })[]) {
    const { entry_id, ...review } = row;
    byId.get(entry_id)?.reviews.push({ ...review, mine: Boolean(review.mine) });
  }
  const data: BoardData = { entries, identity: person ? { name: person.name } : null };
  return Response.json(data, { headers: { "Cache-Control": "no-store" } });
}

export async function writeBoard(request: Request, db?: D1Database, pagesOrigin?: string) {
  if (!db) return fail("共享数据库暂时不可用", 503);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return fail("需要 JSON 请求体", 415);
  const origin = request.headers.get("origin");
  if (pagesOrigin ? origin !== pagesOrigin : origin && origin !== new URL(request.url).origin) {
    return fail("请求来源无效", 403);
  }
  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > 40000) return fail("提交内容过长", 413);
    body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) return fail("提交格式不正确");
  } catch { return fail("提交格式不正确"); }

  const person = await personFor(db, request, Boolean(pagesOrigin));
  if (body.action === "identity") {
    const name = clean(body.name);
    if (!name || name.length > 18) return fail("请输入 1–18 字的昵称");
    if (person) {
      await db.prepare("UPDATE people SET name = ? WHERE id = ?").bind(name, person.id).run();
      return Response.json({ name });
    }
    const token = crypto.randomUUID();
    await db.prepare("INSERT INTO people (id, name, session_hash) VALUES (?, ?, ?)")
      .bind(crypto.randomUUID(), name, await digest(token)).run();
    if (pagesOrigin) return Response.json({ name, sessionToken: token }, { headers: { "Cache-Control": "no-store" } });
    const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
    return Response.json({ name }, { headers: {
      "Set-Cookie": `tuanpai_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=31536000${secure}`,
      "Cache-Control": "no-store",
    } });
  }
  if (!person) return fail("请先设置昵称", 401);

  if (body.action === "add") {
    if (!Array.isArray(body.drafts) || !body.drafts.length || body.drafts.length > IMPORT_LIMIT) {
      return fail("每次可提交 1–50 条团牌");
    }
    const prepared = new Map<string, { id: string; name: string; key: string; kind: Kind; note: string }>();
    for (const draft of body.drafts) {
      if (!draft || typeof draft !== "object") return fail("条目格式不正确");
      const name = clean(draft.name), note = clean(draft.note), key = nameKey(name);
      if (!key || name.length > NAME_LIMIT || note.length > NOTE_LIMIT || !isKind(draft.kind)) {
        return fail("每条团牌须有榜单和团名，团名最多 40 字，评价最多 300 字");
      }
      if (!prepared.has(key)) prepared.set(key, { id: crypto.randomUUID(), name, key, kind: draft.kind, note });
    }
    const now = Date.now();
    const batch = JSON.stringify([...prepared.values()]);
    const [inserted] = await db.batch([
      db.prepare(`
        INSERT INTO entries (id, name, name_key, kind, author_id, created_at)
        SELECT j.value ->> '$.id', j.value ->> '$.name', j.value ->> '$.key', j.value ->> '$.kind', ?, ?
        FROM json_each(?) j
        WHERE NOT EXISTS (SELECT 1 FROM entries e WHERE e.name_key = j.value ->> '$.key')
        ORDER BY j.key LIMIT MAX(0, ? - (SELECT COUNT(*) FROM entries))
        ON CONFLICT (name_key) DO NOTHING
      `).bind(person.id, now, batch, LIMIT),
      db.prepare(`
        INSERT INTO reviews (entry_id, author_id, note, updated_at)
        SELECT e.id, ?, j.value ->> '$.note', ?
        FROM json_each(?) j JOIN entries e ON e.id = j.value ->> '$.id'
        WHERE (j.value ->> '$.note') <> ''
      `).bind(person.id, now, batch),
    ]);
    const added = inserted.meta.changes;
    return Response.json({ added, skipped: body.drafts.length - added });
  }

  const id = clean(body.id);
  if (!/^[0-9a-f-]{36}$/.test(id)) return fail("团牌 ID 不正确");
  if (body.action === "move" || body.action === "delete") {
    if (body.action === "move" && !isKind(body.kind)) return fail("榜单不正确");
    const result = body.action === "move"
      ? await db.prepare("UPDATE entries SET kind = ? WHERE id = ? AND author_id = ?").bind(body.kind, id, person.id).run()
      : await db.prepare("DELETE FROM entries WHERE id = ? AND author_id = ?").bind(id, person.id).run();
    return result.meta.changes ? Response.json({ ok: true }) : fail("这条团牌不存在或不属于你", 404);
  }
  if (body.action === "note" || body.action === "rating" || body.action === "vote") {
    const field = body.action;
    const value = field === "note" ? clean(body.value) : body.value;
    if (
      (field === "note" && String(value).length > NOTE_LIMIT)
      || (field === "vote" && ![-1, 0, 1].some(vote => value === vote))
      || (field === "rating" && value !== null && (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 10))
    ) return fail("评价格式不正确");
    const result = await db.prepare(`
      INSERT INTO reviews (entry_id, author_id, ${field}, updated_at)
      SELECT id, ?, ?, ? FROM entries WHERE id = ?
      ON CONFLICT (entry_id, author_id) DO UPDATE SET ${field} = excluded.${field},
        updated_at = CASE WHEN ? = 'note' THEN excluded.updated_at ELSE reviews.updated_at END
    `).bind(person.id, value, Date.now(), id, field).run();
    return result.meta.changes ? Response.json({ ok: true }) : fail("团牌已被删除", 404);
  }
  return fail("未知操作");
}
