import React, { useState, KeyboardEvent } from "react";
import { AlertCircle, Globe, Loader2, Locate, MapPin, Navigation, Plus, Sparkles, X } from "lucide-react";
import { cn, postJson } from "@/utils";
import { PlacePoint } from "../types";
import { LocationInput } from "./LocationInput";

interface InputPanelProps {
    cityName: string;
    setCityName: (v: string) => void;
    cityAutoStatus: string;

    originMode: "text" | "coord";
    setOriginMode: (v: "text" | "coord") => void;
    originText: string;
    setOriginText: (v: string) => void;
    originCoordText: string;
    setOriginCoordText: (v: string) => void;
    originCoordName: string;
    setOriginCoordName: (v: string) => void;
    locating: boolean;
    useMyLocation: () => void;

    places: PlacePoint[];
    setPlaces: (v: PlacePoint[]) => void;

    onOptimize: () => void;
    optimizing: boolean;
    optError: string;
}

import { useToast } from "../contexts/ToastContext";

export function InputPanel({
    cityName, setCityName, cityAutoStatus,
    originMode, setOriginMode, originText, setOriginText,
    originCoordText, setOriginCoordText, originCoordName, setOriginCoordName,
    locating, useMyLocation,
    places, setPlaces,
    onOptimize, optimizing, optError
}: InputPanelProps) {
    const { toast } = useToast();
    const [newPlace, setNewPlace] = useState("");
    const [addingPlace, setAddingPlace] = useState(false);

    const handleSelectPlace = (tip: any) => {
        if (!tip.location || typeof tip.location !== 'string') {
            setNewPlace(tip.name);
            return;
        }

        const [lngStr, latStr] = tip.location.split(',');
        const lng = parseFloat(lngStr);
        const lat = parseFloat(latStr);

        if (isNaN(lng) || isNaN(lat)) {
            setNewPlace(tip.name);
            return;
        }

        const newPoint: PlacePoint = {
            name: tip.name,
            lng,
            lat,
            location: tip.location,
            formatted_address: tip.address ? `${tip.district || ''}${tip.address}` : undefined,
            city: tip.city,
            adcode: tip.adcode
        };

        if (places.some(p => p.name === newPoint.name)) {
            toast("该地点已在列表中", "info");
            setNewPlace("");
            return;
        }

        setPlaces([...places, newPoint]);
        setNewPlace("");
    };

    const handleAddPlace = async () => {
        const trimmed = newPlace.trim();
        if (!trimmed) return;

        if (places.some(p => p.name === trimmed)) {
            toast("该地点已在列表中", "info");
            return;
        }

        setAddingPlace(true);
        try {
            // Geocode the place immediately to get coordinates
            const res = await postJson<PlacePoint>("/api/geocode", {
                city: cityName,
                address: trimmed
            });

            if (!res || !res.lng || !res.lat) {
                throw new Error("无法获取该地点坐标，请尝试更详细的名称");
            }

            setPlaces([...places, res]);
            setNewPlace("");
        } catch (e: any) {
            toast(`添加失败: ${e.message || "未知错误"}`, "error");
        } finally {
            setAddingPlace(false);
        }
    };

    const handleRemovePlace = (index: number) => {
        const newPlaces = [...places];
        newPlaces.splice(index, 1);
        setPlaces(newPlaces);
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            e.preventDefault();
            handleAddPlace();
        }
    };

    return (
        <div className="space-y-6 animate-slide-left">

            {/* City Section */}
            <div className="space-y-2">
                <label className="label flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Globe className="w-3.5 h-3.5" />
                        目标城市
                    </div>
                    {cityAutoStatus && (
                        <span className={cn(
                            "text-[10px] px-2 py-0.5 rounded-full font-medium",
                            cityAutoStatus.includes("✓")
                                ? "bg-green-100 text-green-700"
                                : "bg-gray-100 text-gray-500"
                        )}>
                            {cityAutoStatus.includes("✓") ? "已定位" : cityAutoStatus}
                        </span>
                    )}
                </label>
                <input
                    className="input-field"
                    value={cityName}
                    onChange={e => setCityName(e.target.value)}
                    placeholder="输入城市名称，如：成都"
                />
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
                        {locating ? "定位中..." : "我的位置"}
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
                    <LocationInput
                        className="flex-1"
                        value={originText}
                        onChange={setOriginText}
                        cityName={cityName}
                        placeholder="例如：天府广场"
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
            <div className="space-y-3">
                <label className="label flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5" />
                        目的地列表
                    </div>
                    <span className="font-normal text-[var(--text-muted)] text-xs">
                        {places.length} 个地点
                    </span>
                </label>

                {/* Add Place Input */}
                <div className="flex gap-2 items-start">
                    <LocationInput
                        className="flex-1"
                        value={newPlace}
                        onChange={setNewPlace}
                        onSelect={handleSelectPlace}
                        onKeyDown={handleKeyDown}
                        disabled={addingPlace}
                        cityName={cityName}
                        placeholder={addingPlace ? "搜索坐标中..." : "输入地点名称并回车"}
                    />
                    <button
                        onClick={handleAddPlace}
                        disabled={!newPlace.trim() || addingPlace}
                        className="btn-secondary w-14 h-12 flex items-center justify-center p-0 disabled:opacity-50"
                    >
                        {addingPlace ? <Loader2 className="w-7 h-7 animate-spin" /> : <Plus className="w-7 h-7 stroke-[2.25]" />}
                    </button>
                </div>

                {/* Place List */}
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                    {places.length === 0 && (
                        <div className="text-center py-6 text-xs text-[var(--text-light)] bg-white/40 rounded-lg border border-dashed border-[var(--border)]">
                            暂无地点，请添加
                        </div>
                    )}
                    {places.map((place, idx) => (
                        <div
                            key={`${place.name}-${idx}`}
                            className="group flex items-center justify-between p-3 bg-white border border-[var(--border-light)] rounded-xl shadow-sm hover:shadow-md transition-all animate-fade-in"
                        >
                            <div className="flex items-center gap-2.5">
                                <div className="w-6 h-6 rounded-full bg-[var(--bg-secondary)] text-[var(--text-secondary)] flex items-center justify-center text-xs font-medium flex-none">
                                    {idx + 1}
                                </div>
                                <div className="min-w-0">
                                    <div className="text-sm font-medium text-[var(--text-primary)] truncate">{place.name}</div>
                                    <div className="text-[10px] text-[var(--text-muted)] truncate max-w-[150px]">{place.formatted_address || "已定位"}</div>
                                </div>
                            </div>
                            <button
                                onClick={() => handleRemovePlace(idx)}
                                className="text-[var(--text-light)] hover:text-red-500 transition-colors p-1"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            {/* Action Button */}
            <div className="pt-2">
                <button
                    onClick={onOptimize}
                    disabled={optimizing || places.length === 0}
                    className={cn(
                        "w-full btn-primary",
                        (optimizing || places.length === 0) && "opacity-50 cursor-not-allowed"
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
                    <div className="mt-4 flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-600 animate-slide-up">
                        <AlertCircle className="w-4 h-4 flex-none mt-0.5" />
                        {optError}
                    </div>
                )}
            </div>
        </div>
    );
}
