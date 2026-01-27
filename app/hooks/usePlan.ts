import { useState, useCallback, useEffect } from "react";
import { OptimizeResp, OriginInput, PlacePoint } from "../types";
import { postJson } from "@/utils";
import { useToast } from "../contexts/ToastContext";

export function usePlan() {
    const { toast } = useToast();
    const [places, setPlaces] = useState<PlacePoint[]>([]);

    // Optimize State
    const [optimizing, setOptimizing] = useState(false);
    const [optError, setOptError] = useState<string>("");
    const [opt, setOpt] = useState<OptimizeResp | null>(null);

    // Route Interaction
    const [activeLegIndex, setActiveLegIndex] = useState<number | null>(null);

    // Reset Active Leg Logic when opt changes
    useEffect(() => {
        setActiveLegIndex(null);
    }, [opt]);

    const handleLegClick = useCallback((index: number) => {
        setActiveLegIndex(prev => prev === index ? null : index);
    }, []);

    const runOptimize = async (
        originMode: "text" | "coord",
        originText: string,
        originCoordText: string,
        originCoordName: string,
        cityName: string,
        cityAdcode: string
    ) => {
        setOptError("");
        setOptimizing(true);
        try {
            const origin: OriginInput =
                originMode === "coord"
                    ? (() => {
                        const parts = originCoordText.trim().split(/[,，]/);
                        if (parts.length < 2) throw new Error("坐标格式错误，请输入 lng,lat");
                        const lng = Number(parts[0]);
                        const lat = Number(parts[1]);
                        if (!Number.isFinite(lng) || !Number.isFinite(lat)) throw new Error("坐标数值无效");

                        return { type: "coord", lng, lat, name: originCoordName || "起点" };
                    })()
                    : { type: "text", text: originText.trim() || "起点" };

            const payload = {
                origin,
                places: places.map(p => p.name),
                cityHint: cityName.trim() || undefined,
                cityAdcode: cityAdcode.trim() || undefined,
            };

            const data = await postJson<OptimizeResp>("/api/optimize", payload);
            setOpt(data);
            return true; // Success
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            setOptError(msg);
            toast(msg, "error");
            return false;
        } finally {
            setOptimizing(false);
        }
    };

    const copyItinerary = async () => {
        if (!opt) return;
        const lines: string[] = [];
        lines.push(`🚀 起点：${opt.origin.name}`);
        lines.push(`📍 路线：${[opt.origin.name, ...opt.orderedPlaces.map((p) => p.name)].join(" → ")}`);
        lines.push("");
        opt.legs.forEach((leg, idx) => {
            const mode = leg.summary.mode === "transit" ? "🚇" : "🚶";
            const fmtDist = (m?: number) => !m && m !== 0 ? "—" : m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`;
            const fmtDur = (s?: number) => {
                if (!s && s !== 0) return "—";
                const mins = Math.round(s / 60);
                if (mins < 60) return `${mins} 分钟`;
                const h = Math.floor(mins / 60);
                const r = mins % 60;
                return `${h}h ${r}m`;
            };
            lines.push(`${idx + 1}. ${leg.from.name} → ${leg.to.name} ${mode} ${fmtDist(leg.summary.distanceM)} ${fmtDur(leg.summary.durationS)}`);
            lines.push(leg.amap.webUrl);
        });
        await navigator.clipboard.writeText(lines.join("\n"));
        toast("已复制到剪贴板", "success");
    };

    return {
        places, setPlaces,
        optimizing, setOptimizing, // Expose setter if needed outside (e.g. forced reset)
        optError, setOptError,
        opt, setOpt,
        activeLegIndex, setActiveLegIndex,
        handleLegClick,
        runOptimize,
        copyItinerary
    };
}
