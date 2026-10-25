-- 20261026000001_receipt_items_schema.sql
-- Migration: Add structured receipt items and financial breakdown to expense_receipts

ALTER TABLE IF EXISTS public.expense_receipts
  ALTER COLUMN storage_path DROP NOT NULL,
  ALTER COLUMN content_type DROP NOT NULL,
  ALTER COLUMN file_size DROP NOT NULL;

ALTER TABLE IF EXISTS public.expense_receipts
  ADD COLUMN IF NOT EXISTS items JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS subtotal_minor BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_minor BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_minor BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tip_minor BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS service_charge_minor BIGINT DEFAULT 0;

COMMENT ON COLUMN public.expense_receipts.items IS 'Structured itemized line items detected or edited for this receipt';
COMMENT ON COLUMN public.expense_receipts.subtotal_minor IS 'Calculated subtotal of item line totals before taxes and discounts';
