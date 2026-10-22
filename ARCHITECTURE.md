# Tabby Architecture & Engineering Specification

This document details the software architecture, database design, security model, accounting domain, and multi-user synchronization mechanics of **Tabby**, a modern multi-user expense splitting and personal finance web application built with **React, TypeScript, and Supabase**.

---

## 1. Architectural Philosophy

Tabby is built on four fundamental architectural tenets:

1. **Supabase PostgreSQL as Authoritative Single Source of Truth**:
   All financial records, group memberships, expense splits, settlements, and category assignments reside authoritatively in PostgreSQL. There are no offline write queues, no uncommitted local mutations masquerading as persisted data, and no spreadsheet sync layers. If a database write fails, the UI surfaces an error and allows the user to retry.

2. **Google Authentication via Supabase Auth**:
   Google is used strictly for secure user identity verification. No Google Drive or Google Sheets scopes or access tokens are requested or stored. Users authenticate via standard OAuth 2.0 PKCE / browser flows managed by Supabase Auth.

3. **Financial Integrity & Integer Math**:
   Floating-point arithmetic is strictly prohibited for authoritative monetary transactions. All currency amounts are stored and calculated as integers in **minor currency units** (e.g., cents, pence, yen). Split remainders are deterministically allocated without fractional balance drift.

4. **Row-Level Security (RLS) with Zero Trust**:
   Multi-tenancy and data privacy are enforced at the database layer via PostgreSQL Row Level Security. Clients authenticate with standard public/anon keys; PostgreSQL policies and non-recursive `SECURITY DEFINER` functions guarantee that users can never read, modify, or delete another user's private data or unrelated group expenses.

```mermaid
flowchart TB
    subgraph Client["Client Browser (React 19 + TypeScript + Vite)"]
        subgraph UI["1. Presentation Tier"]
            Views["Views & Pages (Dashboard, Expenses, Groups, Settlements)"]
            Hooks["State Hooks (useExpenses, useGroups, useSettlements, useAuth)"]
        end

        subgraph Domain["2. Domain Accounting Engine"]
            Money["Money & Currency Math (Integer minor units)"]
            Splits["Split Calculator (Equal, Exact, %, Shares)"]
            SettlementEngine["Settlement Engine (Ledger & Allocations)"]
            BalanceEngine["Balance & Debt Engine (Netting & Min-Cash-Flow)"]
        end

        subgraph ServiceLayer["3. Supabase Data Layer"]
            ExpenseService["Expense Service"]
            GroupService["Group Service"]
            SettlementService["Settlement Service"]
            RealtimeService["Realtime Subscription Service"]
            SupabaseClient["Supabase JS Client (Public Anon Key)"]
        end
    end

    subgraph Supabase["Supabase Cloud Platform"]
        Auth["Supabase Auth (Google OAuth 2.0 PKCE)"]
        Postgres["PostgreSQL Database"]
        subgraph Security["Security & Logic"]
            RLS["Row Level Security Policies"]
            SecDefiner["SECURITY DEFINER Helper Functions"]
            RPC["Atomic Stored Procedures (RPCs)"]
        end
        RealtimeServer["Supabase Realtime Engine (Postgres Changes)"]
    end

    subgraph External["External APIs"]
        Frankfurter["Frankfurter v2 API (Currency Rates)"]
    end

    UI --> Domain
    Domain --> ServiceLayer
    ServiceLayer --> SupabaseClient
    SupabaseClient --> Auth
    SupabaseClient --> Postgres
    SupabaseClient --> RealtimeServer
    Postgres --- Security
    RealtimeServer -.->|WebSocket Notifications| RealtimeService
    RealtimeService -.->|Auto-refresh UI| Hooks
    Money -->|Live / Historical Rates| Frankfurter
```

---

## 2. Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Runtime & Core** | React 19, TypeScript (Strict Mode), Vite 6 |
| **Styling & Components** | Tailwind CSS v4, Lucide React, Radix UI Primitives (shadcn/ui) |
| **Backend & Database** | Supabase PostgreSQL 15+, Supabase Row Level Security (RLS) |
| **Authentication** | Supabase Auth (Google OAuth 2.0 with PKCE) |
| **Multi-User Sync** | Supabase Realtime (WebSocket `postgres_changes`) |
| **Foreign Exchange** | Frankfurter v2 API with multi-tiered caching (Memory + PostgreSQL) |
| **Forms & Validation** | React Hook Form, Zod schema validation |
| **Visualization** | Recharts (Trends, category breakdowns, balance summaries) |
| **Quality & Tests** | Vitest, Testing Library, TypeScript Typechecking |

---

## 3. Database Schema Specification

All tables are defined in schema `public` with UUID primary keys and strict foreign key relationships:

### Core Tables

State after migration `20261023000004_schema_cleanup.sql`. Money is always `*_minor BIGINT` (integer minor units) next to a 3-letter `currency`.

1. **`profiles`**: `id` (= `auth.users.id`), `display_name`, `avatar_url`, `email`, `preferred_currency` (display currency).
   `email` is a deliberate copy of `auth.users.email`: the client cannot read `auth.users`, and friend lookup (`find_profile_by_email`) needs it. Indexed on `lower(trim(email))`.

