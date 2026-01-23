import { NextResponse } from "next/server";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} in .env.local`);
  return v;
}

/**
 * 用高德行政区接口：中文城市名 -> adcode/citycode/level
 * docs: https://lbs.amap.com/api/webservice/guide/api/district
 */
async function queryDistrict(keyword: string) {
  const key = mustEnv("AMAP_WEB_KEY");
  const url = new URL("https://restapi.amap.com/v3/config/district");
  url.searchParams.set("key", key);
  url.searchParams.set("keywords", keyword.trim());
  url.searchParams.set("subdistrict", "0"); // 不要下级
  url.searchParams.set("extensions", "base");
  url.searchParams.set("offset", "10");

  const resp = await fetch(url.toString(), { cache: "no-store" });
  const j = await resp.json();
  return j;
}

function pickBest(districts: any[], keyword: string) {
  if (!Array.isArray(districts) || districts.length === 0) return null;

  // 优先：名字完全匹配
  const exact = districts.find((d) => String(d?.name || "").trim() === keyword.trim());
  if (exact) return exact;

  // 次优先：level=city
  const city = districts.find((d) => d?.level === "city");
  if (city) return city;

  // 再次：level=province（用户只输入“四川”这种）
  const prov = districts.find((d) => d?.level === "province");
  if (prov) return prov;

  // 否则取第一个
  return districts[0];
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { cityName?: string };
    const cityName = (body?.cityName || "").trim();
    if (!cityName) return NextResponse.json({ error: "cityName is required" }, { status: 400 });

    const j = await queryDistrict(cityName);
    const districts = j?.districts;
    const best = pickBest(districts, cityName);

    if (!best?.adcode) {
      return NextResponse.json({ error: `Cannot resolve adcode for: ${cityName}`, raw: j }, { status: 404 });
    }

    return NextResponse.json(
      {
        name: best.name,
        level: best.level,
        adcode: best.adcode,
        citycode: best.citycode || null,
      },
      { status: 200, headers: { "Content-Type": "application/json; charset=utf-8" } }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? String(e), stack: e?.stack ?? null },
      { status: 500, headers: { "Content-Type": "application/json; charset=utf-8" } }
    );
  }
}
