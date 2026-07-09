// Generates the PWA icons (pure Node, no dependencies): a timer ring with a
// dot at 12 o'clock — "when the dial reaches the top, it's prayer time".
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");
mkdirSync(outDir, { recursive: true });

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smoothstep = (e0, e1, x) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;

function drawIcon(size, { maskable }) {
  const rgba = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const motif = maskable ? 0.72 : 1; // keep motif inside the maskable safe zone
  const corner = maskable ? 0 : size * 0.21;
  const ringMid = size * 0.325 * motif;
  const ringHalf = size * 0.038 * motif;
  const dotR = size * 0.085 * motif;
  const dotCy = cy - ringMid;
  const aa = Math.max(1.25, size / 256);

  // background gradient stops (emerald-600 → teal-900)
  const top = [5, 150, 105];
  const bottom = [15, 76, 74];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // rounded-rect coverage
      let shape = 1;
      if (!maskable) {
        const qx = Math.abs(x + 0.5 - cx) - (cx - corner);
        const qy = Math.abs(y + 0.5 - cy) - (cy - corner);
        const dist = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - corner;
        shape = 1 - smoothstep(-aa, aa, dist);
      }
      if (shape <= 0) continue;

      const tGrad = y / size;
      let r = lerp(top[0], bottom[0], tGrad);
      let g = lerp(top[1], bottom[1], tGrad);
      let b = lerp(top[2], bottom[2], tGrad);

      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const dCenter = Math.hypot(dx, dy);
      const ring = 1 - smoothstep(ringHalf - aa, ringHalf + aa, Math.abs(dCenter - ringMid));
      const dDot = Math.hypot(x + 0.5 - cx, y + 0.5 - dotCy);
      const dot = 1 - smoothstep(dotR - aa, dotR + aa, dDot);
      const white = Math.max(ring, dot);
      r = lerp(r, 255, white);
      g = lerp(g, 255, white);
      b = lerp(b, 255, white);

      const i = (y * size + x) * 4;
      rgba[i] = Math.round(r);
      rgba[i + 1] = Math.round(g);
      rgba[i + 2] = Math.round(b);
      rgba[i + 3] = Math.round(255 * shape);
    }
  }
  return encodePng(size, size, rgba);
}

writeFileSync(join(outDir, "icon-192.png"), drawIcon(192, { maskable: false }));
writeFileSync(join(outDir, "icon-512.png"), drawIcon(512, { maskable: false }));
writeFileSync(join(outDir, "maskable-512.png"), drawIcon(512, { maskable: true }));
console.log("icons written to", outDir);
