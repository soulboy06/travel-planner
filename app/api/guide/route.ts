import { NextResponse } from "next/server";

type GuideReq = {
  center: { lng: number; lat: number };
  radiusM?: number; // 默认 3000
  cityHint?: string;
  limit?: number; // 每类返回多少条（排序后截断），默认 20
};

type PoiItem = {
  name: string;
  address?: string;
  location?: string; // "lng,lat"
  distanceM?: number;
  tel?: string;
  type?: string;
  rating?: number; // ✅ 新增：评分（可能缺失）
};

function mustKey() {
  const key = process.env.AMAP_WEB_KEY;
  if (!key) throw new Error("Missing AMAP_WEB_KEY in .env.local");
  return key;
}

function toNumber(x: any): number | undefined {
  const n = Number(x);
  return Number.isFinite(n) ? n : undefined;
}

function getRating(p: any): number {
  // 高德 POI 评分字段不同场景可能叫 rating 或 biz_ext.rating
  const r1 = toNumber(p?.rating);
  const r2 = toNumber(p?.biz_ext?.rating);
  return r1 ?? r2 ?? 0;
}

function sortByRatingDesc(pois: PoiItem[]) {
  return pois.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
}

async function aroundSearch(opts: {
  location: string; // "lng,lat"
  radiusM: number;
  keywords: string;
  cityHint?: string;
  limit: number;
}): Promise<PoiItem[]> {
  const key = mustKey();
  const url = new URL("https://restapi.amap.com/v3/place/around");
  url.searchParams.set("key", key);
  url.searchParams.set("location", opts.location);
  url.searchParams.set("radius", String(opts.radiusM));
  url.searchParams.set("keywords", opts.keywords);

  // 多拿一点，服务端按 rating 排序再截断
  // 高德 offset 最大通常 25（不保证），这里保守取 min(25, limit*2)
  const fetchN = Math.min(25, Math.max(opts.limit * 2, opts.limit));
  url.searchParams.set("offset", String(fetchN));
  url.searchParams.set("page", "1");

  // ✅ 尽量拿更多字段（包含 biz_ext 可能有 rating）
  url.searchParams.set("extensions", "all");
  url.searchParams.set("output", "JSON");
  if (opts.cityHint?.trim()) url.searchParams.set("city", opts.cityHint.trim());

  const r = await fetch(url.toString(), { cache: "no-store" });
  const j = await r.json();

  const pois = Array.isArray(j?.pois) ? j.pois : [];
  const mapped: PoiItem[] = pois.map((p: any) => ({
    name: p?.name,
    address: p?.address,
    location: p?.location,
    distanceM: toNumber(p?.distance),
    tel: p?.tel,
    type: p?.type,
    rating: getRating(p),
  }));

  // ✅ 服务端排序：评分 desc，评分相同按距离 asc
  mapped.sort((a, b) => {
    const rdiff = (b.rating ?? 0) - (a.rating ?? 0);
    if (rdiff !== 0) return rdiff;
    return (a.distanceM ?? 1e9) - (b.distanceM ?? 1e9);
  });

  return mapped.slice(0, opts.limit);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as GuideReq;

    if (!body?.center || !Number.isFinite(body.center.lng) || !Number.isFinite(body.center.lat)) {
      return NextResponse.json({ error: "center{lng,lat} is required" }, { status: 400 });
    }

    const radiusM = body.radiusM ?? 3000; // ✅ 3km
    const limit = body.limit ?? 20;
    const location = `${body.center.lng},${body.center.lat}`;
    const cityHint = body.cityHint;

    const queries = [
      { key: "food", title: "美食", keywords: "美食 餐厅 小吃" },
      { key: "coffee", title: "咖啡/甜品", keywords: "咖啡 甜品 奶茶" },
      { key: "hotel", title: "住宿", keywords: "酒店 民宿" },
      { key: "sight", title: "附近景点", keywords: "景点 公园 博物馆" },
      { key: "metro", title: "交通", keywords: "地铁站 公交站" },
      { key: "store", title: "便利设施", keywords: "便利店 药店 卫生间" },
    ] as const;

    const results = await Promise.all(
      queries.map(async (q) => {
        const items = await aroundSearch({ location, radiusM, keywords: q.keywords, cityHint, limit });
        return { key: q.key, title: q.title, items };
      })
    );

    return NextResponse.json(
      { center: body.center, radiusM, sections: results },
      { status: 200, headers: { "Content-Type": "application/json; charset=utf-8" } }
    );
  } catch (e: any) {
    console.error("GUIDE_ERROR:", e);
    return NextResponse.json(
      { error: e?.message ?? String(e), stack: e?.stack ?? null },
      { status: 500, headers: { "Content-Type": "application/json; charset=utf-8" } }
    );
  }
}
