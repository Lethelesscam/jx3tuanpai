import { env } from "cloudflare:workers";
import { readBoard, writeBoard } from "./handlers";
import { withMysqlBoard } from "./mysql-store";

export const dynamic = "force-dynamic";
export const GET = (request: Request) => withMysqlBoard(env.HYPERDRIVE, store => readBoard(request, store));
export const POST = (request: Request) => withMysqlBoard(env.HYPERDRIVE, store => writeBoard(request, store));
