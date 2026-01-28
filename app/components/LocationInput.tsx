import React, { useState, useEffect, useRef } from "react";
import { MapPin, Loader2 } from "lucide-react";
import { cn, postJson } from "@/utils";

interface LocationInputProps {
    value: string;
    onChange: (val: string) => void;
    onSelect?: (item: any) => void;
    onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
    placeholder?: string;
    cityName?: string;
    className?: string; // for wrapper
    inputClassName?: string;
    disabled?: boolean;
}

export function LocationInput({
    value, onChange, onSelect, onKeyDown,
    placeholder, cityName,
    className, inputClassName, disabled
}: LocationInputProps) {
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [showDropdown, setShowDropdown] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const lastFetchValue = useRef("");

    // Debounce fetching
    useEffect(() => {
        const trimmed = value.trim();
        if (!trimmed || trimmed.length < 1) {
            setSuggestions([]);
            setShowDropdown(false);
            return;
        }

        // Avoid re-fetching if we just selected (optional logic, but simplistic here)
        // Actually, if user types more, we should search.

        const timer = setTimeout(async () => {
            // Only fetch if value changed meaningfully check? 
            // No, just fetch.

            setLoading(true);
            try {
                const res = await postJson<{ tips: any[] }>("/api/inputtips", {
                    keywords: trimmed,
                    cityHint: cityName
                });
                if (res && Array.isArray(res.tips)) {
                    setSuggestions(res.tips);
                    // Only show if we have results and the input is still focused/valid
                    if (res.tips.length > 0) setShowDropdown(true);
                }
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        }, 300); // 300ms debounce for responsiveness

        return () => clearTimeout(timer);
    }, [value, cityName]);

    // Click outside to close
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setShowDropdown(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleSelect = (tip: any) => {
        onChange(tip.name);
        setSuggestions([]);
        setShowDropdown(false);
        if (onSelect) onSelect(tip);
    };

    return (
        <div ref={wrapperRef} className={cn("relative w-full", className)}>
            <div className="relative">
                <input
                    className={cn("input-field w-full", inputClassName)}
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder={placeholder}
                    disabled={disabled}
                    onFocus={() => { if (suggestions.length > 0) setShowDropdown(true); }}
                />
                {loading && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                    </div>
                )}
            </div>

            {/* Dropdown */}
            {showDropdown && suggestions.length > 0 && (
                <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-[var(--border-light)] rounded-xl shadow-lg max-h-60 overflow-y-auto overflow-x-hidden animate-fade-in">
                    {suggestions.map((tip, idx) => (
                        <button
                            key={tip.id || `${tip.name}-${idx}`}
                            className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-start gap-3 border-b border-[var(--border-light)] last:border-0 transition-colors"
                            onClick={() => handleSelect(tip)}
                        >
                            <MapPin className="w-4 h-4 mt-0.5 text-[var(--primary)] flex-none opacity-70" />
                            <div className="min-w-0 flex-1">
                                <div className="text-sm font-medium text-[var(--text-primary)] truncate" title={tip.name}>{tip.name}</div>
                                <div className="text-xs text-[var(--text-muted)] truncate" title={tip.address}>{tip.district || tip.city || ""} {tip.address || ""}</div>
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
