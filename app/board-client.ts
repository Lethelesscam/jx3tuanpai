let endpoint = "/api/board";
let assetBase = "/";
let crossOrigin = false;
let sessionKey = "";
let token = "";

export function configurePages(base: string, api: string) {
  assetBase = base;
  endpoint = new URL("/api/board", api).href;
  crossOrigin = true;
  sessionKey = "jx3tuanpai.session:" + endpoint;
  try { token = localStorage.getItem(sessionKey) || ""; } catch { /* Storage may be disabled. */ }
}

export const assetPath = (file = "") => assetBase + file;

export async function request<T>(method = "GET", body?: Record<string, unknown>): Promise<T> {
  const headers = new Headers();
  if (body) headers.set("Content-Type", "application/json");
  if (crossOrigin && token) headers.set("Authorization", "Bearer " + token);
  const response = await fetch(endpoint, {
    method, cache: "no-store", headers,
    credentials: crossOrigin ? "omit" : "same-origin",
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json().catch(() => ({})) as T & { error?: string; sessionToken?: string };
  if (!response.ok) throw new Error(result.error || "暂时无法连接共享榜单");
  if (crossOrigin && body?.action === "identity" && result.sessionToken) {
    token = result.sessionToken;
    try { localStorage.setItem(sessionKey, token); } catch { /* Use the session in memory. */ }
  }
  return result;
}
