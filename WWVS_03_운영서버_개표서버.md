# WWVS Phase 1 — 프롬프트 03: 운영서버 + 개표서버 + 검증 포털

## Claude Code에 이 내용을 그대로 붙여넣으세요

---

## 작업 전제

- 프롬프트 01, 02가 완료된 상태입니다
- `apps/ops-server/` (포트 3002)
- `apps/count-server/` (포트 3003)
- 두 서버를 이 프롬프트에서 함께 구현합니다

---

# PART A: 운영 서버 (ops-server)

운영서버는 RI를 검증하고, 투표를 받고, RI를 교체하고, 투표확인서를 발급합니다.

## API 엔드포인트

### POST /api/internal/receive-ri  (인증서버로부터 RI 수신)

```typescript
// 헤더 검증: Authorization: Bearer ${AUTH_TO_OPS_SECRET}
// 요청
{ ri: string; electionId: string; expiresAt: string }

// 처리:
// ri_ledger 테이블에 저장
// expires_at = 요청의 expiresAt (30분)

// 응답
{ success: true }
```

### GET /api/vote/ballot?ri=xxx&electionId=xxx  (투표용지 조회)

```typescript
// 처리 순서:
// 1. ri_ledger에서 RI 존재 확인
// 2. is_used = false 확인 (사용된 RI 거부)
// 3. expires_at > now() 확인 (만료된 RI 거부)
// 4. ballot_options에서 해당 선거의 투표 항목 조회

// 응답 성공
{
  success: true,
  election: { id: string; title: string; description: string },
  options: BallotOption[]
}

// 응답 실패
{ success: false, error: "유효하지 않은 접근입니다" }  // RI 문제
{ success: false, error: "투표 시간이 만료되었습니다" } // RI 만료
```

### POST /api/vote/submit  (투표 제출 — 핵심 로직)

```typescript
// 요청
{ ri: string; electionId: string; selectedOptionId: string }

// 처리 순서 (트랜잭션으로 묶어야 함):
// 1. ri_ledger에서 RI 재검증 (is_used=false, 미만료)
// 2. ballot_options에서 선택 항목 유효성 확인
// 3. === 여기서부터 원자적 실행 ===
// 4. ri_ledger의 is_used = true, used_at = now() 업데이트
//    (동시 제출 방지: UPDATE ... WHERE is_used=false 조건 추가)
// 5. 신규 RI 생성: crypto.randomUUID()
// 6. 투표확인서 객체 생성:
//    {
//      newRi, electionId, selectedOptionId,
//      selectedOptionText, createdAt
//    }
// 7. HMAC-SHA256 서명 생성:
//    crypto.createHmac('sha256', OPS_HMAC_SECRET)
//           .update(JSON.stringify(certificate))
//           .digest('hex')
// 8. 개표서버에 투표확인서 전송 (아래 함수)
// 9. 클라이언트에 투표확인서 반환

// 응답 성공
{
  success: true,
  certificate: {
    newRi: string,
    electionId: string,
    selectedOptionId: string,
    selectedOptionText: string,
    hmacSignature: string,
    createdAt: string
  }
}

// 응답 실패
{ success: false, error: "이미 사용된 투표 코드입니다" }
{ success: false, error: "유효하지 않은 투표 항목입니다" }
```

### 내부 함수: sendCertificateToCount

```typescript
// apps/ops-server/src/lib/send-to-count.ts
async function sendCertificateToCount(certificate: VoteCertificate): Promise<boolean>

// count-server의 /api/internal/receive-certificate 를 POST로 호출
// 헤더: Authorization: Bearer ${OPS_TO_COUNT_SECRET}
// 실패 시 3회 재시도 (1초 간격)
// 3회 모두 실패 시 에러 로그 기록 (투표는 이미 유효 처리됨)
```

## 프론트엔드 페이지

### 페이지: /  (투표 화면)

