import { NextResponse } from "next/server";

type OriginInput =
  | { type: "coord"; lng: number; lat: number; name?: string }
  | { type: "text"; text: string };

type OptimizeReq = {
  origin: OriginInput;
  places: string[];
  cityHint?: string;   // 例如：成都
  cityAdcode?: string; // 例如：510100（强烈建议前端传这个）
};

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

type UiLeg = {
  from: PlacePoint;
  to: PlacePoint;
  summary: { mode: "transit" | "walk"; distanceM?: number; durationS?: number; costYuan?: number; note?: string };
  amap: { appUri: string; webUrl: string };
  segments?: any[] | null;
};

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} in .env.local`);
  return v;
}

function parseLocation(loc: string) {
  const [lng, lat] = loc.split(",").map(Number);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) throw new Error(`Bad location: ${loc}`);
  return { lng, lat };
}

// Haversine distance
function distMeters(a: { lng: number; lat: number }, b: { lng: number; lat: number }) {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const aa = s1 * s1 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * s2 * s2;
  return 2 * R * Math.asin(Math.sqrt(aa));
}

/**
 * 目标城市参数：
 * - queryCity：传给高德 city 参数（优先 cityAdcode，其次 cityHint）
 * - expectAdcodePrefix：用来做“必须在目标城市内”的校验（优先从 cityAdcode 推导）
 */
function getCityConstraint(cityHint?: string, cityAdcode?: string) {
  const queryCity = (cityAdcode?.trim() || cityHint?.trim() || "").trim() || undefined;
  // 城市 adcode 一般形如 510100，区县是 5101xx —— 用前4位做前缀校验最稳
  const expectAdcodePrefix = cityAdcode?.trim() ? cityAdcode.trim().slice(0, 4) : undefined;
  return { queryCity, expectAdcodePrefix };
}

// 城市校验：宽松模式
function isInTargetCity(p: PlacePoint, expectAdcodePrefix?: string, cityHint?: string) {
  // 1. 如果有 adcode 前缀约束，且地点有 adcode，优先匹配前缀
  // 注意：adcode 可能是 6 位字符串，前缀通常是前 4 位 (如 1101xx -> 1101)
  if (expectAdcodePrefix && p.adcode && String(p.adcode).startsWith(expectAdcodePrefix)) {
    return true;
  }

  // 2. 如果 adcode 没匹配上（或者没传前缀），尝试用文本匹配
  const target = (cityHint || "").trim();
  if (!target) return true; // 没指定城市，就不拦截

  const pCity = String(p.city || "").trim();
  const pAddr = String(p.formatted_address || "").trim();
  const pAdcode = String(p.adcode || "");

  // 3. 核心逻辑：只要地点的城市名、详细地址、或者 adcode 归属包含目标城市，就算通过
  // 例如：target="北京", pCity="北京市" -> ok
  // target="北京", pAddr="北京市东城区..." -> ok
  if (pCity.includes(target) || target.includes(pCity)) return true;
  if (pAddr.includes(target)) return true;

  // 4. 特殊兜底：直辖市处理 (北京/上海/天津/重庆)
  // 有时候 adcode 是区级别的，但 city 字段可能是空的或者写的区名
  const isDirectCity = ["北京", "上海", "天津", "重庆"].some(c => target.includes(c));
  if (isDirectCity) {
    if (pAdcode.startsWith(target === "北京" ? "11" : target === "上海" ? "31" : target === "天津" ? "12" : "50")) return true;
  }

  return false;
}

// 宽松的 Geocode：先在目标城市找，找不到这在全国找
async function geocodeCore(
  queryCity: string | undefined,
  expectAdcodePrefix: string | undefined,
  cityHint: string | undefined,
  address: string,
  strictCity: boolean = true // 新增参数：是否严格限制城市
): Promise<PlacePoint> {
  const key = mustEnv("AMAP_WEB_KEY");
  const url = new URL("https://restapi.amap.com/v3/geocode/geo");
  url.searchParams.set("key", key);
  url.searchParams.set("address", address);

  // 只有在严格模式下才传 city
  if (strictCity && queryCity) url.searchParams.set("city", queryCity);

  const resp = await fetch(url.toString(), { cache: "no-store" });
  const j = await resp.json();

  const geocodes = Array.isArray(j?.geocodes) ? j.geocodes : [];
  if (geocodes.length === 0) throw new Error(`Geocode not found: ${address}`);

  // 如果是严格模式，必须校验城市
  if (strictCity) {
    for (const g of geocodes) {
      if (!g?.location) continue;
      const { lng, lat } = parseLocation(g.location);
      const candidate: PlacePoint = {
        name: address,
        lng, lat,
        location: g.location,
        formatted_address: g.formatted_address,
        city: g.cityname,
        citycode: g.citycode,
        adcode: g.adcode,
      };
      if (isInTargetCity(candidate, expectAdcodePrefix, cityHint)) {
        return candidate;
      }
    }
    throw new Error(`Geocode not found in target city: ${address}`);
  } else {
    // 非严格模式（全国搜索），直接取第一个结果
    const g = geocodes[0];
    const { lng, lat } = parseLocation(g.location);
    return {
      name: address,
      lng, lat,
      location: g.location,
      formatted_address: g.formatted_address,
      city: g.cityname,
      citycode: g.citycode,
      adcode: g.adcode,
    };
  }
}

function scorePoi(query: string, poi: any) {
  // 评分规则：越像“你输入的那个地方”分越高
  const q = query.trim();
  const name = String(poi?.name ?? "");
  const addr = String(poi?.address ?? "");
  const type = String(poi?.type ?? "");
  const tel = String(poi?.tel ?? "");
  const weight = Number(poi?.weight ?? 0);
  const rating = Number(poi?.biz_ext?.rating ?? 0);

  let s = 0;

  // 名称匹配最重要
  if (name === q) s += 100;
  if (name.includes(q)) s += 60;
  if (q.includes(name) && name.length >= 2) s += 20;

  // 地址/类型略加分
  if (addr.includes(q)) s += 15;
  if (type) s += 5;

  // 有电话/权重/评分稍微加一点（高德字段不一定都有）
  if (tel) s += 2;
  if (weight) s += Math.min(10, weight / 10);
  if (rating) s += Math.min(10, rating);

  return s;
}

async function poiSearchBest(
  queryCity: string | undefined,
  expectAdcodePrefix: string | undefined,
  cityHint: string | undefined,
  query: string,
  strictCity: boolean = true
): Promise<PlacePoint | null> {
  const key = mustEnv("AMAP_WEB_KEY");
  const url = new URL("https://restapi.amap.com/v3/place/text");
  url.searchParams.set("key", key);
  url.searchParams.set("keywords", query);

  if (strictCity && queryCity) {
    url.searchParams.set("city", queryCity);
    url.searchParams.set("citylimit", "true");
  }

  url.searchParams.set("offset", "10");
  url.searchParams.set("page", "1");
  url.searchParams.set("extensions", "all");

  const resp = await fetch(url.toString(), { cache: "no-store" });
  const j = await resp.json();
  const pois = Array.isArray(j?.pois) ? j.pois : [];

  if (pois.length === 0) return null;

  // 严格模式下过滤
  let candidates = pois;
  if (strictCity) {
    const filtered = pois.filter((p: any) => {
      const adcode = String(p?.adcode ?? "");
      const cityname = String(p?.cityname ?? "");
      const pp = { city: cityname, adcode } as PlacePoint;
      return isInTargetCity(pp, expectAdcodePrefix, cityHint);
    });
    candidates = filtered.length ? filtered : [];
  }

  if (candidates.length === 0) return null;

  candidates.sort((a: any, b: any) => scorePoi(query, b) - scorePoi(query, a));
  const best = candidates[0];
  if (!best?.location) return null;

  const { location } = best;
  const [lng, lat] = String(location).split(",").map(Number);

  return {
    name: String(best?.name ?? query),
    lng, lat,
    location: String(best.location),
    formatted_address: String(best?.address ?? ""),
    city: String(best?.cityname ?? ""),
    citycode: String(best?.citycode ?? ""),
    adcode: String(best?.adcode ?? ""),
  };
}

/**
 * ✅ 严格城市 + 智能容错：
 * - 必须在目标城市内搜索
 * - 先尝试精确 Geocode
 * - 失败则尝试 POI 搜索（模糊匹配）
 * - 绝对不进行全国搜索
 */
async function geocodeStrict(
  queryCity: string | undefined,
  expectAdcodePrefix: string | undefined,
  cityHint: string | undefined,
  placeName: string
): Promise<PlacePoint> {
  // 1) 尝试城市内精准地址解析
  try {
    const g = await geocodeCore(queryCity, expectAdcodePrefix, cityHint, placeName, true);
    g.name = placeName;
    return g;
  } catch (e) {
    // ignore
  }

  // 2) 尝试城市内 POI 搜索 (模糊匹配，但严格限制城市)
  try {
    const p = await poiSearchBest(queryCity, expectAdcodePrefix, cityHint, placeName, true);
    if (p) {
      p.name = placeName;
      return p;
    }
  } catch (e) {
    // ignore
  }

  // 3) ❌ 移除所有全局搜索 fallback
  // 如果在目标城市找不到，那就是找不到。不要去外地找同名地点。

  // 这里的错误信息会传到 failed 数组中，前端会显示给用户
  throw new Error(`在 ${cityHint || queryCity || '目标城市'} 未找到该地点，请核对名称`);
}

function buildAmapLinks(from: PlacePoint, to: PlacePoint) {
  const appUri =
    `amapuri://route/plan/?t=1&slat=${from.lat}&slon=${from.lng}&sname=${encodeURIComponent(from.name)}` +
    `&dlat=${to.lat}&dlon=${to.lng}&dname=${encodeURIComponent(to.name)}`;
  const webUrl =
    `https://uri.amap.com/navigation?from=${from.lng},${from.lat},${encodeURIComponent(from.name)}` +
    `&to=${to.lng},${to.lat},${encodeURIComponent(to.name)}&mode=bus&policy=1&src=travel-planner`;
  return { appUri, webUrl };
}

