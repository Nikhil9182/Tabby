import { Resvg } from '@resvg/resvg-js';
import fs from 'fs';
import path from 'path';

const standardSvg = `<svg width="100" height="100" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="100" height="100" rx="24" fill="#FFFFFF"/>
  <rect x="0.75" y="0.75" width="98.5" height="98.5" rx="23.25" fill="none" stroke="#E2E8F0" stroke-width="1.5"/>
  <g transform="translate(50, 52) rotate(-9) translate(-50, -52)">
    <path d="M 22 38 L 22 33 C 22 29.5 24.5 27 28 27 L 46 27 C 49 27 51.5 29 53.5 32 L 56.5 38 L 73 38 C 76.5 38 79 40.5 79 44 L 79 81 C 79 85 76 87.5 72 87.5 L 28 87.5 C 24 87.5 22 85 22 81 Z" fill="#0043CC"/>
    <rect x="28" y="14" width="44" height="40" rx="6" fill="#10B981"/>
    <rect x="31" y="17" width="38" height="34" rx="4" fill="none" stroke="#6EE7B7" stroke-width="1.5"/>
    <circle cx="50" cy="28" r="6" fill="#D1FAE5"/>
    <text x="50" y="31.2" font-size="8.5" font-weight="900" text-anchor="middle" fill="#047857" font-family="system-ui, -apple-system, Arial, sans-serif">$</text>
    <line x1="34" y1="28" x2="41" y2="28" stroke="#A7F3D0" stroke-width="2.2" stroke-linecap="round"/>
    <line x1="59" y1="28" x2="66" y2="28" stroke="#A7F3D0" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M 22 41 C 22 37.5 25 35 28.5 35 L 42.5 35 C 44.5 35 46.5 36.5 48 38.5 C 49 40 50.5 41 52 41 L 53 41 C 54.5 41 56 40 57 38.5 C 58.5 36.5 60.5 35 62.5 35 L 72.5 35 C 76 35 79 37.5 79 41 L 79 81 C 79 84.5 76 87.5 72.5 87.5 L 28.5 87.5 C 25 87.5 22 84.5 22 81 Z" fill="#0055FF"/>
    <rect x="30" y="52" width="22" height="4" rx="2" fill="#FFFFFF" fill-opacity="0.95"/>
    <rect x="30" y="60" width="38" height="3.5" rx="1.75" fill="#99BBFF"/>
    <circle cx="70" cy="54" r="3.5" fill="#FFFFFF" fill-opacity="0.9"/>
  </g>
</svg>`;

const maskableSvg = `<svg width="100" height="100" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="100" height="100" fill="#FFFFFF"/>
  <g transform="translate(50, 50) scale(0.8) translate(-50, -50)">
    <g transform="translate(50, 52) rotate(-9) translate(-50, -52)">
      <path d="M 22 38 L 22 33 C 22 29.5 24.5 27 28 27 L 46 27 C 49 27 51.5 29 53.5 32 L 56.5 38 L 73 38 C 76.5 38 79 40.5 79 44 L 79 81 C 79 85 76 87.5 72 87.5 L 28 87.5 C 24 87.5 22 85 22 81 Z" fill="#0043CC"/>
      <rect x="28" y="14" width="44" height="40" rx="6" fill="#10B981"/>
      <rect x="31" y="17" width="38" height="34" rx="4" fill="none" stroke="#6EE7B7" stroke-width="1.5"/>
      <circle cx="50" cy="28" r="6" fill="#D1FAE5"/>
      <text x="50" y="31.2" font-size="8.5" font-weight="900" text-anchor="middle" fill="#047857" font-family="system-ui, -apple-system, Arial, sans-serif">$</text>
      <line x1="34" y1="28" x2="41" y2="28" stroke="#A7F3D0" stroke-width="2.2" stroke-linecap="round"/>
      <line x1="59" y1="28" x2="66" y2="28" stroke="#A7F3D0" stroke-width="2.2" stroke-linecap="round"/>
      <path d="M 22 41 C 22 37.5 25 35 28.5 35 L 42.5 35 C 44.5 35 46.5 36.5 48 38.5 C 49 40 50.5 41 52 41 L 53 41 C 54.5 41 56 40 57 38.5 C 58.5 36.5 60.5 35 62.5 35 L 72.5 35 C 76 35 79 37.5 79 41 L 79 81 C 79 84.5 76 87.5 72.5 87.5 L 28.5 87.5 C 25 87.5 22 84.5 22 81 Z" fill="#0055FF"/>
      <rect x="30" y="52" width="22" height="4" rx="2" fill="#FFFFFF" fill-opacity="0.95"/>
      <rect x="30" y="60" width="38" height="3.5" rx="1.75" fill="#99BBFF"/>
      <circle cx="70" cy="54" r="3.5" fill="#FFFFFF" fill-opacity="0.9"/>
    </g>
  </g>
</svg>`;

function renderPng(svg, size) {
  const resvg = new Resvg(svg, {
    fitTo: {
      mode: 'width',
      value: size,
    },
    font: {
      loadSystemFonts: true,
      defaultFontFamily: 'Arial',
    },
  });
  return resvg.render().asPng();
}

const targets = [
  { file: 'public/google-logo-120.png', size: 120, svg: standardSvg },
  { file: 'public/apple-touch-icon.png', size: 180, svg: standardSvg },
  { file: 'public/icon-192.png', size: 192, svg: standardSvg },
  { file: 'public/icon-512.png', size: 512, svg: standardSvg },
  { file: 'public/icon-maskable-512.png', size: 512, svg: maskableSvg },
];

for (const target of targets) {
  const buf = renderPng(target.svg, target.size);
  fs.writeFileSync(target.file, buf);
  console.log(`Rendered ${target.file} (${target.size}x${target.size}) - ${buf.length} bytes`);
}

// Clean up temporary test file
if (fs.existsSync('public/test-120.png')) {
  fs.unlinkSync('public/test-120.png');
}

console.log('All icons generated successfully!');
