// Generates simple placeholder PNG icons for the Chrome extension.
// Run: node extension/generate-icons.js

const fs = require("fs");
const path = require("path");

// Minimal PNG generator — creates a solid-color square with "JP" text
// These are valid PNG files (1-bit, minimal).
// For production, replace with real designed icons.

function createPngIcon(size) {
  // We'll create a simple canvas-less PNG using raw bytes.
  // This creates a basic blue square icon.

  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); // width
  ihdr.writeUInt32BE(size, 4); // height
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type (RGB)
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const ihdrChunk = makeChunk("IHDR", ihdr);

  // IDAT chunk — raw pixel data
  const rawData = [];
  for (let y = 0; y < size; y++) {
    rawData.push(0); // filter byte
    for (let x = 0; x < size; x++) {
      // Create a gradient blue circle
      const cx = size / 2, cy = size / 2;
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      const radius = size * 0.42;

      if (dist < radius) {
        // Inside circle: gradient from #0ea5e9 to #6366f1
        const t = dist / radius;
        const r = Math.round(14 + t * (99 - 14));
        const g = Math.round(165 + t * (102 - 165));
        const b = Math.round(233 + t * (241 - 233));
        rawData.push(r, g, b);
      } else {
        // Outside: transparent-ish (white for simplicity)
        rawData.push(255, 255, 255);
      }
    }
  }

  const rawBuf = Buffer.from(rawData);
  const zlib = require("zlib");
  const compressed = zlib.deflateSync(rawBuf);
  const idatChunk = makeChunk("IDAT", compressed);

  // IEND chunk
  const iendChunk = makeChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);

  const typeB = Buffer.from(type, "ascii");
  const crcData = Buffer.concat([typeB, data]);

  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcData), 0);

  return Buffer.concat([len, typeB, data, crc]);
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let j = 0; j < 8; j++) {
      c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

const iconsDir = path.join(__dirname, "icons");
if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir, { recursive: true });

[16, 48, 128].forEach((size) => {
  const png = createPngIcon(size);
  const outPath = path.join(iconsDir, `icon${size}.png`);
  fs.writeFileSync(outPath, png);
  console.log(`Created ${outPath} (${png.length} bytes)`);
});