2. **`groups`**: `name`, `description`, `default_currency`, `image_url`, `created_by`, `archived_at`.

3. **`group_members`**: `group_id`, `user_id`, `role` (`owner`/`admin`/`member`), `status` (`active`/`invited`/`removed`), `joined_at`. `UNIQUE (group_id, user_id)`.

4. **`group_invitations`**: `group_id`, `invited_email`, `invited_by`, `role`, `status`, unique `token`, `expires_at`, `accepted_by`, `accepted_at`.

5. **`friendships`**: one canonical row per pair, `user_id_1 < user_id_2`, `UNIQUE (user_id_1, user_id_2)`, `status`, `action_user_id`.

6. **`group_expenses`** (both group and friend expenses):
   - Context: `context_type` is `'group'` (with `group_id`, no `friendship_id`) or `'direct'` (with `friendship_id`, no `group_id`), enforced by `group_expenses_context_check`.
   - Money: `amount_minor` + `currency` (the transaction, never rewritten).
   - Conversion snapshot: `reporting_currency`, `exchange_rate`, `exchange_rate_date`, `exchange_rate_source`, `reporting_amount_minor` (see §8.1).
   - Also `paid_by`, `category_id`, `split_type`, `expense_date`, `created_by`, `deleted_at`.

7. **`expense_splits`**: `group_expense_id`, `user_id`, `share_minor` (sums to the expense's `amount_minor`), optional `weight` / `percentage_basis_points`. `UNIQUE (group_expense_id, user_id)`.

8. **`settlements`**: `context_type` + `group_id` / `friendship_id` (same check as expenses), `from_user_id`, `to_user_id`, `amount_minor` + `currency` (what was paid), optional `applied_currency` + `applied_amount_minor` with `exchange_rate`, `exchange_rate_date`, `exchange_rate_source` for cross-currency payments, `settlement_date`, `notes`, `deleted_at`.

9. **`personal_expenses`**: solo expenses visible only to `owner_id`.

10. **`currency_rates_cache`**: one row per `(base_currency, quote_currency, rate_date)`, shared by all users.

---

## 4. Row Level Security (RLS) & Non-Recursive Security Model

PostgreSQL RLS ensures complete isolation between unrelated users and groups. To eliminate recursive policy evaluation issues, PostgreSQL `SECURITY DEFINER` functions execute membership lookups with restricted execution context:

### Security Helper Functions
- `public.is_group_member(group_id UUID, user_id UUID) RETURNS BOOLEAN`: Checks active membership in `group_members`.
- `public.can_admin_group(group_id UUID, user_id UUID) RETURNS BOOLEAN`: Validates `admin` role or group creator status.
- `public.is_expense_participant(expense_id UUID, user_id UUID) RETURNS BOOLEAN`: Verifies whether user is payer or split recipient.

### Security Invariants
- **Profile Isolation**: Users can update only their own profile (`id = auth.uid()`), while reading display names of users sharing a group.
- **Group Isolation**: Users can select, view, or participate only in groups where `is_group_member(id, auth.uid())` is true.
- **Financial Privacy**: Expenses, splits, and settlements are strictly inaccessible to any user not belonging to the associated group.
- **Audit Tamper Proofing**: Unauthenticated or unauthorized clients cannot mutate existing settlement records.

---

## 5. Atomic Stored Procedures (RPCs)

To guarantee transactional consistency when creating relational hierarchies, atomic PostgreSQL RPC functions are deployed:

1. **`create_group_with_owner(group_name, group_currency, group_description)`**:
   - Creates the group record.
   - Atomically inserts the calling user as the initial `admin` member in `group_members`.
   - Returns the created group model.

2. **`create_group_expense_with_splits(expense_data, splits_data)`**:
   - Verifies the creator and payer are authorized group members.
   - Inserts the expense header record into `group_expenses`.
   - Inserts all individual split items into `expense_splits`.
   - Asserts that $\sum \text{allocated\_cents} = \text{amount\_cents}$.
   - Executes in a single ACID transaction; any split mismatch automatically rolls back the entire operation.

3. **`accept_group_invitation(invitation_id)`**:
   - Validates pending status and caller's matching email.
   - Inserts the new member into `group_members`.
   - Updates invitation status to `accepted`.

---

## 6. Realtime Multi-User Notification Architecture

Tabby uses Supabase Realtime to push live changes across all active sessions and devices:

```mermaid
sequenceDiagram
    autonumber
    actor Alice as Alice (Client A)
    participant PostgREST as Supabase Postgres
    participant Realtime as Supabase Realtime Engine
    actor Bob as Bob (Client B)

    Alice->>PostgREST: Add expense ($60 dinner)
    PostgREST-->>Alice: 201 Created (Expense + Splits)
    PostgREST->>Realtime: WAL event (group_expenses INSERT)
    Realtime-->>Bob: WebSocket event (INSERT group_expenses)
    Bob->>Bob: Trigger reactive query refresh
    Bob->>PostgREST: Fetch latest group expenses & balances
    PostgREST-->>Bob: Latest balances (Alice +$30, Bob -$30)
```

- When any group member records an expense or settlement, Supabase Realtime broadcasts change payloads on channel `group:<group_id>`.
- Client hooks (`useExpenses`, `useSettlements`, `useGroups`) subscribe to relevant group channels and automatically trigger server revalidation.
- Debounced refresh prevents duplicate queries when batched split records arrive.

---

## 7. Financial Accounting & Domain Calculations

### Integer Minor Units
To eliminate binary floating-point errors (e.g. `0.1 + 0.2 === 0.30000000000000004`), all internal representations and database columns store integer cents:
- \$12.50 is stored as `1250`.
- ¥1,000 is stored as `1000` (zero-decimal currency).
- Display formatting converts integer minor units to user-facing decimals at render time.

### Split Strategies
- **Equal**: Minor units divided evenly by $N$. Remainders $R = \text{Total} \pmod N$ are distributed to the first $R$ participants deterministically.
- **Exact Amounts**: Explicit per-person allocations; validator asserts $\sum \text{allocated} = \text{total}$.
- **Percentages**: Basis points ($10{,}000 = 100.00\%$) ensure precision.
- **Proportional Shares**: Fractional weightings computed and rounded to minor units.

### Greedy Debt Simplification
When enabled for a group, Tabby computes net balances for all members and runs a bipartite minimum-cash-flow algorithm:
1. Calculate net balance for each member: $\text{Net}_u = \sum \text{Paid}_u - \sum \text{Owed}_u$.
2. Separate into creditors ($\text{Net} > 0$) and debtors ($\text{Net} < 0$).
3. Greedily match maximum debtor with maximum creditor until all balances are zeroed, yielding at most $N - 1$ settlement transactions.

---

## 8. Currency & Foreign Exchange Architecture

- **Primary Source**: Frankfurter API v2 (`https://api.frankfurter.dev/v2/`).
- **Multi-Tiered Caching**:
  1. **L1 (In-Memory)**: Active session map for instant lookups during rapid form inputs.
  2. **L2 (PostgreSQL Cache)**: `currency_rates_cache` table shared across all group users, minimizing external API calls.
- **Rate Freezing**: When an expense is recorded in a foreign currency, the exact conversion rate is permanently recorded on the `group_expenses` record (`exchange_rate` column). Future fluctuations never alter historical debts.

### 8.1 Conversion policy

Two currencies are never confused:

- **Transaction currency**: what an expense or settlement was actually recorded in (`currency` + `amount_minor`). It is never rewritten.
- **Display currency**: the user's preference (`profiles.preferred_currency`). Changing it only changes how amounts are *shown*.

| What | Policy | Rate used |
| --- | --- | --- |
| **Balances (who owes whom)** | Kept **per transaction currency**. A USD share creates a USD debt; a USD settlement reduces a USD debt. Raw amounts in different currencies are never added. | None. The ledger never converts. |
| **Balance totals shown to the user** | Each currency bucket is converted once to the display currency and summed, shown with `≈`. | **Latest** rate (current indicative value). |
| **Reports (spending history)** | Each expense share is converted to the display currency. | Rate on the **expense date**. The stored snapshot is reused when its target matches the display currency. |
| **Cross-currency settlement** | Paid amount + currency are stored as-is. The amount applied to the debt (`applied_amount_minor` in `applied_currency`) is converted **once** at recording time and stored with the rate, rate date and source. | Rate on the **settlement date**, frozen on the record. |

Rules:

1. Same currency → amount returned unchanged, no network call.
2. A missing rate is **never** treated as 1:1 and never substituted with another date's rate. The original amount stays visible with a "conversion unavailable" state and a retry.
3. Rates are `target per 1 source`: `converted = original × rate`, scaled by each currency's minor-unit precision (from `CURRENCY_INFO`, else `Intl` ISO 4217 data). Rounding is half-away-from-zero, applied once per converted bucket.
4. Frankfurter carries the previous business day's rate forward for weekends and holidays and returns the effective date; that date is what Tabby records and shows.
5. Legacy rows keep their recorded amount and currency. Snapshot metadata that cannot be recovered is marked `exchange_rate_source = 'unavailable'`; it is never back-filled with an invented rate.

---

## 9. Security & Deployment

- **API Keys**: Only `VITE_SUPABASE_URL` and the public `VITE_SUPABASE_PUBLISHABLE_KEY` (or `anon` key) are bundled in the frontend application. The `service_role` key is strictly excluded.
- **Service Worker / PWA**: The service worker caches static assets (HTML, CSS, JS, fonts) for instant loading, but explicitly bypasses caching for all Supabase API and WebSocket requests (`/rest/v1`, `/auth/v1`, `/realtime/v1`).
- **GitHub Pages Single Page App Routing**: Build output copies `dist/index.html` to `dist/404.html` and handles SPA client-side routing, enabling direct links and OAuth callback redirects (`/auth/callback`) to load without 404 errors.
