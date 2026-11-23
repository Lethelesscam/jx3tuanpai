import { env } from "cloudflare:workers";
import { readBoard, writeBoard } from "./handlers";

export const dynamic = "force-dynamic";
export const GET = (request: Request) => readBoard(request, env.DB);
export const POST = (request: Request) => writeBoard(request, env.DB);
