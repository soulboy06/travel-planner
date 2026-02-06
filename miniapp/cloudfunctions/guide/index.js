const cloud = require('wx-server-sdk');
const https = require('https');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

function mustEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

function httpsPostJson(url, headers, body, timeoutMs = 50000) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const u = new URL(url);
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
          ...headers,
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => {
          try {
            const json = JSON.parse(raw);
            resolve({ status: res.statusCode || 0, json });
          } catch (err) {
            reject(err);
          }
        });
      }
    );
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Upstream timeout after ${timeoutMs}ms`));
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

function extractResponseText(json) {
  if (!json) return "";
  if (json.choices && json.choices[0] && json.choices[0].message) {
    return json.choices[0].message.content || "";
  }
  return JSON.stringify(json);
}

const ARK_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3/chat/completions";

function listify(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((v) => (typeof v === "string" ? v.trim() : JSON.stringify(v)))
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/\r?\n|；|;/g)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeGuide(raw = {}) {
  return {
    title: raw.title || "未命名攻略",
    summary: raw.summary || "",
    itinerary: Array.isArray(raw.itinerary) ? raw.itinerary : listify(raw.itinerary || raw.plan),
    mustDo: listify(raw.mustDo),
    tips: listify(raw.tips),
    keyPoints: listify(raw.keyPoints),
    planB: typeof raw.planB === "string" ? raw.planB.trim() : ""
  };
}

function parseJsonFromContent(content) {
  const clean = String(content || "").replace(/```json/gi, "").replace(/```/g, "").trim();
  try {
    return JSON.parse(clean);
  } catch (_) {
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(clean.slice(start, end + 1));
    }
    throw new Error("Parse JSON failed");
  }
}

exports.main = async (event) => {
  try {
    const {
      days,
      budget,
      vibe,
      pace,
      note,
      city,
      origin,
      destinations
    } = event || {};
    const apiKey = mustEnv("ARK_API_KEY");
    const model = mustEnv("ARK_MODEL_ID");

    const safeDestinations = Array.isArray(destinations)
      ? destinations
          .map((d) => ({
            name: d && d.name ? String(d.name).trim() : "",
            address: d && d.address ? String(d.address).trim() : ""
          }))
          .filter((d) => d.name || d.address)
      : [];
    const destinationNames = safeDestinations.map((d) => d.name || d.address);
    const destinationLines = destinationNames.length > 0
      ? destinationNames.map((name, idx) => `${idx + 1}. ${name}`).join("\n")
      : "未提供";
    const originText = origin
      ? `${origin.name || "未命名起点"}${origin.address ? `（${origin.address}）` : ""}`
      : "未提供";

    const prompt = [
      "请根据以下信息生成旅行攻略，必须返回纯 JSON，不要 markdown，不要解释文字。",
      "",
      `城市：${city || "未指定"}`,
      `起点：${originText}`,
      `已选目的地（必须优先围绕这些地点安排）：\n${destinationLines}`,
      `天数：${days || "1天"}`,
      `预算：${budget || "不限"}`,
      `偏好：${vibe || "无"}`,
      `节奏：${pace || "正常"}`,
      `其他要求：${note || "无"}`,
      "",
      "硬性要求：",
      "1) 优先使用已选目的地，不要替换成无关景点。",
      "2) 每个已选目的地至少出现一次（若确实不适合请在 keyPoints 说明原因）。",
      "3) 内容务必完整，不要留空字段。",
      "",
      "输出 JSON 格式：",
      "{",
      '  "title": "攻略标题",',
      '  "summary": "一句话摘要",',
      '  "itinerary": [',
      '    {"day":"第1天","stops":["地点1","地点2"],"notes":"安排理由与注意事项"}',
      "  ],",
      '  "mustDo": ["必做1", "必做2"],',
      '  "keyPoints": ["关键点1", "关键点2"],',
      '  "tips": ["建议1", "建议2"],',
      '  "planB": "备选方案"',
      "}",
    ].join("\n");

    const body = {
      model,
      messages: [
        { role: "system", content: "你是专业旅行规划师，只输出 JSON。" },
        { role: "user", content: prompt }
      ],
      temperature: 0.6,
      max_tokens: 1400
    };

    const { status, json } = await httpsPostJson(ARK_BASE_URL, {
      Authorization: `Bearer ${apiKey}`
    }, body);

    if (status !== 200) {
      return { error: `Ark API Error ${status}`, raw: json };
    }

    const content = extractResponseText(json);
    try {
      const parsed = parseJsonFromContent(content);
      const data = normalizeGuide(parsed);
      if (destinationNames.length > 0) {
        data.keyPoints = Array.from(new Set([
          ...data.keyPoints,
          `已约束目的地：${destinationNames.join("、")}`
        ]));
      }
      return { success: true, data };
    } catch (e) {
      return { success: false, raw: content, error: e.message || "Parse JSON failed" };
    }
  } catch (e) {
    return { error: e.message };
  }
};
