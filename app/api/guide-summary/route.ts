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

type GuideSummary = {
  title: string;
  duration: string;
  bestTime: string[];
  mustDo: string[];
  foodPick: Array<{ name: string; reason: string; distanceM?: number }>;
  tips: string[];
  nearbyPlanB: string[];
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
    if (m) return JSON.parse(m[0]);
    throw new Error("Model did not return valid JSON");
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

/** 10 分钟 TTL 内存缓存 */
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

async function callDoubao(req: GuideSummaryReq): Promise<GuideSummary> {
  const apiKey = mustEnv("ARK_API_KEY");
  const model = mustEnv("ARK_MODEL_ID");
  const base = (process.env.ARK_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3").replace(/\/+$/, "");
  const url = `${base}/chat/completions`;

  const sec = (k: string) => req.sections.find((s) => s.key === k)?.items;

  const foodCandidates = pickTop(sec("food"), 10);
  const sightCandidates = pickTop(sec("sight"), 10);
  const metroCandidates = pickTop(sec("metro"), 8);

  const system = [
    "你是一个本地旅行攻略编辑。",
    "你只能使用用户提供的数据生成攻略：目的地信息 + 候选POI列表。",
    "严禁编造不存在的店名/地点/具体规定（例如具体票价、具体开放时间若未提供）。",
    "输出必须是严格 JSON，不能包含任何多余文本、注释、markdown。",
    "内容用中文，建议可执行、简短有重点。",
    "",
    "关键要求：mustDo 只写“景区/目的地本身怎么玩”，不要写吃喝。吃喝内容只能出现在 foodPick。",
    "强约束：foodPick 只能从 foodCandidates 里选择，name 必须完全一致。",
  ].join("\n");

  const schemaHint = {
    title: "string",
    duration: "string",
    bestTime: ["string"],
    mustDo: ["string(只写景区本身玩法，不得出现餐厅/咖啡/美食等吃喝词)"],
    foodPick: [{ name: "string(必须来自foodCandidates)", reason: "string", distanceM: "number(optional)" }],
    tips: ["string(可以包含交通/排队/拍照/预约等，但不要推荐吃喝地点到 tips 里)"],
    nearbyPlanB: ["string(备选：公园/博物馆/室内场馆等，禁止编造店名)"],
  };

  const user = {
    task: "生成到达目的地后的攻略卡片。",
    outputSchema: schemaHint,
    place: req.place,
    preferences: req.preferences ?? {},
    candidates: {
      sightCandidates,
      metroCandidates,
      foodCandidates,
    },
    rules: [
      "bestTime 给 2-3 条",
      "mustDo 给 5-8 条：围绕目的地本身（游览顺序/拍照点/节奏/避开人群/路线组织）。允许提及 sightCandidates 作为“顺路可加”的景点，但不要出现吃喝地点。",
      "foodPick 最多 3 个，只能从 foodCandidates 里选；name 必须完全一致；理由写清楚（距离/评分/适合时段）",
      "tips 给 4-6 条：预约/排队/交通/入园准备/雨天方案，不要写去吃什么",
      "nearbyPlanB 给 3-5 条：只写类别或从 sightCandidates 里选，禁止编造具体店名",
    ],
  };

  const body = {
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: JSON.stringify(user) },
    ],
    temperature: 0.6,
  };

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });

  const json = await resp.json().catch(() => ({} as any));
  if (!resp.ok) {
    const msg = json?.error?.message || json?.message || `Doubao request failed: HTTP ${resp.status}`;
    throw new Error(msg);
  }

  const content: string | undefined = json?.choices?.[0]?.message?.content;
  if (!content) throw new Error("Doubao response missing choices[0].message.content");

  const parsed = safeJsonParse(content);

  if (
    !parsed ||
    typeof parsed.title !== "string" ||
    !Array.isArray(parsed.mustDo) ||
    !Array.isArray(parsed.tips) ||
    !Array.isArray(parsed.bestTime) ||
    !Array.isArray(parsed.nearbyPlanB) ||
    !Array.isArray(parsed.foodPick)
  ) {
    throw new Error("Doubao returned JSON but schema mismatch");
  }

  // foodPick 强约束过滤
  const allowedFood = new Set(foodCandidates.map((x) => x.name));
  parsed.foodPick = (parsed.foodPick || [])
    .filter((x: any) => x?.name && allowedFood.has(x.name))
    .slice(0, 3);

  // mustDo 兜底过滤（防模型写吃喝）
  const badWords = ["餐", "吃", "美食", "饭", "咖啡", "奶茶", "火锅", "烧烤", "小吃", "甜品"];
  parsed.mustDo = (parsed.mustDo || []).filter((x: string) => !badWords.some((w) => x.includes(w)));

  return parsed as GuideSummary;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as GuideSummaryReq;
    if (!body?.place?.name || !Array.isArray(body?.sections)) {
      return NextResponse.json({ error: "place and sections are required" }, { status: 400 });
    }

    const cacheKey = buildCacheKey(body);
    const hit = getCache(cacheKey);
    if (hit) {
      return NextResponse.json(
        { summary: hit, cached: true },
        { status: 200, headers: { "Content-Type": "application/json; charset=utf-8" } }
      );
    }

    const summary = await callDoubao(body);
    setCache(cacheKey, summary);

    return NextResponse.json(
      { summary, cached: false },
      { status: 200, headers: { "Content-Type": "application/json; charset=utf-8" } }
    );
  } catch (e: any) {
    console.error("GUIDE_SUMMARY_ERROR:", e);
    return NextResponse.json(
      { error: e?.message ?? String(e), stack: e?.stack ?? null },
      { status: 500, headers: { "Content-Type": "application/json; charset=utf-8" } }
    );
  }
}
