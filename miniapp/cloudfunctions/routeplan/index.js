const cloud = require("wx-server-sdk");
const axios = require("axios");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const KEY = process.env.TENCENT_MAP_KEY;
const BASE_URL = "https://apis.map.qq.com/ws/direction/v1/driving/";

function parseLoc(locStr) {
  if (!locStr) return null;
  const parts = String(locStr).split(",");
  if (parts.length !== 2) return null;
  const lng = parseFloat(parts[0]);
  const lat = parseFloat(parts[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function distMeters(a, b) {
  const R = 6371000;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const aa = s1 * s1 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * s2 * s2;
  return 2 * R * Math.asin(Math.sqrt(aa));
}

function nearestNeighborOrder(start, points) {
  const remaining = [...points];
  const ordered = [];
  let cur = start;
  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestD = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = distMeters(cur, remaining[i]);
      if (d < bestD) {
        bestD = d;
        bestIdx = i;
      }
    }
    const next = remaining.splice(bestIdx, 1)[0];
    ordered.push(next);
    cur = next;
  }
  return ordered;
}

function k2Cluster(points) {
  if (points.length <= 2) return { A: points, B: [] };
  let c1 = points[0];
  let c2 = points[1];
  let best = -1;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const d = distMeters(points[i], points[j]);
      if (d > best) {
        best = d;
        c1 = points[i];
        c2 = points[j];
      }
    }
  }
  let A = [];
  let B = [];
  const iter = 8;
  for (let t = 0; t < iter; t++) {
    A = [];
    B = [];
    for (const p of points) {
      const d1 = distMeters(p, c1);
      const d2 = distMeters(p, c2);
      (d1 <= d2 ? A : B).push(p);
    }
    const mean = (arr) => {
      const lng = arr.reduce((s, x) => s + x.lng, 0) / arr.length;
      const lat = arr.reduce((s, x) => s + x.lat, 0) / arr.length;
      return { ...arr[0], lng, lat, location: `${lng},${lat}` };
    };
    if (A.length > 0) c1 = mean(A);
    if (B.length > 0) c2 = mean(B);
  }
  return { A, B };
}

function twoOpt(route, origin) {
  const path = [origin, ...route];
  const total = () => {
    let s = 0;
    for (let i = 0; i < path.length - 1; i++) s += distMeters(path[i], path[i + 1]);
    return s;
  };
  let improved = true;
  let bestDist = total();
  const maxLoops = 50;
  let loops = 0;
  while (improved && loops++ < maxLoops) {
    improved = false;
    for (let i = 1; i < path.length - 2; i++) {
      for (let k = i + 1; k < path.length - 1; k++) {
        const newPath = path
          .slice(0, i)
          .concat(path.slice(i, k + 1).reverse(), path.slice(k + 1));
        let s = 0;
        for (let x = 0; x < newPath.length - 1; x++) s += distMeters(newPath[x], newPath[x + 1]);
        if (s + 1e-6 < bestDist) {
          bestDist = s;
          for (let x = 0; x < newPath.length; x++) path[x] = newPath[x];
          improved = true;
        }
      }
    }
  }
  return path.slice(1);
}

function clusteredOrder(origin, points) {
  if (points.length <= 3) return nearestNeighborOrder(origin, points);
  const { A, B } = k2Cluster(points);
  if (B.length === 0) return nearestNeighborOrder(origin, A);
  const minDist = (arr) => Math.min(...arr.map((p) => distMeters(origin, p)));
  const first = minDist(A) <= minDist(B) ? A : B;
  const second = first === A ? B : A;
  const firstOrdered = nearestNeighborOrder(origin, first);
  const secondStart = firstOrdered.length ? firstOrdered[firstOrdered.length - 1] : origin;
  const secondOrdered = nearestNeighborOrder(secondStart, second);
  const merged = [...firstOrdered, ...secondOrdered];
  return twoOpt(merged, origin);
}

function isValidPoint(p) {
  return p && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;
}

function toPointsFromPairs(arr) {
  const points = [];
  for (let i = 0; i < arr.length - 1; i += 2) {
    points.push({ lat: arr[i], lng: arr[i + 1] });
  }
  return points;
}

function decodePolyline(polyline) {
  if (!Array.isArray(polyline) || polyline.length < 2) return [];
  const coors = polyline.slice(0);
  for (let i = 2; i < coors.length; i++) {
    coors[i] = coors[i - 2] + coors[i] / 1000000;
  }
  const decoded = toPointsFromPairs(coors).filter(isValidPoint);
  if (decoded.length >= 2) return decoded;
  return toPointsFromPairs(polyline).filter(isValidPoint);
}

exports.main = async (event) => {
  if (!KEY) return { code: -1, msg: "Missing TENCENT_MAP_KEY" };

  try {
    const { points, start, optimize = true } = event;
    if (!points || points.length === 0) return { code: -1, msg: "Destinations required" };
    if (!start) return { code: -1, msg: "Start point required" };

    const startLoc = parseLoc(start.location);
    if (!startLoc) return { code: -1, msg: "Invalid start location" };
    const origin = {
      name: start.name || "起点",
      lng: startLoc.lng,
      lat: startLoc.lat,
      location: start.location,
      address: start.address || ""
    };

    const parsed = points
      .map((p) => {
        const loc = parseLoc(p.location);
        if (!loc) return null;
        return {
          name: p.name || "目的地",
          lng: loc.lng,
          lat: loc.lat,
          location: p.location,
          address: p.address || ""
        };
      })
      .filter(Boolean);

    if (parsed.length === 0) return { code: -1, msg: "No valid destinations" };

    const orderedPlaces = optimize ? clusteredOrder(origin, parsed) : parsed;

    const legPairs = [];
    let cur = origin;
    for (const nxt of orderedPlaces) {
      legPairs.push({ from: cur, to: nxt });
      cur = nxt;
    }

    const promises = legPairs.map(({ from, to }) =>
      axios
        .get(BASE_URL, {
          params: {
            key: KEY,
            from: `${from.lat},${from.lng}`,
            to: `${to.lat},${to.lng}`
          }
        })
        .then((r) => ({
          start: from,
          end: to,
          result: r.data.result?.routes?.[0],
          status: r.data.status
        }))
    );

    const results = await Promise.all(promises);
    let totalDist = 0;
    let totalDur = 0;
    const finalLegs = [];

    results.forEach((r) => {
      if (r.status === 0 && r.result) {
        totalDist += r.result.distance || 0;
        totalDur += r.result.duration || 0;
        finalLegs.push({
          start: r.start,
          end: r.end,
          distanceText:
            r.result.distance < 1000
              ? r.result.distance + "m"
              : (r.result.distance / 1000).toFixed(1) + "km",
          durationText: Math.ceil((r.result.duration || 0) / 60) + "分钟",
          steps: r.result.steps,
          polylinePoints: decodePolyline(r.result.polyline || [])
        });
      }
    });

    return {
      code: 0,
      data: {
        orderedPlaces,
        legs: finalLegs,
        totalDistanceText:
          totalDist < 1000 ? totalDist + "m" : (totalDist / 1000).toFixed(1) + "km",
        totalDurationText: Math.ceil(totalDur / 60) + "分钟"
      }
    };
  } catch (e) {
    return { code: -1, msg: e.message };
  }
};
