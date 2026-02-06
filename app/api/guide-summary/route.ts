// Guide Summary API with Bocha Search + Doubao (Ark)
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

function safeJsonParse(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
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

function domainPriority(url: string) {
  if (url.includes("xiaohongshu")) return { source: "小红书", priority: 100 };
  if (url.includes("zhihu")) return { source: "知乎", priority: 95 };
  if (url.includes("dianping")) return { source: "大众点评", priority: 90 };
  if (url.includes("mafengwo")) return { source: "马蜂窝", priority: 50 };
  if (url.includes("ctrip") || url.includes("qunar")) return { source: "旅游网站", priority: 20 };
  return { source: "Web", priority: 1 };
}

async function callBochaSearch(query: string): Promise<ReferenceItem[]> {
  const apiKey = process.env.BOCHA_API_KEY;
  if (!apiKey) {
    console.warn("BOCHA_API_KEY not set");
    return [];
  }

  const res = await fetch("https://api.bochaai.com/v1/web-search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query, count: 20 }),
  });

  if (!res.ok) {
    console.error(`Bocha API Error: ${res.status}`);
    return [];
  }

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
      ? references.map((r) => `【${r.source}】${r.name}\n${r.snippet}`).join("\n\n")
      : "暂无网友笔记";

  const system = [
    "你是小红书旅游博主，基于网友真实笔记生成攻略。",
    "",
    "核心规则：",
    "1. tips 前 3-5 条必须是【避雷】，格式：'避雷：具体问题（来源：小红书/知乎/大众点评）'",
    "2. foodPick 优先推荐笔记提到 + 在候选清单 + 高评分 + 近距离的餐厅",
    "3. 若笔记未提到美食，则从高分近店补充",
    "4. 禁止推荐不在候选清单中的餐厅",
    "",
    "输出 JSON：",
    "{",
    "  title, duration, bestTime, mustDo, foodPick, tips, nearbyPlanB",
    "}",
  ].join("\n");

  const userMsg = {
    地点: req.place.name,
    真实笔记: searchContext,
    可选美食: foodCandidates.map((f) => `${f.name} ${f.rating ?? "-"}分 ${f.distanceM ?? "-"}m`),
    要求: [
      "tips前3-5条是避雷并标注来源",
      "foodPick至少3个，优先笔记提到的，其次高分近店",
      "禁止编造店名",
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
      temperature: 0.7,
    }),
  });

  if (!resp.ok) {
    throw new Error(`Doubao API Error: ${resp.status}`);
  }

  const json = await resp.json();
  const content = json?.choices?.[0]?.message?.content;
  if (!content) throw new Error("No content from model");

  const parsed = safeJsonParse(content);
  if (!parsed || !Array.isArray(parsed.mustDo)) {
    throw new Error("Invalid JSON structure from model");
  }

  const allowedFood = new Set(foodCandidates.map((x) => x.name));
  parsed.foodPick = (parsed.foodPick || [])
    .filter((x: any) => {
      if (!x?.name) return false;
      return Array.from(allowedFood).some((allowed) => x.name.includes(allowed) || allowed.includes(x.name));
    })
    .slice(0, 5);

  if (parsed.foodPick.length === 0) {
    parsed.foodPick = foodCandidates.slice(0, 3).map((f) => ({
      name: f.name,
      reason: `高评分推荐，评分 ${f.rating ?? "-"} 分`,
      distanceM: f.distanceM,
    }));
  }

  parsed.references = references;
  return parsed as GuideSummary;
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
    const q1 = `"${placeName}" ${cityHint} 避雷 避坑 踩坑`;
    const q2 = `"${placeName}" ${cityHint} 攻略 打卡 推荐`;
    const q3 = `"${placeName}" ${cityHint} 美食 餐厅`;

    const r1 = await callBochaSearch(q1);
    allReferences.push(...r1);
    const r2 = await callBochaSearch(q2);
    allReferences.push(...r2.filter((r) => !allReferences.find((x) => x.url === r.url)));
    const r3 = await callBochaSearch(q3);
    allReferences.push(...r3.filter((r) => !allReferences.find((x) => x.url === r.url)));

    const uniqueRefs = Array.from(new Map(allReferences.map((r) => [r.url, r])).values());
    // 保留所有真实搜索结果，避免因关键词不完全匹配而被过滤掉
    const summary = await callDoubao(body, uniqueRefs.slice(0, 15));
    setCache(cacheKey, summary);

    return NextResponse.json({ summary, cached: false });
  } catch (e: any) {
    console.error("GUIDE_SUMMARY_ERROR:", e);
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