URL에서 RI를 읽거나 (query param) 로컬스토리지에서 읽습니다.

```
[선거 제목]
[선거 설명]

아래 항목 중 하나를 선택하세요:

○ [항목 1]
○ [항목 2]
○ [항목 3]
...

[투표하기 버튼]
```

투표 완료 후 → `/complete` 페이지로 이동, 투표확인서 저장

### 페이지: /complete  (투표 완료)

```
투표가 완료되었습니다

귀하의 투표확인서:
┌─────────────────────────────────┐
│ 선거: [선거명]                   │
│ 선택: [선택한 항목]              │
│ 확인 코드(신규 RI):              │
│ xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxx│
│ 일시: 2025-01-01 12:00:00       │
└─────────────────────────────────┘

이 확인서를 저장해두세요.
투표 종료 후 확인 코드로 본인 투표를 검증할 수 있습니다.

[확인서 텍스트 복사] [스크린샷 안내]
```

로컬스토리지에 확인서 저장:
- 키: `wwvs_certificate_${electionId}`
- 값: VoteCertificate JSON

---

# PART B: 개표 서버 (count-server)

개표서버는 투표확인서를 저장하고, 집계하고, 공개합니다.

## API 엔드포인트

### POST /api/internal/receive-certificate  (운영서버로부터 확인서 수신)

```typescript
// 헤더 검증: Authorization: Bearer ${OPS_TO_COUNT_SECRET}
// 요청: VoteCertificate 객체

// 처리:
// 1. HMAC 서명 재검증 (OPS_HMAC_SECRET으로 검증)
// 2. new_ri 중복 확인 (이미 있으면 거부)
// 3. vote_certificates 테이블에 저장

// 응답
{ success: true }
{ success: false, error: "서명 검증 실패" }
{ success: false, error: "중복 확인서" }
```

### GET /api/results/:electionId  (집계 결과 조회 — 공개)

```typescript
// 선거 상태가 'closed'인 경우에만 결과 공개
// election_results 테이블에서 집계 결과 반환

// 응답
{
  election: { id, title, status },
  results: [
    { optionId, optionText, voteCount, percentage }
  ],
  totalVotes: number,
  finalizedAt: string | null
}
```

### GET /api/certificates/:electionId  (전체 확인서 공개 — 투표 종료 후)

```typescript
// 선거 상태가 'closed'이고 is_published=true인 경우만
// 페이지네이션: ?page=1&limit=100

// 응답
{
  certificates: VoteCertificate[],  // hmac_signature 포함
  total: number,
  page: number
}
```

### GET /api/verify/:newRi  (개인 투표 검증)

```typescript
// new_ri로 확인서 검색
// 선거 종료 후 is_published=true인 경우만

// 응답 성공 — 해당 RI의 확인서 반환
{
  found: true,
  certificate: {
    electionId, selectedOptionText, createdAt, hmacSignature
  }
}

// 응답 실패
{ found: false }
{ found: false, error: "아직 결과가 공개되지 않았습니다" }
```

### POST /api/admin/finalize/:electionId  (개표 확정 — 관리자)

```typescript
// 헤더: Authorization: Bearer ${ADMIN_SECRET}
// 처리:
// 1. vote_certificates 집계 → election_results 저장
// 2. elections status = 'closed' 업데이트
// 3. vote_certificates의 is_published = true 일괄 업데이트

// 응답
{ success: true, totalVotes: number }
```

## 프론트엔드 페이지

### 페이지: /  (메인 — 선거 목록 + 결과)

```
[Who Whom Voting System]
[공개 검증 포털]

현재 선거 목록:
- [선거명] [상태 배지: 진행중/종료]

종료된 선거 결과:
- [선거명] [결과 보기]
```

### 페이지: /results/:electionId  (결과 페이지)

```
[선거명] 결과

[막대 그래프로 항목별 득표율 표시]
항목 1: ████████ 42% (420표)
항목 2: █████    28% (280표)

총 투표수: 1,000표
개표 완료: 2025-01-01 18:00

[내 투표 확인하기] → /verify
```

