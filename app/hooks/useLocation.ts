import { useState, useRef, useEffect } from "react";
import { PlacePoint, OriginInput } from "../types";
import { postJson } from "@/utils";
import { useToast } from "../contexts/ToastContext";

export function useLocation() {
    const { toast } = useToast();

    // City State
    const [cityName, setCityName] = useState<string>("");
    const [cityAdcode, setCityAdcode] = useState<string>("");
    const [cityAutoStatus, setCityAutoStatus] = useState<string>("");
    const [cityCenter, setCityCenter] = useState<[number, number] | undefined>(undefined);

    // Origin State
    const [originMode, setOriginMode] = useState<"text" | "coord">("text");
    const [originText, setOriginText] = useState<string>("");
    const [originCoordText, setOriginCoordText] = useState<string>("");
    const [originCoordName, setOriginCoordName] = useState<string>("我的位置");
    const [locating, setLocating] = useState(false);
    const [originPoint, setOriginPoint] = useState<PlacePoint | null>(null);

    // City Debounce
    const cityDebounceRef = useRef<NodeJS.Timeout | null>(null);
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

                if (g?.lng && g?.lat) {
                    setCityCenter([g.lng, g.lat]);
                }
            } catch {
                setCityAutoStatus("未匹配");
            }
        }, 400);
        return () => {
            if (cityDebounceRef.current) clearTimeout(cityDebounceRef.current);
        };
    }, [cityName]);

    // Origin Debounce
    const originDebounceRef = useRef<NodeJS.Timeout | null>(null);
    useEffect(() => {
        if (originMode === "coord") {
            const parts = originCoordText.trim().split(/[,，]/);
            if (parts.length >= 2) {
                const lng = Number(parts[0]);
                const lat = Number(parts[1]);
                if (Number.isFinite(lng) && Number.isFinite(lat)) {
                    setOriginPoint({
                        name: originCoordName || "起点",
                        lng, lat,
                        location: `${lng},${lat}`,
                        formatted_address: "精确坐标模式",
                    } as PlacePoint);
                    return;
                }
            }
            setOriginPoint(null);
            return;
        }

        const text = originText.trim();
        if (!text) {
            setOriginPoint(null);
            return;
        }

        if (originDebounceRef.current) clearTimeout(originDebounceRef.current);
        originDebounceRef.current = setTimeout(async () => {
            try {
                const g = await postJson<PlacePoint>("/api/geocode", {
                    city: cityName,
                    address: text
                });
                if (g?.lng && g?.lat) {
                    setOriginPoint({ ...g, name: text });
                } else {
                    setOriginPoint(null);
                }
            } catch {
                setOriginPoint(null);
            }
        }, 600);

        return () => {
            if (originDebounceRef.current) clearTimeout(originDebounceRef.current);
        };
    }, [originMode, originText, originCoordText, originCoordName, cityName]);

    // Use My Location
    const useMyLocation = () => {
        if (!navigator.geolocation) {
            toast("浏览器不支持定位", "error");
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
                toast("定位成功", "success");
            },
            () => {
                toast("定位失败，请检查权限", "error");
                setLocating(false);
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    };

    return {
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
        useMyLocation
    };
}
