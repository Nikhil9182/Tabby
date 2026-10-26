# Contributing to Tabby 🐱

Thank you for your interest in contributing to Tabby! Tabby is an open-source, privacy-first, multi-currency expense-sharing and bill-splitting progressive web app.

We welcome all kinds of contributions: bug fixes, new features, UI/UX polish, performance enhancements, documentation improvements, and translations.

---

## ⚡ Zero-Friction Quickstart (No API Keys Required)

You do **not** need a Supabase backend or any API keys to start developing on Tabby!

Tabby features a complete **Guest Mode** powered by browser IndexedDB. You can develop, test, and preview the full UI, mathematical split algorithms, debt simplification, spending reports, and on-device receipt scanning 100% locally.

```bash
# 1. Fork and clone the repository
git clone https://github.com/<your-username>/Tabby.git
cd Tabby

# 2. Install dependencies
npm install

# 3. Start the Vite development server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser. Select **"Continue as Guest"** to immediately access the full application with local data persistence.

---

## 🏗️ Architecture & Project Structure

Tabby separates pure domain logic from framework and UI components:

```
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

## 🧪 Testing & Code Quality

Tabby maintains high automated test coverage. Before submitting a PR, ensure that all checks pass cleanly:

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

## 🚀 Pull Request Workflow

1. **Fork the repo** and create your branch from `master`:
   ```bash
   git checkout -b feature/my-new-feature
   # or
   git checkout -b fix/issue-description
   ```

2. **Make your changes**:
   - Write clean, modern TypeScript and React code.
   - Use Tailwind CSS 4 utility classes matching the existing design language.
   - Keep commits focused and descriptive (e.g. `feat(receipts): add image rotate tool before scanning` or `fix(splits): correct fractional distribution with 3 payers`).
   - Do **not** include automated assistant attribution trailers (such as `Co-Authored-By: Claude`) in commit messages.

3. **Verify locally**:
   Ensure `npm test` and `npx tsc -b` exit with code 0.

4. **Push to your fork and submit a Pull Request**:
   - Fill out the PR template describing the problem and your solution.
   - Link any relevant issues (e.g. `Closes #42`).
   - GitHub Actions will automatically run CI checks against your PR.

---

## 💡 Good First Issues & Roadmap

Contributors actively search GitHub using the filter `is:issue is:open label:"good first issue"`. Below are 5 high-impact, well-scoped tasks with instructions on where in the code to look. 

If you'd like to work on one, feel free to open a PR or comment on the corresponding issue!

---

### 1. 🌐 Internationalization (i18n): Multi-Language Support
* **Labels**: `good first issue`, `enhancement`, `help wanted`
* **Goal**: Support Spanish, German, French, or Hindi locale strings so non-English speakers can use Tabby comfortably.
* **Where to look in the code**:
  * [`src/features/settings/settings-page.tsx`](src/features/settings/settings-page.tsx): Add a "Language" selector in the Preferences section alongside the existing Display Currency selector.
  * [`src/domain/money/money.ts`](src/domain/money/money.ts): Already contains locale-aware currency and decimal formatting utilities (`Intl.NumberFormat`).
  * Create `src/i18n/`: Add lightweight JSON dictionary maps (`en.json`, `es.json`, `de.json`, `fr.json`, `hi.json`) and a typed `useTranslation()` hook or provider in [`src/app/providers.tsx`](src/app/providers.tsx).
* **Acceptance Criteria**:
  * Key navigation tabs (Expenses, Groups, Friends, Reports, Settings) and common buttons ("Add Expense", "Settle Up") update dynamically upon selecting a language.
  * Selection persists in `localStorage` or user profile settings.

---

