-- ============================================================
-- 테스트 시드 데이터
-- auth_db: elections, voters
-- ops_db:  ballot_options
-- 모두 같은 Supabase 인스턴스에 존재
-- ============================================================

-- 고정 UUID (참조 편의용)
-- election_id: 'aaaaaaaa-0000-0000-0000-000000000001'

-- 1. 테스트 선거 추가 (auth_db)
INSERT INTO elections (id, title, description, status, opens_at, closes_at)
VALUES (
  'aaaaaaaa-0000-0000-0000-000000000001',
  '테스트 투표',
  '개발/테스트 전용 선거입니다.',
  'open',
  now() - interval '1 hour',
  now() + interval '7 days'
)
ON CONFLICT (id) DO NOTHING;

-- 2. 투표 항목 추가 (ops_db)
INSERT INTO ballot_options (election_id, option_text, display_order)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', '찬성', 1),
  ('aaaaaaaa-0000-0000-0000-000000000001', '반대', 2)
ON CONFLICT DO NOTHING;

-- 3. 테스트 유권자 등록 (auth_db)
-- phone_number: SHA-256("01012345678")
-- = e60124f2fe2045215abda1ae912aa80bb66dab5fc231a758387682c9c0e70c01
INSERT INTO voters (phone_number, election_id)
VALUES (
  'e60124f2fe2045215abda1ae912aa80bb66dab5fc231a758387682c9c0e70c01',
  'aaaaaaaa-0000-0000-0000-000000000001'
)
ON CONFLICT (phone_number) DO NOTHING;
