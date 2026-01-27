import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// Tailwind Class Merger
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// API Fetch Helper
export async function postJson<T>(url: string, body: any): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  });
  const txt = await res.text();
  let data: any = null;
  try {
    data = txt ? JSON.parse(txt) : null;
  } catch { }
  if (!res.ok) {
    const msg = data?.error || txt || `Request failed: ${res.status}`;
    throw new Error(msg);
  }
  return data as T;
}

// Formatters
export function formatDistance(m?: number) {
  if (!m && m !== 0) return "—";
  if (m < 1000) return `${Math.round(m)}m`;
  return `${(m / 1000).toFixed(1)}km`;
}

export function formatDuration(s?: number) {
  if (!s && s !== 0) return "—";
  const mins = Math.round(s / 60);
  if (mins < 60) return `${mins} 分钟`;
  const h = Math.floor(mins / 60);
  const r = mins % 60;
  return `${h}h ${r}m`;
}

// Coordinate Parser
export function tryParseCoord(input: string): { lng: number; lat: number } | null {
  const t = input.trim();
  if (!t) return null;
  const parts = t.includes(",") ? t.split(",") : t.split(/\s+/);
  if (parts.length < 2) return null;
  const lng = Number(parts[0]);
  const lat = Number(parts[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return { lng, lat };
}
