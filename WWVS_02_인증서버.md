# WWVS Phase 1 — 프롬프트 02: 인증 서버 구현

## Claude Code에 이 내용을 그대로 붙여넣으세요

---

## 작업 전제

- 프롬프트 01(프로젝트 초기화 + DB 스키마)이 완료된 상태입니다
- `apps/auth-server/` Next.js 앱을 구현합니다
- 포트: 3001

## 구현할 내용

인증 서버는 다음 두 가지만 합니다:
1. 전화번호 → OTP 발송 → 투표권 확인
2. 유효한 투표권자에게 RI 발급 → 운영서버에 RI 전달 → 즉시 연결 해제

---

## API 엔드포인트 구현

### POST /api/auth/send-otp

전화번호를 받아 OTP를 SMS로 발송합니다.

```typescript
// 요청
{ phoneNumber: string }  // 예: "01012345678"

// 처리 순서:
// 1. 전화번호 형식 검증 (한국 010-xxxx-xxxx 형식)
// 2. 전화번호를 SHA-256으로 해시 (원본 저장 금지)
// 3. otp_requests 테이블에서 최근 5분 내 발급 이력 확인 (재발송 방지)
// 4. 6자리 랜덤 OTP 생성
// 5. otp_requests 테이블에 저장 (만료: 5분)
// 6. Twilio로 SMS 발송
// 7. 성공 응답 (OTP 자체는 응답에 포함하지 않음)

// 응답 성공
{ success: true, message: "OTP가 발송되었습니다" }

// 응답 실패
{ success: false, error: "이미 발송된 OTP가 있습니다. 5분 후 재시도해주세요" }
```

### POST /api/auth/verify-otp

OTP를 검증하고, 투표권이 있으면 RI를 발급합니다.

```typescript
// 요청
{ phoneNumber: string; otp: string; electionId: string }

// 처리 순서:
// 1. 전화번호 해시 생성
// 2. otp_requests에서 유효한 OTP 확인 (미사용 + 미만료)
// 3. OTP 일치 확인 — 불일치 시 즉시 실패 반환
// 4. voters 테이블에서 투표권 확인:
//    - 해당 전화번호 + electionId가 명부에 있는가?
//    - is_voted가 false인가? (이미 투표했으면 거부)
// 5. 모두 통과 시:
//    a. otp_requests의 is_used = true 업데이트
//    b. crypto.randomUUID()로 RI 생성
//    c. voters의 ri_issued_at 업데이트
//    d. 운영서버로 RI 전달 (아래 내부 API 참조)
//    e. 클라이언트에 RI와 운영서버 URL 반환
//    f. 이후 이 서버와의 연결 유지 없음

// 응답 성공
{
  success: true,
  ri: string,           // 128비트 UUID
  opsServerUrl: string, // 운영서버 주소 (환경변수에서)
  expiresAt: string     // 30분 후 ISO 시각
}

// 응답 실패 케이스
{ success: false, error: "투표권이 없습니다" }
{ success: false, error: "이미 투표하셨습니다" }
{ success: false, error: "OTP가 올바르지 않습니다" }
{ success: false, error: "OTP가 만료되었습니다" }
```

### POST /api/internal/register-ri  (운영서버에 RI 등록 — 내부용)

인증서버가 운영서버를 직접 호출하는 내부 함수입니다.
이것은 API 엔드포인트가 아니라 서버 내부에서 fetch()로 호출하는 함수입니다.

```typescript
// apps/auth-server/src/lib/register-ri-to-ops.ts 로 구현
async function registerRIToOps(ri: string, electionId: string, expiresAt: Date): Promise<boolean>

// 운영서버 /api/internal/receive-ri 를 POST로 호출
// 헤더에 AUTH_TO_OPS_SECRET을 포함하여 인증
// 실패 시 재시도 없이 즉시 에러 반환 (클라이언트에게 실패 알림)
```

---

## 프론트엔드 페이지 구현

### 페이지: /  (메인 투표 시작 화면)

모바일 최적화된 단순한 화면입니다.

```
[Who Whom Voting System 로고/제목]

선거 제목: [선거명 표시]

투표 참여를 위해 본인 인증을 진행합니다.

[전화번호 입력란]  예: 01012345678
[인증번호 받기 버튼]
```

상태 관리:
- `step`: 'phone' | 'otp' | 'redirecting'
- `phoneNumber`: string
- `electionId`: URL 파라미터 또는 환경변수에서

### 페이지: / — OTP 입력 단계 (같은 페이지, 조건부 렌더링)

```
[전화번호]로 인증번호를 발송했습니다.

[6자리 숫자 입력란 — 자동 포커스]
[확인 버튼]
[재발송 (60초 후 활성화)]
```

OTP 확인 성공 시:
- 로컬스토리지에 RI 저장: `wwvs_ri`, `wwvs_expires_at`
- 운영서버 URL로 자동 redirect (window.location.href)
- "투표소로 이동 중..." 로딩 화면 표시

---

## 보안 요구사항

1. Rate limiting: /api/auth/send-otp는 IP당 분당 3회 제한
   - 간단 구현: 메모리 Map 사용 (MVP 수준)

2. 전화번호는 절대 평문으로 DB 저장하지 않음
   - SHA-256 해시 후 저장
   - `crypto.createHash('sha256').update(phone).digest('hex')`

3. 내부 API (register-ri-to-ops) 호출 시 반드시 시크릿 헤더 포함
   - `Authorization: Bearer ${process.env.AUTH_TO_OPS_SECRET}`

4. RI는 클라이언트에게 한 번만 전달됨
   - DB에는 RI 자체를 저장하지 않음 (운영서버 장부에만 있음)
   - 인증서버는 RI를 발급했다는 타임스탬프만 기록

---

## 구현 파일 목록

```
apps/auth-server/src/
├── app/
│   ├── page.tsx                    # 메인 투표 시작 화면
│   ├── layout.tsx                  # 레이아웃 (모바일 최적화)
│   └── api/
│       └── auth/
│           ├── send-otp/route.ts   # OTP 발송
│           └── verify-otp/route.ts # OTP 검증 + RI 발급
├── lib/
│   ├── supabase.ts                 # Supabase 클라이언트
│   ├── phone-hash.ts               # 전화번호 해시 유틸
│   ├── otp-generator.ts            # OTP 생성
│   ├── twilio.ts                   # SMS 발송
│   └── register-ri-to-ops.ts       # 운영서버 RI 등록
└── components/
    ├── PhoneInput.tsx              # 전화번호 입력 컴포넌트
    ├── OtpInput.tsx                # OTP 입력 컴포넌트
    └── LoadingScreen.tsx           # 리다이렉트 로딩 화면
```

---

## UI 스타일 가이드

- 배경: 흰색 (#FFFFFF)
- 메인 컬러: 남색 (#1B2A6B) — 신뢰감
- 버튼: 남색 배경, 흰색 텍스트, 둥근 모서리
- 폰트: 시스템 폰트 (별도 웹폰트 불필요)
- 최대 너비: 430px (모바일 우선)
- 상단에 "Who Whom Voting System" 텍스트 로고

---

## 작업 완료 후 확인 사항

- [ ] `npm run dev`로 포트 3001에서 실행되는가
- [ ] 전화번호 입력 후 OTP 발송 API가 200을 반환하는가
- [ ] OTP 검증 성공 시 RI가 응답에 포함되는가
- [ ] 이미 투표한 번호로 재시도 시 거부되는가
- [ ] 전화번호가 DB에 해시로 저장되는가
