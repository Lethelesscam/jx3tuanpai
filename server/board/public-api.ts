import type { Pool } from "mysql2/promise";
import { readBoard, writeBoard } from "./handlers";
import { withMysqlBoard } from "./mysql-store";

export async function handlePublicBoard(request: Request, database: Pool, allowedOrigin: string) {
  if (new URL(request.url).pathname !== "/api/board") return new Response("Not found", { status: 404 });
  const origin = request.headers.get("Origin");
  if (origin && origin !== allowedOrigin) return new Response("Forbidden", { status: 403 });
  const headers = new Headers({ Vary: "Origin", "Cache-Control": "no-store" });
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
    headers.set("Access-Control-Max-Age", "600");
  }
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "GET" && request.method !== "POST") {
    headers.set("Allow", "GET, POST, OPTIONS");
    return new Response("Method not allowed", { status: 405, headers });
  }
  const response = await withMysqlBoard(database, store => request.method === "GET"
    ? readBoard(request, store)
    : writeBoard(request, store, allowedOrigin));
  if (request.method === "GET" && response.ok) headers.set("X-Board-Storage", "mysql");
  const result = new Response(response.body, response);
  headers.forEach((value, key) => result.headers.set(key, value));
  return result;
}
