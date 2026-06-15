-- ============================================================
-- WWVS Phase 1 — Initial Schema
-- 3개의 논리 DB: auth_db / ops_db / count_db
-- 각 Supabase 프로젝트에 해당하는 섹션만 실행하세요.
-- ============================================================


-- ============================================================
-- [인증 서버 DB] — auth_db
-- ============================================================

-- 선거 목록
CREATE TABLE IF NOT EXISTS elections (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  description text,
  status      text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'open', 'closed')),
  opens_at    timestamptz NOT NULL,
  closes_at   timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 투표인 명부
CREATE TABLE IF NOT EXISTS voters (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number  text UNIQUE NOT NULL,  -- 해시 처리된 전화번호
  election_id   uuid NOT NULL REFERENCES elections(id),
  is_voted      boolean NOT NULL DEFAULT false,
  ri_issued_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- OTP 발급 이력
CREATE TABLE IF NOT EXISTS otp_requests (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_hash  text NOT NULL,
  otp_code    text NOT NULL,           -- 6자리, 5분 후 만료
  expires_at  timestamptz NOT NULL,
  is_used     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_voters_phone_election
  ON voters (phone_number, election_id);


-- ============================================================
-- [운영 서버 DB] — ops_db
-- ============================================================

-- RI 장부 (유효한 RI 목록)
CREATE TABLE IF NOT EXISTS ri_ledger (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ri_value    text UNIQUE NOT NULL,    -- 128비트 난수 UUID
  election_id uuid NOT NULL,
  issued_at   timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,   -- 발급 후 30분
  is_used     boolean NOT NULL DEFAULT false,
  used_at     timestamptz
);

-- 투표 항목
CREATE TABLE IF NOT EXISTS ballot_options (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  election_id    uuid NOT NULL,
  option_text    text NOT NULL,
  display_order  int NOT NULL
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_ri_ledger_ri_value
  ON ri_ledger (ri_value);


-- ============================================================
-- [개표 서버 DB] — count_db
-- ============================================================

-- 투표확인서 (투표 대장)
CREATE TABLE IF NOT EXISTS vote_certificates (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  election_id           uuid NOT NULL,
  new_ri                text UNIQUE NOT NULL,      -- 교체된 신규 RI
  selected_option_id    uuid NOT NULL,
  selected_option_text  text NOT NULL,             -- 항목 텍스트 (스냅샷)
  hmac_signature        text NOT NULL,             -- HMAC-SHA256 서명
  created_at            timestamptz NOT NULL DEFAULT now(),
  is_published          boolean NOT NULL DEFAULT false
);

-- 집계 결과 (공개용)
CREATE TABLE IF NOT EXISTS election_results (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  election_id  uuid NOT NULL,
  option_id    uuid NOT NULL,
  option_text  text NOT NULL,
  vote_count   int NOT NULL DEFAULT 0,
  finalized_at timestamptz
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_vote_certificates_new_ri
  ON vote_certificates (new_ri);

CREATE INDEX IF NOT EXISTS idx_vote_certificates_election_id
  ON vote_certificates (election_id);


-- ============================================================
-- Row Level Security (RLS)
-- 모든 테이블: anon 접근 차단, service_role 만 허용
-- ============================================================

-- auth_db 테이블
ALTER TABLE elections         ENABLE ROW LEVEL SECURITY;
ALTER TABLE voters            ENABLE ROW LEVEL SECURITY;
ALTER TABLE otp_requests      ENABLE ROW LEVEL SECURITY;

-- ops_db 테이블
ALTER TABLE ri_ledger         ENABLE ROW LEVEL SECURITY;
ALTER TABLE ballot_options    ENABLE ROW LEVEL SECURITY;

-- count_db 테이블
ALTER TABLE vote_certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE election_results  ENABLE ROW LEVEL SECURITY;

-- service_role 전용 정책 (auth_db)
CREATE POLICY "service_role_only" ON elections
  USING (auth.role() = 'service_role');

CREATE POLICY "service_role_only" ON voters
  USING (auth.role() = 'service_role');

CREATE POLICY "service_role_only" ON otp_requests
  USING (auth.role() = 'service_role');

-- service_role 전용 정책 (ops_db)
CREATE POLICY "service_role_only" ON ri_ledger
  USING (auth.role() = 'service_role');

CREATE POLICY "service_role_only" ON ballot_options
  USING (auth.role() = 'service_role');

-- service_role 전용 정책 (count_db)
CREATE POLICY "service_role_only" ON vote_certificates
  USING (auth.role() = 'service_role');

CREATE POLICY "service_role_only" ON election_results
  USING (auth.role() = 'service_role');
