const fs = require('fs');
const zlib = require('zlib');

const W = 144;
const H = 144;
const data = Buffer.alloc(W * H * 4, 0);

function setPixel(x, y, r, g, b, a = 255) {
  const i = (y * W + x) * 4;
  data[i] = r;
  data[i + 1] = g;
  data[i + 2] = b;
  data[i + 3] = a;
}

function fillRect(x, y, w, h, color) {
  const [r, g, b, a = 255] = color;
  for (let yy = Math.max(0, y); yy < Math.min(H, y + h); yy++) {
    for (let xx = Math.max(0, x); xx < Math.min(W, x + w); xx++) {
      setPixel(xx, yy, r, g, b, a);
    }
  }
}

function insideRoundRect(px, py, x, y, w, h, r) {
  if (px < x || px >= x + w || py < y || py >= y + h) return false;
  const rx = r;
  const ry = r;
  let cx = 0;
  let cy = 0;
  if (px < x + rx) cx = x + rx - px;
  else if (px > x + w - rx) cx = px - (x + w - rx);
  if (py < y + ry) cy = y + ry - py;
  else if (py > y + h - ry) cy = py - (y + h - ry);
  return cx * cx + cy * cy <= r * r + 1e-6;
}

function fillRoundRect(x, y, w, h, r, color) {
  const [cr, cg, cb, ca = 255] = color;
  for (let yy = Math.max(0, Math.floor(y)); yy < Math.min(H, Math.ceil(y + h)); yy++) {
    for (let xx = Math.max(0, Math.floor(x)); xx < Math.min(W, Math.ceil(x + w)); xx++) {
      const px = xx + 0.5;
      const py = yy + 0.5;
      if (insideRoundRect(px, py, x, y, w, h, r)) {
        setPixel(xx, yy, cr, cg, cb, ca);
      }
    }
  }
}

function fillCircle(cx, cy, r, color) {
  const [cr, cg, cb, ca = 255] = color;
  const r2 = r * r;
  const minX = Math.max(0, Math.floor(cx - r));
  const maxX = Math.min(W - 1, Math.ceil(cx + r));
  const minY = Math.max(0, Math.floor(cy - r));
  const maxY = Math.min(H - 1, Math.ceil(cy + r));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r2 + 1e-6) {
        setPixel(x, y, cr, cg, cb, ca);
      }
    }
  }
}

function pointInPolygon(px, py, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1];
    const xj = pts[j][0], yj = pts[j][1];
    const intersect = ((yi > py) !== (yj > py)) &&
      (px < (xj - xi) * (py - yi) / (yj - yi + 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function fillPolygon(pts, color) {
  const [cr, cg, cb, ca = 255] = color;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  const startX = Math.max(0, Math.floor(minX));
  const endX = Math.min(W - 1, Math.ceil(maxX));
  const startY = Math.max(0, Math.floor(minY));
  const endY = Math.min(H - 1, Math.ceil(maxY));
  for (let y = startY; y <= endY; y++) {
    for (let x = startX; x <= endX; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      if (pointInPolygon(px, py, pts)) {
        setPixel(x, y, cr, cg, cb, ca);
      }
    }
  }
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const vx = x2 - x1;
  const vy = y2 - y1;
  const wx = px - x1;
  const wy = py - y1;
  const c1 = wx * vx + wy * vy;
  if (c1 <= 0) return Math.hypot(px - x1, py - y1);
  const c2 = vx * vx + vy * vy;
  if (c2 <= c1) return Math.hypot(px - x2, py - y2);
  const b = c1 / c2;
  const bx = x1 + b * vx;
  const by = y1 + b * vy;
  return Math.hypot(px - bx, py - by);
}

function strokeLine(x1, y1, x2, y2, width, color) {
  const [cr, cg, cb, ca = 255] = color;
  const r = width / 2;
  const minX = Math.max(0, Math.floor(Math.min(x1, x2) - r));
  const maxX = Math.min(W - 1, Math.ceil(Math.max(x1, x2) + r));
  const minY = Math.max(0, Math.floor(Math.min(y1, y2) - r));
  const maxY = Math.min(H - 1, Math.ceil(Math.max(y1, y2) + r));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      if (distToSegment(px, py, x1, y1, x2, y2) <= r + 1e-6) {
        setPixel(x, y, cr, cg, cb, ca);
      }
    }
  }
}

// Draw order matches SVG
fillRoundRect(8, 8, 128, 128, 28, [230, 243, 255]);
fillRoundRect(24, 28, 96, 88, 16, [183, 219, 255]);
fillRect(32, 44, 80, 56, [234, 246, 255]);
fillRect(36, 48, 72, 48, [214, 236, 255]);
fillRect(44, 56, 56, 32, [194, 226, 255]);
fillCircle(72, 72, 22, [47, 125, 255]);
fillPolygon([[72, 50], [82, 72], [72, 78], [62, 72]], [255, 255, 255]);
fillCircle(72, 72, 4, [31, 94, 217]);
strokeLine(52, 92, 92, 92, 4, [122, 183, 255]);
strokeLine(58, 100, 86, 100, 4, [122, 183, 255]);

// PNG encode
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
    }
  }
  return ~c >>> 0;
}

function pngChunk(type, payload) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(payload.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  const crcVal = crc32(Buffer.concat([t, payload]));
  crc.writeUInt32BE(crcVal, 0);
  return Buffer.concat([len, t, payload, crc]);
}

const header = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // bit depth
// color type 6: RGBA
// compression 0, filter 0, interlace 0

const raw = Buffer.alloc((W * 4 + 1) * H);
for (let y = 0; y < H; y++) {
  raw[y * (W * 4 + 1)] = 0; // filter type 0
  data.copy(raw, y * (W * 4 + 1) + 1, y * W * 4, (y + 1) * W * 4);
}
const compressed = zlib.deflateSync(raw);

const png = Buffer.concat([
  header,
  pngChunk('IHDR', ihdr),
  pngChunk('IDAT', compressed),
  pngChunk('IEND', Buffer.alloc(0)),
]);

fs.writeFileSync('public/miniapp-icon-144.png', png);
