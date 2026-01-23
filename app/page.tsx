"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type OriginInput =
  | { type: "coord"; lng: number; lat: number; name?: string }
  | { type: "text"; text: string };

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
  summary: {
    mode: "transit" | "walk";
    distanceM?: number;
    durationS?: number;
    costYuan?: number;
    note?: string;
  };
  amap: { appUri: string; webUrl: string };
  segments?: any[] | null;
};

type OptimizeResp = {
  origin: PlacePoint;
  orderedPlaces: PlacePoint[];
  legs: UiLeg[];
};

type GuidePoi = {
  id?: string;
  name: string;
  address?: string;
  distance?: number;
  rating?: number;
  location?: string;
  tel?: string;
};

type GuideSection = {
  key: string; // food/coffee/sight/metro/store...
  title: string;
  items: GuidePoi[];
};

type GuideResp = {
  center: { lng: number; lat: number; name?: string };
  sections: GuideSection[];
};

type GuideSummaryResp = {
  title: string;
  duration: string;
  bestTime: string;
  mustDo: string[];
  foodPick: { name: string; why: string }[];
  tips: string[];
  nearbyPlanB: string[];
};

function cn(...xs: Array<string | false | undefined | null>) {
  return xs.filter(Boolean).join(" ");
}

async function postJson<T>(url: string, body: any): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  });
  const txt = await res.text();
  let data: any = null;
  try {
    data = txt ? JSON.parse(txt) : null;
  } catch {
    // ignore
  }
  if (!res.ok) {
    const msg = data?.error || txt || `Request failed: ${res.status}`;
    throw new Error(msg);
  }
  return data as T;
}

