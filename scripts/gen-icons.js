// Rasterizes assets/logo.svg into the PNGs Expo needs (icons are PNG-only).
// Produces opaque (iOS) + transparent (Android adaptive / splash / delivery) variants.
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const A = path.join(__dirname, '..', 'assets');
const svg = fs.readFileSync(path.join(A, 'logo.svg'), 'utf8');
// Transparent variant: drop the white background rect
const svgT = svg.replace(/<path fill="#FFF"[\s\S]*?\/>/i, '');
const DENSITY = 384;
const transparent = { r: 0, g: 0, b: 0, alpha: 0 };

(async () => {
  // Main app icon — OPAQUE white background (iOS forbids transparency)
  await sharp(Buffer.from(svg), { density: DENSITY })
    .resize(1024, 1024, { fit: 'contain', background: '#ffffff' })
    .png().toFile(path.join(A, 'icon.png'));

  // Full transparent logo (delivery + general use)
  await sharp(Buffer.from(svgT), { density: DENSITY })
    .resize(1024, 1024, { fit: 'contain', background: transparent })
    .png().toFile(path.join(A, 'logo-transparent.png'));

  // Android adaptive foreground — transparent, art padded to the ~62% safe zone
  const inner = await sharp(Buffer.from(svgT), { density: DENSITY })
    .resize(640, 640, { fit: 'contain', background: transparent })
    .png().toBuffer();
  await sharp({ create: { width: 1024, height: 1024, channels: 4, background: transparent } })
    .composite([{ input: inner, gravity: 'center' }])
    .png().toFile(path.join(A, 'adaptive-icon.png'));

  // Splash logo — transparent (splash screen sets the background color)
  await sharp(Buffer.from(svgT), { density: DENSITY })
    .resize(512, 512, { fit: 'contain', background: transparent })
    .png().toFile(path.join(A, 'splash-icon.png'));

  // Web favicon — opaque
  await sharp(Buffer.from(svg), { density: 200 })
    .resize(196, 196, { fit: 'contain', background: '#ffffff' })
    .png().toFile(path.join(A, 'favicon.png'));

  console.log('Generated: icon.png, adaptive-icon.png, logo-transparent.png, splash-icon.png, favicon.png');
})().catch((e) => { console.error(e); process.exit(1); });
