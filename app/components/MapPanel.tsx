"use client";

import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { PlacePoint, UiLeg } from "../types";
import { gcj02ToWgs84 } from "../utils/coordTransform";

// Custom Red Icon for Destinations
const redIcon = new L.Icon({
    iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png",
    shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

// Custom Blue Icon for Origin
const blueIcon = new L.Icon({
    iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png",
    shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

// Auto-zoom component
interface ChangeViewProps {
    center?: [number, number];
    places: PlacePoint[];
    origin?: PlacePoint | null;
    activeLegInfo?: { path: [number, number][], isActive: boolean };
}

const ChangeView = ({ center, places, origin, activeLegInfo }: ChangeViewProps) => {
    const map = useMap();

    useEffect(() => {
        if (!map) return;

        // Invalidate map size to ensure correct rendering
        setTimeout(() => { map.invalidateSize(); }, 100);

        // If there is an active leg with path, fit to that path
        if (activeLegInfo && activeLegInfo.path.length > 0) {
            const bounds = L.latLngBounds(activeLegInfo.path);
            map.fitBounds(bounds, { padding: [50, 50] });
            return;
        }

        // Otherwise fit to all markers
        const points: [number, number][] = [];

        if (origin) {
            const [lng, lat] = gcj02ToWgs84(origin.lng, origin.lat);
            points.push([lat, lng]);
        }

        places.forEach((p: PlacePoint) => {
            const [lng, lat] = gcj02ToWgs84(p.lng, p.lat);
            points.push([lat, lng]);
        });

        if (center && points.length === 0) {
            const [lng, lat] = gcj02ToWgs84(center[0], center[1]);
            map.flyTo([lat, lng], 12);
        } else if (points.length > 0) {
            const bounds = L.latLngBounds(points);
            map.fitBounds(bounds, { padding: [50, 50] });
        }
    }, [center, places, origin, map, activeLegInfo]);

    return null;
};

interface MapPanelProps {
    places: PlacePoint[];
    origin?: PlacePoint | null;
    center?: [number, number];
    legs?: UiLeg[];
    activeLegIndex?: number | null;
    onMarkerClick?: (index: number) => void;
    edgeToEdge?: boolean;
}

export default function MapPanel({ places, origin, center, legs, activeLegIndex, onMarkerClick, edgeToEdge }: MapPanelProps) {
    // Default center (Chengdu) - converted to WGS84 for Leaflet
    const [defLng, defLat] = gcj02ToWgs84(104.0648, 30.6586);

    // Compute all polyline paths from legs
    // Return: Array of { path: [lat, lng][], isActive: boolean }
    const routePaths = useMemo(() => {
        if (!legs) return [];

        return legs.map((leg, idx) => {
            const segments = leg.segments || [];
            if (segments.length === 0) return null;

            // Extract all polyline coordinates from segments
            // AMap segment polyline format: "lng,lat;lng,lat;..."
            const points: [number, number][] = [];

            // Add start point
            const [startLng, startLat] = gcj02ToWgs84(leg.from.lng, leg.from.lat);
            points.push([startLat, startLng]);

            // Partial Interface for AMap Segment
            interface AMapSegment {
                walking?: { steps: { polyline: string }[] };
                bus?: { buslines: { polyline: string }[] };
                railway?: { polyline: string };
                taxi?: { polyline: string };
            }

            segments.forEach((seg: AMapSegment) => {
                const extractPolyline = (str?: string) => {
                    if (!str) return;
                    const pairs = str.split(";");
                    pairs.forEach(pair => {
                        const [lngStr, latStr] = pair.split(",");
                        const lng = Number(lngStr);
                        const lat = Number(latStr);
                        // Convert GCJ02 -> WGS84
                        const [wLng, wLat] = gcj02ToWgs84(lng, lat);
                        points.push([wLat, wLng]);
                    });
                };

                if (seg?.walking?.steps) {
                    seg.walking.steps.forEach((step) => extractPolyline(step.polyline));
                }
                if (seg?.bus?.buslines) {
                    seg.bus.buslines.forEach((line) => extractPolyline(line.polyline));
                }
                // Add other transit modes if needed (e.g. railway)
                if (seg?.railway?.polyline) {
                    extractPolyline(seg.railway.polyline);
                }
                if (seg?.taxi?.polyline) {
                    extractPolyline(seg.taxi.polyline);
                }
            });

            // Add end point
            const [endLng, endLat] = gcj02ToWgs84(leg.to.lng, leg.to.lat);
            points.push([endLat, endLng]);

            return {
                path: points,
                isActive: activeLegIndex === idx
            };
        }).filter(Boolean) as { path: [number, number][], isActive: boolean }[];
    }, [legs, activeLegIndex]);

    const activeLegInfo = routePaths.find(p => p.isActive);

    return (
        <div className={`w-full h-full overflow-hidden z-0 relative ${edgeToEdge ? "rounded-none shadow-none" : "rounded-2xl shadow-lg"}`}>
            <MapContainer
                center={[defLat, defLng]}
                zoom={13}
                style={{ height: "100%", width: "100%" }}
            >
                <TileLayer
                    attribution='&copy; OpenStreetMap'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                <ChangeView center={center} places={places} origin={origin} activeLegInfo={activeLegInfo} />

                {/* Polylines */}
                {routePaths.map((route, i) => (
                    <Polyline
                        key={i}
                        positions={route.path}
                        color={route.isActive ? "#10b981" : "#9ca3af"} // Green for active, Gray for inactive
                        weight={route.isActive ? 6 : 4}
                        opacity={route.isActive ? 0.9 : 0.6}
                        dashArray={route.isActive ? undefined : "5, 10"} // Dashed for inactive
                    />
                ))}

                {/* Origin Marker (Blue) */}
                {origin && (() => {
                    const [wgsLng, wgsLat] = gcj02ToWgs84(origin.lng, origin.lat);
                    return (
                        <Marker
                            position={[wgsLat, wgsLng]}
                            icon={blueIcon}
                            zIndexOffset={1000}
                        >
                            <Popup>
                                <div className="font-bold text-blue-600">🚀 起点: {origin.name}</div>
                                <div className="text-xs">{origin.formatted_address || origin.location}</div>
                            </Popup>
                        </Marker>
                    );
                })()}

                {/* Destination Markers (Red) */}
                {places.map((p, idx) => {
                    const [wgsLng, wgsLat] = gcj02ToWgs84(p.lng, p.lat);
                    return (
                        <Marker
                            key={`${p.name}-${idx}`}
                            position={[wgsLat, wgsLng]}
                            icon={redIcon}
                            eventHandlers={{
                                click: () => onMarkerClick?.(idx),
                            }}
                        >
                            <Popup>
                                <div className="font-bold text-[var(--accent)]">{idx + 1}. {p.name}</div>
                                <div className="text-xs">{p.formatted_address}</div>
                            </Popup>
                        </Marker>
                    );
                })}
            </MapContainer>
        </div>
    );
}
