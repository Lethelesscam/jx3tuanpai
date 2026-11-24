import { handlePublicBoard } from "../app/api/board/public-api";

type Env = { HYPERDRIVE: Hyperdrive; PAGES_ORIGIN: string };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handlePublicBoard(request, env.HYPERDRIVE, env.PAGES_ORIGIN);
  },
};
