import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "团牌红黑榜",
  description: "查团牌、看评价，记录每一次开团体验。",
  icons: { icon: "/mark.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
