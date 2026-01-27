import React from "react";
import { BookOpen, Plane, Route } from "lucide-react";

interface EmptyStateProps {
    icon: string | "route" | "book" | "plane";
    text: string;
}

export function EmptyState({ icon, text }: EmptyStateProps) {
    const IconComponent = icon === "route" ? Route : icon === "book" ? BookOpen : Plane;

    return (
        <div className="empty-state">
            <div className="empty-icon">
                <IconComponent className="w-8 h-8" />
            </div>
            <p className="empty-text">{text}</p>
        </div>
    );
}
