/// <reference types="vite/client" />
import { createRoot } from "react-dom/client";
import Board from "../app/board";
import { configurePages } from "../app/board-client";
import "../app/globals.css";

const api = import.meta.env.VITE_BOARD_API_URL;
const root = createRoot(document.getElementById("root")!);
if (api) {
  configurePages(import.meta.env.BASE_URL, api);
  root.render(<Board />);
} else {
  root.render(<p role="alert">榜单尚未配置数据库服务。</p>);
}
