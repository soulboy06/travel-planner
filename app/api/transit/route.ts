import { NextResponse } from "next/server";

type TransitReq = {
  origin: string; // "lng,lat"
  destination: string; // "lng,lat"
  // 可选：如果你已知就传，避免反查
  city1?: string; // citycode (e.g. 010, 021)
  city2?: string; // citycode
  ad1?: string; // adcode (e.g. 110000)
  ad2?: string;
  strategy?: number;
  alternativeRoute?: number;
  debugRaw?: boolean;
};

function mustKey() {
  const key = process.env.AMAP_WEB_KEY;
  if (!key) throw new Error("Missing AMAP_WEB_KEY in .env.local");
  return key;
}

async function regeo(locationLngLat: string): Promise<{ citycode?: string; adcode?: string; city?: string }> {
  const key = mustKey();
  const url = new URL("https://restapi.amap.com/v3/geocode/regeo");
  url.searchParams.set("key", key);
  url.searchParams.set("location", locationLngLat);
  url.searchParams.set("output", "JSON");
  url.searchParams.set("extensions", "base");

  const r = await fetch(url.toString(), { cache: "no-store" });
  const j = await r.json();

  const comp = j?.regeocode?.addressComponent;
  const citycode = comp?.citycode;
  const adcode = comp?.adcode;
  const city = (Array.isArray(comp?.city) ? comp?.province : comp?.city) || comp?.province;

  return { citycode, adcode, city };
}

function walkFallback(origin: string, destination: string, note: string) {
  return {
    status: "1",
    count: 0,
    summary: { mode: "walk", note },
    route: { transits: [] },
    fallback: { origin, destination },
  };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as TransitReq;

    if (!body?.origin || !body?.destination) {
      return NextResponse.json(
        { error: "origin and destination are required" },
        { status: 400, headers: { "Content-Type": "application/json; charset=utf-8" } }
      );
    }

    let { city1, city2, ad1, ad2 } = body;

    // 补齐起终点城市信息（全国城市自动匹配）
    if (!city1 || !ad1) {
      const a = await regeo(body.origin);
      city1 = city1 || a.citycode;
      ad1 = ad1 || a.adcode;
    }
    if (!city2 || !ad2) {
      const b = await regeo(body.destination);
      city2 = city2 || b.citycode;
      ad2 = ad2 || b.adcode;
    }

    if (!city1 || !city2) {
      return NextResponse.json(
        walkFallback(body.origin, body.destination, "missing citycode; fallback to walk-only"),
        { status: 200, headers: { "Content-Type": "application/json; charset=utf-8" } }
      );
    }

    const key = mustKey();
    const url = new URL("https://restapi.amap.com/v5/direction/transit/integrated");
    url.searchParams.set("key", key);
    url.searchParams.set("origin", body.origin);
    url.searchParams.set("destination", body.destination);

    // ✅ v5 要 city1/city2=citycode，ad1/ad2 可选但建议带上
    url.searchParams.set("city1", city1);
    url.searchParams.set("city2", city2);
    if (ad1) url.searchParams.set("ad1", ad1);
    if (ad2) url.searchParams.set("ad2", ad2);

    url.searchParams.set("strategy", String(body.strategy ?? 0));
    url.searchParams.set("AlternativeRoute", String(body.alternativeRoute ?? 3));
    url.searchParams.set("output", "json");

    const r = await fetch(url.toString(), { cache: "no-store" });
    const j = await r.json();

    // 无方案时不抛错，返回 fallback 结构，方便上层统一处理
    const transits = j?.route?.transits;
    const ok = String(j?.status) === "1" && Array.isArray(transits) && transits.length > 0;

    if (!ok) {
      return NextResponse.json(
        walkFallback(body.origin, body.destination, "no transit plans; fallback to walk-only"),
        { status: 200, headers: { "Content-Type": "application/json; charset=utf-8" } }
      );
    }

    return NextResponse.json(
      body.debugRaw ? j : { status: j.status, count: j.count, route: { transits } },
      { status: 200, headers: { "Content-Type": "application/json; charset=utf-8" } }
    );
  } catch (e: any) {
    console.error("TRANSIT_ERROR:", e);
    return NextResponse.json(
      { error: e?.message ?? String(e), stack: e?.stack ?? null },
      { status: 500, headers: { "Content-Type": "application/json; charset=utf-8" } }
    );
  }
}
