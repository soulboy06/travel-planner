// Guide Summary API with Bocha Search Integration
import { NextResponse } from "next/server";

type PoiItem = {
    name: string;
    address?: string;
    location?: string;
    distanceM?: number;
    tel?: string;
    type?: string;
    rating?: number;
};

type GuideSummaryReq = {
    place: { name: string; lng: number; lat: number; cityHint?: string };
    sections: Array<{ key: string; title: string; items: PoiItem[] }>;
    preferences?: {
        budget?: "low" | "mid" | "high";
        vibe?: "classic" | "family" | "photo" | "food" | "night";
        pace?: "slow" | "normal" | "fast";
    };
};

type ReferenceItem = {
    name: string;
    snippet: string;
    url?: string;
    source?: string;
};

type GuideSummary = {
    title: string;
    duration: string;
    bestTime: string[];
    mustDo: string[];
    foodPick: Array<{ name: string; reason: string; distanceM?: number }>;
    tips: string[];
    nearbyPlanB: string[];
    references?: ReferenceItem[];
};

function mustEnv(name: string) {
    const v = process.env[name];
    if (!v) throw new Error(`Missing ${name} in .env.local`);
    return v;
}

function safeJsonParse(text: string): any {
    try {
        return JSON.parse(text);
    } catch {
        const m = text.match(/\{[\s\S]*\}/);
        if (m) {
            try {
                return JSON.parse(m[0]);
            } catch {
                return null;
            }
        }
        return null;
    }
}

function round4(n: number) {
    return Math.round(n * 10000) / 10000;
}

function simpleHash(s: string) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16);
}

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { exp: number; value: GuideSummary }>();

function getCache(key: string): GuideSummary | null {
    const hit = cache.get(key);
    if (!hit) return null;
    if (Date.now() > hit.exp) {
        cache.delete(key);
        return null;
    }
    return hit.value;
}

function setCache(key: string, value: GuideSummary) {
    cache.set(key, { exp: Date.now() + CACHE_TTL_MS, value });
}

function buildCacheKey(req: GuideSummaryReq) {
    const prefsKey = JSON.stringify(req.preferences || {});
    const topNames = req.sections
        .map((s) => `${s.key}:${(s.items || []).slice(0, 10).map((x) => x.name).join("|")}`)
        .join(";");
    const base = [req.place.name, `${round4(req.place.lng)},${round4(req.place.lat)}`, prefsKey, topNames].join("::");
    return simpleHash(base);
}

function pickTop(items: PoiItem[] | undefined, n: number) {
    const arr = Array.isArray(items) ? items : [];
    return [...arr]
        .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
        .slice(0, n)
        .map((x) => ({
            name: x.name,
            rating: x.rating ?? 0,
            distanceM: x.distanceM,
            address: x.address,
        }));
}

