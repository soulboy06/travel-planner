import React, { forwardRef, useMemo } from "react";
import { OptimizeResp } from "../types";
import { Clock, Route } from "lucide-react";
import { formatDistance, formatDuration } from "@/utils";

interface ShareCardProps {
    opt: OptimizeResp;
    city: string;
}

const THEME = {
    text: {
        primary: "#0F3057",
        secondary: "#587B9C",
        muted: "#64748B",
    },
    bg: {
        gradientStart: "#E0F3FF",
        gradientMid: "#F0F9FF",
        gradientEnd: "#FFFFFF",
        card: "rgba(255, 255, 255, 0.6)",
    },
    border: {
        dotted: "#BFDBFE", // blue-200
        card: "rgba(255, 255, 255, 0.5)",
    }
};

export const ShareCard = forwardRef<HTMLDivElement, ShareCardProps>(({ opt, city }, ref) => {
    const totalDist = opt.legs.reduce((s, x) => s + (x.summary.distanceM || 0), 0);
    const totalTime = opt.legs.reduce((s, x) => s + (x.summary.durationS || 0), 0);

    // Date formatting (stable for this render)
    const dateStr = useMemo(() => new Date().toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    }).toUpperCase(), []);

    return (
        <div ref={ref} className="w-[375px] bg-white relative flex flex-col font-sans select-none overflow-visible h-fit">
            {/* Background Gradient Layer - Absolute but follows height */}
            <div
                className="absolute top-0 left-0 right-0 h-full z-0 pointer-events-none"
                style={{ background: `linear-gradient(to bottom, ${THEME.bg.gradientStart}, ${THEME.bg.gradientMid}, ${THEME.bg.gradientEnd})` }}
            />

            {/* Ambient Blobs */}
            <div className="absolute -top-20 -right-20 w-80 h-80 bg-blue-200/30 rounded-full blur-[80px] z-0" />
            <div className="absolute top-1/3 -left-20 w-60 h-60 bg-indigo-100/40 rounded-full blur-[60px] z-0" />

            {/* Content Container - z-10 ensures it sits above background */}
            <div className="relative z-10 flex flex-col p-8 min-h-[667px] mb-4">

                {/* Header Section */}
                <div className="mt-8 mb-8 text-center shrink-0">
                    <h1
                        className="text-5xl font-black tracking-tight mb-2 leading-[1.1] uppercase"
                        style={{ color: THEME.text.primary }}
                    >
                        {city} <br /><span className="text-[var(--primary)]">TRIP</span>
                    </h1>
                    <div
                        className="text-sm uppercase font-medium tracking-widest mt-3"
                        style={{ color: THEME.text.secondary }}
                    >
                        {dateStr}
                    </div>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-2 gap-4 mb-10 shrink-0">
                    <div
                        className="backdrop-blur-md rounded-2xl p-4 shadow-sm border flex flex-col items-center justify-center gap-1"
                        style={{ backgroundColor: THEME.bg.card, borderColor: THEME.border.card }}
                    >
                        <div
                            className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider"
                            style={{ color: THEME.text.secondary }}
                        >
                            <Route className="w-3.5 h-3.5" /> Total Dist
                        </div>
                        <div className="text-xl font-bold" style={{ color: THEME.text.primary }}>{formatDistance(totalDist)}</div>
                    </div>
                    <div
                        className="backdrop-blur-md rounded-2xl p-4 shadow-sm border flex flex-col items-center justify-center gap-1"
                        style={{ backgroundColor: THEME.bg.card, borderColor: THEME.border.card }}
                    >
                        <div
                            className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider"
                            style={{ color: THEME.text.secondary }}
                        >
                            <Clock className="w-3.5 h-3.5" /> Total Time
                        </div>
                        <div className="text-xl font-bold" style={{ color: THEME.text.primary }}>{formatDuration(totalTime)}</div>
                    </div>
                </div>

                {/* Timeline Section - Flex-1 allows it to take space, but no overflow hidden */}
                <div className="flex flex-col gap-6 shrink-0">
                    {/* Origin */}
                    <div className="flex items-stretch gap-5">
                        <div className="flex flex-col items-center shrink-0 w-8">
                            <div
                                className="w-8 h-8 rounded-full bg-blue-100 font-bold text-xs flex items-center justify-center shadow-sm border border-white z-10 shrink-0"
                                style={{ color: THEME.text.primary }}
                            >
                                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: THEME.text.primary }} />
                            </div>
                            <div
                                className="w-0.5 flex-1 border-l-2 border-dotted my-1 min-h-[3rem]"
                                style={{ borderColor: THEME.border.dotted }}
                            />
                        </div>
                        <div className="pb-0 pt-1">
                            <div className="font-bold text-lg leading-none mb-1.5" style={{ color: THEME.text.primary }}>{opt.origin.name}</div>
                            <div className="text-xs font-medium uppercase tracking-wide" style={{ color: THEME.text.secondary }}>Origin</div>
                        </div>
                    </div>

                    {/* Places */}
                    {opt.orderedPlaces.map((place, idx) => (
                        <div key={idx} className="flex items-stretch gap-5">
                            <div className="flex flex-col items-center shrink-0 w-8">
                                <div
                                    className="w-8 h-8 rounded-full bg-white font-bold text-sm grid place-items-center shadow-sm border border-blue-100 z-10 shrink-0"
                                    style={{ color: THEME.text.primary }}
                                >
                                    <span className="leading-none block" style={{ fontVariantNumeric: "tabular-nums" }}>{idx + 1}</span>
                                </div>
                                {idx < opt.orderedPlaces.length - 1 && (
                                    <div
                                        className="w-0.5 flex-1 border-l-2 border-dotted my-1 min-h-[3rem]"
                                        style={{ borderColor: THEME.border.dotted }}
                                    />
                                )}
                            </div>
                            <div className="pb-0 pt-1">
                                <div className="font-bold text-lg leading-tight mb-2" style={{ color: THEME.text.primary }}>{place.name}</div>
                                <div className="text-xs leading-relaxed max-w-[220px]" style={{ color: THEME.text.muted }}>
                                    {place.formatted_address}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Footer / Branding */}
                <div className="mt-8 flex justify-end items-center gap-3 opacity-60 shrink-0 pb-4">
                    <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color: THEME.text.primary }}>Travel Planner AI v2.0</span>
                </div>
            </div>
        </div>
    );
});

ShareCard.displayName = "ShareCard";
