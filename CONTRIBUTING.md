# Contributing to Tabby

Thank you for your interest in contributing to Tabby. Tabby is an open-source, privacy-first, multi-currency expense-sharing and bill-splitting progressive web application.

We welcome all kinds of contributions: bug fixes, new features, UI improvements, performance enhancements, documentation updates, and translations.

---

## Local Setup (No API Keys Required)

You do not need a Supabase backend or API keys to start developing on Tabby.

Tabby features a full Guest Mode powered by browser IndexedDB. You can develop, test, and preview the complete UI, mathematical split algorithms, debt simplification, spending reports, and on-device receipt scanning 100% locally.

```bash
# 1. Fork and clone the repository
git clone https://github.com/<your-username>/Tabby.git
cd Tabby

# 2. Install dependencies
npm install

# 3. Start the Vite development server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser. Select **"Continue as Guest"** to immediately access the application with local data persistence.

---

## Architecture & Project Structure

Tabby separates pure domain logic from framework and UI components:

```text
src/
├── domain/             # Pure TypeScript domain logic (100% testable, zero DOM/React deps)
│   ├── balance-engine.ts       # Greedy debt simplification algorithm
│   ├── money.ts                # Integer minor-unit arithmetic (zero floating-point errors)
│   ├── multi-currency.ts       # Cross-currency conversions and rate snapshots
│   ├── splits.ts               # Equal, exact, percentage, and item-based split calculators
│   └── receipts/               # Line-item parsers and discrepancy reconcilers
├── features/           # Feature pages and route-level components
│   ├── expenses/               # Expense list, itemized editors, split dialogs
│   ├── friends/                # 1-on-1 friend tabs, balances, and direct settlements
│   ├── groups/                 # Group tabs, member management, and shared expenses
│   ├── reports/                # Visual analytics and spending breakdown charts
│   ├── settlements/            # Settle-up forms and recorded payment histories
│   └── settings/               # Display currency, dark mode, export tools, scanner status
├── components/         # Shared design system components (Radix + Tailwind CSS 4)
│   ├── receipts/               # Receipt scanner dialog, live camera, item assigner
│   └── ui/                     # Buttons, cards, modals, dialogs, dropdowns
├── services/           # External I/O and storage abstractions
│   ├── ai/                     # Gemini Vision client and discrepancy reconciler
│   ├── exchange-rates/         # European Central Bank rate fetcher & memory cache
│   ├── guest/                  # Dexie / IndexedDB offline store & cloud migration
│   ├── ocr/                    # Tesseract.js client-side OCR engine
│   └── supabase/               # Postgres queries, Auth, and Realtime subscriptions
└── supabase/           # Server-side migrations and Edge Functions
    └── functions/scan-receipt/ # Deno Edge Function calling Gemini Vision API
```

---

## Testing & Code Quality

Tabby maintains high automated test coverage. Before submitting a pull request, ensure all checks pass cleanly:

```bash
# Run unit & integration tests (330+ Vitest tests)
npm test

# Run TypeScript compiler check
npx tsc -b

# Run linter
npm run lint

# Test the production build bundle
npm run build
```

### Writing Tests
- All domain logic (`src/domain/`) should include thorough unit tests.
- Financial arithmetic tests must verify integer minor units (cents, paise, yen) to guarantee zero rounding drift.
- Place tests in `__tests__/` directories adjacent to the files they test (e.g., `feature-name.test.tsx`).

---

## Pull Request Workflow

1. **Fork the repo** and create your branch from `master`:
   ```bash
   git checkout -b feature/my-new-feature
   # or
   git checkout -b fix/issue-description
   ```

2. **Make your changes**:
   - Write clean, modern TypeScript and React code.
   - Use Tailwind CSS 4 utility classes matching the existing design language.
   - Keep commits focused and descriptive (e.g. `feat(receipts): add image rotate tool before scanning`).
   - Do not include automated assistant attribution trailers (such as `Co-Authored-By: Claude`) in commit messages.

3. **Verify locally**:
   Ensure `npm test`, `npm run lint`, and `npx tsc -b` exit with code 0.

4. **Submit a Pull Request**:
   - Fill out the PR template describing the problem and your solution.
   - Link any relevant issues (e.g. `Closes #1`).
   - GitHub Actions will automatically run CI checks against your PR.

