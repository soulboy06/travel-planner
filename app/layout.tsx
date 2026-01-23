import "./globals.css";

export const metadata = {
  title: "Travel Planner",
  description: "Route optimizer + Amap links + on-demand guides",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
