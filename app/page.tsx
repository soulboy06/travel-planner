"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type OriginInput =
  | { type: "coord"; lng: number; lat: number; name?: string }
  | { type: "text"; text: string };

type PlacePoint = {
  name: string;
  lng: number;
  lat: number;
  location: string;
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
  key: string;
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
  } catch { }
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
  return `${h}h ${r}m`;
}

function tryParseCoord(input: string): { lng: number; lat: number } | null {
  const t = input.trim();
  if (!t) return null;
  const parts = t.includes(",") ? t.split(",") : t.split(/\s+/);
  if (parts.length < 2) return null;
  const lng = Number(parts[0]);
  const lat = Number(parts[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return { lng, lat };
}

export default function Page() {
  const [tab, setTab] = useState<"input" | "result" | "guide">("input");
  const [cityName, setCityName] = useState<string>("成都");
  const [cityAdcode, setCityAdcode] = useState<string>("");
  const [cityAutoStatus, setCityAutoStatus] = useState<string>("");
  const [originMode, setOriginMode] = useState<"text" | "coord">("text");
  const [originText, setOriginText] = useState<string>("天府广场");
  const [originCoordText, setOriginCoordText] = useState<string>("");
  const [originCoordName, setOriginCoordName] = useState<string>("我的位置");
  const [locating, setLocating] = useState(false);
  const [placesText, setPlacesText] = useState<string>("春熙路\n宽窄巷子\n武侯祠\n东郊记忆");
  const [optimizing, setOptimizing] = useState(false);
  const [optError, setOptError] = useState<string>("");
  const [opt, setOpt] = useState<OptimizeResp | null>(null);
  const [guideLoading, setGuideLoading] = useState<Record<string, boolean>>({});
  const [guideError, setGuideError] = useState<Record<string, string>>({});
  const [guideData, setGuideData] = useState<Record<string, GuideResp | null>>({});
  const [guideSummary, setGuideSummary] = useState<Record<string, GuideSummaryResp | null>>({});

  const places = useMemo(() => {
    return placesText.split("\n").map((x) => x.trim()).filter(Boolean);
  }, [placesText]);

  const orderedPlaces = opt?.orderedPlaces ?? [];

  const cityDebounceRef = useRef<any>(null);
  useEffect(() => {
    const name = cityName.trim();
    if (!name) return;
    if (cityDebounceRef.current) clearTimeout(cityDebounceRef.current);
    cityDebounceRef.current = setTimeout(async () => {
      try {
        setCityAutoStatus("匹配中…");
        const g = await postJson<PlacePoint>("/api/geocode", { city: name, address: name });
        if (g?.adcode) {
          setCityAdcode(String(g.adcode));
          setCityAutoStatus(`✓ ${g.adcode}`);
        } else {
          setCityAutoStatus("未匹配");
        }
      } catch {
        setCityAutoStatus("未匹配");
      }
    }, 400);
    return () => {
      if (cityDebounceRef.current) clearTimeout(cityDebounceRef.current);
    };
  }, [cityName]);

  async function onOptimize() {
    setOptError("");
    setOptimizing(true);
    try {
      const origin: OriginInput =
        originMode === "coord"
          ? (() => {
            const parsed = tryParseCoord(originCoordText);
            if (!parsed) throw new Error("坐标格式错误，请输入 lng,lat");
            return { type: "coord", lng: parsed.lng, lat: parsed.lat, name: originCoordName || "起点" };
          })()
          : { type: "text", text: originText.trim() || "起点" };
      const payload = {
        origin,
        places,
        cityHint: cityName.trim() || undefined,
        cityAdcode: cityAdcode.trim() || undefined,
      };
      const data = await postJson<OptimizeResp>("/api/optimize", payload);
      setOpt(data);
      setTab("result");
    } catch (e: any) {
      setOptError(e?.message ?? String(e));
    } finally {
      setOptimizing(false);
    }
  }

  async function copyItinerary() {
    if (!opt) return;
    const lines: string[] = [];
    lines.push(`🚀 起点：${opt.origin.name}`);
    lines.push(`📍 路线：${[opt.origin.name, ...opt.orderedPlaces.map((p) => p.name)].join(" → ")}`);
    lines.push("");
    opt.legs.forEach((leg, idx) => {
      const mode = leg.summary.mode === "transit" ? "🚇" : "🚶";
      lines.push(`${idx + 1}. ${leg.from.name} → ${leg.to.name} ${mode} ${formatDistance(leg.summary.distanceM)} ${formatDuration(leg.summary.durationS)}`);
      lines.push(leg.amap.webUrl);
    });
    await navigator.clipboard.writeText(lines.join("\n"));
    alert("已复制 ✓");
  }

  async function generateGuideFor(place: PlacePoint) {
    const key = place.name;
    setGuideError((m) => ({ ...m, [key]: "" }));
    setGuideLoading((m) => ({ ...m, [key]: true }));
    try {
      const center = { lng: place.lng, lat: place.lat, name: place.name };
      const g = await postJson<GuideResp>("/api/guide", {
        center,
        lng: place.lng,
        lat: place.lat,
        name: place.name,
        cityHint: cityName.trim() || undefined,
        cityAdcode: cityAdcode.trim() || undefined,
      });
      if (!g?.center || !Number.isFinite(g.center.lng) || !Number.isFinite(g.center.lat)) {
        throw new Error("返回数据异常");
      }
      if (!Array.isArray(g?.sections) || g.sections.length === 0) {
        throw new Error("返回数据异常");
      }
      setGuideData((m) => ({ ...m, [key]: g }));
      const raw = await postJson<any>("/api/guide-summary", {
        place: { name: place.name, lng: place.lng, lat: place.lat },
        sections: g.sections,
        center: g.center,
      });
      const sum: GuideSummaryResp = raw?.summary ?? raw;
      setGuideSummary((m) => ({ ...m, [key]: sum }));
    } catch (e: any) {
      setGuideError((m) => ({ ...m, [key]: e?.message ?? String(e) }));
    } finally {
      setGuideLoading((m) => ({ ...m, [key]: false }));
    }
  }

  async function useMyLocation() {
    if (!navigator.geolocation) {
      alert("浏览器不支持定位");
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
      () => {
        alert("定位失败，请检查权限");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50">
      {/* 装饰背景 */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-purple-400/20 to-pink-400/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-gradient-to-br from-blue-400/20 to-indigo-400/20 rounded-full blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-6xl px-4 py-8">
        {/* 标题区 */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold gradient-text tracking-tight">
            ✈️ Travel Planner
          </h1>
          <p className="mt-3 text-slate-500">智能规划路线 · 一键导航</p>
        </div>

        {/* 主卡片 */}
        <div className="glass rounded-3xl shadow-xl overflow-hidden">
          {/* 导航标签 */}
          <div className="flex items-center justify-between px-6 py-5 border-b border-white/20">
            <div className="flex gap-2">
              <TabButton active={tab === "input"} onClick={() => setTab("input")} icon="📝" label="输入" />
              <TabButton active={tab === "result"} onClick={() => setTab("result")} icon="🗺️" label="路线" />
              <TabButton active={tab === "guide"} onClick={() => setTab("guide")} icon="📖" label="攻略" />
            </div>
            <StatusBadge optimizing={optimizing} hasResult={!!opt} legCount={opt?.legs.length ?? 0} />
          </div>

          {/* 内容区 */}
          <div className="grid gap-6 p-6 lg:grid-cols-5">
            {/* 左侧面板 */}
            <div className="lg:col-span-2 space-y-6">
              {tab === "input" && (
                <InputPanel
                  cityName={cityName}
                  setCityName={setCityName}
                  cityAdcode={cityAdcode}
                  setCityAdcode={setCityAdcode}
                  cityAutoStatus={cityAutoStatus}
                  originMode={originMode}
                  setOriginMode={setOriginMode}
                  originText={originText}
                  setOriginText={setOriginText}
                  originCoordText={originCoordText}
                  setOriginCoordText={setOriginCoordText}
                  originCoordName={originCoordName}
                  setOriginCoordName={setOriginCoordName}
                  locating={locating}
                  useMyLocation={useMyLocation}
                  placesText={placesText}
                  setPlacesText={setPlacesText}
                  onOptimize={onOptimize}
                  optimizing={optimizing}
                  placesCount={places.length}
                  optError={optError}
                />
              )}

              {tab === "result" && (
                <ResultPanel
                  opt={opt}
                  copyItinerary={copyItinerary}
                  onReset={() => { setOpt(null); setTab("input"); }}
                  onGuide={() => setTab("guide")}
                />
              )}

              {tab === "guide" && (
                <GuidePanel
                  opt={opt}
                  orderedPlaces={orderedPlaces}
                  guideLoading={guideLoading}
                  guideError={guideError}
                  guideSummary={guideSummary}
                  generateGuideFor={generateGuideFor}
                  onBack={() => setTab(opt ? "result" : "input")}
                />
              )}
            </div>

            {/* 右侧路线卡片 */}
            <div className="lg:col-span-3">
              <RouteCards opt={opt} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TabButton({ active, label, icon, onClick }: { active: boolean; label: string; icon: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300",
        active
          ? "btn-gradient text-white shadow-lg"
          : "bg-white/50 text-slate-600 hover:bg-white/80 hover:shadow"
      )}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function StatusBadge({ optimizing, hasResult, legCount }: { optimizing: boolean; hasResult: boolean; legCount: number }) {
  if (optimizing) {
    return (
      <span className="flex items-center gap-2 text-sm text-indigo-600">
        <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
        生成中…
      </span>
    );
  }
  if (hasResult) {
    return (
      <span className="flex items-center gap-2 text-sm text-emerald-600">
        <span className="w-2 h-2 rounded-full bg-emerald-500" />
        {legCount} 段路线
      </span>
    );
  }
  return (
    <span className="flex items-center gap-2 text-sm text-slate-400">
      <span className="w-2 h-2 rounded-full bg-slate-300" />
      等待输入
    </span>
  );
}

function InputPanel({
  cityName, setCityName, cityAdcode, setCityAdcode, cityAutoStatus,
  originMode, setOriginMode, originText, setOriginText,
  originCoordText, setOriginCoordText, originCoordName, setOriginCoordName,
  locating, useMyLocation, placesText, setPlacesText,
  onOptimize, optimizing, placesCount, optError
}: any) {
  return (
    <div className="bg-white/60 rounded-2xl p-6 shadow-sm space-y-5">
      <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
        <span className="text-2xl">🎯</span> 旅行信息
      </h2>

      {/* 城市 */}
      <div>
        <label className="text-sm font-medium text-slate-600">城市</label>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <input
            className="w-full rounded-xl border-0 bg-white/80 px-4 py-3 text-sm shadow-sm ring-1 ring-slate-200 focus:ring-2 focus:ring-indigo-400 input-glow transition"
            value={cityName}
            onChange={(e) => setCityName(e.target.value)}
            placeholder="成都"
          />
          <div className="relative">
            <input
              className="w-full rounded-xl border-0 bg-white/80 px-4 py-3 text-sm shadow-sm ring-1 ring-slate-200 focus:ring-2 focus:ring-indigo-400 input-glow transition"
              value={cityAdcode}
              onChange={(e) => setCityAdcode(e.target.value)}
              placeholder="城市代码"
            />
            {cityAutoStatus && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">{cityAutoStatus}</span>
            )}
          </div>
        </div>
      </div>

      {/* 起点 */}
      <div>
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-slate-600">起点</label>
          <button
            onClick={useMyLocation}
            disabled={locating}
            className="text-xs font-medium text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
          >
            📍 {locating ? "定位中…" : "当前位置"}
          </button>
        </div>
        <div className="mt-2 flex gap-2">
          <button
            onClick={() => setOriginMode("text")}
            className={cn(
              "flex-1 py-2.5 rounded-xl text-sm font-medium transition-all",
              originMode === "text"
                ? "btn-gradient text-white shadow"
                : "bg-white/80 text-slate-600 ring-1 ring-slate-200 hover:bg-white"
            )}
          >
            文本
          </button>
          <button
            onClick={() => setOriginMode("coord")}
            className={cn(
              "flex-1 py-2.5 rounded-xl text-sm font-medium transition-all",
              originMode === "coord"
                ? "btn-gradient text-white shadow"
                : "bg-white/80 text-slate-600 ring-1 ring-slate-200 hover:bg-white"
            )}
          >
            坐标
          </button>
        </div>
        {originMode === "text" ? (
          <input
            className="mt-3 w-full rounded-xl border-0 bg-white/80 px-4 py-3 text-sm shadow-sm ring-1 ring-slate-200 focus:ring-2 focus:ring-indigo-400 input-glow transition"
            value={originText}
            onChange={(e) => setOriginText(e.target.value)}
            placeholder="天府广场"
          />
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <input
              className="w-full rounded-xl border-0 bg-white/80 px-4 py-3 text-sm shadow-sm ring-1 ring-slate-200 focus:ring-2 focus:ring-indigo-400 input-glow transition"
              value={originCoordText}
              onChange={(e) => setOriginCoordText(e.target.value)}
              placeholder="104.06,30.67"
            />
            <input
              className="w-full rounded-xl border-0 bg-white/80 px-4 py-3 text-sm shadow-sm ring-1 ring-slate-200 focus:ring-2 focus:ring-indigo-400 input-glow transition"
              value={originCoordName}
              onChange={(e) => setOriginCoordName(e.target.value)}
              placeholder="起点名称"
            />
          </div>
        )}
      </div>

      {/* 地点 */}
      <div>
        <label className="text-sm font-medium text-slate-600">目的地（每行一个）</label>
        <textarea
          className="mt-2 h-32 w-full resize-none rounded-xl border-0 bg-white/80 px-4 py-3 text-sm shadow-sm ring-1 ring-slate-200 focus:ring-2 focus:ring-indigo-400 input-glow transition"
          value={placesText}
          onChange={(e) => setPlacesText(e.target.value)}
          placeholder="春熙路&#10;宽窄巷子&#10;武侯祠"
        />
      </div>

      {/* 生成按钮 */}
      <button
        onClick={onOptimize}
        disabled={optimizing || placesCount === 0}
        className={cn(
          "w-full py-3.5 rounded-xl text-sm font-bold transition-all duration-300",
          optimizing || placesCount === 0
            ? "bg-slate-200 text-slate-400 cursor-not-allowed"
            : "btn-gradient text-white shadow-lg hover:shadow-xl"
        )}
      >
        {optimizing ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            生成中…
          </span>
        ) : (
          "🚀 生成路线"
        )}
      </button>

      {optError && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
          ⚠️ {optError}
        </div>
      )}
    </div>
  );
}

function ResultPanel({ opt, copyItinerary, onReset, onGuide }: any) {
  if (!opt) {
    return (
      <div className="bg-white/60 rounded-2xl p-8 text-center">
        <div className="text-4xl mb-3">🗺️</div>
        <div className="text-slate-500">请先生成路线</div>
      </div>
    );
  }

  return (
    <div className="bg-white/60 rounded-2xl p-6 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-800">🎉 路线已生成</h2>
        <div className="flex gap-2">
          <button onClick={copyItinerary} className="px-3 py-2 rounded-lg text-xs font-medium bg-white shadow-sm hover:shadow ring-1 ring-slate-200 transition">
            📋 复制
          </button>
          <button onClick={onReset} className="px-3 py-2 rounded-lg text-xs font-medium bg-white shadow-sm hover:shadow ring-1 ring-slate-200 transition">
            🔄 重置
          </button>
        </div>
      </div>

      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl p-4">
        <div className="text-sm font-semibold text-slate-700">
          {opt.origin.name} → {opt.orderedPlaces.map((p: any) => p.name).join(" → ")}
        </div>
        <div className="mt-2 text-xs text-slate-500">
          共 {opt.legs.length} 段
        </div>
      </div>

      <div className="space-y-2">
        {opt.orderedPlaces.map((p: any, idx: number) => (
          <div key={`${p.name}-${idx}`} className="flex items-center justify-between bg-white rounded-xl px-4 py-3 shadow-sm ring-1 ring-slate-100">
            <div>
              <div className="text-sm font-semibold text-slate-700">{idx + 1}. {p.name}</div>
              <div className="text-xs text-slate-400">{p.formatted_address || p.city || ""}</div>
            </div>
            <button onClick={onGuide} className="text-xs font-medium text-indigo-600 hover:text-indigo-700">
              查看攻略 →
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function GuidePanel({ opt, orderedPlaces, guideLoading, guideError, guideSummary, generateGuideFor, onBack }: any) {
  if (!opt) {
    return (
      <div className="bg-white/60 rounded-2xl p-8 text-center">
        <div className="text-4xl mb-3">📖</div>
        <div className="text-slate-500">请先生成路线</div>
      </div>
    );
  }

  return (
    <div className="bg-white/60 rounded-2xl p-6 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-800">📖 目的地攻略</h2>
        <button onClick={onBack} className="px-3 py-2 rounded-lg text-xs font-medium bg-white shadow-sm hover:shadow ring-1 ring-slate-200 transition">
          ← 返回
        </button>
      </div>

      <div className="space-y-3">
        {orderedPlaces.map((p: any, idx: number) => {
          const loading = !!guideLoading[p.name];
          const err = guideError[p.name];
          const sum = guideSummary[p.name];
          return (
            <div key={`${p.name}-${idx}`} className="bg-white rounded-2xl p-5 shadow-sm ring-1 ring-slate-100">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-700">{idx + 1}. {p.name}</div>
                  <div className="text-xs text-slate-400">{p.formatted_address || ""}</div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => generateGuideFor(p)}
                    disabled={loading}
                    className={cn(
                      "px-3 py-2 rounded-lg text-xs font-semibold transition",
                      loading ? "bg-slate-200 text-slate-400" : "btn-gradient text-white"
                    )}
                  >
                    {loading ? "生成中…" : sum ? "刷新" : "生成"}
                  </button>
                  <a
                    className="px-3 py-2 rounded-lg text-xs font-medium bg-white shadow-sm hover:shadow ring-1 ring-slate-200"
                    href={`https://uri.amap.com/marker?position=${p.lng},${p.lat}&name=${encodeURIComponent(p.name)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    📍 地图
                  </a>
                </div>
              </div>

              {err && <div className="mt-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">⚠️ {err}</div>}

              {loading && (
                <div className="mt-4 space-y-2">
                  <div className="h-4 w-2/3 animate-pulse rounded bg-slate-200" />
                  <div className="h-4 w-1/2 animate-pulse rounded bg-slate-200" />
                </div>
              )}

              {sum && (
                <div className="mt-4 space-y-3">
                  <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl p-4">
                    <div className="text-sm font-bold text-slate-700">{sum.title}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      ⏱ {sum.duration} · 🕐 {sum.bestTime}
                    </div>
                  </div>

                  <Accordion title="🎯 必玩" defaultOpen>
                    <ul className="space-y-1 text-sm text-slate-600">
                      {sum.mustDo?.map((x: string, i: number) => <li key={i}>• {x}</li>)}
                    </ul>
                  </Accordion>

                  <Accordion title="🍜 美食">
                    <div className="space-y-2">
                      {sum.foodPick?.map((x: any, i: number) => (
                        <div key={i} className="bg-slate-50 rounded-lg px-3 py-2">
                          <div className="text-sm font-medium text-slate-700">{x.name}</div>
                          <div className="text-xs text-slate-500">{x.why}</div>
                        </div>
                      ))}
                    </div>
                  </Accordion>

                  <Accordion title="💡 提示">
                    <ul className="space-y-1 text-sm text-slate-600">
                      {sum.tips?.map((x: string, i: number) => <li key={i}>• {x}</li>)}
                    </ul>
                  </Accordion>

                  <Accordion title="🔄 备选">
                    <ul className="space-y-1 text-sm text-slate-600">
                      {sum.nearbyPlanB?.map((x: string, i: number) => <li key={i}>• {x}</li>)}
                    </ul>
                  </Accordion>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RouteCards({ opt }: { opt: OptimizeResp | null }) {
  if (!opt) {
    return (
      <div className="h-full flex items-center justify-center bg-white/40 rounded-2xl p-8">
        <div className="text-center">
          <div className="text-6xl mb-4 animate-float">🗺️</div>
          <div className="text-slate-400">路线卡片将显示在这里</div>
        </div>
      </div>
    );
  }

  const totalDist = opt.legs.reduce((s, x) => s + (x.summary.distanceM || 0), 0);
  const totalTime = opt.legs.reduce((s, x) => s + (x.summary.durationS || 0), 0);

  return (
    <div className="bg-white/60 rounded-2xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-slate-800">🚗 路线详情</h2>
        <div className="text-xs text-slate-500">
          <span className="font-semibold text-slate-700">{formatDistance(totalDist)}</span>
          {" · "}
          <span className="font-semibold text-slate-700">{formatDuration(totalTime)}</span>
        </div>
      </div>

      <div className="space-y-3">
        {opt.legs.map((leg, idx) => (
          <div key={idx} className="bg-white rounded-2xl p-5 shadow-sm ring-1 ring-slate-100 card-hover">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-slate-700">
                  {leg.from.name}
                  <span className="mx-2 text-slate-300">→</span>
                  {leg.to.name}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className={cn(
                    "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold",
                    leg.summary.mode === "transit" ? "badge-transit" : "badge-walk"
                  )}>
                    {leg.summary.mode === "transit" ? "🚇 公交" : "🚶 步行"}
                  </span>
                  <span className="text-xs text-slate-500">{formatDistance(leg.summary.distanceM)}</span>
                  <span className="text-xs text-slate-500">{formatDuration(leg.summary.durationS)}</span>
                  {leg.summary.mode === "transit" && typeof leg.summary.costYuan === "number" && (
                    <span className="text-xs text-amber-600">¥{leg.summary.costYuan}</span>
                  )}
                </div>
              </div>

              <div className="flex gap-2 flex-shrink-0">
                <a
                  className="px-4 py-2 rounded-xl text-xs font-semibold btn-gradient text-white"
                  href={leg.amap.webUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  🌐 网页
                </a>
                <a
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-white shadow-sm ring-1 ring-slate-200 hover:shadow"
                  href={leg.amap.appUri}
                >
                  📱 App
                </a>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Accordion({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl ring-1 ring-slate-200 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 bg-white hover:bg-slate-50 transition"
      >
        <span className="text-sm font-medium text-slate-700">{title}</span>
        <span className="text-slate-400 transition-transform duration-200" style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>
          ▼
        </span>
      </button>
      {open && <div className="px-4 py-3 bg-slate-50 border-t border-slate-100">{children}</div>}
    </div>
  );
}
