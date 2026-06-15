-- 004: ri_voter_map에 실제 전화번호 임시 저장 (SMS 발송용, 투표 완료 처리 후 삭제)
--      pending_vote_completions에 new_ri 추가 (재시도 시 완료신호에 포함)
ALTER TABLE ri_voter_map ADD COLUMN IF NOT EXISTS phone_number text;
ALTER TABLE pending_vote_completions ADD COLUMN IF NOT EXISTS new_ri text;
