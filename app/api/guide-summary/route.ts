import { NextResponse } from "next/server";

type PoiItem = {
  name: string;
  address?: string;
  location?: string;
  distanceM?: number;
  tel?: string;
  type?: string;
  rating?: number;
};

type GuideSummaryReq = {
  place: { name: string; lng: number; lat: number; cityHint?: string };
  sections: Array<{ key: string; title: string; items: PoiItem[] }>;
  preferences?: {
    budget?: "low" | "mid" | "high";
    vibe?: "classic" | "family" | "photo" | "food" | "night";
    pace?: "slow" | "normal" | "fast";
  };
};

type ReferenceItem = {
  name: string;
  snippet: string;
  url?: string;
  source?: string;
  priority?: number;
};

type GuideSummary = {
  title: string;
  duration: string;
  bestTime: string[];
  mustDo: string[];
  foodPick: Array<{ name: string; reason: string; distanceM?: number }>;
  tips: string[];
  nearbyPlanB: string[];
  references?: ReferenceItem[];
};

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} in .env.local`);
  return v;
}

function safeJsonParse(text: string): unknown {
  const candidates: string[] = [];
  const push = (v?: string | null) => {
    const s = (v || "").trim();
    if (s) candidates.push(s);
  };

  push(text);
  push(text.replace(/```json/gi, "").replace(/```/g, ""));

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) push(fenced[1]);

  const obj = text.match(/\{[\s\S]*\}/);
  if (obj?.[0]) push(obj[0]);

  for (const c of candidates) {
    try {
      return JSON.parse(c);
    } catch {
      // try next candidate
    }
  }
  return null;
}

function toStringArray(v: unknown, max = 8): string[] {
  if (Array.isArray(v)) {
    return v
      .map((x) => String(x ?? "").trim())
      .filter(Boolean)
      .slice(0, max);
  }
  if (typeof v === "string") {
    return v
      .split(/\n|；|;|。/)
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, max);
  }
  return [];
}

function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}

function simpleHash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { exp: number; value: GuideSummary }>();

function getCache(key: string): GuideSummary | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.exp) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

function setCache(key: string, value: GuideSummary) {
  cache.set(key, { exp: Date.now() + CACHE_TTL_MS, value });
}

function buildCacheKey(req: GuideSummaryReq) {
  const prefsKey = JSON.stringify(req.preferences || {});
  const topNames = req.sections
    .map((s) => `${s.key}:${(s.items || []).slice(0, 10).map((x) => x.name).join("|")}`)
    .join(";");
  const base = [req.place.name, `${round4(req.place.lng)},${round4(req.place.lat)}`, prefsKey, topNames].join("::");
  return simpleHash(base);
}

function pickTop(items: PoiItem[] | undefined, n: number) {
  const arr = Array.isArray(items) ? items : [];
  return [...arr]
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
    .slice(0, n)
    .map((x) => ({
      name: x.name,
      rating: x.rating ?? 0,
      distanceM: x.distanceM,
      address: x.address,
    }));
}

function toFoodPick(
  v: unknown,
  fallback: Array<{ name: string; rating: number; distanceM?: number }>
): Array<{ name: string; reason: string; distanceM?: number }> {
  if (!Array.isArray(v)) {
    return fallback.slice(0, 3).map((f) => ({
      name: f.name,
      reason: `评分较高，推荐尝试（约 ${f.rating ?? "-"} 分）`,
      distanceM: f.distanceM,
    }));
  }

  const mapped = v
    .map((x) => ({
      name: String((x as any)?.name ?? "").trim(),
      reason: String((x as any)?.reason ?? "").trim(),
      distanceM: Number((x as any)?.distanceM),
    }))
    .filter((x) => x.name)
    .map((x) => ({
      name: x.name,
      reason: x.reason || "口碑较好，建议打卡",
      distanceM: Number.isFinite(x.distanceM) ? x.distanceM : undefined,
    }));

  if (mapped.length > 0) return mapped.slice(0, 5);

  return fallback.slice(0, 3).map((f) => ({
    name: f.name,
    reason: `评分较高，推荐尝试（约 ${f.rating ?? "-"} 分）`,
    distanceM: f.distanceM,
  }));
}

function domainPriority(url: string) {
  const lower = url.toLowerCase();
  if (lower.includes("xiaohongshu")) return { source: "小红书", priority: 100 };
  if (lower.includes("zhihu")) return { source: "知乎", priority: 95 };
  if (lower.includes("dianping")) return { source: "大众点评", priority: 90 };
  if (lower.includes("mafengwo")) return { source: "马蜂窝", priority: 50 };
  if (lower.includes("ctrip") || lower.includes("qunar")) return { source: "旅游网站", priority: 20 };
  return { source: "Web", priority: 1 };
}

async function callBochaSearch(query: string): Promise<ReferenceItem[]> {
  const apiKey = process.env.BOCHA_API_KEY;
  if (!apiKey) return [];

  const res = await fetch("https://api.bochaai.com/v1/web-search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query, count: 20 }),
  });

  if (!res.ok) return [];

  const json = await res.json();
  let items: any[] = [];
  if (json?.data?.webPages?.value) items = json.data.webPages.value;
  else if (json?.data?.results) items = json.data.results;
  else if (json?.results) items = json.results;
  else if (Array.isArray(json?.data)) items = json.data;
  else if (Array.isArray(json)) items = json;

  const mapped = items
    .map((item: any) => {
      const url = item.url || item.link || "";
      const { source, priority } = domainPriority(url);
      return {
        name: item.name || item.title || "未知标题",
        snippet: item.snippet || item.summary || item.description || "",
        url,
        source,
        priority,
      };
    })
    .filter((x: any) => x.url && x.snippet);

  mapped.sort((a: any, b: any) => b.priority - a.priority);
  return mapped.slice(0, 10);
}

async function callDoubao(req: GuideSummaryReq, references: ReferenceItem[]): Promise<GuideSummary> {
  const apiKey = mustEnv("ARK_API_KEY");
  const model = mustEnv("ARK_MODEL_ID");
  const base = (process.env.ARK_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3").replace(/\/+$/, "");
  const url = `${base}/chat/completions`;

  const sec = (k: string) => req.sections.find((s) => s.key === k)?.items;
  const foodCandidates = pickTop(sec("food"), 15);

  const searchContext =
    references.length > 0
      ? references.map((r) => `【${r.source || "Web"}】${r.name}\n${r.snippet}`).join("\n\n")
      : "No external references.";

  const system = [
    "You are a travel guide assistant.",
    "Return only one valid JSON object and no markdown fences.",
    "Required keys: title, duration, bestTime, mustDo, foodPick, tips, nearbyPlanB.",
    "bestTime/mustDo/tips/nearbyPlanB must be arrays of strings.",
    "foodPick must be array of objects: {name, reason, distanceM?}.",
    "foodPick names must come from provided candidate foods.",
  ].join("\n");

  const userMsg = {
    place: req.place.name,
    references: searchContext,
    foodCandidates: foodCandidates.map((f) => ({ name: f.name, rating: f.rating ?? 0, distanceM: f.distanceM })),
    constraints: [
      "Do not invent restaurants not in candidate list.",
      "Provide practical, concise suggestions.",
      "Output JSON only.",
    ],
  };

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(userMsg, null, 2) },
      ],
      temperature: 0.5,
    }),
  });

  if (!resp.ok) {
    throw new Error(`Doubao API Error: ${resp.status}`);
  }

  const json = await resp.json();
  const content = json?.choices?.[0]?.message?.content;
  if (!content) throw new Error("No content from model");

  const parsed = safeJsonParse(content) as Record<string, unknown> | null;
  const summary: GuideSummary = {
    title:
      (parsed && typeof parsed.title === "string" && parsed.title.trim()) ||
      `${req.place.name} 攻略`,
    duration:
      (parsed && typeof parsed.duration === "string" && parsed.duration.trim()) ||
      "半天到1天",
    bestTime: toStringArray(parsed?.bestTime, 6),
    mustDo: toStringArray(parsed?.mustDo, 8),
    foodPick: toFoodPick(parsed?.foodPick, foodCandidates),
    tips: toStringArray(parsed?.tips, 8),
    nearbyPlanB: toStringArray(parsed?.nearbyPlanB, 6),
    references,
  };

  if (summary.bestTime.length === 0) summary.bestTime = ["工作日白天", "错峰出行"];
  if (summary.mustDo.length === 0) summary.mustDo = [`打卡 ${req.place.name}`, "预留排队与换场时间"];
  if (summary.tips.length === 0) summary.tips = ["避雷：尽量避开周末高峰，提前预约"];
  if (summary.nearbyPlanB.length === 0) summary.nearbyPlanB = ["就近找口碑餐厅补充行程"];

  const allowedFood = new Set(foodCandidates.map((x) => x.name));
  summary.foodPick = (summary.foodPick || [])
    .filter((x: any) => {
      if (!x?.name) return false;
      return Array.from(allowedFood).some((allowed) => x.name.includes(allowed) || allowed.includes(x.name));
    })
    .slice(0, 5);

  if (summary.foodPick.length === 0) {
    summary.foodPick = foodCandidates.slice(0, 3).map((f) => ({
      name: f.name,
      reason: `评分较高，推荐尝试（约 ${f.rating ?? "-"} 分）`,
      distanceM: f.distanceM,
    }));
  }

  return summary;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as GuideSummaryReq;
    if (!body?.place?.name || !Array.isArray(body?.sections)) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const cacheKey = buildCacheKey(body);
    const hit = getCache(cacheKey);
    if (hit) return NextResponse.json({ summary: hit, cached: true });

    const placeName = body.place.name;
    const cityHint = body.place.cityHint || "";

    const allReferences: ReferenceItem[] = [];
    const q1 = `"${placeName}" ${cityHint} 避雷 踩坑`;
    const q2 = `"${placeName}" ${cityHint} 攻略 打卡 推荐`;
    const q3 = `"${placeName}" ${cityHint} 美食 餐厅`;

    const r1 = await callBochaSearch(q1);
    allReferences.push(...r1);
    const r2 = await callBochaSearch(q2);
    allReferences.push(...r2.filter((r) => !allReferences.find((x) => x.url === r.url)));
    const r3 = await callBochaSearch(q3);
    allReferences.push(...r3.filter((r) => !allReferences.find((x) => x.url === r.url)));

    const uniqueRefs = Array.from(new Map(allReferences.map((r) => [r.url, r])).values());
    const summary = await callDoubao(body, uniqueRefs.slice(0, 15));
    setCache(cacheKey, summary);

    return NextResponse.json({ summary, cached: false });
  } catch (e: any) {
    console.error("GUIDE_SUMMARY_ERROR:", e);
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
