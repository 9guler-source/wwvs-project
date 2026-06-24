-- 009: voters 테이블에 name 컬럼 추가 + 선거별 중복 방지 제약

-- name 컬럼 추가
ALTER TABLE voters
  ADD COLUMN IF NOT EXISTS name text;

-- phone_hash 컬럼 추가 (admin-panel 업로드용 — auth-server의 phone_number와 구분)
ALTER TABLE voters
  ADD COLUMN IF NOT EXISTS phone_hash text;

-- 선거별 중복 방지: (election_id, phone_hash) 고유 제약
ALTER TABLE voters
  ADD CONSTRAINT IF NOT EXISTS voters_election_phone_hash_unique
    UNIQUE (election_id, phone_hash);

ALTER TABLE voters ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='voters' AND policyname='service_role_only_admin'
  ) THEN
    CREATE POLICY "service_role_only_admin" ON voters
      USING (auth.role() = 'service_role');
  END IF;
END $$;
