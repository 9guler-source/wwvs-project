-- 005: mark_pool (앞마크 풀) + daily_functions (오늘의 함수) — ops_db에 추가

CREATE TABLE IF NOT EXISTS mark_pool (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  election_id  uuid NOT NULL,
  mark_word    text NOT NULL,
  is_assigned  boolean NOT NULL DEFAULT false,
  assigned_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (election_id, mark_word)
);

CREATE TABLE IF NOT EXISTS daily_functions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  election_id   uuid NOT NULL UNIQUE,
  f1_encrypted  text NOT NULL,   -- AES-256-GCM 암호화: iv:ciphertext:tag (hex)
  f2_encrypted  text NOT NULL,
  is_published  boolean NOT NULL DEFAULT false,
  published_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mark_pool_election_unassigned
  ON mark_pool (election_id, is_assigned);

ALTER TABLE mark_pool       ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_functions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_only" ON mark_pool
  USING (auth.role() = 'service_role');

CREATE POLICY "service_role_only" ON daily_functions
  USING (auth.role() = 'service_role');