async function regeo(locationLngLat: string): Promise<{ citycode?: string; adcode?: string; city?: string }> {
  const key = mustEnv("AMAP_WEB_KEY");
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

async function transitDurationV3(from: PlacePoint, to: PlacePoint): Promise<number | undefined> {
  const key = mustEnv("AMAP_WEB_KEY");
  const url = new URL("https://restapi.amap.com/v3/direction/transit/integrated");
  url.searchParams.set("key", key);
  url.searchParams.set("origin", from.location);
  url.searchParams.set("destination", to.location);
  const city = from.citycode || from.city || to.citycode || to.city;
  if (city) url.searchParams.set("city", String(city));
  url.searchParams.set("strategy", "0");
  url.searchParams.set("output", "JSON");

  const r = await fetch(url.toString(), { cache: "no-store" });
  const j = await r.json();
  const transits = j?.route?.transits;
  if (!Array.isArray(transits) || transits.length === 0) return undefined;
  const n = Number(transits[0]?.duration);
  return isNaN(n) ? undefined : n;
}

/**
 * ✅ 修复公交模式：city1/city2 用每个点自己的 adcode
 */
async function transitOrWalk(
  fallbackCityAdcode: string | undefined,
  from: PlacePoint,
  to: PlacePoint
): Promise<Pick<UiLeg, "summary" | "segments">> {
  const key = mustEnv("AMAP_WEB_KEY");

  if (!from.citycode || !from.adcode) {
    try {
      const info = await regeo(from.location);
      from.citycode = from.citycode || info.citycode;
      from.adcode = from.adcode || info.adcode;
      from.city = from.city || info.city;
    } catch {
      // best effort
    }
  }
  if (!to.citycode || !to.adcode) {
    try {
      const info = await regeo(to.location);
      to.citycode = to.citycode || info.citycode;
      to.adcode = to.adcode || info.adcode;
      to.city = to.city || info.city;
    } catch {
      // best effort
    }
  }

  const city1 = from.citycode;
  const city2 = to.citycode;
  const ad1 = from.adcode || fallbackCityAdcode;
  const ad2 = to.adcode || fallbackCityAdcode;

  const url = new URL("https://restapi.amap.com/v5/direction/transit/integrated");
  url.searchParams.set("key", key);
  url.searchParams.set("origin", from.location);
  url.searchParams.set("destination", to.location);

  if (city1) url.searchParams.set("city1", city1);
  if (city2) url.searchParams.set("city2", city2);
  if (ad1) url.searchParams.set("ad1", ad1);
  if (ad2) url.searchParams.set("ad2", ad2);

  const resp = await fetch(url.toString(), { cache: "no-store" });
  const j = await resp.json();

  const route = j?.route;
  const transits = route?.transits;

  if (Array.isArray(transits) && transits.length > 0) {
    const best = transits[0];
    const parseNum = (v: any) => {
      const n = Number(v);
      return isNaN(n) ? undefined : n;
    };
    const sumSegmentField = (segments: any[] | undefined, field: "duration" | "distance") => {
      if (!Array.isArray(segments) || segments.length === 0) return undefined;
      let total = 0;
      let has = false;
      const add = (v: any) => {
        const n = parseNum(v);
        if (n === undefined) return;
        total += n;
        has = true;
      };
      segments.forEach((seg) => {
        add(seg?.walking?.[field]);
        if (Array.isArray(seg?.bus?.buslines)) {
          seg.bus.buslines.forEach((line: any) => add(line?.[field]));
        }
        add(seg?.railway?.[field]);
        add(seg?.taxi?.[field]);
      });
      return has ? total : undefined;
    };

    const distanceM = parseNum(best?.distance) ?? sumSegmentField(best?.segments, "distance");
    let durationS = parseNum(best?.duration) ?? sumSegmentField(best?.segments, "duration");
    if (durationS === undefined) {
      durationS = await transitDurationV3(from, to);
    }
    const costYuan = parseNum(best?.cost);

    return {
      summary: { mode: "transit", distanceM, durationS, costYuan },
      segments: best?.segments ?? null,
    };
  }

  // fallback：步行估算
  const dm = Math.round(distMeters(from, to));
  const speed = 1.3;
  const ds = Math.round(dm / speed);

  return {
    summary: { mode: "walk", distanceM: dm, durationS: ds, note: "no transit plans; fallback to walk-only" },
    segments: null,
  };
}

function nearestNeighborOrder(start: PlacePoint, points: PlacePoint[]) {
  const remaining = [...points];
  const ordered: PlacePoint[] = [];
  let cur = start;

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestD = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const d = distMeters(cur, remaining[i]);
      if (d < bestD) {
        bestD = d;
        bestIdx = i;
      }
    }

    const next = remaining.splice(bestIdx, 1)[0];
    ordered.push(next);
    cur = next;
  }
  return ordered;
}

