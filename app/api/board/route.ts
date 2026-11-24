import { env } from "cloudflare:workers";
import { readBoard, writeBoard } from "./handlers";
import { d1Board } from "./d1-store";

export const dynamic = "force-dynamic";
export const GET = (request: Request) => readBoard(request, env.DB && d1Board(env.DB));
export const POST = (request: Request) => writeBoard(request, env.DB && d1Board(env.DB));
