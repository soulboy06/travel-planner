import { useState, useEffect } from "react";
import { useLocation } from "./useLocation";
import { usePlan } from "./usePlan";
import { useGuide } from "./useGuide";
import { usePersistence } from "./usePersistence";

export function useTravelApp() {
    // 1. Core Hooks
    const location = useLocation();
    const plan = usePlan();
    const guide = useGuide();

    // 2. UI State (Tab)
    const [tab, setTab] = useState<"input" | "result" | "guide">("input");

    // 3. Persistence
    usePersistence(
        plan.places, plan.setPlaces,
        plan.opt, plan.setOpt,
        guide.guideSummary, guide.setGuideSummary,
        setTab
    );

    // 4. Optimization Wrapper (Bridge location data to plan hook)
    const onOptimize = async () => {
        const success = await plan.runOptimize(
            location.originMode,
            location.originText,
            location.originCoordText,
            location.originCoordName,
            location.cityName,
            location.cityAdcode
        );
        if (success) {
            setTab("result");
        }
    };

    // 5. Guide Wrapper
    const generateGuideForWrapper = (place: any) => {
        return guide.generateGuideFor(place, location.cityName);
    };

    // 6. Leg Reset on Tab Change
    useEffect(() => {
        if (tab !== "result") {
            plan.setActiveLegIndex(null);
        }
    }, [tab, plan]); // Added plan to dependencies to satisfy linter, though mainly we care about setActiveLegIndex

    return {
        // UI
        tab, setTab,

        // Location
        cityName: location.cityName, setCityName: location.setCityName,
        cityAdcode: location.cityAdcode, setCityAdcode: location.setCityAdcode,
        cityAutoStatus: location.cityAutoStatus, setCityAutoStatus: location.setCityAutoStatus,
        cityCenter: location.cityCenter, setCityCenter: location.setCityCenter,
        originMode: location.originMode, setOriginMode: location.setOriginMode,
        originText: location.originText, setOriginText: location.setOriginText,
        originCoordText: location.originCoordText, setOriginCoordText: location.setOriginCoordText,
        originCoordName: location.originCoordName, setOriginCoordName: location.setOriginCoordName,
        locating: location.locating, setLocating: location.setLocating,
        originPoint: location.originPoint, setOriginPoint: location.setOriginPoint,
        useMyLocation: location.useMyLocation,

        // Plan
        places: plan.places, setPlaces: plan.setPlaces,
        optimizing: plan.optimizing, setOptimizing: plan.setOptimizing,
        optError: plan.optError, setOptError: plan.setOptError,
        opt: plan.opt, setOpt: plan.setOpt,
        activeLegIndex: plan.activeLegIndex, setActiveLegIndex: plan.setActiveLegIndex,
        handleLegClick: plan.handleLegClick,
        copyItinerary: plan.copyItinerary,
        onOptimize, // Renamed/Wrapped function

        // Guide
        guideLoading: guide.guideLoading, setGuideLoading: guide.setGuideLoading,
        guideError: guide.guideError, setGuideError: guide.setGuideError,
        guideSummary: guide.guideSummary, setGuideSummary: guide.setGuideSummary,
        currentGuidePlace: guide.currentGuidePlace, setCurrentGuidePlace: guide.setCurrentGuidePlace,
        generateGuideFor: generateGuideForWrapper
    };
}