### 페이지: /verify  (개인 투표 검증)

```
본인 투표 확인

확인 코드(신규 RI)를 입력하세요:
[입력란 — UUID 형식]
[확인하기]

결과:
✓ 확인서를 찾았습니다
  선거: [선거명]
  선택: [선택한 항목]
  투표 일시: [일시]
  HMAC 서명: [서명값]
```

### 페이지: /certificates/:electionId  (전체 확인서 목록)

모든 투표확인서를 테이블 형태로 표시합니다.
- 컬럼: 신규 RI (앞 8자리), 선택 항목, 투표 일시
- 검색: RI로 검색 가능
- 다운로드: CSV 내보내기 버튼

---

## 구현 파일 목록

```
apps/ops-server/src/
├── app/
│   ├── page.tsx                           # 투표 화면
│   ├── complete/page.tsx                  # 완료 + 확인서
│   └── api/
│       ├── internal/receive-ri/route.ts
│       ├── vote/
│       │   ├── ballot/route.ts
│       │   └── submit/route.ts
│       └── health/route.ts
├── lib/
│   ├── supabase.ts
│   ├── hmac.ts                            # HMAC 서명/검증
│   └── send-to-count.ts

apps/count-server/src/
├── app/
│   ├── page.tsx                           # 메인 + 선거 목록
│   ├── results/[electionId]/page.tsx      # 결과 페이지
│   ├── verify/page.tsx                    # 개인 검증
│   ├── certificates/[electionId]/page.tsx # 확인서 목록
│   └── api/
│       ├── internal/receive-certificate/route.ts
│       ├── results/[electionId]/route.ts
│       ├── certificates/[electionId]/route.ts
│       ├── verify/[newRi]/route.ts
│       └── admin/finalize/[electionId]/route.ts
└── lib/
    ├── supabase.ts
    └── hmac.ts                            # 운영서버와 동일한 HMAC 검증
```

---

## 보안 요구사항

1. HMAC 검증
   - 운영서버와 개표서버가 동일한 `OPS_HMAC_SECRET`을 사용
   - 확인서 수신 시 반드시 서명 재검증
   - 검증 실패 시 저장 거부 + 로그

2. 중복 제출 방지
   - `new_ri` 컬럼에 UNIQUE 제약 (DB 레벨)
   - 삽입 실패 시 중복 경보

3. 서버 간 인증
   - `OPS_TO_COUNT_SECRET` 헤더 검증
   - 헤더 없는 요청은 즉시 401 반환

4. 결과 공개 조건
   - 선거 status = 'closed'인 경우에만
   - 관리자가 finalize API를 호출해야만 공개

---

## 통합 테스트 시나리오

구현 완료 후 아래 흐름을 직접 테스트해주세요:

1. 인증서버(3001)에서 테스트 전화번호로 OTP 요청
2. OTP 확인 → RI 수신 확인
3. 운영서버(3002)에서 RI로 투표용지 조회
4. 항목 선택 후 투표 제출
5. 투표확인서의 신규 RI 확인
6. 관리자 finalize API 호출
7. 개표서버(3003)에서 결과 조회
8. /verify에서 신규 RI로 본인 투표 확인
9. /certificates에서 전체 확인서 목록 확인

---

## 작업 완료 후 확인 사항

- [ ] 세 서버가 모두 독립적으로 실행되는가
- [ ] 투표 제출 시 HMAC 서명이 생성되는가
- [ ] 동일 RI로 두 번 투표 시 두 번째는 거부되는가
- [ ] 개표서버에서 HMAC 재검증이 작동하는가
- [ ] /verify에서 신규 RI로 본인 투표를 찾을 수 있는가
- [ ] /certificates에서 모든 확인서 목록이 표시되는가
- [ ] CSV 다운로드가 작동하는가
