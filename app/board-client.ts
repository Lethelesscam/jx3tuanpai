let endpoint = "/api/board";
let assetBase = "/";
let sessionKey = "";
let token = "";
const sessionPrefix = "jx3tuanpai.session:";

function savedBoardSession() {
  let saved = "";
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index);
    if (!key?.startsWith(sessionPrefix + "https://") || !key.endsWith("/api/board")) continue;
    const value = localStorage.getItem(key);
    if (!value || !/^[a-f0-9-]{36}$/.test(value)) continue;
    if (saved && saved !== value) return "";
    saved = value;
  }
  return saved;
}

export function configurePages(base: string, api: string) {
  assetBase = base;
  endpoint = new URL("/api/board", api).href;
  sessionKey = sessionPrefix + "v2:" + base;
  token = "";
  try {
    token = localStorage.getItem(sessionKey) || localStorage.getItem(sessionPrefix + endpoint) || "";
    if (!token && location.origin === "https://lethelesscam.github.io" && base === "/jx3tuanpai/") {
      token = savedBoardSession();
    }
    if (token) localStorage.setItem(sessionKey, token);
  } catch { /* Storage may be disabled. */ }
}

export const assetPath = (file = "") => assetBase + file;

export async function request<T>(method = "GET", body?: Record<string, unknown>): Promise<T> {
  const headers = new Headers();
  if (body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", "Bearer " + token);
  const response = await fetch(endpoint, {
    method, cache: "no-store", headers,
    credentials: "omit",
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json().catch(() => null) as (T & { error?: string; sessionToken?: string }) | null;
  if (!response.ok || !result) throw new Error(result?.error || "暂时无法连接共享榜单");
  if (body?.action === "identity" && result.sessionToken) {
    token = result.sessionToken;
    try { localStorage.setItem(sessionKey, token); } catch { /* Use the session in memory. */ }
  }
  return result;
}
