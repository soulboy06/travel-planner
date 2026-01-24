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
  if (m < 1000) return `${Math.round(m)}m`;
  return `${(m / 1000).toFixed(1)}km`;
}

function formatDuration(s?: number) {
  if (!s && s !== 0) return "—";
  const mins = Math.round(s / 60);
  if (mins < 60) return `${mins}m`;
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
    <div className="min-h-screen flex items-center justify-center p-2 sm:p-6 md:p-8">
      {/* 整个主应用容器 - Apple Window Style */}
      {/* 响应式：高度在移动端自动适配，md以上固定高度 */}
      <div className="w-full max-w-6xl apple-glass rounded-2xl sm:rounded-3xl overflow-hidden shadow-2xl flex flex-col h-[92vh] md:h-[85vh]">

        {/* 顶部栏 / Window Toolbar */}
        <div className="flex-none px-4 py-3 md:px-6 md:py-4 border-b border-black/5 flex items-center justify-between bg-white/40 backdrop-blur-md z-10 shrink-0">
          <div className="flex items-center gap-3 md:gap-4">
            <div className="flex gap-1.5 md:gap-2">
              <div className="w-3 h-3 rounded-full bg-[#FF5F57] border border-[#E0443E]/20" />
              <div className="w-3 h-3 rounded-full bg-[#FEBC2E] border border-[#D89E24]/20" />
              <div className="w-3 h-3 rounded-full bg-[#28C840] border border-[#1AAB29]/20" />
            </div>
            <h1 className="text-sm font-semibold text-gray-800/80 ml-1 md:ml-2 truncate">Travel Planner</h1>
          </div>

          {/* iOS Segmented Control */}
          <div className="segmented-control scale-90 md:scale-100 origin-right md:origin-center">
            <button onClick={() => setTab("input")} className={cn("segmented-item", tab === "input" && "active")}>输入</button>
            <button onClick={() => setTab("result")} className={cn("segmented-item", tab === "result" && "active")}>路线</button>
            <button onClick={() => setTab("guide")} className={cn("segmented-item", tab === "guide" && "active")}>攻略</button>
          </div>

          <div className="w-20 flex justify-end">
            {/* 占位，保持平衡 */}
          </div>
        </div>

        {/* 内容区域 - Split View Style on Desktop, Stack on Mobile */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">

          {/* 左侧边栏 / Sidebar */}
          <div className={cn(
            "md:w-[380px] flex-none border-b md:border-b-0 md:border-r border-black/5 bg-white/30 backdrop-blur-md overflow-y-auto p-4 md:p-6 space-y-6 transition-all",
            "w-full h-full md:h-auto absolute inset-0 md:relative z-20 md:z-0 bg-white/80 md:bg-white/30",
            tab === "input" ? "block" : (tab === "guide" ? "block" : "hidden md:block")
          )}>
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
              <div className="md:block hidden">
                <ResultPanel
                  opt={opt}
                  copyItinerary={copyItinerary}
                  onReset={() => { setOpt(null); setTab("input"); }}
                  onGuide={() => setTab("guide")}
                />
              </div>
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

          {/* 右侧主视口 / Main Viewport */}
          <div className={cn(
            "flex-1 bg-white/50 backdrop-blur-sm overflow-y-auto p-4 md:p-8 relative",
            tab === "result" ? "block w-full h-full absolute inset-0 md:relative z-20 md:z-0 bg-gray-50 md:bg-white/50" : "hidden md:block"
          )}>
            {tab === "result" && (
              <div className="md:hidden mb-4">
                <ResultPanel
                  opt={opt}
                  copyItinerary={copyItinerary}
                  onReset={() => { setOpt(null); setTab("input"); }}
                  onGuide={() => setTab("guide")}
                  mobileMode
                />
              </div>
            )}
            <RouteCards opt={opt} />
          </div>

        </div>
      </div>
    </div>
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
    <div className="space-y-6 animate-in fade-in slide-in-from-left-4 duration-500">

      {/* City Section */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider ml-1">City</label>
        <div className="flex gap-2">
          <input
            className="ios-input w-full px-3 py-2"
            value={cityName}
            onChange={e => setCityName(e.target.value)}
            placeholder="City Name"
          />
          <div className="relative w-24 flex-none hidden md:block">
            <input
              className="ios-input w-full px-3 py-2 text-center"
              value={cityAdcode}
              onChange={e => setCityAdcode(e.target.value)}
              placeholder="Code"
            />
            {cityAutoStatus && <div className="absolute -top-5 right-0 text-[10px] text-blue-500 font-medium whitespace-nowrap">{cityAutoStatus}</div>}
          </div>
        </div>
      </div>

      {/* Origin Section */}
      <div className="space-y-2">
        <div className="flex justify-between items-center px-1">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Start Point</label>
          <button onClick={useMyLocation} disabled={locating} className="text-[11px] font-medium text-blue-500 hover:text-blue-600">
            {locating ? "Locating..." : "Use Current Location"}
          </button>
        </div>

        {/* Pseudo Segmented Control for Mode */}
        <div className="bg-gray-100/50 p-1 rounded-lg flex gap-1 mb-2">
          <button onClick={() => setOriginMode("text")} className={cn("flex-1 py-1 text-xs font-medium rounded-md transition-all", originMode === "text" ? "bg-white shadow-sm text-black" : "text-gray-500 hover:text-gray-700")}>Text</button>
          <button onClick={() => setOriginMode("coord")} className={cn("flex-1 py-1 text-xs font-medium rounded-md transition-all", originMode === "coord" ? "bg-white shadow-sm text-black" : "text-gray-500 hover:text-gray-700")}>Coordinate</button>
        </div>

        {originMode === "text" ? (
          <input
            className="ios-input w-full px-3 py-2"
            value={originText}
            onChange={(e) => setOriginText(e.target.value)}
            placeholder='e.g. "Tianfu Square"'
          />
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <input
              className="ios-input w-full px-3 py-2"
              value={originCoordText}
              onChange={(e) => setOriginCoordText(e.target.value)}
              placeholder="lng,lat"
            />
            <input
              className="ios-input w-full px-3 py-2"
              value={originCoordName}
              onChange={(e) => setOriginCoordName(e.target.value)}
              placeholder="Name"
            />
          </div>
        )}
      </div>

      {/* Destinations Section */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider ml-1">Destinations</label>
        <textarea
          className="ios-input w-full p-3 h-32 resize-none"
          value={placesText}
          onChange={(e) => setPlacesText(e.target.value)}
          placeholder="One place per line..."
        />
      </div>

      {/* Action Button */}
      <button
        onClick={onOptimize}
        disabled={optimizing || placesCount === 0}
        className={cn(
          "w-full py-3 ios-btn-primary shadow-lg shadow-blue-500/30",
          (optimizing || placesCount === 0) && "opacity-50 cursor-not-allowed shadow-none"
        )}
      >
        {optimizing ? "Optimizing..." : "Generate Route"}
      </button>

      {optError && <div className="text-xs text-red-500 px-2 font-medium">{optError}</div>}

    </div>
  );
}

function ResultPanel({ opt, copyItinerary, onReset, onGuide, mobileMode }: any) {
  if (!opt) return mobileMode ? null : <EmptyState icon="🗺️" text="Ready to plan your trip." />;

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-500">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-800">Route Ready</h2>
        <div className="flex gap-2">
          <button onClick={copyItinerary} className="ios-btn-secondary px-3 py-1 text-xs">Copy</button>
          <button onClick={onReset} className="text-gray-400 hover:text-gray-600 px-2 text-xs">Reset</button>
        </div>
      </div>

      <div className="bg-white/40 rounded-xl p-4 border border-black/5">
        <div className="text-xs font-medium text-gray-500 uppercase mb-2">Sequence</div>
        <div className="flex flex-wrap gap-2 items-center text-sm text-gray-800">
          <span className="font-semibold">{opt.origin.name}</span>
          {opt.orderedPlaces.map((p: any) => (
            <React.Fragment key={p.name}>
              <span className="text-gray-400">→</span>
              <span>{p.name}</span>
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <div className="text-xs font-medium text-gray-500 uppercase ml-1">Details</div>
        {opt.orderedPlaces.map((p: any, idx: number) => (
          <div key={`${p.name}-${idx}`} className="apple-card rounded-xl p-3 flex justify-between items-center group cursor-default transition-all hover:bg-white/80">
            <div>
              <div className="text-sm font-semibold">{idx + 1}. {p.name}</div>
              <div className="text-[10px] text-gray-500 mt-0.5">{p.formatted_address || p.city}</div>
            </div>
            <button onClick={onGuide} className="opacity-0 group-hover:opacity-100 transition-all text-xs text-blue-500 font-medium bg-blue-50 px-2 py-1 rounded-md">
              Guide
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function GuidePanel({ opt, orderedPlaces, guideLoading, guideError, guideSummary, generateGuideFor, onBack }: any) {
  if (!opt) return <EmptyState icon="📖" text="Generate a route first." />;

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-500">
      <div className="flex items-center justify-between mb-2">
        <button onClick={onBack} className="text-blue-500 flex items-center gap-1 text-sm font-medium hover:opacity-70 transition">
          <span className="text-lg">‹</span> Back
        </button>
        <h2 className="text-sm font-semibold text-gray-800">City Guides</h2>
      </div>

      <div className="space-y-4">
        {orderedPlaces.map((p: any, idx: number) => {
          const loading = !!guideLoading[p.name];
          const err = guideError[p.name];
          const sum = guideSummary[p.name];

          return (
            <div key={`${p.name}-${idx}`} className="apple-card rounded-xl overflow-hidden transition-all">
              {/* Card Header */}
              <div className="p-4 flex items-center justify-between border-b border-gray-100">
                <div>
                  <div className="text-sm font-bold text-gray-900">{p.name}</div>
                  <div className="text-[10px] text-gray-500">{p.formatted_address}</div>
                </div>
                <button
                  onClick={() => generateGuideFor(p)}
                  disabled={loading}
                  className={cn("text-xs font-medium px-3 py-1.5 rounded-full transition-all", loading ? "bg-gray-100 text-gray-400" : sum ? "bg-gray-100 text-gray-600 hover:bg-gray-200" : "bg-blue-500 text-white shadow-sm")}
                >
                  {loading ? "Loading..." : sum ? "Refresh" : "Generate"}
                </button>
              </div>

              {/* Content Area */}
              <div className="p-4 bg-gray-50/50">
                {loading && <div className="space-y-2 animate-pulse"><div className="h-2 bg-gray-200 rounded w-3/4"></div><div className="h-2 bg-gray-200 rounded w-1/2"></div></div>}

                {err && <div className="text-xs text-red-500">{err}</div>}

                {sum && <GuideSummaryView sum={sum} />}

                {!sum && !loading && !err && <div className="text-[10px] text-gray-400 text-center py-2">Tap generate to see tips & food.</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GuideSummaryView({ sum }: { sum: GuideSummaryResp }) {
  return (
    <div className="space-y-3">
      <div className="flex gap-4 text-xs text-gray-600 font-medium pb-2 border-b border-gray-200/50">
        <span>⏱ {sum.duration}</span>
        <span>🕐 {sum.bestTime}</span>
      </div>

      <div className="space-y-2">
        <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Must Do</div>
        <ul className="text-sm space-y-1 text-gray-800">
          {sum.mustDo?.map((x, i) => <li key={i} className="flex gap-2"><span className="text-blue-500">•</span> {x}</li>)}
        </ul>
      </div>

      <div className="bg-white rounded-lg p-3 shadow-sm border border-gray-100">
        <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-2">Food Pick</div>
        <div className="space-y-2">
          {sum.foodPick?.map((x, i) => (
            <div key={i}>
              <div className="text-sm font-medium text-gray-900">{x.name}</div>
              <div className="text-xs text-gray-500 leading-tight mt-0.5">{x.why}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function RouteCards({ opt }: { opt: OptimizeResp | null }) {
  if (!opt) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-3xl shadow-sm border border-white/30">
          ✈️
        </div>
        <p className="text-sm font-medium">Select destinations to start planning</p>
      </div>
    );
  }

  const totalDist = opt.legs.reduce((s, x) => s + (x.summary.distanceM || 0), 0);

  return (
    <div className="space-y-6 max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-8 duration-700">
      <div className="flex items-center justify-between pb-4 border-b border-black/5">
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Your Itinerary</h2>
        <div className="text-sm font-medium text-gray-500 bg-white/50 px-3 py-1 rounded-full backdrop-blur-md shadow-sm">
          Total {formatDistance(totalDist)}
        </div>
      </div>

      <div className="relative border-l-2 border-dashed border-gray-300 ml-4 space-y-8 pb-4">
        {/* Start Point Pin */}
        <div className="-ml-[9px] absolute top-0 flex items-center gap-4">
          <div className="w-4 h-4 bg-gray-900 rounded-full ring-4 ring-gray-100 shadow-sm" />
          <div className="text-sm font-bold text-gray-900">{opt.origin.name}</div>
        </div>

        <div className="pt-8 space-y-8">
          {opt.legs.map((leg, idx) => (
            <div key={idx} className="relative pl-8">
              {/* Connection Line & Badge */}
              <div className="absolute -left-[9px] top-6 w-4 h-4 bg-blue-500 rounded-full ring-4 ring-blue-50 shadow-sm z-10" />

              <div className="apple-card p-5 rounded-2xl transition hover:scale-[1.01] duration-300">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">{leg.to.name}</h3>
                    <div className="text-xs text-gray-500 mt-1">{leg.to.formatted_address || "Destination"}</div>
                  </div>
                  <span className={cn("px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider", leg.summary.mode === "transit" ? "bg-blue-100 text-blue-600" : "bg-green-100 text-green-600")}>
                    {leg.summary.mode}
                  </span>
                </div>

                <div className="bg-gray-50/80 rounded-xl p-3 flex items-center justify-between mb-4 border border-gray-100">
                  <div className="flex gap-4">
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase text-gray-400 font-bold">Distance</span>
                      <span className="text-xs font-semibold text-gray-700">{formatDistance(leg.summary.distanceM)}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase text-gray-400 font-bold">Duration</span>
                      <span className="text-xs font-semibold text-gray-700">{formatDuration(leg.summary.durationS)}</span>
                    </div>
                    {leg.summary.costYuan && (
                      <div className="flex flex-col">
                        <span className="text-[10px] uppercase text-gray-400 font-bold">Cost</span>
                        <span className="text-xs font-semibold text-gray-700">¥{leg.summary.costYuan}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <a href={leg.amap.webUrl} target="_blank" rel="noreferrer" className="ios-btn-secondary py-2 text-center text-xs hover:bg-blue-100 transition">Open Web Map</a>
                  <a href={leg.amap.appUri} className="ios-btn-secondary py-2 text-center text-xs hover:bg-blue-100 transition">Open App</a>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ icon, text }: { icon: string, text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center opacity-60">
      <div className="text-4xl mb-2 grayscale">{icon}</div>
      <div className="text-sm font-medium text-gray-500">{text}</div>
    </div>
  )
}
