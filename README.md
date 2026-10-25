<div align="center">

<img src="public/favicon.svg" alt="Tabby logo" width="96" height="96" />

# Tabby

**Split bills with friends, minus the awkward maths.**

A Splitwise-style expense tracker for friends, flatmates and trips, with real multi-currency support and on-device receipt scanning.<br />
Built with React 19, TypeScript, Tailwind CSS 4, and Supabase. Fork it and make it your own.

[**Live Demo**](https://nikhil9182.github.io/Tabby/) · [Features](#-features) · [Screenshots](#-screenshots) · [Quick Start](#-quick-start) · [How It Works](#-how-it-works) · [Architecture](#-architecture)

[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)](https://vite.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-38B2AC?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres_·_Auth_·_Realtime-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com/)
[![Tested with Vitest](https://img.shields.io/badge/tested_with-Vitest_295_tests-6E9F18?logo=vitest&logoColor=white)](https://vitest.dev/)

<br />

<p align="center">
  <img src="docs/screenshots/dashboard.png" alt="Tabby Dashboard" width="92%" style="border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.3);" />
</p>

</div>

---

## 💡 Why Tabby?

Splitting costs sounds simple until someone pays in dollars, someone else in rupees, three people settle up a week later, and no one wants to type in a 15-item restaurant bill. Tabby keeps a running tab of **who owes whom**, and keeps the numbers mathematically correct:

- **📸 Instant receipt scanning.** Snap a photo of any receipt. Tabby detects items, quantities, taxes, tips, and discounts locally in your browser.
- **💰 No rounding drift.** Money is stored strictly as integer cents (or paise, or yen), and splits always add up to the exact total down to the single penny.
- **🌐 No currency mix-ups.** A $50 debt stays a $50 debt. Totals are converted for display using live rates, never added together raw.
- **⚡ Guest mode included.** Try the full app immediately without signing in. Data lives in local browser storage (IndexedDB) and merges into your cloud account when you sign in.
- **🛡️ Private by design.** Postgres row-level security ensures you only ever see expenses you're directly part of.

---

## 📸 Screenshots

<div align="center">

### Receipt Scanning & Smart Bill Splitting
*Extract restaurant receipts client-side with Tesseract.js OCR and assign individual dishes to friends.*

<p align="center">
  <img src="docs/screenshots/receipt-scanner.png" alt="Receipt Scanner" width="85%" style="border-radius: 10px;" />
</p>

<br />

### Mobile-Ready & Visual Analytics
*Seamless responsiveness on phone and desktop, plus detailed breakdown of monthly spending trends.*

| 📱 Mobile-First Experience | 📊 Spending Reports & Analytics |
| :---: | :---: |
| <img src="docs/screenshots/mobile-dashboard.png" alt="Mobile Dashboard" width="280px" style="border-radius: 12px;" /> | <img src="docs/screenshots/reports.png" alt="Reports Page" width="520px" style="border-radius: 8px;" /> |

<br />

### Instant Onboarding
*Jump straight in with Guest Mode or sign in with Google OAuth.*

<p align="center">
  <img src="docs/screenshots/welcome.png" alt="Welcome Onboarding" width="80%" style="border-radius: 8px;" />
</p>

</div>

---

## ✨ Features

| | |
| :--- | :--- |
| 📸 **Receipt OCR scanner** | Take a photo or upload a receipt. Client-side OCR detects store name, item lines, GST/VAT taxes, tips, and discounts with automatic discrepancy safeguards. |
| 🧮 **Smart bill splitting** | Split bills equally, by exact amounts, by percentage, by shares, or assign individual receipt dishes to specific friends with proportional tax allocation. |
| 👤 **Guest mode** | Test and use Tabby with zero signup. Data persists in browser IndexedDB and smoothly merges with your account when you sign in with Google. |
| 👥 **Friends and groups** | Keep a continuous tab with one friend, or create groups for road trips, flatmates, or holidays. The balances never cross-contaminate. |
| 🤝 **Simplified debt settlement** | Record payments, see balances update instantly, and follow smart suggestions using a greedy cash-flow algorithm that requires the fewest transfers. |
| 🌍 **True multi-currency** | Add expenses in any currency and see balances converted at real-time exchange rates. Settle a USD debt in INR with rate snapshots locked at payment time. |
| 📊 **Reports & CSV export** | Monthly trends, category breakdowns, and friend/group split distributions with one-click CSV export. |
| ⚡ **Realtime sync** | Multi-device sync powered by Supabase Realtime—new expenses and settlements appear instantly without page reloads. |
| 📱 **Installable PWA** | Works offline and installs as a progressive web app on iOS, Android, macOS, and Windows. |
| 🔐 **Row-level security** | Enforced at the Postgres database layer. No user can read, insert, or alter an expense they are not an explicit participant of. |

---

## 🚀 Quick Start

You'll need **Node.js 20+**, a free [Supabase](https://supabase.com) project, and a [Google Cloud](https://console.cloud.google.com) project for OAuth sign-in. It takes about 10 minutes.

### 1. Clone and install

```bash
git clone https://github.com/Nikhil9182/Tabby.git
cd Tabby
npm install
```

### 2. Set up the database

In your Supabase project, open the **SQL Editor** and run each migration in [`supabase/migrations/`](supabase/migrations) **in numerical order**:

| # | Migration File | Description |
| :-: | :--- | :--- |
| 1 | `20261022000001_initial_schema.sql` | Core schema, user profile trigger, default categories |
| 2 | `20261022000002_row_level_security.sql` | Postgres Row-Level Security policies on all tables |
| 3 | `20261022000003_rpc_functions.sql` | Atomic RPC functions for groups and expense creation |
| 4 | `20261022000004_splitwise_direct_expenses.sql` | Friendships and one-to-one direct balances |
| 5 | `20261023000001_friend_profile_lookup.sql` | Secure profile lookup for adding friends by email |
| 6 | `20261023000002_direct_expense_rls.sql` | Direct expense access controls |
| 7 | `20261023000003_multi_currency.sql` | Multi-currency storage, preference and settlement rate locking |
| 8 | `20261023000004_schema_cleanup.sql` | Index optimization and policy cleanup |

> 💡 **Using the Supabase CLI?** Simply run `supabase link` followed by `supabase db push`.

### 3. Configure Google OAuth

1. Go to **Google Cloud Console → APIs & Services → Credentials** and create an **OAuth Client ID** (Web Application).
2. Add Supabase's redirect URI (from **Supabase → Authentication → Providers → Google**, e.g., `https://<project-ref>.supabase.co/auth/v1/callback`) to **Authorized redirect URIs**.
3. In Supabase, enable **Google** provider and enter your Client ID and Client Secret.
4. Under **Supabase → Authentication → URL Configuration**, add redirect URLs:
   - `http://localhost:5173/**` (development)
   - `https://<your-username>.github.io/<repo>/**` (production)

### 4. Configure environment variables

```bash
cp .env.example .env
```

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-anon-key
```

### 5. Launch the development server

```bash
npm run dev
```

Open <http://localhost:5173> and click **Continue as Guest** or sign in with Google. Run `npm run db:inspect` anytime to verify your database connectivity.

---

## 🧠 How It Works

```mermaid
flowchart LR
  subgraph Client["Browser · React 19 SPA"]
    UI["Pages & Components<br/>(Tailwind 4 + shadcn)"] --> Hooks["TanStack Query Hooks"]
    OCR["Tesseract.js OCR<br/>(Client-Side Worker)"] --> UI
    Hooks --> Domain["Domain Layer<br/>money · splits · balance engine"]
    Hooks --> Services["Services Layer"]
    GuestStore["IndexedDB Guest Store"] <--> Hooks
  end

  Services -->|OAuth Sign-in| Auth[(Supabase Auth)]
  Services -->|Atomic RPCs & Queries| DB[(PostgreSQL + RLS)]
  DB -->|Live Change Subscriptions| Realtime[(Supabase Realtime)]
  Realtime --> Hooks
  Services -->|Daily ECB FX Rates| FX[Frankfurter API]
```

### 🔬 Engineering Highlights

- **💰 Integer Minor Unit Math:** Every monetary calculation is strictly integer-based (cents, paise, yen). Fractions and remainders are allocated deterministically using largest-remainder distribution, ensuring zero-drift splits ([`src/domain/money`](src/domain/money), [`src/domain/splits`](src/domain/splits)).
- **📸 Local Browser OCR:** Receipt scanning runs 100% on-device via web workers with Tesseract.js. No receipt images are uploaded to external cloud AI APIs, preserving user privacy.
- **🌐 Dual-Ledger Currency Policy:** Balances are tracked per currency independently. Cross-currency debts snapshot exchange rates at the moment of payment to protect historical records from fluctuating exchange rates ([policy doc](ARCHITECTURE.md#81-conversion-policy)).
- **🧭 Greedy Debt Simplification:** Reduces a tangled web of group debts to the minimum number of transactions using a graph cash-flow algorithm ([`balance-engine.ts`](src/domain/balances/balance-engine.ts)).
- **🧪 295 Passing Tests:** Comprehensive Vitest test suite covering multi-currency edge cases, settlement snapshots, receipt parsing heuristics, and guest data migrations.

---

## 🧱 Codebase Structure

```text
src/
├── app/            # App shell, router definitions, global providers
├── components/     # UI building blocks (ui/ = shadcn-style primitives, receipts/ = OCR modal)
├── domain/         # Pure business logic: money math, receipt parser, splits, balances
├── features/       # Feature pages: dashboard, expenses, friends, groups, reports, settings
├── hooks/          # Data hooks powered by TanStack Query
├── lib/            # Supabase client, database types, utility helpers
├── services/       # OCR service, Supabase adapters, Frankfurter currency service
└── styles/         # Tailwind CSS v4 design tokens and theme variables
supabase/migrations # Production SQL schema migrations, RLS policies, and RPCs
```

---

## 📜 Available Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Start local Vite development server at <http://localhost:5173> |
| `npm run build` | Type-check TypeScript and build production bundle to `dist/` |
| `npm test` | Run all 295 Vitest unit and integration tests |
| `npm run lint` | Run fast static code analysis with oxlint |
| `npm run preview` | Preview production build locally |
| `npm run db:inspect` | Inspect Supabase database tables and RLS status |
| `npm run deploy` | Build and deploy directly to GitHub Pages |

---

## 🔐 Privacy & Security

- All database access is gated by Postgres Row-Level Security policies; the client only holds the public anon key.
- Authentication uses Google OAuth through Supabase; Tabby never collects or stores passwords.
- Receipt images scanned with OCR are processed entirely on your device in browser memory and are never uploaded or stored on servers.
- Zero tracking or analytics cookies. Full policy available in [`public/privacy.html`](public/privacy.html).

---

<div align="center">

Built with care by [**Nikhil Bansal**](https://nikhil9182.github.io/) · [GitHub](https://github.com/Nikhil9182)

If Tabby helped simplify your shared expenses, consider giving it a ⭐!

</div>
