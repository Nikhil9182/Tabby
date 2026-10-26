# 🚀 Tabby Launch & Promotion Kit

This document contains ready-to-copy, high-converting posts and PR submissions for launching Tabby across Hacker News, Reddit, and curated open-source directories.

---

## 1. 🟠 Hacker News (Show HN)

* **Where to submit**: [news.ycombinator.com/submit](https://news.ycombinator.com/submit)
* **Title**: `Show HN: Tabby – Open-source Splitwise alternative with AI receipt scanning & multi-currency`
* **URL**: `https://nikhil9182.github.io/Tabby/`
* **First Comment / Text Body** *(if submitting as text or as the immediate founder comment)*:

```markdown
Hey HN,

Like many of you, I got increasingly fed up with Splitwise adding artificial 10-second cooldown timers, capping free users to 3 expenses per day, and pushing a \$40/year subscription just to split rent and restaurant dinners with friends.

So I built Tabby: a fast, privacy-first, open-source expense sharing PWA that solves the real annoyances of shared tabs:

1. Exact Integer Minor-Unit Math: Floating-point math usually causes split totals to drift (\$10 split 3 ways becomes \$3.33 × 3 = \$9.99). Tabby stores money strictly in integer minor units (cents, paise, yen) and deterministically allocates remainders down to the penny.

2. Dual-Engine Receipt Scanning: Camera photos are sent to a Supabase Edge Function running Google Gemini Vision to extract store names, line items, discounts, and taxes into structured splits. If offline or in guest mode, it automatically and silently falls back to on-device Tesseract.js OCR.

3. True Multi-Currency: If you travel together, a \$50 debt remains a \$50 debt. Tabby never converts amounts destructive in the database; it fetches daily European Central Bank rates to show converted balances and locks snapshots at settlement time.

4. 100% Offline Guest Mode: You can use the entire app right now without creating an account or providing an email. Everything is stored locally in IndexedDB (Dexie). If you decide to sign in with Google later, your local tab merges cleanly into Supabase Postgres.

5. Privacy First: No third-party ads, no tracking cookies, and Postgres Row-Level Security (RLS) guarantees users can only access expenses they are explicit participants in.

The tech stack is React 19, TypeScript, Tailwind CSS 4, Vite, Supabase (Auth/Postgres/Edge Functions), and Vitest (332 tests passing).

Live demo (works immediately in Guest Mode): https://nikhil9182.github.io/Tabby/
Source Code (MIT): https://github.com/nikhil9182/Tabby

Would love your feedback, bug reports, and thoughts on what features you'd like to see next!
```

---

## 2. 🔴 Reddit Communities

---

### A. r/selfhosted

* **Subreddit**: `r/selfhosted`
* **Post Type**: Link / Text Post
* **Title**: `I got tired of Splitwise's 3-expense daily limit and ads, so I built Tabby: an open-source, offline-first alternative with receipt scanning`
* **Body**:

```markdown
Hey r/selfhosted,

After Splitwise introduced aggressive limits on free tiers (3 expenses per day, 10-second delay countdowns, and intrusive ads), my friends and I were looking for a clean, self-hostable alternative that wasn’t clunky.

I built **Tabby** (MIT licensed), and wanted to share it with the community:

**Key Features:**
- **Zero-Setup Guest Mode**: Run and use it 100% offline in browser memory and IndexedDB. You don't even need a backend server running to track expenses and split bills with friends.
- **Self-Hostable Backend**: When you want multi-device cloud sync and Google OAuth, connect it to your own self-hosted Supabase instance (schema migrations and edge functions are provided in the repo).
- **Dual-Engine Receipt Scanning**: Central server-side Gemini Vision OCR for line-item extraction with automatic on-device fallback to local Tesseract.js when offline.
- **Mathematically Strict**: No floating-point rounding bugs. Every calculation uses integer minor units with deterministic remainder distribution.
- **True Multi-Currency**: Store expenses in original currencies (EUR, USD, INR, JPY, GBP, etc.) with live European Central Bank exchange rates.
- **PWA**: Installable on iOS, Android, macOS, and Linux as a standalone web app.

- **Live Demo (Guest Mode requires no signup)**: https://nikhil9182.github.io/Tabby/
- **GitHub Repo (MIT)**: https://github.com/Nikhil9182/Tabby

Feedback, pull requests, and self-hosting suggestions are very welcome!
```

---

### B. r/reactjs & r/webdev

* **Subreddit**: `r/reactjs` (or `r/webdev`)
* **Title**: `Building an offline-first Splitwise alternative with React 19, Tailwind v4, IndexedDB, and Supabase Realtime`
* **Body**:

```markdown
Hey everyone,

Over the past few months, I built **Tabby**, an open-source expense sharing app (Splitwise alternative), and wanted to share some interesting technical problems and architectural decisions we tackled:

### 1. Integer Financial Math & Remainder Allocation
Financial apps that use floating-point numbers quickly accumulate rounding bugs ($10.00 / 3 = $3.3333333333...). In Tabby, all currency is stored as integer minor units (`1000` for $10.00). When dividing, fractional remainders are allocated deterministically to payers, guaranteeing that `sum(splits) === totalMinor` down to the exact penny in every transaction.

### 2. Dual-Engine Receipt Scanning (Cloud AI + Local WASM)
We wanted smart receipt scanning without paying monthly subscription fees:
- When online & authenticated: An Edge Function calls Google Gemini Vision to extract store name, line items, discounts, and taxes in ~1-2 seconds.
- When offline or guest: Tabby silently falls back to on-device Tesseract.js (WebAssembly) OCR with custom regex heuristics to parse line items.

### 3. Frictionless Guest Mode -> Cloud Migration
Users hate signing up before testing an app. We built a full **Guest Mode** powered by browser IndexedDB (Dexie). You can use 100% of the app offline. When the user signs in with Google OAuth later, a migration service merges local IndexedDB records into Supabase Postgres with foreign key resolution and conflict deduplication.

### 4. Greedy Cash-Flow Settlement Algorithm
To settle debts among groups (e.g. 6 people on a road trip), Tabby calculates pairwise net balances and runs a greedy cash-flow simplification algorithm to minimize total bank transfers needed to bring everyone to zero balance.

### 5. Tech Stack
- **Framework**: React 19 + TypeScript + Vite
- **Styling**: Tailwind CSS 4 + Radix UI primitives
- **State & Data**: TanStack Query + Supabase Realtime + Dexie (IndexedDB)
- **Testing**: 332 unit & integration tests running via Vitest

- **Live App**: https://nikhil9182.github.io/Tabby/
- **GitHub**: https://github.com/Nikhil9182/Tabby

We just added a `CONTRIBUTING.md` with several curated `good first issue` tasks (i18n, PDF export, receipt crop tool). Would love code reviews and community contributions!
```

---

### C. r/SideProject & r/opensource

* **Subreddit**: `r/SideProject` (or `r/opensource`)
* **Title**: `I built an open-source Splitwise alternative with AI receipt scanning, zero ads, and offline guest mode`
* **Body**:

```markdown
Hi all!

Fed up with Splitwise putting artificial wait screens and 3-expense daily limits on free accounts, I spent the last few weeks building an open-source, privacy-first alternative: **Tabby**.

**What makes it different:**
- **No ads & no paywalls**: Completely free and open-source under the MIT license.
- **Instant Guest Mode**: You can open the site on your phone right now, create expenses, and split tabs without creating an account or handing over your email.
- **Smart Receipt Scanning**: Take a picture of your receipt, and it automatically extracts dishes and prices so you can assign specific items to specific friends.
- **Real Multi-Currency**: Perfect for traveling with friends from different countries—debts stay in their original currency with live exchange rates.
- **PWA Support**: Tap "Add to Home Screen" on iOS/Android for a native app feel.

Check out the live demo: https://nikhil9182.github.io/Tabby/
GitHub repository: https://github.com/Nikhil9182/Tabby

Let me know what you think and what features would make this your daily expense splitter!
```

---

## 3. 📑 Pull Requests for Curated "Awesome" Lists

---

### A. awesome-selfhosted

* **Repo**: `awesome-selfhosted/awesome-selfhosted`
* **Section**: `Money, Budgeting & Management`
* **Position**: Alphabetical under the section (between `Silverstrike` and `Tricount`/`Wallos`)
* **Markdown Entry**:

```markdown
- [Tabby](https://nikhil9182.github.io/Tabby/) - Privacy-first, multi-currency expense sharing and bill-splitting app with dual-engine AI and offline OCR receipt scanning. ([Source Code](https://github.com/nikhil9182/Tabby)) `MIT` `Nodejs/Docker`
```

* **PR Title**: `Add Tabby to Money, Budgeting & Management`
* **PR Description**:

```markdown
### What does this PR do?
Adds **Tabby**, an open-source, privacy-first alternative to Splitwise for group and friend expense splitting with multi-currency math and on-device/cloud receipt scanning.

- **Name**: Tabby
- **Website / Demo**: https://nikhil9182.github.io/Tabby/
- **Repository**: https://github.com/Nikhil9182/Tabby
- **License**: MIT
- **Category**: Money, Budgeting & Management
```

---

### B. awesome-supabase

* **Repo**: `supabase-community/awesome-supabase`
* **Section**: `Projects / Showcase` (or `Open Source Projects`)
* **Markdown Entry**:

```markdown
- [Tabby](https://github.com/nikhil9182/Tabby) - Open-source Splitwise alternative built with React 19, Tailwind CSS 4, Supabase (Auth, Postgres RLS, Realtime), and Gemini Edge Functions. [Demo](https://nikhil9182.github.io/Tabby/)
```

* **PR Title**: `Add Tabby to Open Source Projects / Showcase`
* **PR Description**:

```markdown
### Project Submission
- **Project Name**: Tabby
- **Repository**: https://github.com/Nikhil9182/Tabby
- **Live Demo**: https://nikhil9182.github.io/Tabby/
- **Description**: An open-source expense-sharing and bill-splitting PWA leveraging Supabase Auth, Postgres Row-Level Security, Realtime subscriptions, and Supabase Edge Functions for AI receipt parsing.
- **License**: MIT
```

---

### C. awesome-react

* **Repo**: `enaqx/awesome-react`
* **Section**: `Demo Apps` or `Applications`
* **Markdown Entry**:

```markdown
- [Tabby](https://github.com/Nikhil9182/Tabby) - Modern expense sharing and bill splitting PWA with React 19, Tailwind CSS 4, IndexedDB offline guest mode, and multi-currency math. [Demo](https://nikhil9182.github.io/Tabby/)
```

* **PR Title**: `Add Tabby to Applications / Demo Apps`
* **PR Description**:

```markdown
### Project Submission
Adds Tabby, a production-grade React 19 PWA with 330+ Vitest tests, demonstrating offline-first IndexedDB storage, pure mathematical domain engines, and multimodal AI edge integration.

- **Demo**: https://nikhil9182.github.io/Tabby/
- **Source**: https://github.com/Nikhil9182/Tabby
- **License**: MIT
```
