import React from "react";
import { ArrowRight, BookOpen, MapPin, Navigation, RotateCcw, AlertCircle, Footprints, Bus, Globe, Smartphone, Share2 } from "lucide-react";
import { OptimizeResp } from "../types";
import { cn, formatDistance, formatDuration } from "@/utils";

interface ResultPanelProps {
    opt: OptimizeResp | null;
    copyItinerary: () => void;
    onReset: () => void;
    onGuide?: () => void;
    onShare?: () => void;
    mobileMode?: boolean;
    onLegClick?: (index: number) => void;
    activeLegIndex?: number | null;
}

export function ResultPanel({
    opt,
    copyItinerary,
    onReset,
    onGuide,
    onShare,
    mobileMode,
    onLegClick,
    activeLegIndex
}: ResultPanelProps) {
    if (!opt) return null;

    return (
        <div className={cn(
            "w-full flex flex-col bg-white overflow-hidden",
            mobileMode ? "rounded-2xl shadow-sm" : "h-full rounded-2xl"
        )}>
            {/* Header */}
            <div className="p-4 border-b border-[var(--border)] bg-gray-50/50 flex justify-between items-center shrink-0">
                <div>
                    <h2 className="text-lg font-bold text-[var(--text-primary)]">路线已生成</h2>
                    <div className="text-xs text-[var(--text-muted)] mt-0.5">
                        共 {opt.orderedPlaces.length} 个地点
                    </div>
                </div>
                <div className="flex gap-2">
                    <button onClick={onShare} className="btn-primary text-xs px-3 py-1.5 h-auto flex items-center gap-1.5">
                        <Share2 className="w-3.5 h-3.5" />
                        分享
                    </button>
                    <button onClick={onReset} className="btn-ghost p-1.5 h-auto rounded-full hover:bg-gray-200" title="重置">
                        <RotateCcw className="w-4 h-4 text-[var(--text-muted)]" />
                    </button>
                </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-0">
                {/* Itinerary Summary Card */}
                <div className="p-4 pb-0">
                    <div className="bg-[var(--bg-secondary)]/50 rounded-xl p-3 border border-[var(--border)] text-sm">
                        <div className="font-medium text-[var(--text-secondary)] mb-2 flex items-center">
                            <Navigation className="w-3.5 h-3.5 mr-1.5" />
                            行程顺序
                        </div>
                        <div className="flex flex-wrap gap-y-2 items-center text-[var(--text-primary)] leading-relaxed">
                            <span className="font-bold text-[var(--primary)] flex items-center">
                                <MapPin className="w-3 h-3 mr-0.5" />
                                {opt.origin.name}
                            </span>
                            {opt.orderedPlaces.map((p, i) => (
                                <React.Fragment key={i}>
                                    <ArrowRight className="w-3 h-3 mx-1.5 text-gray-300" />
                                    <span className="hover:text-[var(--primary)] transition-colors cursor-pointer">
                                        {p.name}
                                    </span>
                                </React.Fragment>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Failed Places Alert */}
                {opt.failed && opt.failed.length > 0 && (
                    <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-100 rounded-lg flex gap-3">
                        <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                        <div className="text-xs text-red-700">
                            <p className="font-bold mb-1">以下地点未找到：</p>
                            <ul className="list-disc list-inside space-y-0.5">
                                {opt.failed.map((f, i) => (
                                    <li key={i}>{f.name} <span className="opacity-75">({f.reason})</span></li>
                                ))}
                            </ul>
                        </div>
                    </div>
                )}

                {/* Timeline List */}
                <div className="p-4 space-y-0">
                    <div className="text-xs font-bold text-[var(--text-muted)] mb-3 pl-1">详细路线</div>

                    {/* Origin */}
                    <div className="relative pl-8 pb-6 border-l-2 border-gray-100 last:border-0 ml-3">
                        <div className="absolute -left-[9px] top-0 bg-[var(--primary)] border-2 border-white w-4 h-4 rounded-full shadow-sm z-10"></div>
                        <div className="bg-white border border-[var(--border)] rounded-2xl p-3 shadow-sm hover:shadow-md transition-all">
                            <div className="text-sm font-bold text-[var(--text-primary)]">{opt.origin.name}</div>
                            <div className="text-xs text-[var(--text-muted)] mt-0.5 truncate">{opt.origin.formatted_address || "起点"}</div>
                        </div>
                    </div>

                    {/* Places & Legs */}
                    {opt.orderedPlaces.map((place, idx) => {
                        const leg = opt.legs[idx]; // Leg from prev to this place
                        const isActive = activeLegIndex === idx;

                        return (
                            <React.Fragment key={idx}>
                                {/* Route Leg Info (between nodes) */}
                                {leg && (
                                    <div
                                        className={cn(
                                            "relative pl-8 pb-6 border-l-2 ml-3 cursor-pointer group",
                                            isActive ? "border-[var(--primary)]" : "border-gray-100 hover:border-gray-300"
                                        )}
                                        onClick={() => onLegClick?.(idx)}
                                    >
                                        <div className={cn(
                                            "flex items-center gap-3 text-xs py-2 px-3 rounded-lg border transition-all w-fit",
                                            isActive
                                                ? "bg-[var(--primary)]/10 border-[var(--primary)] text-[var(--primary)] font-medium"
                                                : "bg-gray-50 border-transparent text-[var(--text-muted)] group-hover:bg-gray-100"
                                        )}>
                                            {leg.summary.mode === 'transit' ? <Bus className="w-3 h-3" /> : <Footprints className="w-3 h-3" />}
                                            <span>{formatDistance(leg.summary.distanceM)}</span>
                                            <span>•</span>
                                            <span>{formatDuration(leg.summary.durationS)}</span>

                                            {/* Navigation Links */}
                                            <div className="w-px h-3 bg-current opacity-20 mx-1"></div>

                                            <a
                                                href={leg.amap.webUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center hover:underline opacity-80 hover:opacity-100"
                                                onClick={(e) => e.stopPropagation()}
                                                title="高德网页版"
                                            >
                                                <Globe className="w-3 h-3 mr-0.5" />
                                                Web
                                            </a>
                                            <a
                                                href={leg.amap.appUri}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center hover:underline opacity-80 hover:opacity-100"
                                                onClick={(e) => e.stopPropagation()}
                                                title="高德地图App"
                                            >
                                                <Smartphone className="w-3 h-3 mr-0.5" />
                                                App
                                            </a>
                                        </div>
                                    </div>
                                )}

                                {/* Place Node */}
                                <div id={`place-card-${idx}`} className="relative pl-8 pb-6 border-l-2 border-gray-100 last:border-0 last:pb-0 ml-3">
                                    <div className="absolute -left-[11px] top-0 bg-[var(--accent)] text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center shadow-sm z-10 border-2 border-white">
                                        {idx + 1}
                                    </div>
                                    <div className={`bg-white border border-[var(--border)] rounded-2xl p-3 shadow-sm hover:shadow-md transition-all group ${activeLegIndex === idx ? 'ring-2 ring-[var(--primary)]' : ''}`}>
                                        <div className="flex justify-between items-start">
                                            <div className="flex-1">
                                                <div className="text-sm font-bold text-[var(--text-primary)] mb-0.5">{place.name}</div>
                                                <div className="text-xs text-[var(--text-muted)] line-clamp-2 leading-relaxed">
                                                    {place.formatted_address || place.location}
                                                </div>
                                            </div>
                                            {/* Guide Button - Only show if onGuide is passed */}
                                            {onGuide && (
                                                <button
                                                    className="ml-2 p-1.5 text-[var(--text-muted)] hover:text-[var(--primary)] hover:bg-[var(--primary)]/10 rounded-lg transition-colors"
                                                    title="查看攻略"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onGuide();
                                                    }}
                                                >
                                                    <BookOpen className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </React.Fragment>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
