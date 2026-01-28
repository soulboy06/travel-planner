"use client";

import React, { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  Compass,
  Route,
  BookOpen,
  Plane,
} from "lucide-react";
import { cn, postJson } from "@/utils";
import { OptimizeResp, OriginInput, PlacePoint } from "./types";
import { useTravelApp } from "./hooks/useTravelApp";
import { InputPanel } from "./components/InputPanel";
import { ResultPanel } from "./components/ResultPanel";
import { GuidePanel } from "./components/GuidePanel";
import { RefPanel } from "./components/RefPanel";
import { RouteCards } from "./components/RouteCards";
import { ShareCard } from "./components/ShareCard";
import html2canvas from "html2canvas";
import { useToast } from "./contexts/ToastContext";

// Dynamically import MapPanel with no SSR
const MapPanel = dynamic(() => import("./components/MapPanel"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex flex-col items-center justify-center bg-white/50 backdrop-blur-sm rounded-2xl border border-[var(--border)] text-[var(--text-muted)] p-6 gap-3">
      <div className="w-12 h-12 rounded-full border-4 border-[var(--primary)] border-t-transparent animate-spin opacity-50"></div>
      <div className="text-sm font-medium animate-pulse">地图组件加载中...</div>
    </div>
  )
});

export default function Page() {
  const { toast } = useToast();
  const {
    tab, setTab,
    cityName, setCityName,
    cityAdcode, setCityAdcode,
    cityAutoStatus, setCityAutoStatus,
    cityCenter, setCityCenter,
    originMode, setOriginMode,
    originText, setOriginText,
    originCoordText, setOriginCoordText,
    originCoordName, setOriginCoordName,
    locating, setLocating,
    originPoint, setOriginPoint,
    places, setPlaces,
    optimizing, setOptimizing,
    optError, setOptError,
    opt, setOpt,
    guideLoading,
    guideError,
    guideSummary,
    currentGuidePlace, setCurrentGuidePlace,
    activeLegIndex,
    handleLegClick,
    copyItinerary,
    generateGuideFor,
    onOptimize,
    useMyLocation
  } = useTravelApp();

  const orderedPlaces = opt?.orderedPlaces ?? [];

  // Share State
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareImage, setShareImage] = useState<string>("");
  const shareCardRef = useRef<HTMLDivElement>(null);
  const [isGeneratingShare, setIsGeneratingShare] = useState(false);

  const handleShare = async () => {
    if (!shareCardRef.current || !opt) return;
    setIsGeneratingShare(true);
    try {
      // Wait for fonts to load (optional but safe)
      await document.fonts.ready;

      const canvas = await html2canvas(shareCardRef.current, {
        useCORS: true,
        scale: 2, // Retina quality
        backgroundColor: '#ffffff',
        height: shareCardRef.current.scrollHeight + 50, // Add buffer
        windowHeight: shareCardRef.current.scrollHeight + 100,
      });

      const imgData = canvas.toDataURL("image/png");
      setShareImage(imgData);
      setShowShareModal(true);
    } catch (e) {
      console.error("Share gen failed:", e);
      toast("生成分享卡片失败，请重试", "error");
    } finally {
      setIsGeneratingShare(false);
    }
  };

  const handleMarkerClick = (index: number) => {
    // Only available in result mode when nodes are rendered with ids
    if (tab !== "result") return;
    const el = document.getElementById(`place-card-${index}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-[var(--primary)]");
      setTimeout(() => el.classList.remove("ring-2", "ring-[var(--primary)]"), 2000);
    }
  };

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
                places={places}
                setPlaces={setPlaces}
                onOptimize={onOptimize}
                optimizing={optimizing}
                optError={optError}
              />
            )}

            {tab === "result" && (
              <div className="hidden md:block">
                <ResultPanel
                  opt={opt}
                  copyItinerary={copyItinerary}
                  onReset={() => { setOpt(null); setTab("input"); }}
                  onGuide={() => opt?.orderedPlaces[0] && generateGuideFor(opt.orderedPlaces[0])}
                  onShare={handleShare}
                  onLegClick={handleLegClick}
                  activeLegIndex={activeLegIndex}
                />
              </div>
            )}

            {/* Guide Tab (Full Screen on Mobile, Panel on Desktop) */}
            {tab === "guide" && (
              <GuidePanel
                opt={opt}
                orderedPlaces={orderedPlaces}
                guideLoading={guideLoading}
                guideError={guideError}
                guideSummary={guideSummary}
                references={guideSummary[currentGuidePlace]?.references}
                generateGuideFor={generateGuideFor}
                onBack={() => setTab(opt ? "result" : "input")}
                currentPlaceName={currentGuidePlace}
                onPlaceSelect={setCurrentGuidePlace}
              />
            )}
          </aside>

          {/* Main Viewport */}
          <main className={cn(
            "flex-1 bg-[var(--bg-secondary)]/30 relative",
            tab === "input" ? "overflow-hidden" : "overflow-hidden p-4 md:p-8 md:overflow-y-auto",
            tab === "result" ? "block w-full h-full absolute inset-0 md:relative z-20 md:z-0" : "hidden md:block"
          )}>

            {/* Map is now shown in both Input and Result tabs on Desktop */}
            {(tab === "input" || tab === "result") && (
              <div className={cn("w-full h-full", tab === "result" ? "hidden md:block" : "block")}>
                <MapPanel
                  places={tab === "result" && opt ? opt.orderedPlaces : places}
                  origin={tab === "result" && opt ? opt.origin : (originPoint || undefined)}
                  center={cityCenter}
                  legs={tab === "result" && opt ? opt.legs : undefined}
                  activeLegIndex={activeLegIndex}
                  onMarkerClick={handleMarkerClick}
                />
              </div>
            )}

            {/* Result Tab: Show Mobile Panel & Route Cards */}
            {tab === "result" && (
              <div className="md:hidden h-full flex flex-col">
                <div className="h-[45vh] min-h-[260px] sm:h-64 shrink-0 mb-4">
                  <MapPanel
                    places={opt ? opt.orderedPlaces : places}
                    origin={opt ? opt.origin : (originPoint || undefined)}
                    center={cityCenter}
                    legs={opt ? opt.legs : undefined}
                    activeLegIndex={activeLegIndex}
                    onMarkerClick={handleMarkerClick}
                  />
                </div>
                <div className="flex-1 overflow-y-auto">
                  <div className="mb-4">
                    <ResultPanel
                      opt={opt}
                      copyItinerary={copyItinerary}
                      onReset={() => { setOpt(null); setTab("input"); }}
                      onGuide={() => setTab("guide")}
                      mobileMode
                      activeLegIndex={activeLegIndex}
                      onLegClick={handleLegClick}
                    />
                  </div>
                  <RouteCards opt={opt} />
                </div>
              </div>
            )}

            {/* Guide Tab: Show RefPanel on Desktop */}
            {tab === "guide" && (
              <div className="hidden md:block h-full">
                <RefPanel references={guideSummary[currentGuidePlace]?.references} />
              </div>
            )}
          </main>
        </div>

        {/* Share Modal Overlay */}
        {
          showShareModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in p-4">
              <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-4 border-b border-[var(--border)] flex justify-between items-center">
                  <h3 className="font-bold text-lg">分享行程</h3>
                  <button
                    onClick={() => setShowShareModal(false)}
                    className="p-1.5 hover:bg-gray-100 rounded-full transition-colors"
                  >
                    <div className="w-5 h-5 flex items-center justify-center text-gray-500">✕</div>
                  </button>
                </div>

                <div className="p-6 bg-gray-50 flex-1 overflow-auto flex justify-center">
                  {shareImage ? (
                    <img src={shareImage} alt="Share Plan" className="rounded-xl shadow-lg w-auto h-auto max-w-full" />
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-[var(--text-muted)] animate-pulse">
                      <div className="w-8 h-8 rounded-full border-2 border-[var(--primary)] border-t-transparent animate-spin mb-3"></div>
                      <span>正在生成精美卡片...</span>
                    </div>
                  )}
                </div>

                <div className="p-4 border-t border-[var(--border)] bg-white">
                  <p className="text-xs text-center text-gray-400 mb-3">长按图片保存，或右键另存为</p>
                  <button
                    onClick={() => setShowShareModal(false)}
                    className="w-full btn-secondary"
                  >
                    关闭
                  </button>
                </div>
              </div>
            </div>
          )
        }

        {/* Off-screen Share Card Render */}
        <div className="fixed left-[-9999px] top-0 w-[375px]">
          {opt && (
            <ShareCard ref={shareCardRef} opt={opt} city={cityName} />
          )}
        </div>
      </div>
    </div>
  );
}
