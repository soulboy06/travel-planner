import React, { useEffect } from "react";
import { AlertCircle, CheckCircle2, ChevronLeft, Clock, Info, Loader2, RotateCcw, Sparkles, Utensils } from "lucide-react";
import { GuideSummaryResp, OptimizeResp, PlacePoint, ReferenceItem } from "../types";
import { cn } from "@/utils";
import { EmptyState } from "./EmptyState";
import { RefPanel } from "./RefPanel";

interface GuidePanelProps {
    opt: OptimizeResp | null;
    orderedPlaces: PlacePoint[];
    guideLoading: Record<string, boolean>;
    guideError: Record<string, string>;
    guideSummary: Record<string, GuideSummaryResp | null>;
    references?: ReferenceItem[];
    generateGuideFor: (place: PlacePoint) => void;
    onBack: () => void;
    currentPlaceName?: string;
    onPlaceSelect: (name: string) => void;
}

export function GuidePanel({ opt, orderedPlaces, guideLoading, guideError, guideSummary, references, generateGuideFor, onBack, currentPlaceName, onPlaceSelect }: GuidePanelProps) {
    // Auto-select first place on mount if none selected
    useEffect(() => {
        if (orderedPlaces.length > 0 && !currentPlaceName) {
            onPlaceSelect(orderedPlaces[0].name);
        }
    }, [orderedPlaces, currentPlaceName, onPlaceSelect]);

    // Tab State
    const [tab, setTab] = React.useState<"summary" | "refs">("summary");

    if (!opt) return <EmptyState icon="book" text="请先生成路线规划" />;

    return (
        <div className="space-y-5 animate-slide-right h-full flex flex-col">
            <div className="flex items-center justify-between mb-2 flex-none">
                <button onClick={onBack} className="btn-ghost flex items-center gap-1 text-[var(--primary)]">
                    <ChevronLeft className="w-5 h-5" />
                    返回
                </button>
                <div className="flex bg-gray-100 p-0.5 rounded-lg">
                    <button
                        className={cn("px-3 py-1 text-xs font-bold rounded-md transition-all", tab === "summary" ? "bg-white shadow-sm text-[var(--primary)]" : "text-[var(--text-muted)]")}
                        onClick={() => setTab("summary")}
                    >概览</button>
                    <button
                        className={cn("px-3 py-1 text-xs font-bold rounded-md transition-all", tab === "refs" ? "bg-white shadow-sm text-[var(--primary)]" : "text-[var(--text-muted)]")}
                        onClick={() => setTab("refs")}
                    >真实笔记</button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-1 custom-scrollbar">
                <div className="space-y-4">
                    {orderedPlaces.map((p, idx) => {
                        const loading = !!guideLoading[p.name];
                        const err = guideError[p.name];
                        const sum = guideSummary[p.name];
                        const isActive = p.name === currentPlaceName;

                        if (!isActive) {
                            return (
                                <div
                                    key={`${p.name}-${idx}`}
                                    className="p-3 border rounded-xl hover:bg-gray-50 cursor-pointer flex justify-between items-center"
                                    onClick={() => onPlaceSelect(p.name)}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-6 h-6 rounded-md bg-gray-200 text-xs font-bold flex items-center justify-center text-[var(--text-muted)]">{idx + 1}</div>
                                        <span className="font-bold text-sm text-[var(--text-primary)]">{p.name}</span>
                                    </div>
                                    <ChevronLeft className="w-4 h-4 rotate-180 text-gray-300" />
                                </div>
                            );
                        }

                        return (
                            <div
                                key={`${p.name}-${idx}`}
                                className={cn(
                                    "guide-card transition-all border border-[var(--primary)] shadow-md bg-blue-50/30"
                                )}
                            >
                                <div className="guide-header">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-semibold text-sm bg-[var(--primary)]">
                                            {idx + 1}
                                        </div>
                                        <div>
                                            <div className="text-sm font-bold text-[var(--text-primary)]">{p.name}</div>
                                            <div className="text-xs text-[var(--text-muted)]">{p.formatted_address}</div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            generateGuideFor(p);
                                        }}
                                        disabled={loading}
                                        className={cn("btn-secondary text-xs", loading && "opacity-50 cursor-not-allowed")}
                                    >
                                        {loading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> 加载中</> : sum ? <><RotateCcw className="w-3.5 h-3.5" /> 刷新</> : <><Sparkles className="w-3.5 h-3.5" /> 生成</>}
                                    </button>
                                </div>

                                <div className="guide-content">
                                    {loading && (
                                        <div className="space-y-2 py-4">
                                            <div className="skeleton h-3 w-3/4" />
                                            <div className="skeleton h-3 w-1/2" />
                                            <div className="skeleton h-3 w-2/3" />
                                        </div>
                                    )}

                                    {err && (
                                        <div className="flex items-start gap-2 text-red-500 text-sm py-2">
                                            <AlertCircle className="w-4 h-4 flex-none mt-0.5" />{err}
                                        </div>
                                    )}

                                    {!sum && !loading && !err && (
                                        <div className="text-center py-6 text-[var(--text-muted)] text-sm flex flex-col items-center gap-2">
                                            <Info className="w-5 h-5 opacity-50" />
                                            点击生成获取攻略
                                        </div>
                                    )}

                                    {sum && (
                                        <div className="mt-4">
                                            {tab === "summary" ? (
                                                <GuideSummaryView sum={sum} />
                                            ) : (
                                                <div className="min-h-[200px]">
                                                    <RefPanel references={references} />
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
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
                    {Array.isArray(sum.bestTime) ? sum.bestTime.join(" / ") : sum.bestTime}
                </span>
            </div>

            {/* Must Do */}
            <div className="space-y-2">
                <div className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wide flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[var(--success)]" />
                    必打卡
                </div>
                <ul className="text-sm space-y-2 text-[var(--text-primary)]">
                    {sum.mustDo?.map((x, i) => (
                        <li key={i} className="flex items-start gap-2 leading-relaxed">
                            <span className="w-1.5 h-1.5 rounded-full bg-[var(--primary)] mt-2 flex-none" />
                            {x}
                        </li>
                    ))}
                </ul>
            </div>

            {/* Tips (避雷/实用建议) */}
            {sum.tips && sum.tips.length > 0 && (
                <div className="bg-amber-50/50 rounded-xl p-4 shadow-sm border border-amber-200/50">
                    <div className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5" />
                        避雷 & 实用建议
                    </div>
                    <ul className="text-sm space-y-2 text-[var(--text-primary)]">
                        {sum.tips.map((tip, i) => (
                            <li key={i} className="flex items-start gap-2 leading-relaxed">
                                <span className="text-amber-600 flex-none">•</span>
                                <span>{tip}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Food Pick */}
            <div className="bg-white rounded-xl p-4 shadow-sm border border-[var(--border-light)]">
                <div className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wide mb-3 flex items-center gap-1.5">
                    <Utensils className="w-3.5 h-3.5 text-[var(--accent)]" />
                    美食推荐
                </div>
                <div className="space-y-4">
                    {sum.foodPick?.map((x, i) => (
                        <div key={i}>
                            <div className="text-sm font-semibold text-[var(--text-primary)]">{x.name}</div>
                            <div className="text-xs text-[var(--text-muted)] leading-relaxed mt-1">{x.reason}</div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
