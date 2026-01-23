import "./globals.css";
import { Analytics } from "@vercel/analytics/next";

export const metadata = {
  title: "Travel Planner",
  description: "Route optimizer + Amap links + on-demand guides",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
