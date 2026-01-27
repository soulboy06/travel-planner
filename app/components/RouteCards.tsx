import React from "react";
import { Clock, Map, MapPin, Navigation, Plane, Route, Smartphone } from "lucide-react";
import { OptimizeResp } from "../types";
import { cn, formatDistance, formatDuration } from "@/utils";

interface RouteCardsProps {
    opt: OptimizeResp | null;
}

export function RouteCards({ opt }: RouteCardsProps) {
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
