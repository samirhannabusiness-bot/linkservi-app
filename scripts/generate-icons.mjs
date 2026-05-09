import sharp from "sharp";
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "../artifacts/servilink/public");
mkdirSync(publicDir, { recursive: true });

const svgIcon = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${size * 0.22}" fill="#0f172a"/>
  <rect width="${size}" height="${size}" rx="${size * 0.22}" fill="url(#grad)"/>
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0ea5e9;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#22d3ee;stop-opacity:1" />
    </linearGradient>
  </defs>
  <!-- Zap lightning bolt -->
  <polygon
    points="${size*0.58},${size*0.08} ${size*0.28},${size*0.52} ${size*0.50},${size*0.52} ${size*0.42},${size*0.92} ${size*0.72},${size*0.48} ${size*0.50},${size*0.48} ${size*0.58},${size*0.08}"
    fill="white"
    stroke="none"
  />
</svg>
`;

const sizes = [
  { name: "icon-192.png", size: 192 },
  { name: "icon-512.png", size: 512 },
  { name: "apple-touch-icon.png", size: 180 },
  { name: "icon-72.png", size: 72 },
  { name: "icon-96.png", size: 96 },
  { name: "icon-128.png", size: 128 },
  { name: "icon-144.png", size: 144 },
  { name: "icon-152.png", size: 152 },
  { name: "icon-384.png", size: 384 },
  { name: "favicon-32.png", size: 32 },
];

for (const { name, size } of sizes) {
  const svg = Buffer.from(svgIcon(size));
  const out = join(publicDir, name);
  await sharp(svg).png().toFile(out);
  console.log(`✅ ${name} (${size}x${size})`);
}

const maskableSvg = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="#22d3ee"/>
  <polygon
    points="${size*0.58},${size*0.08} ${size*0.28},${size*0.52} ${size*0.50},${size*0.52} ${size*0.42},${size*0.92} ${size*0.72},${size*0.48} ${size*0.50},${size*0.48} ${size*0.58},${size*0.08}"
    fill="#0f172a"
    stroke="none"
  />
</svg>
`;

await sharp(Buffer.from(maskableSvg(512))).png().toFile(join(publicDir, "icon-maskable-512.png"));
await sharp(Buffer.from(maskableSvg(192))).png().toFile(join(publicDir, "icon-maskable-192.png"));
console.log("✅ Maskable icons generated");
console.log("🎉 All icons generated successfully!");