function k2Cluster(points: PlacePoint[]) {
  if (points.length <= 2) return { A: points, B: [] as PlacePoint[] };

  let c1 = points[0];
  let c2 = points[1];
  let best = -1;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const d = distMeters(points[i], points[j]);
      if (d > best) {
        best = d;
        c1 = points[i];
        c2 = points[j];
      }
    }
  }

  let A: PlacePoint[] = [];
  let B: PlacePoint[] = [];

  const iter = 8;
  for (let t = 0; t < iter; t++) {
    A = [];
    B = [];
    for (const p of points) {
      const d1 = distMeters(p, c1);
      const d2 = distMeters(p, c2);
      (d1 <= d2 ? A : B).push(p);
    }

    const mean = (arr: PlacePoint[]) => {
      const lng = arr.reduce((s, x) => s + x.lng, 0) / arr.length;
      const lat = arr.reduce((s, x) => s + x.lat, 0) / arr.length;
      return { ...arr[0], lng, lat, location: `${lng},${lat}` };
    };

    if (A.length > 0) c1 = mean(A);
    if (B.length > 0) c2 = mean(B);
  }

  return { A, B };
}

function twoOpt(route: PlacePoint[], origin: PlacePoint) {
  const path = [origin, ...route];

  const total = () => {
    let s = 0;
    for (let i = 0; i < path.length - 1; i++) s += distMeters(path[i], path[i + 1]);
    return s;
  };

  let improved = true;
  let bestDist = total();

  const maxLoops = 50;
  let loops = 0;

  while (improved && loops++ < maxLoops) {
    improved = false;

    for (let i = 1; i < path.length - 2; i++) {
      for (let k = i + 1; k < path.length - 1; k++) {
        const newPath = path.slice(0, i).concat(path.slice(i, k + 1).reverse(), path.slice(k + 1));
        let s = 0;
        for (let x = 0; x < newPath.length - 1; x++) s += distMeters(newPath[x], newPath[x + 1]);

        if (s + 1e-6 < bestDist) {
          bestDist = s;
          for (let x = 0; x < newPath.length; x++) path[x] = newPath[x];
          improved = true;
        }
      }
    }
  }

  return path.slice(1);
}

