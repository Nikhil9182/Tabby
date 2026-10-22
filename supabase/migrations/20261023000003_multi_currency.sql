-- 20261023000003_multi_currency.sql
-- Real multi-currency support (policy: ARCHITECTURE.md §8.1).
-- Additive only: no column is dropped and no recorded amount or currency is changed.

-- ============================================================================
-- 1. DISPLAY-CURRENCY PREFERENCE (source of truth for the user's display currency)
-- ============================================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferred_currency VARCHAR(3)
  CHECK (preferred_currency IS NULL OR preferred_currency ~ '^[A-Z]{3}$');

-- ============================================================================
-- 2. SETTLEMENT CONVERSION SNAPSHOT
-- amount_minor/currency = what was actually paid (never changed).
-- applied_amount_minor/applied_currency = what it reduces in the debt's currency,
-- converted once at recording time. NULL = applied as paid (same currency).
-- ============================================================================
ALTER TABLE public.settlements
  ADD COLUMN IF NOT EXISTS applied_currency VARCHAR(3),
  ADD COLUMN IF NOT EXISTS applied_amount_minor BIGINT,
  ADD COLUMN IF NOT EXISTS exchange_rate_source TEXT;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'settlements_applied_pair_check'
  ) THEN
    ALTER TABLE public.settlements
      ADD CONSTRAINT settlements_applied_pair_check CHECK (
        (applied_currency IS NULL AND applied_amount_minor IS NULL)
        OR (applied_currency ~ '^[A-Z]{3}$' AND applied_amount_minor > 0)
      );
  END IF;
END $$;

-- Legacy settlements were always applied in their own currency (no conversion happened)
UPDATE public.settlements
SET exchange_rate_source = 'identity'
WHERE exchange_rate_source IS NULL;

-- ============================================================================
-- 3. LEGACY EXPENSE SNAPSHOTS
-- Rows whose snapshot names a different reporting currency but carries the
-- default identity rate were never really converted. Their amounts stay as
-- recorded; only the snapshot is flagged so the app won't trust it.
-- ============================================================================
UPDATE public.group_expenses
SET exchange_rate_source = 'unavailable'
WHERE reporting_currency IS DISTINCT FROM currency
  AND COALESCE(exchange_rate_source, 'identity') = 'identity';

-- Read-only list of records that need a human look. RLS still applies.
CREATE OR REPLACE VIEW public.currency_reconciliation_report
WITH (security_invoker = true) AS
SELECT
  'group_expenses'::TEXT AS table_name,
  id,
  description AS label,
  amount_minor,
  currency,
  reporting_currency,
  exchange_rate,
  exchange_rate_source,
  'Snapshot targets another currency but no real rate was recorded'::TEXT AS issue
FROM public.group_expenses
WHERE exchange_rate_source = 'unavailable'
  AND deleted_at IS NULL;

GRANT SELECT ON public.currency_reconciliation_report TO authenticated;

-- ============================================================================
-- 4. DIRECT SETTLEMENT RPC: accept the conversion snapshot
-- ============================================================================
DROP FUNCTION IF EXISTS public.record_direct_settlement(UUID, BIGINT, VARCHAR, TIMESTAMPTZ, TEXT, UUID, UUID);

CREATE OR REPLACE FUNCTION public.record_direct_settlement(
  p_friend_id UUID,
  p_amount_minor BIGINT,
  p_currency VARCHAR(3),
  p_settlement_date TIMESTAMPTZ,
  p_notes TEXT,
  p_payer_id UUID,
  p_recipient_id UUID,
  p_applied_currency VARCHAR(3) DEFAULT NULL,
  p_applied_amount_minor BIGINT DEFAULT NULL,
  p_exchange_rate NUMERIC DEFAULT NULL,
  p_exchange_rate_date DATE DEFAULT NULL,
  p_exchange_rate_source TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_friendship_id UUID;
  v_settlement_id UUID;
  v_result JSONB;
  v_currency VARCHAR(3);
  v_applied_currency VARCHAR(3);
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_amount_minor <= 0 THEN
    RAISE EXCEPTION 'Settlement amount must be greater than zero';
  END IF;

  IF p_payer_id = p_recipient_id THEN
    RAISE EXCEPTION 'Payer and recipient cannot be the same user';
  END IF;

  IF v_user_id <> p_payer_id AND v_user_id <> p_recipient_id THEN
    RAISE EXCEPTION 'Caller must be either the payer or recipient in a direct settlement';
  END IF;

  v_currency := upper(trim(p_currency));
  v_applied_currency := NULLIF(upper(trim(COALESCE(p_applied_currency, ''))), '');

  -- A cross-currency settlement must carry its frozen conversion
  IF v_applied_currency IS NOT NULL AND v_applied_currency <> v_currency THEN
    IF p_applied_amount_minor IS NULL OR p_applied_amount_minor <= 0 THEN
      RAISE EXCEPTION 'Applied amount is required when settling in a different currency';
    END IF;
    IF p_exchange_rate IS NULL OR p_exchange_rate <= 0 THEN
      RAISE EXCEPTION 'An exchange rate is required when settling in a different currency';
    END IF;
  ELSE
    v_applied_currency := NULL;
  END IF;

  v_friendship_id := public.get_or_create_friendship(v_user_id, p_friend_id);

  INSERT INTO public.settlements (
    context_type,
    friendship_id,
    group_id,
    from_user_id,
    to_user_id,
    amount_minor,
    currency,
    applied_currency,
    applied_amount_minor,
    exchange_rate,
    exchange_rate_date,
    exchange_rate_source,
    settlement_date,
    notes,
    created_by
  ) VALUES (
    'direct',
    v_friendship_id,
    NULL,
    p_payer_id,
    p_recipient_id,
    p_amount_minor,
    v_currency,
    v_applied_currency,
    CASE WHEN v_applied_currency IS NULL THEN NULL ELSE p_applied_amount_minor END,
    CASE WHEN v_applied_currency IS NULL THEN 1.0 ELSE p_exchange_rate END,
    COALESCE(p_exchange_rate_date, (p_settlement_date AT TIME ZONE 'UTC')::DATE),
    CASE WHEN v_applied_currency IS NULL THEN 'identity' ELSE COALESCE(p_exchange_rate_source, 'frankfurter') END,
    p_settlement_date,
    p_notes,
    v_user_id
  )
  RETURNING id INTO v_settlement_id;

  SELECT row_to_json(s)::jsonb INTO v_result
  FROM public.settlements s
  WHERE s.id = v_settlement_id;

  RETURN v_result;
END;
$$;
