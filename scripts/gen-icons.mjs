// Generate reporter icon assets from the single canonical mark (matches @reporter/ui Logo).
// Run: node scripts/gen-icons.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

// Canonical mark, colors baked (light-theme accent). viewBox matches Logo.tsx.
const markSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 32 32" fill="none">
  <rect x="2" y="2" width="28" height="28" rx="8" fill="#0e8a8a"/>
  <circle cx="16" cy="16" r="7" fill="none" stroke="#ffffff" stroke-width="2.5"/>
  <circle cx="16" cy="16" r="2.5" fill="#ffffff"/>
  <path d="M16 5 v3 M16 24 v3 M5 16 h3 M24 16 h3" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/>
</svg>`;

// Compact transparent-background variant for the menubar tray (reads better small).
const traySvg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <circle cx="256" cy="256" r="150" fill="none" stroke="#0e8a8a" stroke-width="52"/>
  <circle cx="256" cy="256" r="60" fill="#0e8a8a"/>
</svg>`;

// Standalone SVG favicon (self-contained, baked colors — CSS vars don't apply to favicons).
const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" fill="none">
  <rect x="2" y="2" width="28" height="28" rx="8" fill="#0e8a8a"/>
  <circle cx="16" cy="16" r="7" fill="none" stroke="#ffffff" stroke-width="2.5"/>
  <circle cx="16" cy="16" r="2.5" fill="#ffffff"/>
  <path d="M16 5 v3 M16 24 v3 M5 16 h3 M24 16 h3" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/>
</svg>`;

await mkdir('apps/desktop/build', { recursive: true });
await sharp(Buffer.from(markSvg)).resize(512, 512).png().toFile('apps/desktop/build/icon.png');
await sharp(Buffer.from(traySvg)).resize(32, 32).png().toFile('apps/desktop/build/tray.png');
await sharp(Buffer.from(traySvg)).resize(64, 64).png().toFile('apps/desktop/build/tray@2x.png');
await writeFile('apps/web/public/favicon.svg', faviconSvg);
await sharp(Buffer.from(markSvg)).resize(64, 64).png().toFile('apps/web/public/favicon.png');
console.log('Wrote desktop icons + web favicon (icon.png, tray.png, tray@2x.png, favicon.svg, favicon.png)');
