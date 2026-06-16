-- 13-b(SMS 발송) 기능 제거: 전화번호+공개용RI 결합으로 인한 실시간 감청 위협 방지
-- ri_voter_map.phone_number 및 pending_vote_completions.new_ri 컬럼 삭제

ALTER TABLE ri_voter_map
  DROP COLUMN IF EXISTS phone_number;

ALTER TABLE pending_vote_completions
  DROP COLUMN IF EXISTS new_ri;
