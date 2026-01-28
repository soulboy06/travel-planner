import { NextResponse } from "next/server";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} in .env.local`);
  return v;
}

type Tip = {
  id?: string;
  name: string;
  address?: string;
  location?: string; // "lng,lat" 可能为空
  adcode?: string;
  district?: string;
  city?: string;
  typecode?: string;
};

function getCityConstraint(cityHint?: string, cityAdcode?: string) {
  const queryCity = (cityAdcode?.trim() || cityHint?.trim() || "").trim() || undefined;
  const expectAdcodePrefix = cityAdcode?.trim() ? cityAdcode.trim().slice(0, 4) : undefined;
  return { queryCity, expectAdcodePrefix };
}

function isInTargetCity(t: Tip, expectAdcodePrefix?: string, cityHint?: string) {
  if (expectAdcodePrefix && t.adcode) return String(t.adcode).startsWith(expectAdcodePrefix);
  if (cityHint?.trim()) {
    const h = cityHint.trim();
    const s = `${t.city ?? ""}${t.district ?? ""}${t.address ?? ""}`;
    return s.includes(h);
  }
  return true;
}

// 候选打分：名字匹配优先，其次地址，最后有坐标加一点
function scoreTip(q: string, t: Tip) {
  const query = q.trim();
  const name = t.name ?? "";
  const addr = `${t.district ?? ""}${t.address ?? ""}`;
  let s = 0;
  if (name === query) s += 100;
  if (name.includes(query)) s += 60;
  if (addr.includes(query)) s += 15;
  if (t.location) s += 3;
  return s;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { keywords: string; cityHint?: string; cityAdcode?: string };
    const keywords = (body.keywords || "").trim();
    if (!keywords) return NextResponse.json({ tips: [] }, { status: 200 });

    const key = mustEnv("AMAP_WEB_KEY");
    const { queryCity, expectAdcodePrefix } = getCityConstraint(body.cityHint, body.cityAdcode);

    const url = new URL("https://restapi.amap.com/v3/assistant/inputtips");
    url.searchParams.set("key", key);
    url.searchParams.set("keywords", keywords);
    url.searchParams.set("datatype", "all");
    if (queryCity) url.searchParams.set("city", queryCity);
    url.searchParams.set("citylimit", "true"); // ✅ 关键：限定城市
    url.searchParams.set("offset", "20");

    const resp = await fetch(url.toString(), { cache: "no-store" });
    const j = await resp.json();
    const tipsRaw = Array.isArray(j?.tips) ? j.tips : [];

    const tips: Tip[] = tipsRaw
      .map((x: any) => ({
        id: x?.id,
        name: String(x?.name ?? ""),
        address: String(x?.address ?? ""),
        location: x?.location ? String(x.location) : undefined,
        adcode: x?.adcode ? String(x.adcode) : undefined,
        district: x?.district ? String(x.district) : undefined,
        city: x?.city ? String(x.city) : undefined,
        typecode: x?.typecode ? String(x.typecode) : undefined,
      }))
      .filter((t: Tip) => t.name) // 去空
      .filter((t: Tip) => t.name); // 去空
    // .filter((t: Tip) => isInTargetCity(t, expectAdcodePrefix, body.cityHint)); // 移除强过滤，依赖高德 citylimit

    // 按“最可能”排序
    tips.sort((a, b) => scoreTip(keywords, b) - scoreTip(keywords, a));

    return NextResponse.json(
      { tips },
      { status: 200, headers: { "Content-Type": "application/json; charset=utf-8" } }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? String(e), stack: e?.stack ?? null },
      { status: 500, headers: { "Content-Type": "application/json; charset=utf-8" } }
    );
  }
}