function formatDistance(m?: number) {
  if (!m && m !== 0) return "—";
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

function formatDuration(s?: number) {
  if (!s && s !== 0) return "—";
  const mins = Math.round(s / 60);
  if (mins < 60) return `${mins} 分钟`;
  const h = Math.floor(mins / 60);
  const r = mins % 60;
  return `${h} 小时 ${r} 分钟`;
}

function badgeForMode(mode: "transit" | "walk") {
  return mode === "transit"
    ? { text: "公交/地铁", cls: "bg-blue-600/10 text-blue-700 border-blue-200" }
    : { text: "步行", cls: "bg-emerald-600/10 text-emerald-700 border-emerald-200" };
}

function tryParseCoord(input: string): { lng: number; lat: number } | null {
  const t = input.trim();
  if (!t) return null;
  // 支持 "lng,lat" 或 "lng lat"
  const parts = t.includes(",") ? t.split(",") : t.split(/\s+/);
  if (parts.length < 2) return null;
  const lng = Number(parts[0]);
  const lat = Number(parts[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return { lng, lat };
}

export default function Page() {
  const [tab, setTab] = useState<"input" | "result" | "guide" | "settings">("input");

  // 城市
  const [cityName, setCityName] = useState<string>("成都");
  const [cityAdcode, setCityAdcode] = useState<string>(""); // 自动填充
  const [cityAutoStatus, setCityAutoStatus] = useState<string>("");

  // 起点
  const [originMode, setOriginMode] = useState<"text" | "coord">("text");
  const [originText, setOriginText] = useState<string>("天府广场");
  const [originCoordText, setOriginCoordText] = useState<string>(""); // "lng,lat"
  const [originCoordName, setOriginCoordName] = useState<string>("我的位置");
  const [locating, setLocating] = useState(false);

  // 地点列表
  const [placesText, setPlacesText] = useState<string>("春熙路\n宽窄巷子\n武侯祠\n东郊记忆");

  // 生成结果
  const [optimizing, setOptimizing] = useState(false);
  const [optError, setOptError] = useState<string>("");
  const [opt, setOpt] = useState<OptimizeResp | null>(null);

  // 攻略缓存
  const [guideLoading, setGuideLoading] = useState<Record<string, boolean>>({});
  const [guideError, setGuideError] = useState<Record<string, string>>({});
  const [guideData, setGuideData] = useState<Record<string, GuideResp | null>>({});
  const [guideSummary, setGuideSummary] = useState<Record<string, GuideSummaryResp | null>>({});

  const places = useMemo(() => {
    return placesText
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);
  }, [placesText]);

  const orderedPlaces = opt?.orderedPlaces ?? [];

  // ========== 城市中文名 -> adcode 自动匹配（用你现有 /api/geocode） ==========
  const cityDebounceRef = useRef<any>(null);
  useEffect(() => {
    const name = cityName.trim();
    if (!name) return;

    // 防抖
    if (cityDebounceRef.current) clearTimeout(cityDebounceRef.current);
    cityDebounceRef.current = setTimeout(async () => {
      try {
        setCityAutoStatus("匹配城市代码中…");
        // 用 geocode 直接查“成都”这种城市名，通常能拿到 adcode
        const g = await postJson<PlacePoint>("/api/geocode", { city: name, address: name });
        if (g?.adcode) {
          setCityAdcode(String(g.adcode));
          setCityAutoStatus(`已匹配：${g.adcode}`);
        } else {
          setCityAutoStatus("未匹配到 adcode（可手填）");
        }
      } catch {
        setCityAutoStatus("未匹配到 adcode（可手填）");
      }
    }, 400);

    return () => {
      if (cityDebounceRef.current) clearTimeout(cityDebounceRef.current);
    };
  }, [cityName]);

  // ========== 生成顺序 ==========
  async function onOptimize() {
    setOptError("");
    setOptimizing(true);
    try {
      const origin: OriginInput =
        originMode === "coord"
          ? (() => {
              const parsed = tryParseCoord(originCoordText);
              if (!parsed) throw new Error("坐标起点格式不对，请输入：lng,lat");
              return { type: "coord", lng: parsed.lng, lat: parsed.lat, name: originCoordName || "起点" };
            })()
          : { type: "text", text: originText.trim() || "起点" };

      const payload = {
        origin,
        places,
        cityHint: cityName.trim() || undefined,
        cityAdcode: cityAdcode.trim() || undefined,
      };

      // 关键：你同名跑外地，大概率就是这里没把 cityHint/cityAdcode 传给后端
      const data = await postJson<OptimizeResp>("/api/optimize", payload);
      setOpt(data);
      setTab("result");
    } catch (e: any) {
      setOptError(e?.message ?? String(e));
    } finally {
      setOptimizing(false);
    }
  }

  // ========== 复制行程 ==========
  async function copyItinerary() {
    if (!opt) return;
    const lines: string[] = [];
    lines.push(`起点：${opt.origin.name}`);
    lines.push(`顺序：${[opt.origin.name, ...opt.orderedPlaces.map((p) => p.name)].join(" → ")}`);
    lines.push("");
    lines.push("分段导航（webUrl）：");
    opt.legs.forEach((leg, idx) => {
      const b = badgeForMode(leg.summary.mode);
      lines.push(
        `${idx + 1}. ${leg.from.name} → ${leg.to.name}｜${b.text}｜${formatDistance(leg.summary.distanceM)}｜${formatDuration(
          leg.summary.durationS
        )}`
      );
      lines.push(leg.amap.webUrl);
    });

    await navigator.clipboard.writeText(lines.join("\n"));
    alert("已复制到剪贴板");
  }

  // ========== 攻略 ==========
  async function generateGuideFor(place: PlacePoint) {
    const key = place.name;
    setGuideError((m) => ({ ...m, [key]: "" }));
    setGuideLoading((m) => ({ ...m, [key]: true }));
    try {
      const g = await postJson<GuideResp>("/api/guide", {
        lng: place.lng,
        lat: place.lat,
        name: place.name,
        cityHint: cityName.trim() || undefined,
        cityAdcode: cityAdcode.trim() || undefined,
      });
      setGuideData((m) => ({ ...m, [key]: g }));

      const sum = await postJson<GuideSummaryResp>("/api/guide-summary", {
        place: { name: place.name, lng: place.lng, lat: place.lat },
        guide: g,
        // 你后端已做 TTL 缓存和 foodPick 限定
      });
      setGuideSummary((m) => ({ ...m, [key]: sum }));
    } catch (e: any) {
      setGuideError((m) => ({ ...m, [key]: e?.message ?? String(e) }));
    } finally {
      setGuideLoading((m) => ({ ...m, [key]: false }));
    }
  }

  async function useMyLocation() {
    if (!navigator.geolocation) {
      alert("当前浏览器不支持定位");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lng = pos.coords.longitude;
        const lat = pos.coords.latitude;
        setOriginMode("coord");
        setOriginCoordText(`${lng},${lat}`);
        setLocating(false);
      },
      (err) => {
        console.error(err);
        alert("定位失败：请允许浏览器定位权限");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  // 页面骨架
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-slate-50 to-slate-100 text-slate-900">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="mb-6 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">Travel Planner</h1>
          <p className="mt-2 text-sm text-slate-500">生成访问顺序 + 每段高德导航链接；攻略按需生成，不展示细步骤</p>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white/70 shadow-sm backdrop-blur">
          {/* Tabs */}
          <div className="flex items-center justify-between px-6 pt-6">
            <div className="inline-flex rounded-2xl bg-slate-100 p-1">
              <TabButton active={tab === "input"} onClick={() => setTab("input")} label="插入旅行信息" />
              <TabButton active={tab === "result"} onClick={() => setTab("result")} label="生成结果" />
              <TabButton active={tab === "guide"} onClick={() => setTab("guide")} label="生成目的地攻略" />
              <TabButton active={tab === "settings"} onClick={() => setTab("settings")} label="设置" />
            </div>

            <div className="text-xs text-slate-500">
              {optimizing ? (
                <span className="inline-flex items-center gap-2">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
                  正在生成路线…
                </span>
              ) : opt ? (
                <span className="inline-flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  已生成 {opt.legs.length} 段
                </span>
              ) : (
                <span className="inline-flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-slate-300" />
                  等待生成路线
                </span>
              )}
            </div>
          </div>

          <div className="grid gap-6 px-6 pb-6 pt-6 lg:grid-cols-2">
            {/* Left column */}
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              {tab === "input" && (
                <>
                  <h2 className="text-lg font-semibold">输入旅行信息</h2>

                  {/* City */}
                  <div className="mt-5">
                    <label className="text-sm font-medium text-slate-700">城市提示（强烈建议固定）</label>
                    <div className="mt-2 grid gap-3 sm:grid-cols-2">
                      <input
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-blue-400"
                        value={cityName}
                        onChange={(e) => setCityName(e.target.value)}
                        placeholder="例如：成都 / 北京"
                      />
                      <input
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-blue-400"
                        value={cityAdcode}
                        onChange={(e) => setCityAdcode(e.target.value)}
                        placeholder="城市 adcode（可自动填）"
                      />
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      {cityAutoStatus || "提示：固定城市能大幅减少“同名跑外地”的问题。"}
                    </p>
                  </div>

                  {/* Origin mode */}
                  <div className="mt-6">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-slate-700">起点（可选：文本 / 坐标）</label>
                      <button
                        onClick={useMyLocation}
                        className="text-xs font-medium text-blue-600 hover:text-blue-700"
                        disabled={locating}
                      >
                        {locating ? "定位中…" : "使用定位"}
                      </button>
                    </div>

                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => setOriginMode("text")}
                        className={cn(
                          "flex-1 rounded-xl border px-4 py-2 text-sm font-medium",
                          originMode === "text"
                            ? "border-slate-900 bg-slate-900 text-white"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        )}
                      >
                        文本输入
                      </button>
                      <button
                        onClick={() => setOriginMode("coord")}
                        className={cn(
                          "flex-1 rounded-xl border px-4 py-2 text-sm font-medium",
                          originMode === "coord"
                            ? "border-slate-900 bg-slate-900 text-white"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        )}
                      >
                        坐标输入
                      </button>
                    </div>

                    {originMode === "text" ? (
                      <div className="mt-3">
                        <input
                          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-blue-400"
                          value={originText}
                          onChange={(e) => setOriginText(e.target.value)}
                          placeholder='例如："天府广场" / "成都东站"'
                        />
                      </div>
                    ) : (
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <input
                          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-blue-400"
                          value={originCoordText}
                          onChange={(e) => setOriginCoordText(e.target.value)}
                          placeholder="lng,lat 例如：104.06,30.67"
                        />
                        <input
                          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-blue-400"
                          value={originCoordName}
                          onChange={(e) => setOriginCoordName(e.target.value)}
                          placeholder="起点名称（可选）"
                        />
                      </div>
                    )}
                  </div>

                  {/* Places */}
                  <div className="mt-6">
                    <label className="text-sm font-medium text-slate-700">地点列表（每行一个）</label>
                    <textarea
                      className="mt-2 h-36 w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-blue-400"
                      value={placesText}
                      onChange={(e) => setPlacesText(e.target.value)}
                      placeholder={"例如：\n春熙路\n宽窄巷子\n武侯祠"}
                    />
                    <p className="mt-2 text-xs text-slate-500">
                      规则：分团（K=2）+ 最近邻 + twoOpt 微调；每段公交无方案才 fallback 步行。
                    </p>
                  </div>

                  {/* Action */}
                  <button
                    onClick={onOptimize}
                    disabled={optimizing || places.length === 0}
                    className={cn(
                      "mt-6 w-full rounded-2xl px-4 py-3 text-sm font-semibold shadow-sm",
                      optimizing || places.length === 0
                        ? "bg-slate-200 text-slate-500"
                        : "bg-blue-600 text-white hover:bg-blue-700"
                    )}
                  >
                    {optimizing ? "生成中…" : "生成顺序 + 导航"}
                  </button>

                  {optError && (
                    <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {optError}
                    </div>
                  )}
                </>
              )}

              {tab === "result" && (
                <>
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold">生成结果</h2>
                    <div className="flex gap-2">
                      <button
                        onClick={copyItinerary}
                        disabled={!opt}
                        className={cn(
                          "rounded-xl border px-3 py-2 text-xs font-semibold",
                          opt ? "border-slate-200 bg-white hover:bg-slate-50" : "border-slate-200 bg-slate-100 text-slate-400"
                        )}
                      >
                        一键复制路线文本
                      </button>
                      <button
                        onClick={() => {
                          setOpt(null);
                          setTab("input");
                        }}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold hover:bg-slate-50"
                      >
                        重新输入
                      </button>
                    </div>
                  </div>

                  {!opt ? (
                    <EmptyPanel title="还没有结果" desc="请回到“插入旅行信息”生成路线。" />
                  ) : (
                    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="text-sm font-semibold text-slate-800">
                        {opt.origin.name} → {opt.orderedPlaces.map((p) => p.name).join(" → ")}
                      </div>
                      <div className="mt-2 text-xs text-slate-500">
                        共 {opt.legs.length} 段｜点击右侧路线卡片的链接即可打开高德导航
                      </div>
                    </div>
                  )}

                  <div className="mt-6">
                    <h3 className="text-sm font-semibold text-slate-700">目的地列表</h3>
                    <div className="mt-3 space-y-2">
                      {(opt?.orderedPlaces ?? []).map((p, idx) => (
                        <div
                          key={`${p.name}-${idx}`}
                          className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3"
                        >
                          <div>
                            <div className="text-sm font-semibold">{idx + 1}. {p.name}</div>
                            <div className="text-xs text-slate-500">{p.formatted_address || p.city || "—"}</div>
                          </div>
                          <button
                            onClick={() => setTab("guide")}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold hover:bg-slate-50"
                          >
                            去生成攻略
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {tab === "guide" && (
                <>
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold">目的地攻略</h2>
                    <button
                      onClick={() => setTab(opt ? "result" : "input")}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold hover:bg-slate-50"
                    >
                      返回
                    </button>
                  </div>

                  {!opt ? (
                    <EmptyPanel title="还没有路线" desc="请先生成路线，再按目的地生成攻略。" />
                  ) : (
                    <div className="mt-4 space-y-3">
                      {orderedPlaces.map((p, idx) => {
                        const loading = !!guideLoading[p.name];
                        const err = guideError[p.name];
                        const sum = guideSummary[p.name];
                        return (
                          <div key={`${p.name}-${idx}`} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="text-sm font-semibold">
                                  {idx + 1}. {p.name}
                                </div>
                                <div className="mt-1 text-xs text-slate-500">{p.formatted_address || "—"}</div>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => generateGuideFor(p)}
                                  disabled={loading}
                                  className={cn(
                                    "rounded-xl px-3 py-2 text-xs font-semibold",
                                    loading ? "bg-slate-200 text-slate-500" : "bg-blue-600 text-white hover:bg-blue-700"
                                  )}
                                >
                                  {loading ? "生成中…" : sum ? "重新生成" : "生成攻略"}
                                </button>
                                <a
                                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold hover:bg-slate-50"
                                  href={`https://uri.amap.com/marker?position=${p.lng},${p.lat}&name=${encodeURIComponent(p.name)}`}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  地图定位
                                </a>
                              </div>
                            </div>

                            {err && (
                              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                                {err}
                              </div>
                            )}

                            {!sum && !loading && !err && (
                              <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                                点击“生成攻略”，将依次调用：/api/guide → /api/guide-summary（服务端有 TTL 缓存）
                              </div>
                            )}

                            {loading && (
                              <div className="mt-4 space-y-2">
                                <div className="h-4 w-2/3 animate-pulse rounded bg-slate-200" />
                                <div className="h-4 w-1/2 animate-pulse rounded bg-slate-200" />
                                <div className="h-4 w-3/4 animate-pulse rounded bg-slate-200" />
                              </div>
                            )}

                            {sum && (
                              <div className="mt-4 space-y-3">
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                  <div className="text-sm font-semibold">{sum.title}</div>
                                  <div className="mt-1 text-xs text-slate-600">
                                    建议时长：{sum.duration} ｜ 最佳时间：{sum.bestTime}
                                  </div>
                                </div>

                                <Accordion title="必做（景区怎么玩）" defaultOpen>
                                  <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
                                    {sum.mustDo?.map((x, i) => (
                                      <li key={i}>{x}</li>
                                    ))}
                                  </ul>
                                </Accordion>

                                <Accordion title="吃什么（只从候选 POI 选）">
                                  <div className="space-y-2">
                                    {sum.foodPick?.map((x, i) => (
                                      <div key={i} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                                        <div className="text-sm font-semibold">{x.name}</div>
                                        <div className="text-xs text-slate-600">{x.why}</div>
                                      </div>
                                    ))}
                                  </div>
                                </Accordion>

                                <Accordion title="提示">
                                  <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
                                    {sum.tips?.map((x, i) => (
                                      <li key={i}>{x}</li>
                                    ))}
                                  </ul>
                                </Accordion>

                                <Accordion title="附近 Plan B">
                                  <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
                                    {sum.nearbyPlanB?.map((x, i) => (
                                      <li key={i}>{x}</li>
                                    ))}
                                  </ul>
                                </Accordion>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}

              {tab === "settings" && (
                <>
                  <h2 className="text-lg font-semibold">设置</h2>
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                    <div className="font-semibold">建议</div>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                      <li>城市提示尽量固定（成都/北京等），减少同名跑外地</li>
                      <li>如要更强约束：后端 POI 搜索建议加 citylimit=true（你当前 poiSearch 没加）</li>
                      <li>线路细步骤不展示没问题，导航交给高德链接即可</li>
                    </ul>
                  </div>
                </>
              )}
            </div>

            {/* Right column */}
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">路线卡片</h2>
                {opt && (
                  <div className="text-xs text-slate-500">
                    总距离/时间（估算）：{" "}
                    <span className="font-semibold text-slate-700">
                      {formatDistance(opt.legs.reduce((s, x) => s + (x.summary.distanceM || 0), 0))}
                    </span>{" "}
                    ·{" "}
                    <span className="font-semibold text-slate-700">
                      {formatDuration(opt.legs.reduce((s, x) => s + (x.summary.durationS || 0), 0))}
                    </span>
                  </div>
                )}
              </div>

              {!opt ? (
                <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
                  生成顺序后，右侧显示每段导航卡片
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {opt.legs.map((leg, idx) => {
                    const b = badgeForMode(leg.summary.mode);
                    return (
                      <div key={idx} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold">
                              {leg.from.name} <span className="text-slate-400">→</span> {leg.to.name}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                              <span className={cn("inline-flex items-center rounded-full border px-2 py-1 text-xs font-semibold", b.cls)}>
                                {b.text}
                              </span>
                              <span className="text-xs text-slate-600">{formatDistance(leg.summary.distanceM)}</span>
                              <span className="text-xs text-slate-600">{formatDuration(leg.summary.durationS)}</span>
                              {leg.summary.mode === "transit" && typeof leg.summary.costYuan === "number" && (
                                <span className="text-xs text-slate-600">¥{leg.summary.costYuan}</span>
                              )}
                              {leg.summary.note && <span className="text-xs text-amber-700">{leg.summary.note}</span>}
                            </div>
                          </div>

                          <div className="flex gap-2">
                            <a
                              className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                              href={leg.amap.webUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              打开 web
                            </a>
                            <a
                              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold hover:bg-slate-50"
                              href={leg.amap.appUri}
                            >
                              打开 App
                            </a>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 text-center text-xs text-slate-400">
          Tips：同名跑外地通常是“没传 cityHint/cityAdcode 或后端没限制 citylimit”，这版前端已确保传参。
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-2xl px-4 py-2 text-sm font-semibold transition",
        active ? "bg-blue-600 text-white shadow-sm" : "text-slate-700 hover:bg-white"
      )}
    >
      {label}
    </button>
  );
}

function EmptyPanel({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
      <div className="text-sm font-semibold text-slate-800">{title}</div>
      <div className="mt-2 text-sm text-slate-500">{desc}</div>
    </div>
  );
}

function Accordion({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl border border-slate-200 bg-white">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-slate-400">{open ? "—" : "+"}</div>
      </button>
      {open && <div className="border-t border-slate-200 px-4 py-3">{children}</div>}
    </div>
  );
}
