import { readBoard, writeBoard } from "../app/api/board/handlers";
import { withMysqlBoard } from "../app/api/board/mysql-store";

type Env = { HYPERDRIVE: Hyperdrive; PAGES_ORIGIN: string };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (new URL(request.url).pathname !== "/api/board") return new Response("Not found", { status: 404 });
    const origin = request.headers.get("Origin");
    if (origin && origin !== env.PAGES_ORIGIN) return new Response("Forbidden", { status: 403 });
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
    const response = await withMysqlBoard(env.HYPERDRIVE, store =>
      request.method === "GET"
        ? readBoard(request, store, true)
        : writeBoard(request, store, env.PAGES_ORIGIN));
    if (request.method === "GET" && response.ok) headers.set("X-Board-Storage", "mysql");
    const result = new Response(response.body, response);
    headers.forEach((value, key) => result.headers.set(key, value));
    return result;
  },
};
