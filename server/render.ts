import { serve } from "@hono/node-server";
import { createPool } from "mysql2/promise";
import { mysqlClientOptions } from "../app/api/board/mysql-store";
import { handlePublicBoard } from "../app/api/board/public-api";
import sqlpubCA from "../database/sqlpub-ca.crt?raw";

function setting(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Set the ${name} environment variable.`);
  return value;
}

const origin = new URL(setting("PAGES_ORIGIN")).origin;
const mysqlPort = Number(setting("MYSQL_PORT"));
if (!Number.isInteger(mysqlPort) || mysqlPort < 1 || mysqlPort > 65535) {
  throw new Error("Set MYSQL_PORT to a port number from 1 to 65535.");
}

const pool = createPool({
  ...mysqlClientOptions,
  host: setting("MYSQL_HOST"),
  port: mysqlPort,
  database: setting("MYSQL_DATABASE"),
  user: setting("MYSQL_USER"),
  password: setting("MYSQL_PASSWORD"),
  ssl: { ca: sqlpubCA, rejectUnauthorized: true },
  connectionLimit: 4,
  maxIdle: 2,
  idleTimeout: 30_000,
  queueLimit: 32,
});

serve({
  hostname: "0.0.0.0",
  port: Number(process.env.PORT ?? 10000),
  overrideGlobalObjects: false,
  fetch(request) {
    if (request.method === "GET" && new URL(request.url).pathname === "/healthz") {
      return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
    }
    return handlePublicBoard(request, pool, origin);
  },
});
