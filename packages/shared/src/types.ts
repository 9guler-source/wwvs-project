// 선거 상태
export type ElectionStatus = 'pending' | 'open' | 'closed';

// 투표 단계
export type VotingStep =
  | 'phone_input'   // 전화번호 입력
  | 'otp_verify'    // OTP 인증
  | 'ballot'        // 투표용지
  | 'completed';    // 완료

// RI 정보 (서버 간 전달용)
export interface RIPayload {
  ri: string;
  electionId: string;
  expiresAt: string;
}

// 투표확인서
export interface VoteCertificate {
  publicRi: string;   // 공개용RI = {앞마크}_{신규RI}_{1차마크}_{2차마크}
  electionId: string;
  selectedOptionId: string;
  selectedOptionText: string;
  hmacSignature: string;
  createdAt: string;
}

// 투표용지 옵션
export interface BallotOption {
  id: string;
  text: string;
  displayOrder: number;
}
