import { readBoard, writeBoard } from "../app/api/board/handlers";
import { d1Board } from "../app/api/board/d1-store";
import { mysqlBoard } from "../app/api/board/mysql-store";
import { createConnection } from "mysql2/promise";

type Env = { DB?: D1Database; HYPERDRIVE?: Hyperdrive; PAGES_ORIGIN: string; BOARD_READ_ONLY?: string };

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
    if (request.method === "POST" && env.BOARD_READ_ONLY === "1") {
      headers.set("Retry-After", "60");
      return Response.json({ error: "榜单正在迁移数据库，稍后可继续提交。" }, { status: 503, headers });
    }

    let connection: Awaited<ReturnType<typeof createConnection>> | undefined;
    try {
      if (env.HYPERDRIVE) {
        const { host, port, user, password, database } = env.HYPERDRIVE;
        connection = await createConnection({
          host, port, user, password, database,
          charset: "utf8mb4_unicode_ci", disableEval: true, connectTimeout: 8000,
        });
      }
      const store = connection ? mysqlBoard(connection) : env.DB && d1Board(env.DB);
      const response = request.method === "GET"
        ? await readBoard(request, store, true)
        : await writeBoard(request, store, env.PAGES_ORIGIN);
      const result = new Response(response.body, response);
      headers.forEach((value, key) => result.headers.set(key, value));
      return result;
    } catch (error) {
      const code = error instanceof Error && "code" in error ? error.code : "UNKNOWN";
      console.error("Board request failed", code);
      return Response.json({ error: "共享数据库暂时不可用" }, { status: 503, headers });
    } finally {
      if (connection) await connection.end().catch(() => undefined);
    }
  },
};