async function callBochaSearch(query: string): Promise<ReferenceItem[]> {
    const apiKey = process.env.BOCHA_API_KEY;
    if (!apiKey) {
        console.warn("⚠️ BOCHA_API_KEY not set");
        return [];
    }

    try {
        console.log("🔍 Calling Bocha with query:", query);
        const res = await fetch("https://api.bochaai.com/v1/web-search", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                query: query,
                count: 20
            })
        });

        if (!res.ok) {
            console.error(`❌ Bocha API Error: ${res.status}`);
            return [];
        }

        const json = await res.json();
        console.log("📦 Bocha response structure:", Object.keys(json));

        let items: any[] = [];
        if (json?.data?.webPages?.value) items = json.data.webPages.value;
        else if (json?.data?.results) items = json.data.results;
        else if (json?.results) items = json.results;
        else if (Array.isArray(json?.data)) items = json.data;
        else if (Array.isArray(json)) items = json;

        console.log(`📊 Found ${items.length} raw items`);

        const mapped = items.map((item: any) => {
            const url = item.url || item.link || "";
            let source = "Web";
            let priority = 1;

            // 优先级：小红书 > 知乎 > 大众点评 > 马蜂窝 > 其他
            if (url.includes("xiaohongshu")) {
                source = "小红书";
                priority = 100;
            } else if (url.includes("zhihu")) {
                source = "知乎";
                priority = 95;
            } else if (url.includes("dianping")) {
                source = "大众点评";
                priority = 90;
            } else if (url.includes("mafengwo")) {
                source = "马蜂窝";
                priority = 50;
            } else if (url.includes("ctrip") || url.includes("qunar")) {
                source = "旅游网站";
                priority = 20;
            }

            return {
                name: item.name || item.title || "未知标题",
                snippet: item.snippet || item.summary || item.description || "",
                url: url,
                source,
                priority
            };
        }).filter((x: any) => x.name !== "未知标题" && x.url && x.snippet);

        console.log(`✅ After filter: ${mapped.length} items`);
        mapped.sort((a: any, b: any) => b.priority - a.priority);

        const final = mapped.slice(0, 10).map(({ priority, ...rest }: any) => rest);
        console.log(`📋 Returning ${final.length} references`);
        return final;

    } catch (e) {
        console.error("❌ Bocha Search Failed:", e);
        return [];
    }
}

async function callDoubao(req: GuideSummaryReq, references: ReferenceItem[]): Promise<GuideSummary> {
    const apiKey = mustEnv("ARK_API_KEY");
    const model = mustEnv("ARK_MODEL_ID");
    const base = (process.env.ARK_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3").replace(/\/+$/, "");
    const url = `${base}/chat/completions`;

    const sec = (k: string) => req.sections.find((s) => s.key === k)?.items;
    const foodCandidates = pickTop(sec("food"), 15);
    const sightCandidates = pickTop(sec("sight"), 10);

    const searchContext = references.length > 0
        ? references.map((r, i) => `【${r.source}】${r.name}\n${r.snippet}`).join("\n\n")
        : "暂无网友评论";

    const system = [
        "🎯 你是小红书旅游博主，基于网友真实笔记生成攻略。",
        "",
        "📌 核心规则：",
        "1. tips 前3-5条必须是【避雷】，格式：'❌避雷：具体问题（来自【小红书/知乎/大众点评】）'",
        "2. foodPick 优先推荐笔记提到+在列表中+高分+近距离的店",
        "3. 如果笔记未提美食，就选高分近店，reason写'高德POI推荐，Xx⭐'",
        "4. 禁止推荐不在foodCandidates中的店",
        "",
        "📋 输出JSON：",
        "{",
        "  title: 标题（emoji）",
        "  duration: 时长",
        "  bestTime: 时间数组",
        "  mustDo: 必打卡（引用笔记）",
        "  foodPick: [{name, reason, distanceM}] 至少3个",
        "  tips: 建议（前3-5条避雷）",
        "  nearbyPlanB: 备选",
        "}"
    ].join("\n");

    const userMsg = {
        "地点": req.place.name,
        "真实笔记": searchContext,
        "可选美食": foodCandidates.map(f => `${f.name} ${f.rating}⭐ ${f.distanceM}m`),
        "要求": [
            "1. tips前3条避雷，标注来源",
            "2. foodPick至少3个，优先笔记提到的，其次高分近店",
            "3. 禁止编造店名"
        ]
    };

    const resp = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model,
            messages: [
                { role: "system", content: system },
                { role: "user", content: JSON.stringify(userMsg, null, 2) }
            ],
            temperature: 0.7
        }),
    });

    if (!resp.ok) {
        throw new Error(`Doubao API Error: ${resp.status}`);
    }

    const json = await resp.json();
    const content = json?.choices?.[0]?.message?.content;
    if (!content) throw new Error("No content from model");

    const parsed = safeJsonParse(content);
    if (!parsed || !Array.isArray(parsed.mustDo)) {
        throw new Error("Invalid JSON structure from model");
    }

    // 放宽过滤条件：只要名字在列表中就保留
    const allowedFood = new Set(foodCandidates.map((x) => x.name));
    parsed.foodPick = (parsed.foodPick || [])
        .filter((x: any) => {
            if (!x?.name) return false;
            // 模糊匹配：如果 foodPick 中的店名包含在 candidates 中，或反之
            return Array.from(allowedFood).some(allowed =>
                x.name.includes(allowed) || allowed.includes(x.name)
            );
        })
        .slice(0, 5);

    // 如果过滤后没有美食，自动补充高分近店
    if (parsed.foodPick.length === 0) {
        console.warn("⚠️ No valid foodPick, adding fallback recommendations");
        parsed.foodPick = foodCandidates.slice(0, 3).map(f => ({
            name: f.name,
            reason: `高德POI推荐，评分${f.rating}⭐`,
            distanceM: f.distanceM
        }));
    }

    parsed.references = references;
    return parsed as GuideSummary;
}

