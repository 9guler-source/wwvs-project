-- ============================================================
-- WWVS Phase 1 — ACK/재시도/멱등성 테이블 추가
-- ============================================================
-- 실행 대상: 모든 섹션을 같은 Supabase 프로젝트에서 실행
-- (auth_db / ops_db 는 논리적 구분이며 물리 DB는 동일)
-- ============================================================


-- ============================================================
-- [auth_db] 원본RI-투표자 임시 매핑
-- verify-otp 시 생성 → vote-completed 수신 시 삭제
-- ============================================================
CREATE TABLE IF NOT EXISTS ri_voter_map (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ri_value    text UNIQUE NOT NULL,   -- 원본 RI (UUID)
  voter_id    uuid NOT NULL,          -- voters.id 참조
  expires_at  timestamptz NOT NULL,   -- RI 만료 시각 (30분)
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ri_voter_map_ri_value
  ON ri_voter_map (ri_value);

ALTER TABLE ri_voter_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_only" ON ri_voter_map
  USING (auth.role() = 'service_role');


-- ============================================================
-- [ops_db] 미전송 완료신호 대기열
-- auth-server 전송 실패 시 저장 → 백그라운드 워커가 재시도
-- ============================================================
CREATE TABLE IF NOT EXISTS pending_vote_completions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_ri       text UNIQUE NOT NULL,   -- 원본 RI
  retry_count       int NOT NULL DEFAULT 0,
  last_attempted_at timestamptz,
  next_retry_at     timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pending_completions_next_retry
  ON pending_vote_completions (next_retry_at);

ALTER TABLE pending_vote_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_only" ON pending_vote_completions
  USING (auth.role() = 'service_role');


-- ============================================================
-- [ops_db] 미전송 확인서 대기열
-- count-server 전송 실패 시 저장 → 백그라운드 워커가 재시도
-- ============================================================
CREATE TABLE IF NOT EXISTS pending_certificates (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  certificate_data  jsonb NOT NULL,    -- VoteCertificate JSON
  retry_count       int NOT NULL DEFAULT 0,
  last_attempted_at timestamptz,
  next_retry_at     timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pending_certs_next_retry
  ON pending_certificates (next_retry_at);

ALTER TABLE pending_certificates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_only" ON pending_certificates
  USING (auth.role() = 'service_role');
