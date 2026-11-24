import { IMPORT_LIMIT, isKind, NAME_LIMIT, nameKey, NOTE_LIMIT } from "../../model";
import type { BoardData, Entry } from "../../model";
import type { BoardStore, NewEntry } from "./store";

const clean = (value: unknown) => typeof value === "string" ? value.trim() : "";
const fail = (error: string, status = 400) => Response.json({ error }, { status });
const MAX_BODY_LENGTH = 40_000;

async function readRequestText(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      text += decoder.decode(value, { stream: !done });
      if (text.length > MAX_BODY_LENGTH) {
        if (!done) void reader.cancel().catch(() => undefined);
        return null;
      }
      if (done) return text;
    }
  } finally {
    reader.releaseLock();
  }
}

async function digest(token: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function personFor(store: BoardStore, request: Request, crossOrigin: boolean) {
  const token = crossOrigin
    ? request.headers.get("Authorization")?.match(/^Bearer ([a-f0-9-]{36})$/)?.[1]
    : request.headers.get("cookie")?.match(/(?:^|;\s*)tuanpai_session=([a-f0-9-]{36})(?:;|$)/)?.[1];
  if (!token) return null;
  return store.findPerson(await digest(token));
}

export async function readBoard(request: Request, store: BoardStore, crossOrigin = false) {
  const person = await personFor(store, request, crossOrigin);
  const rows = await store.read(person?.id ?? "");
  const entries: Entry[] = rows.entries.map(row => ({ ...row, mine: Boolean(row.mine), reviews: [] }));
  const byId = new Map(entries.map(entry => [entry.id, entry]));
  for (const row of rows.notes) {
    const { entry_id, ...review } = row;
    byId.get(entry_id)?.reviews.push({ ...review, mine: Boolean(review.mine) });
  }
  const data: BoardData = { entries, identity: person ? { name: person.name } : null };
  return Response.json(data, { headers: { "Cache-Control": "no-store" } });
}

export async function writeBoard(request: Request, store: BoardStore, pagesOrigin?: string) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) return fail("需要 JSON 请求体", 415);
  const origin = request.headers.get("origin");
  if (pagesOrigin ? origin !== pagesOrigin : origin && origin !== new URL(request.url).origin) {
    return fail("请求来源无效", 403);
  }
  let body: Record<string, unknown>;
  try {
    const raw = await readRequestText(request);
    if (raw === null) return fail("提交内容过长", 413);
    body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) return fail("提交格式不正确");
  } catch { return fail("提交格式不正确"); }

  const person = await personFor(store, request, Boolean(pagesOrigin));
  if (body.action === "identity") {
    const name = clean(body.name);
    if (!name || name.length > 18) return fail("请输入 1–18 字的昵称");
    if (person) {
      await store.renamePerson(person.id, name);
      return Response.json({ name });
    }
    const token = crypto.randomUUID();
    await store.addPerson(crypto.randomUUID(), name, await digest(token), Date.now());
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
    const prepared = new Map<string, NewEntry>();
    for (const draft of body.drafts) {
      if (!draft || typeof draft !== "object") return fail("条目格式不正确");
      const name = clean(draft.name), note = clean(draft.note), key = nameKey(name);
      if (!key || name.length > NAME_LIMIT || note.length > NOTE_LIMIT || !isKind(draft.kind)) {
        return fail("每条团牌须有榜单和团名，团名最多 40 字，评价最多 300 字");
      }
      if (!prepared.has(key)) prepared.set(key, { id: crypto.randomUUID(), name, key, kind: draft.kind, note });
    }
    const added = await store.addEntries([...prepared.values()], person.id, Date.now());
    return Response.json({ added, skipped: body.drafts.length - added });
  }

  const id = clean(body.id);
  if (!/^[0-9a-f-]{36}$/.test(id)) return fail("团牌 ID 不正确");
  if (body.action === "move") {
    if (!isKind(body.kind)) return fail("榜单不正确");
    return await store.moveEntry(id, person.id, body.kind) ? Response.json({ ok: true }) : fail("这条团牌不存在或不属于你", 404);
  }
  if (body.action === "delete") {
    return await store.deleteEntry(id, person.id) ? Response.json({ ok: true }) : fail("这条团牌不存在或不属于你", 404);
  }
  if (body.action === "note" || body.action === "rating" || body.action === "vote") {
    const field = body.action;
    const value = field === "note" ? clean(body.value) : body.value;
    if (
      (field === "note" && String(value).length > NOTE_LIMIT)
      || (field === "vote" && ![-1, 0, 1].some(vote => value === vote))
      || (field === "rating" && value !== null && (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 10))
    ) return fail("评价格式不正确");
    const updated = await store.writeReview(id, person.id, field, value as string | number | null, Date.now());
    return updated ? Response.json({ ok: true }) : fail("团牌已被删除", 404);
  }
  return fail("未知操作");
}
