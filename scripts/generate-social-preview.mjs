import { Resvg } from '@resvg/resvg-js';
import fs from 'fs';
import path from 'path';

const dashB64 = fs.readFileSync('docs/screenshots/dashboard.png').toString('base64');
const mobileB64 = fs.readFileSync('docs/screenshots/mobile-dashboard.png').toString('base64');

const svg = `<svg width="1280" height="640" viewBox="0 0 1280 640" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Background Gradients -->
    <radialGradient id="bgGlowBlue" cx="20%" cy="25%" r="60%">
      <stop offset="0%" stop-color="#0055FF" stop-opacity="0.28" />
      <stop offset="100%" stop-color="#070A12" stop-opacity="0" />
    </radialGradient>
    <radialGradient id="bgGlowEmerald" cx="80%" cy="80%" r="55%">
      <stop offset="0%" stop-color="#10B981" stop-opacity="0.22" />
      <stop offset="100%" stop-color="#070A12" stop-opacity="0" />
    </radialGradient>
    <linearGradient id="cardBorder" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#3B82F6" stop-opacity="0.6" />
      <stop offset="50%" stop-color="#1E293B" stop-opacity="0.8" />
      <stop offset="100%" stop-color="#10B981" stop-opacity="0.4" />
    </linearGradient>
    <filter id="shadow" x="-10%" y="-10%" width="130%" height="130%">
      <feDropShadow dx="0" dy="16" stdDeviation="24" flood-color="#000000" flood-opacity="0.6" />
    </filter>
    <clipPath id="dashboardClip">
      <rect x="620" y="70" width="600" height="420" rx="16" />
    </clipPath>
    <clipPath id="mobileClip">
      <rect x="520" y="240" width="170" height="340" rx="20" />
    </clipPath>
  </defs>

  <!-- Base Canvas Background -->
  <rect width="1280" height="640" fill="#070A12" />
  <rect width="1280" height="640" fill="url(#bgGlowBlue)" />
  <rect width="1280" height="640" fill="url(#bgGlowEmerald)" />

  <!-- Subtle Grid Pattern -->
  <g opacity="0.06" stroke="#FFFFFF" stroke-width="1">
    <line x1="0" y1="80" x2="1280" y2="80" />
    <line x1="0" y1="160" x2="1280" y2="160" />
    <line x1="0" y1="240" x2="1280" y2="240" />
    <line x1="0" y1="320" x2="1280" y2="320" />
    <line x1="0" y1="400" x2="1280" y2="400" />
    <line x1="0" y1="480" x2="1280" y2="480" />
    <line x1="0" y1="560" x2="1280" y2="560" />
    <line x1="160" y1="0" x2="160" y2="640" />
    <line x1="320" y1="0" x2="320" y2="640" />
    <line x1="480" y1="0" x2="480" y2="640" />
    <line x1="640" y1="0" x2="640" y2="640" />
    <line x1="800" y1="0" x2="800" y2="640" />
    <line x1="960" y1="0" x2="960" y2="640" />
    <line x1="1120" y1="0" x2="1120" y2="640" />
  </g>

  <!-- RIGHT COLUMN: Application Screenshots Preview -->
  <!-- Main Desktop Window -->
  <rect x="618" y="68" width="604" height="424" rx="18" fill="url(#cardBorder)" filter="url(#shadow)" />
  <rect x="620" y="70" width="600" height="420" rx="16" fill="#0F172A" />
  <image href="data:image/png;base64,${dashB64}" x="620" y="70" width="600" height="420" preserveAspectRatio="xMidYMid slice" clip-path="url(#dashboardClip)" />

  <!-- Mobile Floating Overlay -->
  <rect x="518" y="238" width="174" height="344" rx="22" fill="#0055FF" filter="url(#shadow)" opacity="0.8" />
  <rect x="520" y="240" width="170" height="340" rx="20" fill="#0B132B" />
  <image href="data:image/png;base64,${mobileB64}" x="520" y="240" width="170" height="340" preserveAspectRatio="xMidYMid slice" clip-path="url(#mobileClip)" />

  <!-- Floating Feature Highlight Card -->
  <g transform="translate(860, 480)" filter="url(#shadow)">
    <rect width="360" height="100" rx="16" fill="#0F172A" stroke="#334155" stroke-width="1.5" />
    <circle cx="44" cy="50" r="22" fill="#0055FF" fill-opacity="0.2" stroke="#0055FF" stroke-width="1.5" />
    <text x="44" y="56" font-size="20" text-anchor="middle" fill="#60A5FA" font-family="system-ui, -apple-system, sans-serif">📸</text>
    <text x="82" y="44" font-size="16" font-weight="700" fill="#F8FAFC" font-family="system-ui, -apple-system, sans-serif">AI Receipt Scanner</text>
    <text x="82" y="68" font-size="13" font-weight="500" fill="#94A3B8" font-family="system-ui, -apple-system, sans-serif">Auto-splits dishes with 0% rounding error</text>
  </g>

  <!-- LEFT COLUMN: Brand & Messaging -->
  <!-- Top Category Pill -->
  <g transform="translate(70, 68)">
    <rect width="280" height="32" rx="16" fill="#10B981" fill-opacity="0.15" stroke="#10B981" stroke-opacity="0.5" stroke-width="1.2" />
    <circle cx="18" cy="16" r="4.5" fill="#10B981" />
    <text x="32" y="21" font-size="12" font-weight="700" fill="#34D399" font-family="system-ui, -apple-system, sans-serif" letter-spacing="0.5">OPEN-SOURCE SPLITWISE ALTERNATIVE</text>
  </g>

  <!-- Brand Title -->
  <g transform="translate(70, 155)">
    <!-- Tabby Logo Mark -->
    <rect width="52" height="52" rx="14" fill="#0055FF" />
    <text x="26" y="36" font-size="28" font-weight="900" text-anchor="middle" fill="#FFFFFF" font-family="system-ui, -apple-system, sans-serif">🐱</text>
    <text x="70" y="40" font-size="44" font-weight="900" fill="#FFFFFF" font-family="system-ui, -apple-system, sans-serif" letter-spacing="-1">Tabby</text>
  </g>

  <!-- Catchy Headline -->
  <text x="70" y="240" font-size="34" font-weight="800" fill="#F8FAFC" font-family="system-ui, -apple-system, sans-serif">
    <tspan x="70" dy="0">Split bills with friends,</tspan>
    <tspan x="70" dy="44" fill="#60A5FA">minus the awkward maths.</tspan>
  </text>

  <!-- Key Highlights List -->
  <g transform="translate(70, 345)" font-family="system-ui, -apple-system, sans-serif" font-size="15" font-weight="600" fill="#E2E8F0">
    <g transform="translate(0, 0)">
      <circle cx="8" cy="8" r="4" fill="#0055FF" />
      <text x="24" y="13">📸 Dual AI Vision &amp; Local On-Device OCR Scanner</text>
    </g>
    <g transform="translate(0, 32)">
      <circle cx="8" cy="8" r="4" fill="#10B981" />
      <text x="24" y="13">💰 Exact Minor-Unit Math — Zero Penny Rounding Drift</text>
    </g>
    <g transform="translate(0, 64)">
      <circle cx="8" cy="8" r="4" fill="#F59E0B" />
      <text x="24" y="13">🌐 Multi-Currency with Real-Time Exchange Rates</text>
    </g>
    <g transform="translate(0, 96)">
      <circle cx="8" cy="8" r="4" fill="#8B5CF6" />
      <text x="24" y="13">⚡ 100% Offline Guest Mode &amp; Supabase Realtime Sync</text>
    </g>
  </g>

  <!-- Bottom Tech Stack Pills -->
  <g transform="translate(70, 520)" font-family="system-ui, -apple-system, sans-serif" font-size="13" font-weight="700">
    <!-- React 19 -->
    <rect x="0" y="0" width="94" height="30" rx="8" fill="#1E293B" stroke="#334155" stroke-width="1" />
    <text x="47" y="19" text-anchor="middle" fill="#61DAFB">React 19</text>

    <!-- TypeScript -->
    <rect x="104" y="0" width="105" height="30" rx="8" fill="#1E293B" stroke="#334155" stroke-width="1" />
    <text x="156" y="19" text-anchor="middle" fill="#38BDF8">TypeScript</text>

    <!-- Tailwind v4 -->
    <rect x="219" y="0" width="105" height="30" rx="8" fill="#1E293B" stroke="#334155" stroke-width="1" />
    <text x="271" y="19" text-anchor="middle" fill="#38B2AC">Tailwind 4</text>

    <!-- Supabase -->
    <rect x="334" y="0" width="96" height="30" rx="8" fill="#1E293B" stroke="#334155" stroke-width="1" />
    <text x="382" y="19" text-anchor="middle" fill="#3ECF8E">Supabase</text>

    <!-- 332 Tests -->
    <rect x="440" y="0" width="108" height="30" rx="8" fill="#1E293B" stroke="#334155" stroke-width="1" />
    <text x="494" y="19" text-anchor="middle" fill="#A3E635">332 Tests ✓</text>
  </g>

  <!-- Live Demo URL footer -->
  <text x="70" y="585" font-size="13" font-weight="500" fill="#64748B" font-family="system-ui, -apple-system, sans-serif">
    nikhil9182.github.io/Tabby
  </text>
</svg>`;

const resvg = new Resvg(svg, {
  fitTo: {
    mode: 'width',
    value: 1280,
  },
  font: {
    loadSystemFonts: true,
    defaultFontFamily: 'Segoe UI, Arial, sans-serif',
  },
});

const pngBuffer = resvg.render().asPng();
fs.writeFileSync('docs/social-preview.png', pngBuffer);
console.log('Successfully generated docs/social-preview.png (' + pngBuffer.length + ' bytes)');
