import { readBoard, writeBoard } from "../app/api/board/handlers";

type Env = { DB: D1Database; PAGES_ORIGIN: string };

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

    try {
      const response = request.method === "GET"
        ? await readBoard(request, env.DB, true)
        : await writeBoard(request, env.DB, env.PAGES_ORIGIN);
      const result = new Response(response.body, response);
      headers.forEach((value, key) => result.headers.set(key, value));
      return result;
    } catch (error) {
      console.error("Board request failed", error);
      return Response.json({ error: "共享数据库暂时不可用" }, { status: 503, headers });
    }
  },
};
