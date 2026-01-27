import { useEffect } from "react";

const STORAGE_VERSION = "1.0.0";
const VERSION_KEY = "tp_version";

export function usePersistence(
    places: any[],
    setPlaces: (v: any[]) => void,
    opt: any,
    setOpt: (v: any) => void,
    guideSummary: any,
    setGuideSummary: (v: any) => void,
    setTab: (v: any) => void
) {
    // Load on Mount
    useEffect(() => {
        try {
            const currentVersion = localStorage.getItem(VERSION_KEY);

            // Version Check: if mismatch, clear all
            if (currentVersion !== STORAGE_VERSION) {
                console.warn(`Storage version mismatch (Local: ${currentVersion} vs App: ${STORAGE_VERSION}). Clearing storage.`);
                localStorage.clear();
                localStorage.setItem(VERSION_KEY, STORAGE_VERSION);
                return;
            }

            const savedPlaces = localStorage.getItem("tp_places");
            if (savedPlaces) {
                setPlaces(JSON.parse(savedPlaces));
            }

            const savedOpt = localStorage.getItem("tp_opt");
            if (savedOpt) {
                setOpt(JSON.parse(savedOpt));
                setTab("result");
            }

            const savedGuides = localStorage.getItem("tp_guides");
            if (savedGuides) {
                setGuideSummary(JSON.parse(savedGuides));
            }
        } catch (e) {
            console.error("Failed to load persistence:", e);
            // On fatal error, maybe clear storage too?
        }
    }, [setPlaces, setOpt, setTab, setGuideSummary]);

    // Save Effects
    useEffect(() => {
        localStorage.setItem("tp_places", JSON.stringify(places));
    }, [places]);

    useEffect(() => {
        if (opt) {
            localStorage.setItem("tp_opt", JSON.stringify(opt));
        } else {
            localStorage.removeItem("tp_opt");
        }
    }, [opt]);

    useEffect(() => {
        if (Object.keys(guideSummary).length > 0) {
            localStorage.setItem("tp_guides", JSON.stringify(guideSummary));
        } else {
            localStorage.removeItem("tp_guides");
        }
    }, [guideSummary]);
}