function clusteredOrder(origin: PlacePoint, points: PlacePoint[]) {
  if (points.length <= 3) return nearestNeighborOrder(origin, points);

  const { A, B } = k2Cluster(points);
  if (B.length === 0) return nearestNeighborOrder(origin, A);

  const minDist = (arr: PlacePoint[]) => Math.min(...arr.map((p) => distMeters(origin, p)));
  const first = minDist(A) <= minDist(B) ? A : B;
  const second = first === A ? B : A;

  const firstOrdered = nearestNeighborOrder(origin, first);
  const secondStart = firstOrdered.length ? firstOrdered[firstOrdered.length - 1] : origin;
  const secondOrdered = nearestNeighborOrder(secondStart, second);

  const merged = [...firstOrdered, ...secondOrdered];
  return twoOpt(merged, origin);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as OptimizeReq;
    if (!body?.origin || !Array.isArray(body?.places) || body.places.length === 0) {
      return NextResponse.json({ error: "origin and places[] are required" }, { status: 400 });
    }

    let { queryCity, expectAdcodePrefix } = getCityConstraint(body.cityHint, body.cityAdcode);

    // 如果你想“强制必须限定城市”，可以打开这段：
    // if (!queryCity) {
    //   return NextResponse.json({ error: "cityHint or cityAdcode is required to avoid ambiguous places" }, { status: 400 });
    // }


    // 0) 如果没传 cityAdcode，尝试根据 cityHint 自动补全
    if (!body.cityAdcode && body.cityHint) {
      try {
        // 利用 geocodeCore 来查城市本身，通常能拿到 adcode
        // 注意：这里查 "成都市" 或 "成都"，此时还没有 adcode 约束
        const cityInfo = await geocodeCore(undefined, undefined, undefined, body.cityHint);
        if (cityInfo && cityInfo.adcode) {
          body.cityAdcode = String(cityInfo.adcode);
          // 更新约束条件
          const newCons = getCityConstraint(body.cityHint, body.cityAdcode);
          expectAdcodePrefix = newCons.expectAdcodePrefix;
          // QueryCity 也可以更新，但一般保持原样也没事，因为 geocodeStrict 内部会处理
        }
      } catch (e) {
        console.warn("Auto-match city adcode failed:", e);
        // 失败了就不填，继续往下走，只不过可能没有 prefix 约束
      }
    }

    // 1) 起点
    let originPoint: PlacePoint;
    if (body.origin.type === "coord") {
      originPoint = {
        name: body.origin.name || "起点",
        lng: body.origin.lng,
        lat: body.origin.lat,
        location: `${body.origin.lng},${body.origin.lat}`,
      };
    } else {
      originPoint = await geocodeStrict(queryCity, expectAdcodePrefix, body.cityHint, body.origin.text);
      originPoint.name = body.origin.text;
    }

    // 2) 地点：强制城市 + 选最可能
    // 并发 Geocoding
    const geocodedResults = await Promise.allSettled(
      body.places.map(async (name) => {
        const p = await geocodeStrict(queryCity, expectAdcodePrefix, body.cityHint, name);
        p.name = name;
        return p;
      })
    );

    const geocoded: PlacePoint[] = [];
    const failed: { name: string; reason: string }[] = [];

    geocodedResults.forEach((res, idx) => {
      const name = body.places[idx];
      if (res.status === "fulfilled") {
        geocoded.push(res.value);
      } else {
        failed.push({ name, reason: res.reason?.message ?? "not found" });
      }
    });

    if (geocoded.length === 0) {
      return NextResponse.json(
        {
          error: "No places found in target city. Please be more specific.",
          failed,
        },
        { status: 400, headers: { "Content-Type": "application/json; charset=utf-8" } }
      );
    }

    // 3) 排序（分团 + twoOpt）
    const orderedPlaces = clusteredOrder(originPoint, geocoded);

    // 4) legs：并发 Route Planning
    // 为了保证顺序，我们先构建 pair 数组，再并发请求，最后按顺序组装
    const legPairs: { from: PlacePoint; to: PlacePoint }[] = [];
    let cur = originPoint;
    for (const nxt of orderedPlaces) {
      legPairs.push({ from: cur, to: nxt });
      cur = nxt;
    }

    const legResults = await Promise.all(
      legPairs.map(async ({ from, to }) => {
        const { summary, segments } = await transitOrWalk(body.cityAdcode, from, to);
        return {
          from,
          to,
          summary,
          segments,
          amap: buildAmapLinks(from, to),
        } as UiLeg;
      })
    );

    return NextResponse.json(
      { origin: originPoint, orderedPlaces, legs: legResults, failed },
      { status: 200, headers: { "Content-Type": "application/json; charset=utf-8" } }
    );
  } catch (e: any) {
    console.error("OPTIMIZE_ERROR:", e);
    return NextResponse.json(
      { error: e?.message ?? String(e), stack: e?.stack ?? null },
      { status: 500, headers: { "Content-Type": "application/json; charset=utf-8" } }
    );
  }
}
