import React from "react";
import { ExternalLink, MessageSquareQuote } from "lucide-react";
import { ReferenceItem } from "../types";

export function RefPanel({ references }: { references?: ReferenceItem[] }) {
    if (!references || references.length === 0) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center text-[var(--text-muted)] p-8">
                <MessageSquareQuote className="w-12 h-12 mb-4 opacity-20" />
                <p className="text-sm">暂无相关真实笔记</p>
            </div>
        );
    }

    return (
        <div className="w-full h-full overflow-y-auto p-4 md:p-6 bg-white/50 backdrop-blur-sm">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-[var(--text-primary)]">
                <span className="text-red-500">📕</span> 真实笔记
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
                {references.map((ref, idx) => {
                    const isXhs = ref.source === "小红书";
                    const isDp = ref.source === "大众点评";

                    return (
                        <a
                            key={idx}
                            href={ref.url}
                            target="_blank"
                            rel="noreferrer"
                            className="group block p-4 rounded-xl border border-[var(--border)] bg-white hover:shadow-md transition-all relative overflow-hidden"
                        >
                            <div className="flex items-start justify-between mb-2">
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold text-white ${isXhs ? 'bg-red-500' : (isDp ? 'bg-orange-500' : 'bg-gray-500')}`}>
                                    {ref.source || "WEB"}
                                </span>
                                <ExternalLink className="w-3.5 h-3.5 text-gray-300 group-hover:text-[var(--primary)]" />
                            </div>

                            <h4 className="text-sm font-bold text-[var(--text-primary)] mb-2 line-clamp-2 group-hover:text-[var(--primary)] transition-colors">
                                {ref.name}
                            </h4>

                            <p className="text-xs text-[var(--text-light)] line-clamp-3 leading-relaxed">
                                {ref.snippet}
                            </p>
                        </a>
                    );
                })}
            </div>

            <div className="mt-8 text-center">
                <p className="text-[10px] text-[var(--text-light)]">
                    数据由 Bocha AI 实时搜索提供 · 仅供参考
                </p>
            </div>
        </div>
    );
}
