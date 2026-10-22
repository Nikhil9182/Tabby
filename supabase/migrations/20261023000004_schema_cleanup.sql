-- 20261023000004_schema_cleanup.sql
-- Removes redundant indexes and policies, drops structures that hold no data,
-- and adds consistency checks. No expense, split or settlement row is changed.
--
-- Everything runs inside ONE statement (the DO block), so it is atomic however
-- the SQL editor handles transactions: any error, or any change to the
-- financial totals checked at the end, undoes all of it. Safe to re-run, also
-- after a partial earlier attempt (every step uses IF EXISTS / IF NOT EXISTS).
-- The SELECT at the bottom is read-only and shows the outcome.

DO $migration$
DECLARE
  v_before JSONB;
  v_after JSONB;
  v_count BIGINT;
BEGIN
  -- ==========================================================================
  -- 0. SAFETY NET: counts and totals of every financial table
  -- ==========================================================================
  SELECT jsonb_build_object(
    'group_expenses', (SELECT jsonb_build_array(count(*), COALESCE(sum(amount_minor), 0),
                         COALESCE(sum(reporting_amount_minor), 0)) FROM public.group_expenses),
    'personal_expenses', (SELECT jsonb_build_array(count(*), COALESCE(sum(amount_minor), 0)) FROM public.personal_expenses),
    'expense_splits', (SELECT jsonb_build_array(count(*), COALESCE(sum(share_minor), 0)) FROM public.expense_splits),
    'settlements', (SELECT jsonb_build_array(count(*), COALESCE(sum(amount_minor), 0),
                      COALESCE(sum(applied_amount_minor), 0)) FROM public.settlements),
    'friendships', (SELECT count(*) FROM public.friendships),
    'group_members', (SELECT count(*) FROM public.group_members)
  ) INTO v_before;

  -- ==========================================================================
  -- 1. REDUNDANT INDEXES
  -- ==========================================================================
  -- 1a. Exact duplicates of indexes that UNIQUE constraints already create
  DROP INDEX IF EXISTS public.idx_group_invitations_token;   -- = UNIQUE (token)
  DROP INDEX IF EXISTS public.idx_rates_cache_lookup;        -- = uq_rate_pair_date

  -- 1b. Covered by the leading column of a UNIQUE constraint's index
  DROP INDEX IF EXISTS public.idx_group_members_group_id;    -- uq_group_member (group_id, user_id)
  DROP INDEX IF EXISTS public.idx_expense_splits_expense_id; -- uq_expense_split (group_expense_id, user_id)
  DROP INDEX IF EXISTS public.idx_friendships_user1;         -- uq_friendship_canonical (user_id_1, user_id_2)

  -- 1c. Single-column indexes on 2-3 value flags; the planner never picks them
  DROP INDEX IF EXISTS public.idx_group_members_status;
  DROP INDEX IF EXISTS public.idx_friendships_status;
  DROP INDEX IF EXISTS public.idx_group_expenses_context;
  DROP INDEX IF EXISTS public.idx_settlements_context;
  DROP INDEX IF EXISTS public.idx_settlements_deleted_at;
  DROP INDEX IF EXISTS public.idx_groups_archived_at;

  -- 1d. Unused: nothing searches profiles by display name
  DROP INDEX IF EXISTS public.idx_profiles_display_name;

  -- ==========================================================================
  -- 2. INDEXES THAT MATCH THE REAL QUERIES
  -- ==========================================================================
  -- find_profile_by_email() compares lower(trim(email)); a plain index can't serve it
  DROP INDEX IF EXISTS public.idx_profiles_email;
  CREATE INDEX IF NOT EXISTS idx_profiles_email_lookup ON public.profiles (lower(trim(email)));

  -- Expense lists read active rows newest first: one partial index replaces two
  DROP INDEX IF EXISTS public.idx_group_expenses_date;
  DROP INDEX IF EXISTS public.idx_group_expenses_deleted_at;
  CREATE INDEX IF NOT EXISTS idx_group_expenses_active_date
    ON public.group_expenses (expense_date DESC)
    WHERE deleted_at IS NULL;

  -- ==========================================================================
  -- 3. REDUNDANT READ POLICIES
  -- The *_select policies already allow every row the old *_select_policy did
  -- (group rows have context_type = 'group'); both were evaluated per row.
  -- Recreated scoped to signed-in users with identical logic.
  -- ==========================================================================
  DROP POLICY IF EXISTS "group_expenses_select_policy" ON public.group_expenses;
  DROP POLICY IF EXISTS group_expenses_select ON public.group_expenses;
  CREATE POLICY group_expenses_select ON public.group_expenses
    FOR SELECT
    TO authenticated
    USING (
      (context_type = 'group' AND public.is_group_member(group_id, auth.uid()))
      OR (context_type = 'direct' AND public.is_friendship_member(friendship_id, auth.uid()))
    );

  DROP POLICY IF EXISTS "settlements_select_policy" ON public.settlements;
  DROP POLICY IF EXISTS settlements_select ON public.settlements;
  CREATE POLICY settlements_select ON public.settlements
    FOR SELECT
    TO authenticated
    USING (
      (context_type = 'group' AND public.is_group_member(group_id, auth.uid()))
      OR (context_type = 'direct' AND (from_user_id = auth.uid() OR to_user_id = auth.uid()))
    );

  -- ==========================================================================
  -- 4. STRUCTURES THAT HOLD NO DATA (kept if they hold anything)
  -- ==========================================================================
  -- settlement_allocations: never written by the app or any function
  IF to_regclass('public.settlement_allocations') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.settlement_allocations' INTO v_count;
    IF v_count = 0 THEN
      EXECUTE 'DROP TABLE public.settlement_allocations';
      DROP FUNCTION IF EXISTS public.get_settlement_group_id(UUID);
      RAISE NOTICE 'Dropped empty table settlement_allocations';
    ELSE
      RAISE NOTICE 'Kept settlement_allocations: it holds % rows', v_count;
    END IF;
  END IF;

  -- group_members.created_at: always set from the same now() as joined_at
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'group_members' AND column_name = 'created_at'
  ) THEN
    EXECUTE 'SELECT count(*) FROM public.group_members
             WHERE abs(extract(epoch FROM (created_at - joined_at))) > 1' INTO v_count;
    IF v_count = 0 THEN
      EXECUTE 'ALTER TABLE public.group_members DROP COLUMN created_at';
      RAISE NOTICE 'Dropped group_members.created_at (identical to joined_at)';
    ELSE
      RAISE NOTICE 'Kept group_members.created_at: % rows differ from joined_at', v_count;
    END IF;
  END IF;

  -- ==========================================================================
  -- 5. CONSISTENCY CHECKS FOR DUPLICATED CONTEXT DATA
  -- Added NOT VALID (enforced for new rows), then validated only when every
  -- existing row already agrees; otherwise left NOT VALID instead of failing.
  -- ==========================================================================
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'group_expenses_context_check') THEN
    ALTER TABLE public.group_expenses
      ADD CONSTRAINT group_expenses_context_check CHECK (
        (context_type = 'group' AND group_id IS NOT NULL AND friendship_id IS NULL)
        OR (context_type = 'direct' AND group_id IS NULL AND friendship_id IS NOT NULL)
      ) NOT VALID;
  END IF;
  SELECT count(*) INTO v_count FROM public.group_expenses
  WHERE NOT (
    (context_type = 'group' AND group_id IS NOT NULL AND friendship_id IS NULL)
    OR (context_type = 'direct' AND group_id IS NULL AND friendship_id IS NOT NULL)
  );
  IF v_count = 0 THEN
    ALTER TABLE public.group_expenses VALIDATE CONSTRAINT group_expenses_context_check;
  ELSE
    RAISE NOTICE 'group_expenses_context_check left NOT VALID: % existing rows need review', v_count;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'settlements_context_check') THEN
    ALTER TABLE public.settlements
      ADD CONSTRAINT settlements_context_check CHECK (
        (context_type = 'group' AND group_id IS NOT NULL AND friendship_id IS NULL)
        OR (context_type = 'direct' AND group_id IS NULL AND friendship_id IS NOT NULL)
      ) NOT VALID;
  END IF;
  SELECT count(*) INTO v_count FROM public.settlements
  WHERE NOT (
    (context_type = 'group' AND group_id IS NOT NULL AND friendship_id IS NULL)
    OR (context_type = 'direct' AND group_id IS NULL AND friendship_id IS NOT NULL)
  );
  IF v_count = 0 THEN
    ALTER TABLE public.settlements VALIDATE CONSTRAINT settlements_context_check;
  ELSE
    RAISE NOTICE 'settlements_context_check left NOT VALID: % existing rows need review', v_count;
  END IF;

  -- ==========================================================================
  -- 6. VERIFY: undo everything if any financial number changed
  -- ==========================================================================
  SELECT jsonb_build_object(
    'group_expenses', (SELECT jsonb_build_array(count(*), COALESCE(sum(amount_minor), 0),
                         COALESCE(sum(reporting_amount_minor), 0)) FROM public.group_expenses),
    'personal_expenses', (SELECT jsonb_build_array(count(*), COALESCE(sum(amount_minor), 0)) FROM public.personal_expenses),
    'expense_splits', (SELECT jsonb_build_array(count(*), COALESCE(sum(share_minor), 0)) FROM public.expense_splits),
    'settlements', (SELECT jsonb_build_array(count(*), COALESCE(sum(amount_minor), 0),
                      COALESCE(sum(applied_amount_minor), 0)) FROM public.settlements),
    'friendships', (SELECT count(*) FROM public.friendships),
    'group_members', (SELECT count(*) FROM public.group_members)
  ) INTO v_after;

  IF v_after IS DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'Financial data changed (before %, after %): everything rolled back', v_before, v_after;
  END IF;
