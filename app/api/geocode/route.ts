import { NextResponse } from "next/server";

type PlacePoint = {
  name: string;
  lng: number;
  lat: number;
  location: string; // "lng,lat"
  formatted_address?: string;
  city?: string;
  citycode?: string;
  adcode?: string;
};

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} in .env.local`);
  return v;
}

// 地理编码：根据地址获取经纬度
async function geocode(cityHint: string | undefined, address: string): Promise<PlacePoint> {
  const key = mustEnv("AMAP_WEB_KEY");
  const url = new URL("https://restapi.amap.com/v3/geocode/geo");
  url.searchParams.set("key", key);
  url.searchParams.set("address", address);
  if (cityHint?.trim()) url.searchParams.set("city", cityHint.trim()); // 如果提供了城市名称，添加到请求中

  const resp = await fetch(url.toString(), { cache: "no-store" });
  const j = await resp.json();

  const g = Array.isArray(j?.geocodes) ? j.geocodes[0] : null;
  if (!g?.location) throw new Error(`Geocode not found: ${address}`);

  const { lng, lat } = parseLocation(g.location);
  return {
    name: address,
    lng,
    lat,
    location: g.location,
    formatted_address: g.formatted_address,
    city: g.cityname,
    citycode: g.citycode,
    adcode: g.adcode,
  };
}

// POI 查询（高德 POI 接口）
async function poiSearch(cityHint: string | undefined, address: string): Promise<PlacePoint | null> {
  const key = mustEnv("AMAP_WEB_KEY");
  const url = new URL("https://restapi.amap.com/v3/place/text");
  url.searchParams.set("key", key);
  url.searchParams.set("keywords", address);  // 用地址进行关键词查询
  if (cityHint) url.searchParams.set("city", cityHint.trim());  // 如果提供了城市名称，进行限制查询

  const resp = await fetch(url.toString(), { cache: "no-store" });
  const j = await resp.json();
  const pois = j?.pois;

  if (!pois || pois.length === 0) {
    return null;  // 如果没有返回 POI，直接返回 null
  }

  // 获取第一个匹配的 POI 数据
  const firstPoi = pois[0];
  const { location, name, address: poiAddress, city, citycode, adcode } = firstPoi;
  const [lng, lat] = location.split(",").map(Number);

  return {
    name,
    lng,
    lat,
    location,
    formatted_address: poiAddress,
    city,
    citycode,
    adcode,
  };
}

// 解析位置
function parseLocation(loc: string) {
  const [lng, lat] = loc.split(",").map(Number);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) throw new Error(`Bad location: ${loc}`);
  return { lng, lat };
}

// POST 请求处理
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { city?: string; address: string };
    if (!body?.address) {
      return NextResponse.json({ error: "address is required" }, { status: 400 });
    }

    const { city, address } = body;

    // 1) 尝试地理编码
    let result: PlacePoint | null = await geocode(city, address);  // 这里声明 result 为 PlacePoint | null

    // 2) 如果地理编码失败，尝试 POI 查询
    if (!result) {
      console.error(`Geocode failed for address: ${address}. Trying POI search...`);
      result = await poiSearch(city, address);  // 这里 poiSearch 可能返回 null
      if (!result) throw new Error(`POI search also failed for: ${address}`);
    }

    return NextResponse.json(result, { status: 200 });
  } catch (e: any) {
    console.error("Geocode Error:", e);
    return NextResponse.json({ error: e?.message ?? String(e), stack: e?.stack ?? null }, { status: 500 });
  }
}
