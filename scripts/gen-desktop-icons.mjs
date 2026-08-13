// Generate the desktop app icon and tray icons from the reporter logo mark.
// Run once: `node scripts/gen-desktop-icons.mjs`
import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';

const OUT = 'apps/desktop/build';

// The app icon: teal rounded square with the aperture mark (matches the web Logo).
const appSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect x="32" y="32" width="448" height="448" rx="112" fill="#0e8a8a"/>
  <circle cx="256" cy="256" r="120" fill="none" stroke="#ffffff" stroke-width="34"/>
  <circle cx="256" cy="256" r="42" fill="#ffffff"/>
  <g stroke="#ffffff" stroke-width="28" stroke-linecap="round">
    <path d="M256 84 v40"/><path d="M256 388 v40"/><path d="M84 256 h40"/><path d="M388 256 h40"/>
  </g>
</svg>`;

// The tray icon: a compact solid mark that reads at menubar size.
const traySvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <circle cx="256" cy="256" r="150" fill="none" stroke="#0e8a8a" stroke-width="52"/>
  <circle cx="256" cy="256" r="60" fill="#0e8a8a"/>
</svg>`;

await mkdir(OUT, { recursive: true });

await sharp(Buffer.from(appSvg)).resize(512, 512).png().toFile(`${OUT}/icon.png`);
await sharp(Buffer.from(traySvg)).resize(32, 32).png().toFile(`${OUT}/tray.png`);
await sharp(Buffer.from(traySvg)).resize(64, 64).png().toFile(`${OUT}/tray@2x.png`);

console.log(`Wrote ${OUT}/icon.png, tray.png, tray@2x.png`);
