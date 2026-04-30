CREATE TABLE IF NOT EXISTS public.custom_characters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL CHECK (char_length(trim(display_name)) BETWEEN 1 AND 20),
  gender text NOT NULL CHECK (gender IN ('male', 'female', 'nonbinary')),
  age integer NOT NULL CHECK (age BETWEEN 16 AND 70),
  mbti text NOT NULL DEFAULT '' CHECK (
    mbti = ''
    OR mbti IN (
      'INTJ', 'INTP', 'ENTJ', 'ENTP',
      'INFJ', 'INFP', 'ENFJ', 'ENFP',
      'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ',
      'ISTP', 'ISFP', 'ESTP', 'ESFP'
    )
  ),
  basic_info text CHECK (basic_info IS NULL OR char_length(basic_info) <= 400),
  style_label text CHECK (style_label IS NULL OR char_length(style_label) <= 400),
  avatar_seed text,
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_custom_characters_user_visible_created
  ON public.custom_characters(user_id, is_deleted, created_at DESC);

ALTER TABLE public.custom_characters ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'custom_characters'
      AND policyname = 'custom_characters_select_own'
  ) THEN
    CREATE POLICY custom_characters_select_own
      ON public.custom_characters
      FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'custom_characters'
      AND policyname = 'custom_characters_insert_own'
  ) THEN
    CREATE POLICY custom_characters_insert_own
      ON public.custom_characters
      FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'custom_characters'
      AND policyname = 'custom_characters_update_own'
  ) THEN
    CREATE POLICY custom_characters_update_own
      ON public.custom_characters
      FOR UPDATE
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END;
$$;
