"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  MapPin,
  Navigation,
  Compass,
  Clock,
  Route,
  Copy,
  RotateCcw,
  BookOpen,
  ChevronLeft,
  Plane,
  Map,
  ExternalLink,
  Smartphone,
  Loader2,
  Sparkles,
  Utensils,
  CheckCircle2,
  AlertCircle,
  Info,
  Locate,
  Globe,
  ArrowRight,
} from "lucide-react";

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
    <div className="min-h-screen aurora-bg aurora-animated flex items-center justify-center p-3 sm:p-6 md:p-8">
      <div className="w-full max-w-6xl main-container rounded-2xl sm:rounded-3xl overflow-hidden flex flex-col h-[94vh] md:h-[88vh]">

        {/* Header */}
        <header className="flex-none px-4 py-3 md:px-6 md:py-4 border-b border-[var(--border)] flex items-center justify-between bg-white/60 backdrop-blur-md z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--primary)] to-[var(--primary-dark)] flex items-center justify-center shadow-md">
              <Plane className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-[var(--text-primary)]">Travel Planner</h1>
              <p className="text-xs text-[var(--text-muted)] hidden sm:block">智能行程规划</p>
            </div>
          </div>

          {/* Tab Control */}
          <div className="tab-control">
            <button onClick={() => setTab("input")} className={cn("tab-item", tab === "input" && "active")}>
              <span className="hidden sm:inline">输入</span>
              <Compass className="w-4 h-4 sm:hidden" />
            </button>
            <button onClick={() => setTab("result")} className={cn("tab-item", tab === "result" && "active")}>
              <span className="hidden sm:inline">路线</span>
              <Route className="w-4 h-4 sm:hidden" />
            </button>
            <button onClick={() => setTab("guide")} className={cn("tab-item", tab === "guide" && "active")}>
              <span className="hidden sm:inline">攻略</span>
              <BookOpen className="w-4 h-4 sm:hidden" />
            </button>
          </div>

          <div className="w-10 md:w-20" />
        </header>

        {/* Main Content */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">

          {/* Sidebar */}
          <aside className={cn(
            "md:w-[400px] flex-none border-b md:border-b-0 md:border-r border-[var(--border)] bg-white/40 backdrop-blur-md overflow-y-auto p-4 md:p-6 transition-all",
            "w-full h-full md:h-auto absolute inset-0 md:relative z-20 md:z-0",
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
              <div className="hidden md:block">
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
          </aside>

          {/* Main Viewport */}
          <main className={cn(
            "flex-1 bg-[var(--bg-secondary)]/30 overflow-y-auto p-4 md:p-8 relative",
            tab === "result" ? "block w-full h-full absolute inset-0 md:relative z-20 md:z-0" : "hidden md:block"
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
          </main>
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
    <div className="space-y-6 animate-slide-left">

      {/* City Section */}
      <div className="space-y-2">
        <label className="label flex items-center gap-2">
          <Globe className="w-3.5 h-3.5" />
          目标城市
        </label>
        <div className="flex gap-2">
          <input
            className="input-field flex-1"
            value={cityName}
            onChange={e => setCityName(e.target.value)}
            placeholder="输入城市名称"
          />
          <div className="relative w-24 flex-none hidden md:block">
            <input
              className="input-field w-full text-center text-sm"
              value={cityAdcode}
              onChange={e => setCityAdcode(e.target.value)}
              placeholder="区号"
            />
            {cityAutoStatus && (
              <div className="absolute -top-5 right-0 text-[10px] text-[var(--primary)] font-medium whitespace-nowrap">
                {cityAutoStatus}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Origin Section */}
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <label className="label flex items-center gap-2 mb-0">
            <Navigation className="w-3.5 h-3.5" />
            出发点
          </label>
          <button
            onClick={useMyLocation}
            disabled={locating}
            className="btn-ghost text-xs flex items-center gap-1.5 text-[var(--primary)]"
          >
            {locating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Locate className="w-3.5 h-3.5" />}
            {locating ? "定位中..." : "使用当前位置"}
          </button>
        </div>

        {/* Mode Toggle */}
        <div className="mode-toggle">
          <button
            onClick={() => setOriginMode("text")}
            className={cn("mode-toggle-item", originMode === "text" && "active")}
          >
            文字地址
          </button>
          <button
            onClick={() => setOriginMode("coord")}
            className={cn("mode-toggle-item", originMode === "coord" && "active")}
          >
            精确坐标
          </button>
        </div>

        {originMode === "text" ? (
          <input
            className="input-field"
            value={originText}
            onChange={(e) => setOriginText(e.target.value)}
            placeholder="例如：天府广场、春熙路"
          />
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <input
              className="input-field"
              value={originCoordText}
              onChange={(e) => setOriginCoordText(e.target.value)}
              placeholder="经度,纬度"
            />
            <input
              className="input-field"
              value={originCoordName}
              onChange={(e) => setOriginCoordName(e.target.value)}
              placeholder="位置名称"
            />
          </div>
        )}
      </div>

      {/* Destinations Section */}
      <div className="space-y-2">
        <label className="label flex items-center gap-2">
          <MapPin className="w-3.5 h-3.5" />
          目的地列表
          <span className="ml-auto font-normal text-[var(--text-muted)]">
            {placesCount} 个地点
          </span>
        </label>
        <textarea
          className="textarea-field h-36"
          value={placesText}
          onChange={(e) => setPlacesText(e.target.value)}
          placeholder="每行输入一个目的地&#10;例如：&#10;春熙路&#10;宽窄巷子&#10;武侯祠"
        />
      </div>

      {/* Action Button */}
      <button
        onClick={onOptimize}
        disabled={optimizing || placesCount === 0}
        className={cn(
          "w-full btn-primary",
          (optimizing || placesCount === 0) && "opacity-50 cursor-not-allowed"
        )}
      >
        {optimizing ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            规划中...
          </>
        ) : (
          <>
            <Sparkles className="w-5 h-5" />
            生成最优路线
          </>
        )}
      </button>

      {optError && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-600">
          <AlertCircle className="w-4 h-4 flex-none mt-0.5" />
          {optError}
        </div>
      )}
    </div>
  );
}

function ResultPanel({ opt, copyItinerary, onReset, onGuide, mobileMode }: any) {
  if (!opt) return mobileMode ? null : <EmptyState icon="route" text="准备规划您的旅程" />;

  return (
    <div className="space-y-5 animate-slide-right">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-[var(--text-primary)]">路线已生成</h2>
        <div className="flex gap-2">
          <button onClick={copyItinerary} className="btn-secondary">
            <Copy className="w-4 h-4" />
            复制
          </button>
          <button onClick={onReset} className="btn-ghost">
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Route Sequence */}
      <div className="summary-card">
        <div className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-3">
          行程顺序
        </div>
        <div className="flex flex-wrap gap-2 items-center text-sm text-[var(--text-primary)]">
          <span className="font-semibold flex items-center gap-1">
            <Navigation className="w-3.5 h-3.5 text-[var(--primary)]" />
            {opt.origin.name}
          </span>
          {opt.orderedPlaces.map((p: any, idx: number) => (
            <React.Fragment key={p.name}>
              <ArrowRight className="w-4 h-4 text-[var(--text-light)]" />
              <span className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-[var(--accent)]" />
                {p.name}
              </span>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Place List */}
      <div className="space-y-3">
        <div className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">
          详细信息
        </div>
        {opt.orderedPlaces.map((p: any, idx: number) => (
          <div
            key={`${p.name}-${idx}`}
            className="glass-card p-4 flex justify-between items-center group cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--accent)] to-[var(--accent-dark)] flex items-center justify-center text-white font-semibold text-sm">
                {idx + 1}
              </div>
              <div>
                <div className="text-sm font-semibold text-[var(--text-primary)]">{p.name}</div>
                <div className="text-xs text-[var(--text-muted)] mt-0.5">{p.formatted_address || p.city}</div>
              </div>
            </div>
            <button
              onClick={onGuide}
              className="opacity-0 group-hover:opacity-100 transition-all btn-secondary text-xs px-3 py-1.5"
            >
              <BookOpen className="w-3.5 h-3.5" />
              攻略
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function GuidePanel({ opt, orderedPlaces, guideLoading, guideError, guideSummary, generateGuideFor, onBack }: any) {
  if (!opt) return <EmptyState icon="book" text="请先生成路线规划" />;

  return (
    <div className="space-y-5 animate-slide-right">
      <div className="flex items-center justify-between mb-2">
        <button onClick={onBack} className="btn-ghost flex items-center gap-1 text-[var(--primary)]">
          <ChevronLeft className="w-5 h-5" />
          返回
        </button>
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">目的地攻略</h2>
        <div className="w-16" />
      </div>

      <div className="space-y-4">
        {orderedPlaces.map((p: any, idx: number) => {
          const loading = !!guideLoading[p.name];
          const err = guideError[p.name];
          const sum = guideSummary[p.name];

          return (
            <div key={`${p.name}-${idx}`} className="guide-card">
              <div className="guide-header">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--primary)] to-[var(--primary-dark)] flex items-center justify-center text-white font-semibold text-sm">
                    {idx + 1}
                  </div>
                  <div>
                    <div className="text-sm font-bold text-[var(--text-primary)]">{p.name}</div>
                    <div className="text-xs text-[var(--text-muted)]">{p.formatted_address}</div>
                  </div>
                </div>
                <button
                  onClick={() => generateGuideFor(p)}
                  disabled={loading}
                  className={cn(
                    "btn-secondary text-xs",
                    loading && "opacity-50 cursor-not-allowed"
                  )}
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      加载中
                    </>
                  ) : sum ? (
                    <>
                      <RotateCcw className="w-3.5 h-3.5" />
                      刷新
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      生成
                    </>
                  )}
                </button>
              </div>

              <div className="guide-content">
                {loading && (
                  <div className="space-y-2">
                    <div className="skeleton h-3 w-3/4" />
                    <div className="skeleton h-3 w-1/2" />
                    <div className="skeleton h-3 w-2/3" />
                  </div>
                )}

                {err && (
                  <div className="flex items-start gap-2 text-red-500 text-sm">
                    <AlertCircle className="w-4 h-4 flex-none mt-0.5" />
                    {err}
                  </div>
                )}

                {sum && <GuideSummaryView sum={sum} />}

                {!sum && !loading && !err && (
                  <div className="text-center py-4 text-[var(--text-muted)] text-sm flex flex-col items-center gap-2">
                    <Info className="w-5 h-5" />
                    点击生成获取攻略和美食推荐
                  </div>
                )}
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
    <div className="space-y-4 animate-fade-in">
      {/* Time Info */}
      <div className="flex gap-4 text-sm text-[var(--text-secondary)] font-medium pb-3 border-b border-[var(--border-light)]">
        <span className="flex items-center gap-1.5">
          <Clock className="w-4 h-4 text-[var(--primary)]" />
          {sum.duration}
        </span>
        <span className="flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-[var(--accent)]" />
          {sum.bestTime}
        </span>
      </div>

      {/* Must Do */}
      <div className="space-y-2">
        <div className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wide flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-[var(--success)]" />
          必打卡
        </div>
        <ul className="text-sm space-y-1.5 text-[var(--text-primary)]">
          {sum.mustDo?.map((x, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--primary)] mt-2 flex-none" />
              {x}
            </li>
          ))}
        </ul>
      </div>

      {/* Food Pick */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-[var(--border-light)]">
        <div className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wide mb-3 flex items-center gap-1.5">
          <Utensils className="w-3.5 h-3.5 text-[var(--accent)]" />
          美食推荐
        </div>
        <div className="space-y-3">
          {sum.foodPick?.map((x, i) => (
            <div key={i}>
              <div className="text-sm font-semibold text-[var(--text-primary)]">{x.name}</div>
              <div className="text-xs text-[var(--text-muted)] leading-relaxed mt-0.5">{x.why}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RouteCards({ opt }: { opt: OptimizeResp | null }) {
  if (!opt) {
    return (
      <div className="h-full flex flex-col items-center justify-center">
        <div className="empty-state">
          <div className="empty-icon animate-pulse-glow">
            <Plane className="w-8 h-8" />
          </div>
          <p className="empty-text">选择目的地，开始规划旅程</p>
        </div>
      </div>
    );
  }

  const totalDist = opt.legs.reduce((s, x) => s + (x.summary.distanceM || 0), 0);
  const totalTime = opt.legs.reduce((s, x) => s + (x.summary.durationS || 0), 0);

  return (
    <div className="space-y-6 max-w-2xl mx-auto animate-slide-up">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-[var(--border)]">
        <h2 className="text-2xl font-bold text-[var(--text-primary)]">您的行程</h2>
        <div className="flex gap-3">
          <div className="text-sm font-medium text-[var(--text-secondary)] bg-white/80 px-4 py-2 rounded-full shadow-sm border border-[var(--border)]">
            <Route className="w-4 h-4 inline mr-1.5 text-[var(--primary)]" />
            {formatDistance(totalDist)}
          </div>
          <div className="text-sm font-medium text-[var(--text-secondary)] bg-white/80 px-4 py-2 rounded-full shadow-sm border border-[var(--border)]">
            <Clock className="w-4 h-4 inline mr-1.5 text-[var(--accent)]" />
            {formatDuration(totalTime)}
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="timeline space-y-6">
        {/* Start Point */}
        <div className="relative pl-8">
          <div className="timeline-dot timeline-dot-start top-1" />
          <div className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
            <Navigation className="w-4 h-4 text-[var(--text-primary)]" />
            {opt.origin.name}
          </div>
          <div className="text-xs text-[var(--text-muted)] mt-0.5">出发点</div>
        </div>

        {/* Legs */}
        {opt.legs.map((leg, idx) => (
          <div key={idx} className="relative pl-8 animate-fade-in" style={{ animationDelay: `${idx * 0.1}s` }}>
            <div className="timeline-dot" style={{ top: '24px' }} />

            <div className="route-card">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-[var(--accent)]" />
                    {leg.to.name}
                  </h3>
                  <div className="text-xs text-[var(--text-muted)] mt-1">
                    {leg.to.formatted_address || "目的地"}
                  </div>
                </div>
                <span className={cn(
                  "badge",
                  leg.summary.mode === "transit" ? "badge-transit" : "badge-walk"
                )}>
                  {leg.summary.mode === "transit" ? (
                    <>
                      <Route className="w-3 h-3" />
                      公交
                    </>
                  ) : (
                    <>
                      <Navigation className="w-3 h-3" />
                      步行
                    </>
                  )}
                </span>
              </div>

              <div className="info-grid mb-4">
                <div className="info-item">
                  <div className="info-label">距离</div>
                  <div className="info-value">{formatDistance(leg.summary.distanceM)}</div>
                </div>
                <div className="info-item">
                  <div className="info-label">时间</div>
                  <div className="info-value">{formatDuration(leg.summary.durationS)}</div>
                </div>
                {leg.summary.costYuan && (
                  <div className="info-item">
                    <div className="info-label">费用</div>
                    <div className="info-value">¥{leg.summary.costYuan}</div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <a
                  href={leg.amap.webUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary py-2.5 text-center"
                >
                  <Map className="w-4 h-4" />
                  网页地图
                </a>
                <a
                  href={leg.amap.appUri}
                  className="btn-secondary py-2.5 text-center"
                >
                  <Smartphone className="w-4 h-4" />
                  打开App
                </a>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState({ icon, text }: { icon: string; text: string }) {
  const IconComponent = icon === "route" ? Route : icon === "book" ? BookOpen : Plane;

  return (
    <div className="empty-state">
      <div className="empty-icon">
        <IconComponent className="w-8 h-8" />
      </div>
      <p className="empty-text">{text}</p>
    </div>
  );
}