---

## Good First Issues & Roadmap

Beginner-friendly tasks are actively tracked in GitHub Issues with the `good first issue` label:

### 1. Internationalization (i18n): Multi-Language Support ([#1](https://github.com/Nikhil9182/Tabby/issues/1))
* **Labels**: `good first issue`, `enhancement`, `help wanted`
* **Goal**: Support Spanish, German, French, or Hindi locale strings so non-English speakers can use Tabby comfortably.
* **Code locations**:
  * [`src/features/settings/settings-page.tsx`](src/features/settings/settings-page.tsx): Add a "Language" selector in Preferences.
  * [`src/domain/money/money.ts`](src/domain/money/money.ts): Locale-aware currency and decimal formatting utilities.
  * Add translation dictionary maps in `src/i18n/` and a typed provider in [`src/app/providers.tsx`](src/app/providers.tsx).

### 2. Export to PDF: Downloadable & Printable Group Summary ([#2](https://github.com/Nikhil9182/Tabby/issues/2))
* **Labels**: `good first issue`, `enhancement`, `help wanted`
* **Goal**: Add a "Print / Download PDF" summary option alongside existing CSV and JSON backup exports.
* **Code locations**:
  * [`src/features/groups/group-detail-page.tsx`](src/features/groups/group-detail-page.tsx): Header action for summary export.
  * [`src/features/reports/reports-page.tsx`](src/features/reports/reports-page.tsx): Monthly spending report print layout.
  * Uses a clean `@media print` print stylesheet or client-side rendering.

### 3. Custom Expense Categories ([#3](https://github.com/Nikhil9182/Tabby/issues/3))
* **Labels**: `good first issue`, `enhancement`, `help wanted`
* **Goal**: Allow users to define custom expense categories (e.g. "Rent", "Pet Care", "Concert") beyond the default predefined categories.
* **Code locations**:
  * [`src/domain/models/types.ts`](src/domain/models/types.ts): `Category` interface.
  * [`src/services/guest/indexed-db.ts`](src/services/guest/indexed-db.ts): Dexie `categories` store for guest mode.
  * [`src/features/expenses/expense-form.tsx`](src/features/expenses/expense-form.tsx): Category selector dropdown with "+ Add Custom Category" option.

### 4. Group QR Code Sharing ([#4](https://github.com/Nikhil9182/Tabby/issues/4))
* **Labels**: `good first issue`, `enhancement`, `help wanted`
* **Goal**: Enable friends to scan a QR code from another device to immediately join a shared group without typing URLs.
* **Code locations**:
  * [`src/features/groups/group-detail-page.tsx`](src/features/groups/group-detail-page.tsx): "Share QR Code" button.
  * Deep link route: `#/groups/:id` with SVG QR code rendering.

### 5. Receipt Image Pre-Crop / Rotate Tool ([#5](https://github.com/Nikhil9182/Tabby/issues/5))
* **Labels**: `good first issue`, `enhancement`
* **Goal**: Provide an interactive 90-degree rotate and crop tool in the receipt preview dialog prior to OCR or AI scanning.
* **Code locations**:
  * [`src/components/receipts/receipt-scanner-dialog.tsx`](src/components/receipts/receipt-scanner-dialog.tsx): Step 1 (Upload/Preview).
  * [`src/services/image/image-compression.ts`](src/services/image/image-compression.ts): In-memory canvas manipulation.

---

## Code of Conduct

Tabby is an open and welcoming project. Treat fellow contributors with respect, patience, and empathy. Be constructive in code reviews and help newcomers get started.

---

## Questions & Support

Feel free to open an issue or discussion on GitHub if you have questions or want to propose an architecture change before writing code.
