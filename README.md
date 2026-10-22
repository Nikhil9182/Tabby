# 🐾 Tabby — Modern Multi-User Expense Splitting & Finance

> **Real-time, multi-user expense splitting application powered by React, TypeScript, and Supabase.**

[![React](https://img.shields.io/badge/React-19.0-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6.x-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL_&_Auth-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com/)
[![Vitest](https://img.shields.io/badge/Vitest-Passing-green?logo=vitest&logoColor=white)](https://vitest.dev/)
[![License](https://img.shields.io/badge/License-MIT-amber.svg)](LICENSE)

---

## 🌟 What is Tabby?

**Tabby** is a modern, responsive web application inspired by Splitwise, built for roommates, travel groups, couples, and friends.

All financial data is authoritatively stored in **Supabase PostgreSQL** with **Row Level Security (RLS)**, ensuring that group members see identical, synchronized balances across all their devices in real time.

---

## ✨ Core Features

- **🔐 Google Authentication via Supabase Auth**:
  - Secure sign-in with Google OAuth without requesting unnecessary Google Drive or Sheets permissions.
  - Automatic profile creation and session restoration.
- **👥 Multi-User Groups & Realtime Synchronization**:
  - Create groups, invite members, and collaborate in real-time.
  - Real-time updates via Supabase Realtime WebSockets push updates whenever an expense or settlement is created or updated.
- **🧮 Flexible Split Strategies**:
  - **Equal Splits**: Evenly distributed, with remainder cents deterministically allocated to prevent fractional balance drift.
  - **Exact Amounts**: Explicit per-person amounts validated against the total.
  - **Percentages**: Stored in integer basis points ($10{,}000 = 100.00\%$) for penny-accurate math.
  - **Shares / Ratios**: Weighted proportional splits (e.g. 2 shares vs 1 share).
- **🤝 Immutable Settlement Accounting**:
  - Settlements are recorded as distinct financial events between two members.
  - Settlements never mutate or delete historical expense records, preserving a clear audit trail.
- **⚡ Greedy Debt Simplification**:
  - Bipartite minimum cash-flow debt simplification algorithm reduces complex debt webs to the minimum number of direct payments ($N - 1$ maximum).
- **🌍 Multi-Currency & Frankfurter Forex API**:
  - Supports 30+ world currencies.
  - Real-time and historical exchange rates via the **Frankfurter v2 API** (`https://api.frankfurter.dev/v2`).
  - Rate snapshotting: rates are frozen when an expense is recorded so future forex changes never retroactively alter settled debts.
- **🔒 PostgreSQL Row Level Security (RLS)**:
  - Database-level security guarantees that users can only view and modify groups and expenses they belong to.
- **📱 Responsive & Installable (PWA)**:
  - Works seamlessly across mobile, tablet, and desktop devices.
  - Service worker caches application shell and static assets (API responses and tokens are strictly excluded).

---

## 🛠️ Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend Framework** | React 19, TypeScript (Strict Mode), Vite 6 |
| **Styling & Components** | Tailwind CSS v4, Lucide React, Radix UI Primitives (shadcn/ui style) |
| **Backend & Database** | Supabase PostgreSQL 15+, Row Level Security (RLS) |
| **Authentication** | Supabase Auth (Google OAuth 2.0 PKCE flow) |
| **Realtime Sync** | Supabase Realtime (WebSocket `postgres_changes`) |
| **Forex & Exchange** | Frankfurter v2 API with PostgreSQL & In-Memory caching |
| **Validation & Forms** | React Hook Form, Zod schema validation |
| **Data Visualization** | Recharts (Monthly spending trends, category distributions, net balance charts) |
| **Testing** | Vitest, React Testing Library |

---

## 🚀 Getting Started

### Prerequisites
- Node.js `20.x` or higher
- A [Supabase](https://supabase.com) account (free tier works great)
- A [Google Cloud Console](https://console.cloud.google.com) project for Google OAuth

---

### Step 1: Clone and Install Dependencies

```bash
git clone https://github.com/Nikhil9182/Tabby.git
cd Tabby
npm install
```

---

### Step 2: Set Up Supabase Project & Database Schema

1. Go to [supabase.com](https://supabase.com) and create a new project.
2. Open the **SQL Editor** in your Supabase dashboard.
3. Run the SQL migration scripts in order from the `supabase/migrations/` directory:
   - **`supabase/migrations/20261022000001_initial_schema.sql`**: Creates tables (`profiles`, `groups`, `group_members`, `group_expenses`, `expense_splits`, `settlements`, `categories`, `currency_rates_cache`) and triggers.
   - **`supabase/migrations/20261022000002_row_level_security.sql`**: Enables RLS on all tables and creates security definer helper functions and policies.
   - **`supabase/migrations/20261022000003_rpc_functions.sql`**: Creates transactional RPC functions (`create_group_with_owner`, `create_group_expense_with_splits`, `accept_group_invitation`) and enables Supabase Realtime publication.

*(Alternatively, if using the Supabase CLI: run `supabase db push`)*

---

### Step 3: Configure Google OAuth in Supabase

1. In the **Google Cloud Console** (`console.cloud.google.com`):
   - Go to **APIs & Services > Credentials**.
   - Create an **OAuth 2.0 Client ID** (Web application).
   - In Supabase, go to **Authentication > Providers > Google** and copy the **Callback URL (for OAuth)** (e.g. `https://<your-project-ref>.supabase.co/auth/v1/callback`).
   - Paste that Callback URL into **Authorized redirect URIs** in Google Cloud Console.
   - Save and copy your Google **Client ID** and **Client Secret**.
2. In the **Supabase Dashboard**:
   - Go to **Authentication > Providers > Google**.
   - Enable the Google provider.
   - Paste your Google **Client ID** and **Client Secret**.
   - Click **Save**.
3. In **Authentication > URL Configuration**:
   - Add your local dev URL: `http://localhost:5173/**`
   - Add your production URL (e.g. `https://nikhil9182.github.io/Tabby/**`) to **Redirect URLs**.

---

### Step 4: Configure Environment Variables

Create a `.env` file in the project root:

```bash
cp .env.example .env
```

Fill in your Supabase project credentials (found under **Project Settings > API** in Supabase):

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-or-anon-key
```

> **Security Note**: Never expose the Supabase `service_role` key in frontend code or in `.env`. Tabby only requires the public publishable/anon key.

---

### Step 5: Run the Development Server

```bash
npm run dev
```

Open your browser to [http://localhost:5173](http://localhost:5173). Sign in with your Google account to start creating groups and splitting expenses.

---

## 🧪 Testing

Run all unit and integration tests with Vitest:

```bash
npm test
```

To run tests with UI:
```bash
npm run test:ui
```

---

## 🚀 Deploying to GitHub Pages

This repository includes an automated GitHub Actions deployment workflow (`.github/workflows/deploy.yml`).

1. Push your code to GitHub:
   ```bash
   git push origin master
   ```
2. In your GitHub repository:
   - Go to **Settings > Secrets and variables > Actions**.
   - Add the following Repository Secrets:
     - `VITE_SUPABASE_URL`: Your Supabase Project URL.
     - `VITE_SUPABASE_PUBLISHABLE_KEY`: Your Supabase public anon key.
   - Go to **Settings > Pages**:
     - Under **Build and deployment > Source**, select **GitHub Actions**.
3. Trigger the workflow under the **Actions** tab or push a new commit to `master`. Your app will be deployed automatically!

---

## 📂 Project Architecture

```
src/
├── components/          # Reusable UI components & Layout (shadcn/ui style)
│   ├── layout/          # AppLayout, Navbar, ProtectedRoute
│   └── ui/              # Radix/Tailwind primitives (Button, Dialog, Card, etc.)
├── domain/              # Pure domain business logic & financial accounting
│   ├── balance-engine.ts # Net balance calculator & debt simplification
│   ├── money.ts          # Integer minor units, currency formatting, math
│   ├── split-calculator.ts # Equal, exact, percentage, and shares split logic
│   └── validation.ts    # Financial validation invariants
├── features/            # Feature pages & user flows
│   ├── auth/            # Welcome page & OAuth callback handler
│   ├── dashboard/       # Overview, net balances, activity feed
│   ├── expenses/        # Expense forms, detail modals, split selector
│   ├── groups/          # Group management, member invitations, debt graphs
│   ├── settlements/     # Settlement creation & debt history
│   ├── friends/         # Friend list and shared balances
│   └── settings/        # Profile settings & currency preferences
├── hooks/               # React hooks interfacing with the Supabase data layer
│   ├── use-auth.tsx     # Google authentication & session state
│   ├── use-expenses.ts  # Expense data fetching, creation, deletion
│   ├── use-groups.ts    # Group data fetching, creation, member lookup
│   ├── use-settlements.ts # Settlement records & balance updates
│   └── use-sync.tsx     # Realtime connectivity & sync status indicator
├── lib/                 # Supabase client singleton & TypeScript database types
│   ├── supabase.ts      # Centralized Supabase client instance
│   └── supabase-types.ts # TypeScript database definitions
└── services/            # Supabase API services
    ├── auth/            # Supabase Google OAuth service
    ├── exchange-rates/  # Frankfurter API v2 client & rate cache
    └── supabase/        # Supabase service layer (expenses, groups, settlements, etc.)
```

---

## 📄 License

This project is open-source under the [MIT License](LICENSE).
