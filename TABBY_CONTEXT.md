# Tabby: project context handoff

Everything a new assistant needs to continue work on Tabby. Written 2026-10-24.

---

## 1. The project

- **What:** Tabby, a Splitwise-style expense-splitting web app (friends, groups, settle up, multi-currency, reports).
- **Owner:** Nikhil Bansal (GitHub `Nikhil9182`, portfolio https://nikhil9182.github.io/).
- **Repo:** https://github.com/Nikhil9182/Tabby (branch `master`). Local path: `D:\Websites\Tabby` (Windows; PowerShell and Git Bash).
- **Live site:** https://nikhil9182.github.io/Tabby/ (GitHub Pages, from the `gh-pages` branch).
- **Stack:** React 19, TypeScript (strict), Vite 8, Tailwind CSS 4, shadcn/Radix UI, TanStack Query, React Hook Form + Zod, Recharts, Vitest + Testing Library.
- **Backend:** Supabase (Postgres with row-level security, Google OAuth through Supabase Auth, Realtime). Project ref `cfxaagxwejritgagmpjb`.
- **Exchange rates:** Frankfurter v2 API (`https://api.frankfurter.dev/v2`).

## 2. How the user works

- Commit, push and deploy only when asked.
- **Never add `Co-Authored-By: Claude`** or any AI attribution to commits or PRs.
- Migrations are run **by the user, manually**, in the Supabase SQL Editor (no Supabase CLI). Write each one as a new file in `supabase/migrations/` and ask them to run it.
- The SQL Editor does **not** honour `BEGIN … COMMIT` as one transaction. Write multi-step migrations as a single `DO $$ … $$` block so they're atomic, and add a read-only `SELECT` summary at the end, since NOTICE messages aren't shown reliably.
- Deploy with `npm run deploy` (builds, then pushes `dist/` to `gh-pages`). After a deploy, users may need Ctrl+Shift+R because of the service worker.
- The user wants simple, Splitwise-like UI and plain, non-technical wording in the app.
- On Windows PowerShell 5.1, write commit messages to a file and use `git commit -F <file>`, because inline quotes break.

## 3. Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server (http://localhost:5173) |
| `npm run build` | `tsc -b` + vite build (copies index.html to 404.html for SPA routing) |
| `npm test` | Vitest (251 tests, all passing) |
| `npx tsc -b` | Type-check |
| `npm run lint` | oxlint (pre-existing warnings only) |
| `npm run deploy` | Publish to GitHub Pages |
| `npm run db:inspect` | Read-only check that all 11 tables are reachable (uses `.env`) |

`.env` holds `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (never a `service_role` key). There is also a `.github/workflows/deploy.yml` Actions deploy, but the user actually deploys with `npm run deploy`.

## 4. Code layout

```text
src/
  app/          router.tsx (routes), providers.tsx
  components/   ui/ (shadcn primitives), currency/, expenses/, groups/, settlements/, layout/ (navbar)
  domain/       pure logic: money/money.ts, money/conversion.ts, splits/, balances/balance-engine.ts
  features/     dashboard, friends, groups, expenses, reports, settlements, settings, auth (welcome)
  hooks/        use-currency, use-expenses, use-groups, use-settlements, use-users, use-friends, use-settle-up, use-settlement-conversion
  services/     supabase/*-service.ts, exchange-rates/exchange-rate-service.ts, currency/currency-service.ts
  lib/          supabase.ts, supabase-types.ts
supabase/migrations/   8 migration files (below)
public/        privacy.html, favicon.svg, google-logo-120.png, google07febc61abc84615.html (Search Console), sw.js, manifest
```

- `ARCHITECTURE.md` holds the schema reference and **§8.1, the currency conversion policy**.
- `README.md` was rewritten for users, forks and the portfolio.

## 5. Database migrations (all applied by the user, in this order)

1. `20261022000001_initial_schema.sql`: core tables, `handle_new_user` trigger, seed categories.
2. `20261022000002_row_level_security.sql`: RLS plus `SECURITY DEFINER` helpers (`is_group_member`, `can_admin_group`, …).
3. `20261022000003_rpc_functions.sql`: `create_group_with_owner`, `create_group_expense_with_splits`, `accept_group_invitation`.
4. `20261022000004_splitwise_direct_expenses.sql`: `friendships` table, direct (friend) expenses and settlements, `create_direct_expense_with_splits`.
5. `20261023000001_friend_profile_lookup.sql`: `find_profile_by_email` RPC, `are_friends`, friends can read each other's profiles, profile backfill.
6. `20261023000002_direct_expense_rls.sql`: `is_friendship_member` and `can_access_direct_expense`; both friends can read and manage direct expenses and splits.
7. `20261023000003_multi_currency.sql`: `profiles.preferred_currency`; settlement `applied_currency`, `applied_amount_minor` and `exchange_rate_source`; flags fake legacy snapshots as `'unavailable'`; `currency_reconciliation_report` view; `record_direct_settlement` gains optional applied and rate parameters.
8. `20261023000004_schema_cleanup.sql`: one atomic `DO` block that:
   - drops redundant and low-cardinality indexes;
   - adds `idx_profiles_email_lookup` on `lower(trim(email))` and a partial `idx_group_expenses_active_date`;
   - replaces duplicate read policies with `group_expenses_select` / `settlements_select` (TO authenticated);
   - drops `settlement_allocations` and `group_members.created_at` (guarded);
   - adds `group_expenses_context_check` and `settlements_context_check`;
   - aborts if any financial total changes.

   It was verified on PGlite (Postgres 16) before the user ran it, and the summary came back fine.

**Schema notes**
- Group and friend expenses both live in `group_expenses`, told apart by `context_type` (`'group'` with `group_id`, or `'direct'` with `friendship_id`).
- Splits live in `expense_splits`; settlements in `settlements`.
- Friendships are one canonical row per pair (`user_id_1 < user_id_2`).

## 6. Key design decisions

- **Money** is integer minor units, with per-currency decimals (`getCurrencyDecimals`: `CURRENCY_INFO`, then `Intl`, then 2).
- **Currency policy** (ARCHITECTURE.md §8.1):
  - The ledger is kept **per transaction currency** (`MoneyBag` = currency → minor units) and is never summed raw across currencies.
  - Balance totals are converted at the **latest** rate and shown with "≈" plus the original breakdown (`BalanceAmount`).
  - Reports and expense history use the **expense-date** rate (`ConvertedAmount`), reusing the stored snapshot when it holds a real rate.
  - A cross-currency settlement stores its paid amount and currency as-is, plus the applied amount in the debt's currency with a frozen rate.
  - A missing rate is never treated as 1:1 and an amount is never relabelled with another currency; the UI shows "unavailable" with a retry.
- **Rate fetching:** `exchangeRateService.getRate(from, to, date?)` returns a `RateQuote`. It throws `ExchangeRateError` (`unsupported` / `network` / `unavailable`), shares in-flight requests, never substitutes another date, and caches in memory and in the `currency_rates_cache` table.
- **Single entry points:**
  - `currencyService` (`services/currency`);
  - `useCurrency()`, whose display currency comes from `profiles.preferred_currency` with a localStorage mirror;
  - `useRates()` and `useDisplayConversion()`.
- **Balance engine:** `calculate*Bag` functions return per-currency bags. `calculateGroupBalances` nets and simplifies each currency separately. `settlementLedgerAmount()` honours the applied amount.
- **Settle up:** the `useSettleUp` hook plus the `SettleUpFields` component, used by the Friends modal and `/settlements/new`.
- **Display names:** `useUsers()` with no IDs loads every profile visible under RLS, so names resolve everywhere.
- **Expense form:** the transaction currency defaults to the group's or the user's currency. Changing it keeps the typed number, with an explicit "Convert" button. A rate snapshot is saved on create and edit.

## 7. What was done this session (in order)

1. Friend-by-email lookup fixed (RLS blocked the profile search; the `find_profile_by_email` RPC replaces it).
2. Privacy policy page (`public/privacy.html`), logo, Google OAuth consent-screen setup, and Search Console verification for both `/Tabby/` and the root portfolio repo (`Nikhil9182.github.io`, commit `5c75876`).
3. Expense form fixes: the `cat_other` invalid UUID, and the "Paid by" React #185 render loop (unstable hook arrays memoised).
4. Direct-expense RLS for splits (they showed "0 participants" and no balance).
5. Participant names and avatars on expense detail.
6. UI simplification: shared Tabs fix, Create Group page, group detail cut to 3 tabs (Expenses / Balances / Members) with Settings behind a gear icon.
7. Reports totals, menu spacing site-wide, names instead of IDs, the notification panel closing on click, and plain-language copy (removed Supabase/PostgreSQL/RLS jargon, the unused Google GSI script and the "Google Drive" description).
8. Full multi-currency conversion (commit `a585ab1`): 39 new tests; removed the dead `settlement-form.tsx` and `expense-new-page.tsx`.
9. Schema cleanup migration (commit `ed9a25b`).
10. README rewrite (commit `45f7a3f`, HEAD of `master`, pushed). The working tree is clean.

## 8. Open items

- **Remove Claude as a contributor (user's pending request):** 13 commits (`b91a338` … `45f7a3f`) still contain `Co-Authored-By: Claude`. The rewrite was blocked by the assistant's safety check, so the user was given these commands to run themselves:
  ```bash
  git branch backup/before-remove-coauthor
  FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch -f --msg-filter "sed '/^Co-Authored-By: Claude/Id'" -- b91a338^..HEAD
  git log --grep="Co-Authored-By: Claude" -i --oneline | wc -l   # expect 0
  git diff backup/before-remove-coauthor HEAD                    # expect nothing
  git push --force-with-lease origin master
  ```
  The portfolio repo commit `5c75876` needs the same steps (`5c75876^..HEAD`). As of writing this hasn't been done yet.
- **Bug, not fixed:** the `handle_new_user` trigger runs `AFTER INSERT OR UPDATE ON auth.users`, so every sign-in overwrites a user's edited display name with their Google name.
- **No `LICENSE` file:** the MIT claim was removed from the README. The user may want to add one.
- **Screenshots:** the README has a commented-out slot for `docs/screenshots/dashboard.png` and `friend.png`.
- **Google OAuth branding verification:** pending on Google's side. Before resubmitting, `prompt: 'consent'` / `access_type: 'offline'` in `src/services/auth/supabase-auth-service.ts` could be removed (offline access isn't used). The consent screen shows the supabase.co domain unless a custom domain or Google Identity Services is used.
- **Untested in the live app:** the new multi-currency UI with real signed-in data.
