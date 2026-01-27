export type OriginInput =
    | { type: "coord"; lng: number; lat: number; name?: string }
    | { type: "text"; text: string };

export type PlacePoint = {
    name: string;
    lng: number;
    lat: number;
    location: string;
    formatted_address?: string;
    city?: string;
    citycode?: string;
    adcode?: string;
};

export type UiLeg = {
    from: PlacePoint;
    to: PlacePoint;
    summary: {
        mode: "transit" | "walk";
        distanceM?: number;
        durationS?: number;
        costYuan?: number;
        note?: string;
    };
    amap: { appUri: string; webUrl: string };
    segments?: any[] | null;
};

export type OptimizeResp = {
    origin: PlacePoint;
    orderedPlaces: PlacePoint[];
    legs: UiLeg[];
    failed?: { name: string; reason: string }[];
};

export type GuidePoi = {
    id?: string;
    name: string;
    address?: string;
    distance?: number;
    rating?: number;
    location?: string;
    tel?: string;
};

export type GuideSection = {
    key: string;
    title: string;
    items: GuidePoi[];
};

export type GuideResp = {
    center: { lng: number; lat: number; name?: string };
    sections: GuideSection[];
};


export type ReferenceItem = {
    name: string;
    snippet: string;
    url?: string;
    source?: string;
};

export type GuideSummaryResp = {
    title: string;
    duration: string;
    bestTime: string[];
    mustDo: string[];
    foodPick: Array<{ name: string; reason: string; distanceM?: number }>;
    tips: string[];
    nearbyPlanB: string[];
    references?: ReferenceItem[];
};