export async function POST(req: Request) {
    try {
        const body = (await req.json()) as GuideSummaryReq;
        if (!body?.place?.name || !Array.isArray(body?.sections)) {
            return NextResponse.json({ error: "Invalid request" }, { status: 400 });
        }

        const cacheKey = buildCacheKey(body);
        const hit = getCache(cacheKey);
        if (hit) {
            console.log("✅ Cache hit");
            return NextResponse.json({ summary: hit, cached: true });
        }

        const placeName = body.place.name;
        const cityHint = body.place.cityHint || "";

        // 构建精确搜索关键词
        const baseQuery = cityHint ? `${cityHint} ${placeName}` : placeName;

        // 多轮搜索策略：精确限定，避免无关结果
        let allReferences: ReferenceItem[] = [];

        // 第1轮：避雷专项（优先）
        const pileiQuery = `"${placeName}" ${cityHint} 避雷 避坑 踩坑`;
        console.log("🔍 Round 1 (避雷):", pileiQuery);
        const pileiRefs = await callBochaSearch(pileiQuery);
        allReferences.push(...pileiRefs);

        // 第2轮：小红书/知乎攻略
        const guideQuery = `"${placeName}" ${cityHint} 攻略 打卡 推荐`;
        console.log("🔍 Round 2 (攻略):", guideQuery);
        const guideRefs = await callBochaSearch(guideQuery);
        allReferences.push(...guideRefs.filter(r => !allReferences.find(x => x.url === r.url)));

        // 第3轮：大众点评美食
        const foodQuery = `"${placeName}" ${cityHint} 美食 餐厅`;
        console.log("🔍 Round 3 (美食):", foodQuery);
        const foodRefs = await callBochaSearch(foodQuery);
        allReferences.push(...foodRefs.filter(r => !allReferences.find(x => x.url === r.url)));

        // 去重并按优先级排序
        const uniqueRefs = Array.from(new Map(allReferences.map(r => [r.url, r])).values());

        // 过滤掉明显不相关的结果
        const filteredRefs = uniqueRefs.filter(ref => {
            const text = `${ref.name} ${ref.snippet}`.toLowerCase();
            const placeNameLower = placeName.toLowerCase();
            // 必须包含景点名称
            return text.includes(placeNameLower);
        });

        console.log(`✅ Total ${filteredRefs.length} relevant references (filtered from ${uniqueRefs.length})`);
        console.log(`📋 Sources:`, filteredRefs.reduce((acc: any, r) => {
            acc[r.source || 'Unknown'] = (acc[r.source || 'Unknown'] || 0) + 1;
            return acc;
        }, {}));

        const summary = await callDoubao(body, filteredRefs.slice(0, 15));
        setCache(cacheKey, summary);

        return NextResponse.json({ summary, cached: false });
    } catch (e: any) {
        console.error("GUIDE_SUMMARY_ERROR:", e);
        return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
    }
}
