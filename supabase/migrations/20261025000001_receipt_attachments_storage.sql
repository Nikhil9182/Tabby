-- 20261025000001_receipt_attachments_storage.sql
-- Migration: Receipt Attachments & Private Supabase Storage for Tabby

-- 1. EXPENSE RECEIPTS TABLE
CREATE TABLE IF NOT EXISTS public.expense_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id UUID NOT NULL REFERENCES public.group_expenses(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  original_filename TEXT,
  content_type TEXT NOT NULL DEFAULT 'image/jpeg',
  file_size BIGINT NOT NULL CHECK (file_size > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_expense_receipt_expense UNIQUE (expense_id)
);

CREATE INDEX IF NOT EXISTS idx_expense_receipts_expense ON public.expense_receipts(expense_id);
CREATE INDEX IF NOT EXISTS idx_expense_receipts_uploader ON public.expense_receipts(uploaded_by);

-- 2. HELPER FUNCTIONS FOR AUTHORIZATION
CREATE OR REPLACE FUNCTION public.can_view_expense(p_expense_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_expenses e
    WHERE e.id = p_expense_id
      AND (
        (e.context_type = 'direct' AND public.is_friendship_member(e.friendship_id, p_user_id))
        OR (e.context_type = 'group' AND public.is_group_member(e.group_id, p_user_id))
        OR e.paid_by = p_user_id
        OR e.created_by = p_user_id
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_expense_receipt(p_expense_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.expense_receipts er
    JOIN public.group_expenses e ON e.id = er.expense_id
    WHERE er.expense_id = p_expense_id
      AND (
        er.uploaded_by = p_user_id
        OR e.created_by = p_user_id
        OR e.paid_by = p_user_id
        OR (e.context_type = 'group' AND public.can_admin_group(e.group_id, p_user_id))
      )
  );
$$;

-- 3. ROW LEVEL SECURITY (RLS) FOR EXPENSE RECEIPTS
ALTER TABLE public.expense_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "expense_receipts_select" ON public.expense_receipts;
CREATE POLICY "expense_receipts_select"
  ON public.expense_receipts
  FOR SELECT
  TO authenticated
  USING (public.can_view_expense(expense_id, auth.uid()));

DROP POLICY IF EXISTS "expense_receipts_insert" ON public.expense_receipts;
CREATE POLICY "expense_receipts_insert"
  ON public.expense_receipts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = uploaded_by
    AND public.can_view_expense(expense_id, auth.uid())
  );

DROP POLICY IF EXISTS "expense_receipts_delete" ON public.expense_receipts;
CREATE POLICY "expense_receipts_delete"
  ON public.expense_receipts
  FOR DELETE
  TO authenticated
  USING (public.can_manage_expense_receipt(expense_id, auth.uid()));

-- 4. PRIVATE SUPABASE STORAGE BUCKET: receipts
-- Insert into storage.buckets if storage schema exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'storage') THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'receipts',
      'receipts',
      false, -- strictly private
      15728640, -- 15MB limit
      ARRAY['image/jpeg', 'image/png', 'image/webp']
    )
    ON CONFLICT (id) DO UPDATE SET
      public = false,
      file_size_limit = 15728640,
      allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

    -- Storage Object Policies
    DROP POLICY IF EXISTS "receipts_storage_insert" ON storage.objects;
    CREATE POLICY "receipts_storage_insert"
      ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'receipts'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );

    DROP POLICY IF EXISTS "receipts_storage_select" ON storage.objects;
    CREATE POLICY "receipts_storage_select"
      ON storage.objects
      FOR SELECT
      TO authenticated
      USING (
        bucket_id = 'receipts'
        AND (
          (storage.foldername(name))[1] = auth.uid()::text
          OR EXISTS (
            SELECT 1 FROM public.expense_receipts er
            WHERE er.storage_path = name
              AND public.can_view_expense(er.expense_id, auth.uid())
          )
        )
      );

    DROP POLICY IF EXISTS "receipts_storage_delete" ON storage.objects;
    CREATE POLICY "receipts_storage_delete"
      ON storage.objects
      FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'receipts'
        AND (
          (storage.foldername(name))[1] = auth.uid()::text
          OR EXISTS (
            SELECT 1 FROM public.expense_receipts er
            WHERE er.storage_path = name
              AND public.can_manage_expense_receipt(er.expense_id, auth.uid())
          )
        )
      );
  END IF;
END $$;
