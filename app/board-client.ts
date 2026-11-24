let endpoint = "/api/board";
let assetBase = "/";
let crossOrigin = false;
let sessionKey = "";
let token = "";
const legacyProductionSession =
  "jx3tuanpai.session:https://jx3tuanpai-api.tuanpai-redblack.workers.dev/api/board";

export function configurePages(base: string, api: string) {
  assetBase = base;
  endpoint = new URL("/api/board", api).href;
  crossOrigin = true;
  sessionKey = "jx3tuanpai.session:v2:" + base;
  try {
    const legacySession = location.origin === "https://lethelesscam.github.io" && base === "/jx3tuanpai/"
      ? localStorage.getItem(legacyProductionSession)
      : null;
    token = localStorage.getItem(sessionKey) || localStorage.getItem("jx3tuanpai.session:" + endpoint) || legacySession || "";
    if (token) localStorage.setItem(sessionKey, token);
  } catch { /* Storage may be disabled. */ }
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
  const result = await response.json().catch(() => null) as (T & { error?: string; sessionToken?: string }) | null;
  if (!response.ok || !result) throw new Error(result?.error || "暂时无法连接共享榜单");
  if (crossOrigin && body?.action === "identity" && result.sessionToken) {
    token = result.sessionToken;
    try { localStorage.setItem(sessionKey, token); } catch { /* Use the session in memory. */ }
  }
  return result;
}
