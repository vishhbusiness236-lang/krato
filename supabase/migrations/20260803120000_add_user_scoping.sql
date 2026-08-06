ALTER TABLE public.scans
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);

ALTER TABLE public.scheduled_scans
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);

ALTER TABLE public.scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_scans ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'scans'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.scans', pol.policyname);
  END LOOP;

  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'scheduled_scans'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.scheduled_scans', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "Users can insert their own scans"
  ON public.scans
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can select their own scans"
  ON public.scans
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own scheduled scans"
  ON public.scheduled_scans
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can select their own scheduled scans"
  ON public.scheduled_scans
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can select all scheduled scans"
  ON public.scheduled_scans
  FOR SELECT
  TO service_role
  USING (true);
