# 🐱 Tabby v1.0.0 — Modern, Privacy-First Splitwise Alternative

We're thrilled to announce the official **v1.0.0 release of Tabby**! Tabby is built from the ground up to solve modern frustrations with bill splitting: zero floating-point arithmetic errors, real multi-currency support, full offline Guest Mode, and a central dual-engine receipt scanner powered by Google Gemini Vision with offline local OCR fallback.

---

### ✨ Highlights & Key Features

* **📸 Dual-Engine AI & Local Receipt Scanning**:
  * Take a photo or upload a receipt from any mobile or desktop camera.
  * Server-side Gemini Vision extracts merchant names, individual line items, quantities, discounts, and taxes in seconds.
  * Automatic silent fallback to local Tesseract OCR when offline or in guest mode.
  * Smart discount reconciliation and one-click discrepancy resolution.

* **💰 Exact Minor-Unit Financial Engine**:
  * All amounts stored strictly as integer minor units (cents, paise, yen).
  * Deterministic remainder distribution ensures bill splits always match the total down to the single cent.

* **🌐 True Multi-Currency with Real-Time Rates**:
  * Add expenses in any of 30+ world currencies.
  * Balances converted for display using live European Central Bank (ECB) exchange rates.
  * Settle debts cross-currency with locked rate snapshots at payment time.

* **⚡ 100% Offline Guest Mode + Supabase Realtime Sync**:
  * Try the complete application immediately without signing up. Data lives in local browser storage (IndexedDB).
  * Seamless one-click migration into cloud account upon Google OAuth login.
  * Realtime multi-device sync across friends and group members.

* **🤝 Simplified Debt Settlement**:
  * Greedy cash-flow algorithm minimizes total bank transactions among group members.

* **🛡️ Security & Privacy First**:
  * Postgres Row-Level Security (RLS) ensures users can only access expenses they are explicit participants of.
  * Zero Gemini credentials or API keys exposed to the client.

* **🧪 332 Vitest Automated Tests**:
  * 100% passing test suite across 35 test files covering splits, debt engines, multi-currency conversions, OCR, and IndexedDB migrations.

---

### 🚀 Quick Links
* **Live Demo**: [https://nikhil9182.github.io/Tabby/](https://nikhil9182.github.io/Tabby/)
* **Contributing Guide**: [CONTRIBUTING.md](https://github.com/nikhil9182/Tabby/blob/master/CONTRIBUTING.md)
* **License**: [MIT](https://github.com/nikhil9182/Tabby/blob/master/LICENSE)
