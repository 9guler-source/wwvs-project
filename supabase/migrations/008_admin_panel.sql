-- 008: admin panel 지원 테이블

-- elections.mode 컬럼 추가 (simulation | production)
ALTER TABLE elections
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'simulation'
    CHECK (mode IN ('simulation', 'production'));

-- 시스템 설정 테이블
CREATE TABLE IF NOT EXISTS system_config (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO system_config (key, value)
  VALUES ('simulation_mode', 'true')
  ON CONFLICT (key) DO NOTHING;

ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only" ON system_config
  USING (auth.role() = 'service_role');

-- 관리자 액션 로그
CREATE TABLE IF NOT EXISTS admin_logs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action     text NOT NULL,
  detail     jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE admin_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only" ON admin_logs
  USING (auth.role() = 'service_role');
