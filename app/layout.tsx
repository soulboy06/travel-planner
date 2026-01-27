import "./globals.css";

export const metadata = {
  title: "Travel Planner",
  description: "Route optimizer + Amap links + on-demand guides",
};

import { ToastProvider } from "./contexts/ToastContext";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <ToastProvider>
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}
