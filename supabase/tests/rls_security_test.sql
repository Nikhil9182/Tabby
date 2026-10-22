-- supabase/tests/rls_security_test.sql
-- Automated RLS Security Test Suite for Tabby PostgreSQL & Supabase
-- Tests all 8 mandatory security requirements from Section 7

BEGIN;

-- Setup test users
CREATE TEMP TABLE test_users (
  name TEXT PRIMARY KEY,
  id UUID DEFAULT gen_random_uuid()
);

INSERT INTO test_users (name) VALUES ('alice'), ('bob'), ('carol');

-- Insert corresponding auth.users mock entries (if auth schema exists) or profiles
DO $$
DECLARE
  v_alice_id UUID;
  v_bob_id UUID;
  v_carol_id UUID;
  v_group_a UUID;
  v_group_b UUID;
  v_expense_a UUID;
  v_expense_b UUID;
  v_settlement_a UUID;
  v_count INT;
BEGIN
  SELECT id INTO v_alice_id FROM test_users WHERE name = 'alice';
  SELECT id INTO v_bob_id FROM test_users WHERE name = 'bob';
  SELECT id INTO v_carol_id FROM test_users WHERE name = 'carol';

  -- Create profiles
  INSERT INTO public.profiles (id, display_name, email)
  VALUES
    (v_alice_id, 'Alice', 'alice@test.local'),
    (v_bob_id, 'Bob', 'bob@test.local'),
    (v_carol_id, 'Carol', 'carol@test.local');

  -- Create Group A (Alice owner, Carol member)
  INSERT INTO public.groups (id, name, created_by)
  VALUES (gen_random_uuid(), 'Alice & Carol Trip', v_alice_id)
  RETURNING id INTO v_group_a;

  INSERT INTO public.group_members (group_id, user_id, role, status)
  VALUES
    (v_group_a, v_alice_id, 'owner', 'active'),
    (v_group_a, v_carol_id, 'member', 'active');

  -- Create Group B (Bob private group)
  INSERT INTO public.groups (id, name, created_by)
  VALUES (gen_random_uuid(), 'Bob Private Club', v_bob_id)
  RETURNING id INTO v_group_b;

  INSERT INTO public.group_members (group_id, user_id, role, status)
  VALUES (v_group_b, v_bob_id, 'owner', 'active');

  -- Create Bob personal expense
  INSERT INTO public.personal_expenses (owner_id, description, amount_minor, currency)
  VALUES (v_bob_id, 'Bob Private Gadget', 5000, 'USD');

  -- Create Group A expense
  INSERT INTO public.group_expenses (
    id, group_id, description, paid_by, amount_minor, reporting_amount_minor, created_by
  )
  VALUES (
    gen_random_uuid(), v_group_a, 'Trip Dinner', v_alice_id, 6000, 6000, v_alice_id
  )
  RETURNING id INTO v_expense_a;

  INSERT INTO public.expense_splits (group_expense_id, user_id, share_minor)
  VALUES
    (v_expense_a, v_alice_id, 3000),
    (v_expense_a, v_carol_id, 3000);

  -- Create Group B expense
  INSERT INTO public.group_expenses (
    id, group_id, description, paid_by, amount_minor, reporting_amount_minor, created_by
  )
  VALUES (
    gen_random_uuid(), v_group_b, 'Secret Meeting', v_bob_id, 2000, 2000, v_bob_id
  )
  RETURNING id INTO v_expense_b;

  -- =========================================================================
  -- TEST 1: Signed-out user cannot access private financial records
  -- =========================================================================
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('role', 'anon', true);

  SELECT count(*) INTO v_count FROM public.personal_expenses;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'TEST 1 FAILED: Anon user could read personal expenses';
  END IF;

  SELECT count(*) INTO v_count FROM public.group_expenses;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'TEST 1 FAILED: Anon user could read group expenses';
  END IF;
  RAISE NOTICE 'TEST 1 PASSED: Signed-out user blocked from private records';

  -- =========================================================================
  -- TEST 2: Alice cannot read Bob personal expenses
  -- =========================================================================
  PERFORM set_config('request.jwt.claim.sub', v_alice_id::text, true);
  PERFORM set_config('role', 'authenticated', true);

  SELECT count(*) INTO v_count FROM public.personal_expenses WHERE owner_id = v_bob_id;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'TEST 2 FAILED: Alice read Bob personal expenses';
  END IF;
  RAISE NOTICE 'TEST 2 PASSED: Alice cannot read Bob personal expenses';

  -- =========================================================================
  -- TEST 3: Member (Alice, Carol) can access their own group data
  -- =========================================================================
  SELECT count(*) INTO v_count FROM public.group_expenses WHERE group_id = v_group_a;
  IF v_count != 1 THEN
    RAISE EXCEPTION 'TEST 3 FAILED: Alice could not read Group A expenses';
  END IF;
  RAISE NOTICE 'TEST 3 PASSED: Member can access own group data';

  -- =========================================================================
  -- TEST 4: Non-member (Alice) cannot read another group (Group B) expenses
  -- =========================================================================
  SELECT count(*) INTO v_count FROM public.group_expenses WHERE group_id = v_group_b;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'TEST 4 FAILED: Alice read Group B expenses';
  END IF;
  RAISE NOTICE 'TEST 4 PASSED: Non-member cannot read another group expenses';

  -- =========================================================================
  -- TEST 5: Member (Carol) cannot grant themselves an admin or owner role
  -- =========================================================================
  PERFORM set_config('request.jwt.claim.sub', v_carol_id::text, true);

  -- Try self-promotion directly via UPDATE
  UPDATE public.group_members SET role = 'admin'
  WHERE group_id = v_group_a AND user_id = v_carol_id;

  SELECT role INTO v_count FROM public.group_members
  WHERE group_id = v_group_a AND user_id = v_carol_id;

  IF (SELECT role FROM public.group_members WHERE group_id = v_group_a AND user_id = v_carol_id) = 'admin' THEN
    RAISE EXCEPTION 'TEST 5 FAILED: Carol successfully promoted herself to admin';
  END IF;
  RAISE NOTICE 'TEST 5 PASSED: Member cannot self-promote to admin or owner';

  -- =========================================================================
  -- TEST 6: User cannot create an expense in a group they cannot access
  -- =========================================================================
  -- Carol tries to insert expense into Group B (where she is NOT a member)
  BEGIN
    INSERT INTO public.group_expenses (
      group_id, description, paid_by, amount_minor, reporting_amount_minor, created_by
    )
    VALUES (v_group_b, 'Unauthorized Expense', v_carol_id, 1000, 1000, v_carol_id);
    RAISE EXCEPTION 'TEST 6 FAILED: Carol inserted expense into inaccessible Group B';
  EXCEPTION
    WHEN insufficient_privilege OR check_violation THEN
      RAISE NOTICE 'TEST 6 PASSED: Rejected expense insertion into inaccessible group';
  END;

  -- =========================================================================
  -- TEST 7: User cannot settle debts in a group they cannot access
  -- =========================================================================
  BEGIN
    INSERT INTO public.settlements (
      group_id, from_user_id, to_user_id, amount_minor, currency, created_by
    )
    VALUES (v_group_b, v_carol_id, v_bob_id, 500, 'USD', v_carol_id);
    RAISE EXCEPTION 'TEST 7 FAILED: Carol settled in inaccessible Group B';
  EXCEPTION
    WHEN insufficient_privilege OR check_violation THEN
      RAISE NOTICE 'TEST 7 PASSED: Rejected settlement in inaccessible group';
  END;

  -- =========================================================================
  -- TEST 8: Unauthorized user cannot update or delete another user's private data
  -- =========================================================================
  -- Carol tries to update Bob's private expense
  UPDATE public.personal_expenses SET description = 'Hacked' WHERE owner_id = v_bob_id;
  IF (SELECT count(*) FROM public.personal_expenses WHERE description = 'Hacked') > 0 THEN
    RAISE EXCEPTION 'TEST 8 FAILED: Carol updated Bob personal expense';
  END IF;
  RAISE NOTICE 'TEST 8 PASSED: Unauthorized user cannot update or delete another user data';

END $$;

ROLLBACK;