### 2. 📄 Export to PDF: Downloadable & Printable Group Summary
* **Labels**: `good first issue`, `enhancement`
* **Goal**: Add a "Print / Download PDF" summary option alongside the existing CSV and JSON backup exports.
* **Where to look in the code**:
  * [`src/features/groups/group-detail-page.tsx`](src/features/groups/group-detail-page.tsx): Add an "Export Summary as PDF" button in group header actions.
  * [`src/features/reports/reports-page.tsx`](src/features/reports/reports-page.tsx): Add a monthly spending report print button.
  * [`src/features/settings/settings-page.tsx`](src/features/settings/settings-page.tsx): Card 4 ("Data Export") currently exports CSV and full JSON backup.
  * Implementation can use a clean, styled `@media print` CSS print stylesheet or client-side PDF utility.
* **Acceptance Criteria**:
  * Generates a clean, formatted layout containing: Group/Trip title, date range, expense breakdown, and the final simplified "Who Owes Whom" debt settlement table.

---

### 3. ✂️ Receipt Image Pre-Crop / Rotate Tool
* **Labels**: `good first issue`, `enhancement`, `ai-vision`
* **Goal**: When users take mobile camera photos of receipts, they can sometimes be rotated 90° or have noisy table backgrounds. Provide a quick interactive canvas rotate and crop tool prior to triggering AI/OCR scanning.
* **Where to look in the code**:
  * [`src/components/receipts/receipt-scanner-dialog.tsx`](src/components/receipts/receipt-scanner-dialog.tsx): Step 1 (Upload/Preview step).
  * [`src/services/image/image-compression.ts`](src/services/image/image-compression.ts): Already handles in-memory `<canvas>` resizing and compression. Can easily incorporate a 90° rotation transform and crop bounding coordinates.
* **Acceptance Criteria**:
  * Add a 90° rotate button (`RotateCw` icon from Lucide) and an optional crop box.
  * The resulting cropped/rotated canvas output is passed to `parseReceipt()`.

---

### 4. 🏷️ Custom Expense Categories & Emoji Picker
* **Labels**: `good first issue`, `enhancement`
* **Goal**: Allow users to define custom expense categories (e.g. "Rent 🏠", "Pet Care 🐱", "Concert 🎟️") beyond the default predefined categories.
* **Where to look in the code**:
  * [`src/domain/models/types.ts`](src/domain/models/types.ts): Check the `Category` interface (`id`, `name`, `icon`, `color`).
  * [`src/services/guest/indexed-db.ts`](src/services/guest/indexed-db.ts): Dexie `categories` store for guest mode.
  * [`src/features/expenses/expense-form.tsx`](src/features/expenses/expense-form.tsx): Category selector dropdown with a `+ Add Custom Category` modal trigger.
  * [`src/features/settings/settings-page.tsx`](src/features/settings/settings-page.tsx): Category management section.
* **Acceptance Criteria**:
  * Custom categories persist locally in IndexedDB (for guests) and sync with Supabase (for cloud users).
  * Custom categories appear with their custom icon in the Expense list, expense details, and report charts.

---

### 5. 📱 Group QR Code Sharing
* **Labels**: `good first issue`, `enhancement`
* **Goal**: When friends are hanging out in person, let them scan a QR code from a friend's phone to instantly open Tabby and join the group with zero typing.
* **Where to look in the code**:
  * [`src/features/groups/group-detail-page.tsx`](src/features/groups/group-detail-page.tsx): Add a "Share QR Code" button next to "Add Expense" or in the group menu.
  * Deep link route: Formatted as `${baseUrl}#/groups/:id` or an invite code deep link.
  * Render an SVG QR code modal with a "Copy Link" fallback button.
* **Acceptance Criteria**:
  * Clicking "Share QR Code" opens a dialog displaying a crisp QR code.
  * Scanning the QR code with another mobile phone opens Tabby and displays the group view.

---

## 📋 Code of Conduct

Tabby is an open and welcoming community. Please treat fellow contributors with respect, patience, and empathy. Be kind, constructive in code reviews, and focus on helping each other build great software.

---

## ❓ Need Help?

Feel free to open an issue or start a discussion on GitHub if you have questions or want to propose an architecture change before writing code. We're happy to help!
