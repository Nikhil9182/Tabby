# 📋 Ready-to-Post "Good First Issues" for GitHub

Copy and paste these directly into **[GitHub Issues](https://github.com/nikhil9182/Tabby/issues/new)** to populate your repository with attractive, beginner-friendly tasks that contributors can find with `label:"good first issue"`.

---

## Issue 1: Internationalization (i18n): Add Multi-Language Support

**Title:** `[Feature]: Add Internationalization (i18n) for Spanish, German, French, and Hindi`  
**Labels:** `good first issue`, `enhancement`, `help wanted`

### Description
Tabby currently supports multi-currency arithmetic, but UI strings are hardcoded in English. Adding i18n will allow people worldwide to split bills in their native languages.

### Suggested Implementation
1. Add a translation system in `src/i18n/` (e.g. lightweight JSON translation files `en.json`, `es.json`, `de.json`, `fr.json`, `hi.json`).
2. Provide a simple `useTranslation()` hook in `src/app/providers.tsx` or wrap the app in a translation context.
3. Add a "Language" selection dropdown in `src/features/settings/settings-page.tsx` under the Preferences card.
4. Save the user's selected language in `localStorage` / user preferences.

### Files to Look At
- `src/features/settings/settings-page.tsx`
- `src/app/providers.tsx`
- `src/components/layout/`

---

## Issue 2: Export to PDF: Downloadable & Printable Group Summary

**Title:** `[Feature]: Add "Export to PDF" / Printable summary for groups and trips`  
**Labels:** `good first issue`, `enhancement`, `help wanted`

### Description
Users frequently need to share a summary of a group trip or flatmate month with people who don't have the app open. Tabby already exports raw CSV and JSON backups, but a clean PDF / printable view is missing.

### Desired Behavior
1. In `src/features/groups/group-detail-page.tsx`, add an **Export to PDF** button in the group header.
2. Clicking the button opens a clean print-ready modal or triggers a styled print layout (`@media print`).
3. Layout should include:
   - Group name & date range
   - Total group spend
   - Member spending breakdown
   - Simplified "Who Owes Whom" settlement summary table

### Files to Look At
- `src/features/groups/group-detail-page.tsx`
- `src/features/reports/reports-page.tsx`
- `src/features/settings/settings-page.tsx`

---

## Issue 3: Receipt Image Pre-Crop & 90° Rotation Tool

**Title:** `[Feature]: Add image rotation and crop tool prior to receipt scanning`  
**Labels:** `good first issue`, `enhancement`, `ai-vision`

### Description
When users snap photos of receipts on mobile devices, photos are sometimes oriented sideways or include excessive background noise (table tops, dishes) which degrades OCR and Gemini Vision extraction accuracy.

### Desired Behavior
1. In `src/components/receipts/receipt-scanner-dialog.tsx` (Step 1: Upload / Preview stage), display:
   - A **Rotate 90° Clockwise** button (`RotateCw` icon from `lucide-react`).
   - A basic crop box / drag handle to trim non-receipt borders.
2. Process the rotation/crop directly in canvas memory before dispatching to `parseReceipt()`.

### Files to Look At
- `src/components/receipts/receipt-scanner-dialog.tsx`
- `src/services/image/image-compression.ts` (canvas resize and compression pipeline)

---

## Issue 4: Custom Categories & Emoji Picker

**Title:** `[Feature]: Allow users to create custom expense categories with custom icons or emoji`  
**Labels:** `good first issue`, `enhancement`, `help wanted`

### Description
Tabby has default expense categories (Food, Drinks, Groceries, Transport, Entertainment, etc.), but users often want specialized categories (e.g., "Rent 🏠", "Pet Care 🐱", "Utilities ⚡").

### Desired Behavior
1. In the expense form category selector (`src/features/expenses/expense-form.tsx`), add a `+ Add Custom Category` option.
2. Allow users to choose a name, color, and emoji/icon.
3. Persist custom categories in browser IndexedDB (Guest Mode) and Supabase database.
4. Render custom categories correctly in expense list items and spending report pie charts.

### Files to Look At
- `src/domain/models/types.ts` (`Category` model)
- `src/services/guest/indexed-db.ts`
- `src/features/expenses/expense-form.tsx`
- `src/features/settings/settings-page.tsx`

---

## Issue 5: Group QR Code Sharing & Deep Linking

**Title:** `[Feature]: Generate QR Code with deep-link to invite friends to a group`  
**Labels:** `good first issue`, `enhancement`, `help wanted`

### Description
When hanging out with friends in person, typing URLs or sending text messages is cumbersome. Adding an instant QR code modal lets friends scan with their phone camera and jump straight into the group tab.

### Desired Behavior
1. In `src/features/groups/group-detail-page.tsx`, add a "Share QR Code" button.
2. Display a modal rendering an SVG QR code pointing to `${window.location.origin}/Tabby/#/groups/${groupId}`.
3. Include a "Copy Invite Link" button with toast confirmation.

### Files to Look At
- `src/features/groups/group-detail-page.tsx`
- `src/components/ui/dialog.tsx`
