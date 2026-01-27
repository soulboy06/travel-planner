import { useState } from "react";
import { GuideResp, GuideSummaryResp, PlacePoint } from "../types";
import { postJson } from "@/utils";
import { useToast } from "../contexts/ToastContext";

export function useGuide() {
    const { toast } = useToast();
    const [guideLoading, setGuideLoading] = useState<Record<string, boolean>>({});
    const [guideError, setGuideError] = useState<Record<string, string>>({});
    const [guideSummary, setGuideSummary] = useState<Record<string, GuideSummaryResp | null>>({});
    const [currentGuidePlace, setCurrentGuidePlace] = useState<string>("");

    const generateGuideFor = async (place: PlacePoint, cityNameHint: string) => {
        const key = place.name;
        setGuideError((m) => ({ ...m, [key]: "" }));
        setGuideLoading((m) => ({ ...m, [key]: true }));

        try {
            const gResp = await postJson<GuideResp>("/api/guide", {
                center: { lng: place.lng, lat: place.lat },
                cityHint: cityNameHint.trim() || undefined,
            });

            // Define a union type for potential API response formats
            type GuideSummaryResult = GuideSummaryResp | { summary: GuideSummaryResp };
            const sumResp = await postJson<GuideSummaryResult>("/api/guide-summary", {
                place: { name: place.name, lng: place.lng, lat: place.lat, cityHint: cityNameHint.trim() },
                sections: gResp.sections,
            });

            let sum: GuideSummaryResp;
            if ("summary" in sumResp) {
                sum = sumResp.summary;
            } else {
                sum = sumResp as GuideSummaryResp;
            }
            setGuideSummary((m) => ({ ...m, [key]: sum }));

        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            setGuideError((m) => ({ ...m, [key]: msg }));
            toast(msg, "error");
        } finally {
            setGuideLoading((m) => ({ ...m, [key]: false }));
        }
    };

    return {
        guideLoading, setGuideLoading,
        guideError, setGuideError,
        guideSummary, setGuideSummary,
        currentGuidePlace, setCurrentGuidePlace,
        generateGuideFor
    };
}
