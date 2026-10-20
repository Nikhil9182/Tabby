# 🐾 Tabby — Expense Splitter & Personal Finance

> **Offline-first, zero-backend expense splitting and personal finance web app powered by Google Drive & Google Sheets.**

[![React](https://img.shields.io/badge/React-19.0-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6.x-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Dexie](https://img.shields.io/badge/Dexie.js-IndexedDB-blue)](https://dexie.com/)
[![PWA](https://img.shields.io/badge/PWA-Installable-0D9488)](https://web.dev/progressive-web-apps/)
[![Vitest](https://img.shields.io/badge/Vitest-Passing-green?logo=vitest&logoColor=white)](https://vitest.dev/)
[![License](https://img.shields.io/badge/License-MIT-amber.svg)](LICENSE)

---

## 🌟 What is Tabby?

**Tabby** is a privacy-respecting, zero-subscription expense splitting application designed for roommates, group trips, couples, and personal finance tracking.

### The Problem with Existing Split Apps
Traditional expense-splitting tools suffer from:
- **Server Lock-in & Privacy Hazards**: Your personal financial relationships and spending habits reside on closed proprietary databases.
- **Aggressive Paywalls & Subscriptions**: Features like receipt scanning, currency conversion, and search are frequently locked behind monthly fees.
- **Fragile Offline Support**: When you lose cell service on a remote trip or flight, most apps fail to load or corrupt pending entries.

### The Tabby Philosophy
1. **Zero Proprietary Backend**: Tabby runs 100% in your browser. There is no custom backend server, no user tracking, and no proprietary database.
2. **User Data Sovereignty**: All your data is stored locally in your browser's IndexedDB. When you choose to sync, Tabby connects directly from your browser to **your own Google Drive and Google Sheets** via standard OAuth 2.0.
3. **True Offline-First Architecture**: Create groups, add expenses, split bills, and record debt settlements completely offline. Changes are safely queued in a local persistent outbox and synced automatically when connectivity returns.
4. **Financial Integrity**: Authoritative financial calculations never use floating-point numbers. Tabby uses integer minor units (cents, pence, yen) and immutable event-sourced settlement accounting.

---

## ✨ Core Features

- **🧮 Sophisticated Split Strategies**:
  - **Equal Splits**: Distributed evenly, with fractional pennies deterministically assigned without balance drift.
  - **Exact Amounts**: Explicit per-person allocations validated against the total amount.
  - **Percentage Splits**: Input percentages converted to integer basis points ($10{,}000 = 100.00\%$) for penny-accurate math.
  - **Proportional Shares**: Fractional weights or ratio shares (e.g., 2 shares vs 1 share).
- **🤝 Independent Settlement Accounting**:
  - Debt settlements are recorded as distinct financial transfer events with their own timestamps and audit notes.
  - **Settlements never mutate or overwrite past expense records**, ensuring complete ledger integrity, partial payment flexibility, and clean multi-party audits.
- **⚡ Greedy Debt Simplification**:
  - Group debt simplification algorithm (bipartite minimum cash-flow) reduces tangled web-of-debts to the minimum possible number of direct payments ($N - 1$ maximum).
- **🌍 Multi-Currency & Forex Engine**:
  - Supports 30+ world currencies with dynamic decimal configurations (0, 2, and 3 decimals).
  - Live and historical exchange rate queries via the **Frankfurter v2 API**.
  - **Rate Snapshotting**: When foreign expenses are recorded, exchange rates are frozen and stored on the record so future forex fluctuations never alter past settled debts.
- **📱 Progressive Web App (PWA)**:
  - Fully installable on iOS, Android, macOS, Windows, and Linux with standalone display mode.
  - Custom Service Worker caches app shell and static bundles for instant offline boots.
  - Strict security policy: tokens and authenticated Google APIs are strictly excluded from service worker caches.
- **📊 Reports & Data Mobility**:
  - Visual analytics with Recharts (monthly spending trends, category distributions, net balance charts).
  - One-click full database export (JSON) and report export (CSV).

---

## 🛠️ Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Runtime & Core** | React 19, TypeScript (Strict Mode), Vite |
| **Styling & Icons** | Tailwind CSS v4, Lucide React, Radix UI Primitives (shadcn/ui style) |
| **Local Persistence** | IndexedDB via **Dexie.js** (12 indexed tables, reactive live queries) |
| **Cloud Storage** | Google Drive API v3 & Google Sheets API v4 (direct browser-to-Google OAuth) |
| **Foreign Exchange** | Frankfurter v2 API with multi-tiered caching (Memory, Dexie, LocalStorage) |
| **Forms & Validation** | React Hook Form, Zod runtime schema validators |
| **Charts & Visuals** | Recharts, date-fns |
| **Quality & Tests** | Vitest, React Testing Library, ESLint / Oxlint |

---

## 🚀 Quickstart & Local Installation

### Prerequisites
- Node.js `18.x` or higher (Node 20+ recommended)
- `npm` or `pnpm`

### 1. Clone & Install
```bash
git clone https://github.com/your-username/tabby.git
cd tabby
npm install
```

### 2. Configure Environment (Optional for Google Sync)
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Populate your Google OAuth Client ID (see [Google Cloud Configuration](#-google-cloud-configuration-guide) below):
```env
VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```
*(Note: Tabby is fully operational offline without a Google Client ID. You can also paste your Client ID directly in the in-app Settings UI at any time).*

### 3. Launch Development Server
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

### 4. Build for Production
```bash
npm run build
npm run preview
```

### 5. Run Test Suite
```bash
# Run all unit and integration tests
npx vitest run

# Run tests in watch mode
npx vitest
```

---

## ☁️ Google Cloud Configuration Guide

To enable automated synchronization with your personal Google Drive and Google Sheets, configure an OAuth 2.0 Web Client in the Google Cloud Console:

### Step 1: Create a Google Cloud Project
1. Navigate to the [Google Cloud Console](https://console.cloud.google.com/).
2. Click the project dropdown at the top and select **New Project**.
3. Name your project (e.g., `Tabby Expense Splitter`) and click **Create**.

### Step 2: Enable Required APIs
1. In the navigation menu, go to **APIs & Services** > **Library**.
2. Search for and enable:
   - **Google Drive API**
   - **Google Sheets API**

### Step 3: Configure the OAuth Consent Screen
1. Go to **APIs & Services** > **OAuth consent screen**.
2. Select **External** (or **Internal** if using a Google Workspace organization) and click **Create**.
3. Fill in the app details:
   - **App name**: `Tabby`
   - **User support email**: Your email address
   - **Developer contact information**: Your email address
4. Click **Save and Continue** to advance to **Scopes**.
5. Click **Add or Remove Scopes** and add the following:
   - `https://www.googleapis.com/auth/drive.file` *(Permits Tabby to view and manage only files created by Tabby)*
   - `https://www.googleapis.com/auth/spreadsheets` *(Permits Tabby to read and write spreadsheet ledgers)*
   - `https://www.googleapis.com/auth/userinfo.profile` *(Retrieves your name and avatar)*
   - `https://www.googleapis.com/auth/userinfo.email` *(Retrieves your Google email)*
6. In **Test users**, add your own Google email address (required while the app is in "Testing" status).
7. Save and finish the wizard.

### Step 4: Create OAuth 2.0 Client Credentials
1. Go to **APIs & Services** > **Credentials**.
2. Click **+ Create Credentials** > **OAuth client ID**.
3. Select Application type: **Web application**.
4. Set **Name**: `Tabby Web Client`.
5. Under **Authorized JavaScript origins**, add:
   - `http://localhost:5173` *(Local Vite dev server)*
   - `http://localhost:4173` *(Local Vite preview server)*
   - Your production domain (e.g., `https://tabby.yourdomain.com` or `https://username.github.io`)
6. Click **Create**.
7. Copy the generated **Client ID** (format: `xxxxxxxxxxxx-xxxxxxxxxxxxxxxx.apps.googleusercontent.com`).

### Step 5: Connect in Tabby
Either add it to your `.env` file:
```env
VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```
Or open Tabby in your browser, navigate to **Settings**, and paste your Client ID directly into the Google Cloud configuration field. Click **Connect Google Drive** to authenticate.

---

## 📡 Offline & Sync Architecture

Tabby's synchronization pipeline is designed for intermittent, low-bandwidth, and offline environments:

```
[User Action in UI]
       │
       ▼
[Validate with Domain Engine]
       │
       ▼
[Commit Atomically to Dexie (IndexedDB)]
       │
       ├─────────────────────────────────────────┐
       ▼                                         ▼
[Instant UI Update]                [Enqueue in syncOperations]
(Zero Latency)                     (Status: "pending")
                                                 │
                                                 ▼
                                     [Online & Authenticated?]
                                        ├── NO  ──> (Wait for reconnect)
                                        └── YES ──> [SyncEngine.processOutbox()]
                                                          │
                                                          ▼
                                             [Check Remote OperationLog]
                                                          │
                                                          ▼
                                             [Append Rows to Google Sheet]
                                                          │
                                                          ▼
                                             [Mark Local Outbox "synced"]
```

### Outbox Guarantees
- **At-Least-Once Delivery with Idempotency**: Each mutation generates a unique `operationId`. The remote `OperationLog` sheet records every committed operation. If a network interruption occurs, re-transmitting the operation is a safe no-op.
- **Mutexed Writes per Spreadsheet**: Concurrent background updates targeting the same Google Spreadsheet are serialized via in-memory queues, avoiding write collisions.
- **Soft Deletion**: Entities are flagged with `deletedAt: ISO8601` rather than deleted from sheets, preserving audit trails and propagating deletions cleanly across offline devices.

---

## 🧪 Testing Guide

### 1. Automated Test Suite
Tabby has an extensive test suite verifying mathematical correctness, split remainders, settlements, debt simplification, and validation schemas:
```bash
# Run the complete Vitest suite
npx vitest run

# Run specific domain tests
npx vitest run src/domain/__tests__/money.test.ts
npx vitest run src/domain/__tests__/splits.test.ts
npx vitest run src/domain/__tests__/settlement-regression.test.ts
npx vitest run src/domain/__tests__/balance-engine.test.ts
```

### 2. Manual Testing Walkthrough

#### A. Testing Splits and Math
1. Navigate to **Groups** and create a new group (e.g. `"Ski Trip 2026"`).
2. Add 3 members: Alice, Bob, Charlie.
3. Click **Add Expense** with an amount of `$100.00` paid by Alice.
   - Choose **Equal Split**: Notice each share is calculated down to the exact cent ($33.34, $33.33, $33.33).
   - Change to **Percentage Split**: Enter 50%, 25%, 25%. Notice total balances update accurately.
   - Change to **Shares Split**: Enter 2 shares, 1 share, 1 share.

#### B. Testing Settlements & Balance Netting
1. Go to **Dashboard** or the Group Detail page.
2. Note that Bob owes Alice `$33.33`.
3. Click **Settle Up** (or go to **Settlements > New Settlement**).
4. Record a partial settlement of `$20.00` from Bob to Alice.
5. Verify the updated balance shows Bob still owes Alice `$13.33`.
6. Inspect the original expense: notice it remains **intact and unmodified**; the settlement is logged as its own independent financial transaction.

#### C. Testing Offline Outbox & Background Sync
1. Open browser DevTools (`F12`), switch to the **Network** tab, and toggle throttling to **Offline**.
2. Add a new expense (e.g. `"Groceries - $45.00"`).
3. Notice:
   - The UI updates instantly.
   - The Sync Indicator in the sidebar displays an offline badge with `1 pending operation`.
4. Switch the Network tab back to **Online** (and ensure Google account is connected).
5. Watch the Sync Indicator automatically trigger and complete, clearing the pending queue and recording the row in your remote Google Sheet.

---

## 🌐 Free Static Hosting Guide

Because Tabby has **zero backend servers**, the compiled production bundle (`dist/`) can be hosted for free on any static web host or CDN:

### Option 1: Vercel (Recommended)
1. Push your repository to GitHub.
2. Import the project into [Vercel](https://vercel.com/).
3. Add a `vercel.json` file to the root to support SPA client-side routing:
```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```
4. Add `VITE_GOOGLE_CLIENT_ID` in Vercel **Project Settings > Environment Variables**.
5. Remember to add your Vercel deployment URL to **Authorized JavaScript origins** in Google Cloud Console.

### Option 2: Netlify
1. Import your repository into [Netlify](https://www.netlify.com/).
2. Set build command: `npm run build` and publish directory: `dist`.
3. Create a `public/_redirects` file with:
```
/*    /index.html   200
```
4. Configure your environment variables in Netlify site settings.

### Option 3: GitHub Pages
1. Open the repository's **Settings → Pages → Build and deployment** and set **Source** to **GitHub Actions**. Publishing the source branch's root serves the uncompiled `index.html`, causing `/src/main.tsx` 404 errors and a blank page.
2. Push to `main` or `master`, or run **Actions → Deploy to GitHub Pages → Run workflow**. The included `.github/workflows/deploy.yml` builds the app and publishes only `dist`.
3. The build already uses the case-sensitive base `/Tabby/` and copies `dist/index.html` to `dist/404.html` for client-side route reloads.
4. After deployment succeeds, open https://nikhil9182.github.io/Tabby/. Its HTML should reference `/Tabby/assets/*.js`, never `/src/main.tsx`. If an old page persists, unregister the site's service worker in browser developer tools and reload.

---

## ⚠️ Known Limitations & Google Sheets Considerations

### Account deletion and phone layouts

In **Settings → Delete Tabby account & erase data**, choose either device erasure or device plus owned Google Drive files. Review the exact file list, acknowledge any owned shared ledgers, and type `DELETE` before confirming. Cloud deletion permanently deletes the reviewed owned Tabby spreadsheets and invitation files. It does not delete a Google account, files owned by other people, or copies held by collaborators. Device-only erasure retains Drive files, which can return after reconnecting. The JSON backup includes every local table, including splits and memberships.

Deletion pauses sync in open tabs before erasing records. A partial cloud failure retains local data and leaves sync paused across reloads so erased files are not recreated; reconnect if needed and retry deletion from Settings. After successful erasure, other open tabs return to onboarding. Starting again from onboarding explicitly re-enables local storage and sync.

Phone layouts include bottom safe-area spacing, dialogs that scroll within the visible viewport, wrapping action controls and group tabs, stacked expense/settlement rows, and 16px form fields to prevent iOS focus zoom. The main screens are checked at 320, 375, and 430 pixel frame widths; browser scrollbars make the usable content width slightly smaller.

### Friend requests and group invitations

The **Friends** tab is the main entry point for direct expense sharing. Sending a request emails a Google Drive invitation to a separate `Tabby_Request_*` spreadsheet. It contains the invitation and acceptance response only. The personal expense spreadsheet is never shared. The recipient signs into Tabby with the invited Google email and accepts or declines under **Friends → Requests**.

After acceptance, the sender must have Tabby open and connected to Google. The next sync grants access to the pair or group expense spreadsheet, publishes the accepted member's profile, and activates membership. Requests are polled every 30 seconds while the app is connected; **Refresh requests** also checks immediately. A browser-only GitHub Pages app cannot process acceptance while the sender is offline. Group invitations require separate acceptance even for existing friends.

Each accepted friendship uses a dedicated shared ledger, represented internally as a group with `kind: direct` and excluded from the Groups list. Group ledgers remain separate. Pending, declined, and cancelled requests do not grant financial spreadsheet access or become selectable expense participants. Legacy local contacts require a new invitation; historical expenses are retained.

**Google Cloud setup:** add `https://www.googleapis.com/auth/drive.metadata.readonly` to the OAuth consent configuration alongside the existing `drive.file`, `spreadsheets`, and profile scopes, then reconnect Google in Tabby. Metadata access is needed to discover invitation files shared by another user, which `drive.file` alone cannot reliably discover. This scope allows reading Drive file metadata; the app queries only `Tabby_Request_*` spreadsheets. Configure test users while the OAuth app is in Testing, and complete Google's required verification before wider distribution. Google Workspace sharing policies can prevent invitations to external accounts; failures appear in the request UI.

Invitation identity and activation sheets are protected for the owner. Only the response sheet is editable by the invitee; the expense sheet is shared only after a valid acceptance for the addressed email. Editors cannot reshare through Drive. Existing offline copies cannot be recalled when access is revoked.

Before a production rollout, verify with two Google test accounts: send a friend request, confirm that the expense sheet is inaccessible before acceptance, accept it, sync the owner, create an expense from each account, and confirm both balances. Repeat with a third account in a separate group; also check decline, cancellation, and owner removal. Automated tests mock Google APIs and cannot verify email delivery, OAuth configuration, or Workspace policy.

While Google Sheets provides an extraordinary free, user-owned database, developers and users should keep the following operational characteristics in mind:

1. **Google Sheets API Quotas**:
   - Google enforces a rate limit of **60 read/write requests per minute per user** and 300 per minute per project.
   - Tabby mitigates this by buffering changes in IndexedDB and serializing remote appends in batches. For typical personal or group usage, this limit is never exceeded.
2. **High-Frequency Concurrent Collaboration**:
   - Google Sheets lacks row-level distributed locking. If 10 people in the same group make edits at the exact same second while offline, sync reconciliation applies Last-Write-Wins based on ISO timestamps. Tabby is ideal for personal finance and groups of up to ~50 active participants.
3. **Spreadsheet Size Capacity**:
   - Google Sheets supports up to 10 million cells per document. At Tabby's schema density (~15 columns per record), a single group sheet can comfortably store hundreds of thousands of transactions before reaching capacity.
4. **Third-Party Cookies & Private Windows**:
   - Google Identity Services (GIS) requires cookies for silent token refresh. In strict incognito windows or browsers blocking third-party storage, the user may need to re-authenticate when the 1-hour access token expires.

---

## 📄 License

Tabby is open-source software licensed under the [MIT License](LICENSE).
Built with ❤️ for privacy and financial freedom.
