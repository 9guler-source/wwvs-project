-- 선거인명부 봉인 테이블 + 봉인 트리거
-- 봉인 후 voters 테이블의 신원 컬럼(phone_number, election_id) 변경 차단

CREATE TABLE IF NOT EXISTS roster_seal (
  id          uuid      PRIMARY KEY DEFAULT gen_random_uuid(),
  election_id uuid      NOT NULL UNIQUE,
  is_sealed   boolean   NOT NULL DEFAULT false,
  sealed_at   timestamptz,
  voters_hash text,
  voter_count int,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE roster_seal ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only" ON roster_seal
  USING (auth.role() = 'service_role');

-- 트리거 함수: 봉인된 명부의 신원정보 변경/삭제/추가 차단
CREATE OR REPLACE FUNCTION fn_voters_seal_guard()
RETURNS TRIGGER AS $$
DECLARE
  v_sealed    boolean;
  v_election  uuid;
BEGIN
  v_election := CASE TG_OP WHEN 'DELETE' THEN OLD.election_id ELSE NEW.election_id END;

  SELECT is_sealed INTO v_sealed
  FROM roster_seal
  WHERE election_id = v_election;

  -- 봉인 기록 없거나 봉인 전 → 허용
  IF NOT FOUND OR NOT COALESCE(v_sealed, false) THEN
    RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  -- 봉인 후 DELETE/INSERT 차단
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION '봉인된 선거인명부: 삭제 불가';
  END IF;

  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION '봉인된 선거인명부: 신규 등록 불가';
  END IF;

  -- UPDATE: phone_number / election_id 변경 차단 (is_voted, ri_issued_at 허용)
  IF OLD.phone_number IS DISTINCT FROM NEW.phone_number OR
     OLD.election_id  IS DISTINCT FROM NEW.election_id THEN
    RAISE EXCEPTION '봉인된 선거인명부: 신원정보 수정 불가';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER voters_seal_guard
  BEFORE INSERT OR UPDATE OR DELETE ON voters
  FOR EACH ROW EXECUTE FUNCTION fn_voters_seal_guard();
