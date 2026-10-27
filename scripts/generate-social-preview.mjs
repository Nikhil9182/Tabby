import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Tabby Social Preview</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@500;600;700&display=swap" rel="stylesheet">
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    html, body {
      width: 1280px;
      height: 640px;
      overflow: hidden;
      background-color: #05070D;
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #F8FAFC;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    .canvas {
      position: relative;
      width: 1280px;
      height: 640px;
      padding: 44px 54px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: 
        radial-gradient(circle at 10% 15%, rgba(37, 99, 235, 0.28) 0%, rgba(5, 7, 13, 0) 50%),
        radial-gradient(circle at 90% 85%, rgba(16, 185, 129, 0.22) 0%, rgba(5, 7, 13, 0) 50%),
        radial-gradient(circle at 50% 50%, rgba(15, 23, 42, 0.75) 0%, rgba(5, 7, 13, 1) 100%),
        #05070D;
    }

    /* Precision subtle grid */
    .grid-overlay {
      position: absolute;
      inset: 0;
      background-image: 
        linear-gradient(rgba(255, 255, 255, 0.038) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255, 255, 255, 0.038) 1px, transparent 1px);
      background-size: 36px 36px;
      mask-image: radial-gradient(ellipse at 50% 50%, black 45%, transparent 85%);
      pointer-events: none;
    }

    .glow-beam {
      position: absolute;
      width: 600px;
      height: 1px;
      top: 0;
      left: 150px;
      background: linear-gradient(90deg, transparent, rgba(59, 130, 246, 0.8), rgba(52, 211, 153, 0.8), transparent);
    }

    /* LEFT COLUMN */
    .left-col {
      width: 560px;
      height: 100%;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      z-index: 5;
    }

    .brand-bar {
      display: flex;
      align-items: center;
      gap: 14px;
    }

    .logo-container {
      width: 48px;
      height: 48px;
      background: #FFFFFF;
      border-radius: 14px;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.2);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .brand-name {
      font-size: 32px;
      font-weight: 800;
      letter-spacing: -0.035em;
      color: #FFFFFF;
    }

    .badge-open-source {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      padding: 5px 12px;
      border-radius: 999px;
      background: rgba(16, 185, 129, 0.12);
      border: 1px solid rgba(16, 185, 129, 0.35);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.06em;
      color: #34D399;
      text-transform: uppercase;
    }

    .dot-live {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #10B981;
      box-shadow: 0 0 8px #10B981;
    }

    .url-pill {
      font-size: 11px;
      font-weight: 600;
      color: #64748B;
      font-family: 'JetBrains Mono', monospace;
      padding: 4px 10px;
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.06);
    }

    .hero-heading {
      font-size: 41px;
      font-weight: 900;
      line-height: 1.14;
      letter-spacing: -0.04em;
      color: #FFFFFF;
      margin-top: 16px;
      margin-bottom: 14px;
    }

    .gradient-hero {
      background: linear-gradient(135deg, #60A5FA 0%, #38BDF8 40%, #34D399 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      white-space: nowrap;
    }

    .hero-sub {
      font-size: 14.5px;
      line-height: 1.55;
      color: #94A3B8;
      font-weight: 450;
      margin-bottom: 22px;
      max-width: 530px;
    }

    /* 4-Item Feature Grid */
    .features-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px 14px;
      margin-bottom: 22px;
    }

    .feat-card {
      display: flex;
      align-items: center;
      gap: 10px;
      background: rgba(255, 255, 255, 0.035);
      border: 1px solid rgba(255, 255, 255, 0.07);
      padding: 9px 13px;
      border-radius: 10px;
    }

    .feat-icon-badge {
      width: 26px;
      height: 26px;
      border-radius: 7px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .icon-blue { background: rgba(59, 130, 246, 0.18); color: #60A5FA; }
    .icon-green { background: rgba(16, 185, 129, 0.18); color: #34D399; }
    .icon-amber { background: rgba(245, 158, 11, 0.18); color: #FBBF24; }
    .icon-purple { background: rgba(168, 85, 247, 0.18); color: #C084FC; }

    .feat-card-text {
      font-size: 13px;
      font-weight: 700;
      color: #F1F5F9;
      letter-spacing: -0.01em;
    }

    /* Proof Footer */
    .proof-bar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding-top: 16px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
    }

    .pill {
      font-size: 11.5px;
      font-weight: 700;
      color: #94A3B8;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.08);
      padding: 5px 11px;
      border-radius: 6px;
      font-family: 'JetBrains Mono', monospace;
    }

    .pill-green {
      color: #34D399;
      background: rgba(16, 185, 129, 0.1);
      border-color: rgba(16, 185, 129, 0.3);
    }

    /* RIGHT COLUMN - FINTECH UI MOCKUP */
    .right-col {
      width: 580px;
      height: 100%;
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    /* Main Product Card */
    .app-window {
      width: 560px;
      height: 485px;
      background: #090E1A;
      border-radius: 18px;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.12);
      box-shadow: 
        0 30px 70px -15px rgba(0, 0, 0, 0.9),
        0 0 0 1px rgba(255, 255, 255, 0.06),
        0 0 50px rgba(59, 130, 246, 0.15);
      display: flex;
      flex-direction: column;
    }

    /* Window Header */
    .app-header {
      height: 38px;
      background: #0C1222;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 16px;
    }

    .window-controls {
      display: flex;
      align-items: center;
      gap: 7px;
    }

    .w-dot {
      width: 9px;
      height: 9px;
      border-radius: 50%;
    }
    .w-red { background: #EF4444; }
    .w-yellow { background: #F59E0B; }
    .w-green { background: #10B981; }

    .nav-tabs {
      display: flex;
      gap: 16px;
      font-size: 11.5px;
      font-weight: 600;
      color: #64748B;
    }
    .nav-tab-active {
      color: #38BDF8;
      font-weight: 700;
    }

    .user-pill {
      font-size: 11px;
      font-weight: 600;
      color: #94A3B8;
      background: rgba(255, 255, 255, 0.05);
      padding: 3px 8px;
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.08);
    }

    /* App Interior */
    .app-body {
      flex: 1;
      padding: 16px 20px;
      display: flex;
      flex-direction: column;
      gap: 13px;
      background: #070B14;
    }

    /* Balance Hero Banner */
    .balance-banner {
      background: linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.9) 100%);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 14px;
      padding: 14px 18px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .bal-label {
      font-size: 11px;
      font-weight: 700;
      color: #94A3B8;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 3px;
    }

    .bal-amount {
      font-size: 26px;
      font-weight: 900;
      color: #34D399;
      letter-spacing: -0.03em;
      font-family: 'JetBrains Mono', monospace;
    }

    .bal-sub {
      font-size: 11px;
      color: #64748B;
      font-weight: 500;
    }

    .action-btn-group {
      display: flex;
      gap: 8px;
    }

    .app-btn {
      padding: 7px 14px;
      border-radius: 8px;
      font-size: 11.5px;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .app-btn-blue {
      background: #0055FF;
      color: #FFFFFF;
      box-shadow: 0 4px 12px rgba(0, 85, 255, 0.35);
    }
    .app-btn-ghost {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: #E2E8F0;
    }

    /* Expense List Rows */
    .expense-list {
      display: flex;
      flex-direction: column;
      gap: 9px;
    }

    .expense-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: rgba(255, 255, 255, 0.025);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 10px;
      padding: 10px 13px;
    }

    .row-left {
      display: flex;
      align-items: center;
      gap: 11px;
    }

    .cat-avatar {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      background: rgba(59, 130, 246, 0.15);
      border: 1px solid rgba(59, 130, 246, 0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #60A5FA;
      font-size: 14px;
    }

    .cat-title {
      font-size: 12.5px;
      font-weight: 700;
      color: #F1F5F9;
    }

    .cat-meta {
      font-size: 10.5px;
      color: #64748B;
    }

    .row-right {
      text-align: right;
    }

    .row-amount-positive {
      font-size: 13px;
      font-weight: 800;
      color: #34D399;
      font-family: 'JetBrains Mono', monospace;
    }

    .row-sub {
      font-size: 10px;
      color: #64748B;
    }

    /* Floating AI Scanner Receipt Card */
    .receipt-overlay-card {
      position: absolute;
      right: -14px;
      bottom: 12px;
      width: 310px;
      background: rgba(15, 23, 42, 0.95);
      backdrop-filter: blur(20px);
      border: 1.5px solid rgba(59, 130, 246, 0.5);
      border-radius: 16px;
      padding: 14px 17px;
      box-shadow: 
        0 25px 50px -10px rgba(0, 0, 0, 0.9),
        0 0 30px rgba(0, 85, 255, 0.25);
      z-index: 20;
    }

    .card-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 9px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      margin-bottom: 10px;
    }

    .card-top-title {
      font-size: 11.5px;
      font-weight: 800;
      color: #60A5FA;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .card-badge-ai {
      font-size: 9.5px;
      font-weight: 800;
      padding: 2px 7px;
      border-radius: 4px;
      background: rgba(16, 185, 129, 0.15);
      color: #34D399;
      border: 1px solid rgba(16, 185, 129, 0.3);
    }

    .receipt-items {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-bottom: 11px;
    }

    .r-item {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      color: #CBD5E1;
    }
    .r-item-name { font-weight: 600; }
    .r-item-price { font-family: 'JetBrains Mono', monospace; font-weight: 700; }

    .r-discount {
      color: #34D399;
      font-weight: 700;
    }

    .card-settle-strip {
      background: rgba(0, 85, 255, 0.12);
      border: 1px solid rgba(0, 85, 255, 0.3);
      padding: 7px 10px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .settle-text {
      font-size: 10.5px;
      font-weight: 700;
      color: #93C5FD;
    }

    .settle-exact {
      font-size: 10.5px;
      font-weight: 800;
      color: #34D399;
      font-family: 'JetBrains Mono', monospace;
    }
  </style>
</head>
<body>
  <div class="canvas">
    <div class="grid-overlay"></div>
    <div class="glow-beam"></div>

    <!-- LEFT COLUMN -->
    <div class="left-col">
      <div>
        <div class="brand-bar">
          <div class="logo-container">
            <svg width="38" height="38" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
              <g transform="translate(50, 52) rotate(-9) translate(-50, -52)">
                <path d="M 22 38 L 22 33 C 22 29.5 24.5 27 28 27 L 46 27 C 49 27 51.5 29 53.5 32 L 56.5 38 L 73 38 C 76.5 38 79 40.5 79 44 L 79 81 C 79 85 76 87.5 72 87.5 L 28 87.5 C 24 87.5 22 85 22 81 Z" fill="#0043CC" />
                <rect x="28" y="14" width="44" height="40" rx="6" fill="#10B981" />
                <rect x="31" y="17" width="38" height="34" rx="4" fill="none" stroke="#6EE7B7" stroke-width="1.5" />
                <circle cx="50" cy="28" r="6" fill="#D1FAE5" />
                <text x="50" y="31.2" font-size="8.5" font-weight="900" text-anchor="middle" fill="#047857" font-family="system-ui, -apple-system, sans-serif">$</text>
                <path d="M 22 41 C 22 37.5 25 35 28.5 35 L 42.5 35 C 44.5 35 46.5 36.5 48 38.5 C 49 40 50.5 41 52 41 L 53 41 C 54.5 41 56 40 57 38.5 C 58.5 36.5 60.5 35 62.5 35 L 72.5 35 C 76 35 79 37.5 79 41 L 79 81 C 79 84.5 76 87.5 72.5 87.5 L 28.5 87.5 C 25 87.5 22 84.5 22 81 Z" fill="#0055FF" />
                <rect x="30" y="52" width="22" height="4" rx="2" fill="#FFFFFF" fill-opacity="0.95" />
                <rect x="30" y="60" width="38" height="3.5" rx="1.75" fill="#99BBFF" />
                <circle cx="70" cy="54" r="3.5" fill="#FFFFFF" fill-opacity="0.9" />
              </g>
            </svg>
          </div>
          <span class="brand-name">Tabby</span>
          <div class="badge-open-source">
            <span class="dot-live"></span>
            100% Free & Open Source
          </div>
          <span class="url-pill">nikhil9182.github.io/Tabby</span>
        </div>

        <h1 class="hero-heading">
          Split bills with friends.<br>
          <span class="gradient-hero">Without the math or the fees.</span>
        </h1>

        <p class="hero-sub">
          The modern, privacy-first Splitwise alternative. Instant AI receipt itemization, exact integer-minor math, and full offline Guest Mode.
        </p>

        <div class="features-grid">
          <div class="feat-card">
            <div class="feat-icon-badge icon-blue">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                <circle cx="12" cy="13" r="4"></circle>
              </svg>
            </div>
            <span class="feat-card-text">AI Receipt Scanner</span>
          </div>

          <div class="feat-card">
            <div class="feat-icon-badge icon-green">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="m9 12 2 2 4-4"></path>
              </svg>
            </div>
            <span class="feat-card-text">Zero Rounding Drift</span>
          </div>

          <div class="feat-card">
            <div class="feat-icon-badge icon-amber">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="2" y1="12" x2="22" y2="12"></line>
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
              </svg>
            </div>
            <span class="feat-card-text">30+ Real Currencies</span>
          </div>

          <div class="feat-card">
            <div class="feat-icon-badge icon-purple">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
              </svg>
            </div>
            <span class="feat-card-text">Offline Guest Mode</span>
          </div>
        </div>
      </div>

      <div class="proof-bar">
        <span class="pill">React 19</span>
        <span class="pill">TypeScript</span>
        <span class="pill">Tailwind 4</span>
        <span class="pill">Supabase</span>
        <span class="pill pill-green">332 Tests Passed ✓</span>
      </div>
    </div>

    <!-- RIGHT COLUMN -->
    <div class="right-col">
      <!-- Main Application Mockup -->
      <div class="app-window">
        <div class="app-header">
          <div class="window-controls">
            <div class="w-dot w-red"></div>
            <div class="w-dot w-yellow"></div>
            <div class="w-dot w-green"></div>
          </div>
          <div class="nav-tabs">
            <span class="nav-tab-active">Overview</span>
            <span>Friends</span>
            <span>Groups</span>
            <span>Expenses</span>
            <span>Reports</span>
          </div>
          <div class="user-pill">USD ($)</div>
        </div>

        <div class="app-body">
          <!-- Balance Banner -->
          <div class="balance-banner">
            <div>
              <div class="bal-label">Overall Net Balance</div>
              <div class="bal-amount">+$142.50</div>
              <div class="bal-sub">You are owed across 3 groups and 2 friends</div>
            </div>
            <div class="action-btn-group">
              <div class="app-btn app-btn-blue">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                Add Expense
              </div>
              <div class="app-btn app-btn-ghost">Settle Up</div>
            </div>
          </div>

          <!-- Expense List Rows -->
          <div class="expense-list">
            <div class="expense-row">
              <div class="row-left">
                <div class="cat-avatar">🍕</div>
                <div>
                  <div class="cat-title">Trattoria Roma Dinner</div>
                  <div class="cat-meta">Yesterday • Paid by you ($84.50) • 3 people</div>
                </div>
              </div>
              <div class="row-right">
                <div class="row-amount-positive">+$56.33</div>
                <div class="row-sub">you lent</div>
              </div>
            </div>

            <div class="expense-row">
              <div class="row-left">
                <div class="cat-avatar" style="color: #FBBF24; background: rgba(245,158,11,0.15); border-color: rgba(245,158,11,0.3);">🚕</div>
                <div>
                  <div class="cat-title">Airport Taxi Cab</div>
                  <div class="cat-meta">Oct 24 • Paid by Sam ($48.00) • 3 people</div>
                </div>
              </div>
              <div class="row-right">
                <div class="row-amount-positive" style="color: #F87171;">-$16.00</div>
                <div class="row-sub">you owe</div>
              </div>
            </div>

            <div class="expense-row">
              <div class="row-left">
                <div class="cat-avatar" style="color: #34D399; background: rgba(16,185,129,0.15); border-color: rgba(16,185,129,0.3);">🛒</div>
                <div>
                  <div class="cat-title">Weekly Flatmate Groceries</div>
                  <div class="cat-meta">Oct 22 • Paid by you ($124.80) • Flat 4B</div>
                </div>
              </div>
              <div class="row-right">
                <div class="row-amount-positive">+$83.20</div>
                <div class="row-sub">you lent</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Floating AI Scanner Receipt Card -->
      <div class="receipt-overlay-card">
        <div class="card-top">
          <div class="card-top-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path>
            </svg>
            AI Receipt Extraction
          </div>
          <div class="card-badge-ai">Gemini Vision</div>
        </div>

        <div class="receipt-items">
          <div class="r-item">
            <span class="r-item-name">1x Margherita D.O.P</span>
            <span class="r-item-price">$18.50</span>
          </div>
          <div class="r-item">
            <span class="r-item-name">1x Truffle Tagliatelle</span>
            <span class="r-item-price">$26.00</span>
          </div>
          <div class="r-item">
            <span class="r-item-name">2x Peroni Gran Riserva</span>
            <span class="r-item-price">$16.00</span>
          </div>
          <div class="r-item r-discount">
            <span class="r-item-name">Dinner Promo Discount</span>
            <span class="r-item-price">-$10.00</span>
          </div>
        </div>

        <div class="card-settle-strip">
          <span class="settle-text">Auto-assigned to 3 friends</span>
          <span class="settle-exact">Exact $24.83 / ea</span>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;

const tempHtmlPath = path.resolve('temp-preview.html');
fs.writeFileSync(tempHtmlPath, htmlContent, 'utf-8');

const tempPngPath = path.join(process.env.TEMP || 'C:\\Users\\91827\\AppData\\Local\\Temp', 'social-preview-render.png');

console.log('Rendering polished social preview via Chrome headless...');
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const fileUrl = 'file:///' + tempHtmlPath.replace(/\\/g, '/');

const cmd = `"${chromePath}" --headless=new --screenshot="${tempPngPath}" --window-size=1280,640 --hide-scrollbars --force-device-scale-factor=1 "${fileUrl}"`;
execSync(cmd, { stdio: 'inherit' });

// Copy rendered image
fs.copyFileSync(tempPngPath, 'docs/social-preview.png');
fs.copyFileSync(tempPngPath, 'public/og-image.png');

// Cleanup
fs.unlinkSync(tempHtmlPath);
try { fs.unlinkSync(tempPngPath); } catch(e) {}

const stats = fs.statSync('docs/social-preview.png');
console.log(`Successfully generated docs/social-preview.png & public/og-image.png (${stats.size} bytes)`);
