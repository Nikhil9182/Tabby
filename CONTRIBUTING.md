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

## 💡 Good First Issue Ideas

Looking for something to work on? Here are areas where contributions are actively welcomed:

- 🌐 **Internationalization (i18n)**: Adding multilingual support (Spanish, French, German, Hindi, Japanese, etc.).
- 📄 **PDF / Printable Export**: Generating a printable or PDF summary sheet for group trips or monthly flatmate accounts.
- ✂️ **Receipt Pre-Scan Tools**: Adding an interactive image rotation and cropping canvas to [`receipt-scanner-dialog.tsx`](src/components/receipts/receipt-scanner-dialog.tsx).
- ⌨️ **Keyboard Shortcuts**: Adding global shortcuts (<kbd>N</kbd> for new expense, <kbd>/</kbd> to search, <kbd>Esc</kbd> to dismiss modals).
- 🏷️ **Custom Category Icons**: Letting users define custom expense categories with custom icons or emoji.
- 📱 **PWA Polish**: Improving offline caching strategies or add-to-homescreen banners.

---

## 📋 Code of Conduct

Tabby is an open and welcoming community. Please treat fellow contributors with respect, patience, and empathy. Be kind, constructive in code reviews, and focus on helping each other build great software.

---

## ❓ Need Help?

Feel free to open an issue or start a discussion on GitHub if you have questions or want to propose an architecture change before writing code. We're happy to help!