END
$migration$;

-- ============================================================================
-- Read-only summary of the result (this is what the SQL editor displays)
-- ============================================================================
SELECT check_name, ok
FROM (VALUES
  ('Redundant indexes removed',
    NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname IN (
      'idx_group_invitations_token', 'idx_rates_cache_lookup', 'idx_group_members_group_id',
      'idx_expense_splits_expense_id', 'idx_friendships_user1', 'idx_group_members_status',
      'idx_friendships_status', 'idx_group_expenses_context', 'idx_settlements_context',
      'idx_settlements_deleted_at', 'idx_groups_archived_at', 'idx_profiles_display_name',
      'idx_profiles_email', 'idx_group_expenses_date', 'idx_group_expenses_deleted_at'))),
  ('Email lookup index present',
    EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_profiles_email_lookup')),
  ('Active-expenses index present',
    EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_group_expenses_active_date')),
  ('Duplicate read policies removed',
    NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
      AND policyname IN ('group_expenses_select_policy', 'settlements_select_policy'))),
  ('Merged read policies present',
    (SELECT count(*) FROM pg_policies WHERE schemaname = 'public'
      AND policyname IN ('group_expenses_select', 'settlements_select')) = 2),
  ('settlement_allocations dropped (false = kept because it has rows)',
    to_regclass('public.settlement_allocations') IS NULL),
  ('group_members.created_at dropped (false = kept because values differ)',
    NOT EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'group_members' AND column_name = 'created_at')),
  ('Expense context check validated (false = some older rows need review)',
    COALESCE((SELECT convalidated FROM pg_constraint WHERE conname = 'group_expenses_context_check'), false)),
  ('Settlement context check validated (false = some older rows need review)',
    COALESCE((SELECT convalidated FROM pg_constraint WHERE conname = 'settlements_context_check'), false))
) AS t(check_name, ok);
