# WWVS Phase 1 — 프롬프트 01: 프로젝트 초기화 & DB 스키마

## Claude Code에 이 내용을 그대로 붙여넣으세요

---

## 프로젝트 개요

"Who Whom Voting System (WWVS)"의 Phase 1 MVP를 구현합니다.
모바일 전화번호 기반 익명 전자투표 시스템으로, 3개의 독립 서버로 구성됩니다.

## 기술 스택

- Next.js 14 (App Router) + TypeScript + Tailwind CSS
- Supabase (PostgreSQL, Tokyo 리전) — 기존 계정 사용
- Vercel 배포
- Twilio SMS API (OTP 발송)

## 지금 해줄 작업: 모노레포 초기화 + DB 스키마 전체 생성

### 1. 폴더 구조 생성

아래 구조로 프로젝트를 초기화해주세요:

```
wwvs/
├── apps/
│   ├── auth-server/        # 인증 서버 (Next.js)
│   ├── ops-server/         # 운영 서버 (Next.js)
│   └── count-server/       # 개표 서버 (Next.js)
├── packages/
│   └── shared/             # 공통 타입, 유틸리티
├── supabase/
│   └── migrations/         # DB 마이그레이션 SQL
├── .env.example
├── package.json            # 모노레포 루트
└── README.md
```

각 apps/ 하위 Next.js 앱은 `npx create-next-app`으로 초기화하되,
TypeScript + Tailwind CSS + App Router + src/ 디렉토리 사용으로 설정해주세요.

### 2. Supabase DB 스키마 생성

`supabase/migrations/001_initial_schema.sql` 파일을 만들고
아래 테이블들을 모두 생성하는 SQL을 작성해주세요.

#### 테이블 설계 명세

**[인증 서버 DB] — auth_db**

```
voters (투표인 명부)
- id: uuid PRIMARY KEY DEFAULT gen_random_uuid()
- phone_number: text UNIQUE NOT NULL  -- 해시 처리된 전화번호
- election_id: uuid NOT NULL
- is_voted: boolean DEFAULT false     -- 투표 완료 여부
- ri_issued_at: timestamptz           -- RI 발급 시각
- created_at: timestamptz DEFAULT now()

elections (선거 목록)
- id: uuid PRIMARY KEY DEFAULT gen_random_uuid()
- title: text NOT NULL
- description: text
- status: text DEFAULT 'pending'      -- pending | open | closed
- opens_at: timestamptz NOT NULL
- closes_at: timestamptz NOT NULL
- created_at: timestamptz DEFAULT now()

otp_requests (OTP 발급 이력)
- id: uuid PRIMARY KEY DEFAULT gen_random_uuid()
- phone_hash: text NOT NULL
- otp_code: text NOT NULL             -- 6자리, 5분 후 만료
- expires_at: timestamptz NOT NULL
- is_used: boolean DEFAULT false
- created_at: timestamptz DEFAULT now()
```

**[운영 서버 DB] — ops_db**

```
ri_ledger (RI 장부 — 유효한 RI 목록)
- id: uuid PRIMARY KEY DEFAULT gen_random_uuid()
- ri_value: text UNIQUE NOT NULL      -- 128비트 난수 UUID
- election_id: uuid NOT NULL
- issued_at: timestamptz DEFAULT now()
- expires_at: timestamptz NOT NULL    -- 발급 후 30분
- is_used: boolean DEFAULT false
- used_at: timestamptz

ballot_options (투표 항목)
- id: uuid PRIMARY KEY DEFAULT gen_random_uuid()
- election_id: uuid NOT NULL
- option_text: text NOT NULL
- display_order: int NOT NULL
```

**[개표 서버 DB] — count_db**

```
vote_certificates (투표확인서 — 투표 대장)
- id: uuid PRIMARY KEY DEFAULT gen_random_uuid()
- election_id: uuid NOT NULL
- new_ri: text UNIQUE NOT NULL        -- 교체된 신규 RI
- selected_option_id: uuid NOT NULL   -- 선택한 항목 ID
- selected_option_text: text NOT NULL -- 항목 텍스트 (스냅샷)
- hmac_signature: text NOT NULL       -- HMAC-SHA256 서명
- created_at: timestamptz DEFAULT now()
- is_published: boolean DEFAULT false -- 결과 공개 여부

election_results (집계 결과 — 공개용)
- id: uuid PRIMARY KEY DEFAULT gen_random_uuid()
- election_id: uuid NOT NULL
- option_id: uuid NOT NULL
- option_text: text NOT NULL
- vote_count: int DEFAULT 0
- finalized_at: timestamptz
```

#### 보안 설정 (RLS)

각 테이블에 Row Level Security를 활성화하고,
서버 역할(service_role)만 접근 가능하도록 정책을 설정해주세요.
일반 anon 키로는 어떤 테이블도 읽기/쓰기 불가능해야 합니다.

#### 인덱스

성능을 위해 아래 인덱스를 추가해주세요:
- voters(phone_number, election_id)
- ri_ledger(ri_value) — 빠른 RI 조회용
- vote_certificates(new_ri) — 개인 검증용 검색
- vote_certificates(election_id) — 집계용

### 3. 공통 타입 패키지 생성

`packages/shared/src/types.ts` 파일을 만들고
아래 TypeScript 타입들을 정의해주세요:

```typescript
// 선거 상태
export type ElectionStatus = 'pending' | 'open' | 'closed';

// 투표 단계
export type VotingStep = 
  | 'phone_input'      // 전화번호 입력
  | 'otp_verify'       // OTP 인증
  | 'ballot'           // 투표용지
  | 'completed';       // 완료

// RI 정보 (서버 간 전달용)
export interface RIPayload {
  ri: string;
  electionId: string;
  expiresAt: string;
}

// 투표확인서
export interface VoteCertificate {
  newRi: string;
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
```

### 4. 환경변수 템플릿 생성

루트의 `.env.example` 파일:

```env
# ── 공통 ──────────────────────────────────
NEXT_PUBLIC_SITE_NAME=Who Whom Voting System

# ── 인증 서버 ──────────────────────────────
AUTH_SUPABASE_URL=
AUTH_SUPABASE_SERVICE_KEY=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
OTP_EXPIRY_MINUTES=5
RI_EXPIRY_MINUTES=30

# ── 운영 서버 ──────────────────────────────
OPS_SUPABASE_URL=
OPS_SUPABASE_SERVICE_KEY=
OPS_HMAC_SECRET=          # 32자 이상 랜덤 문자열 (openssl rand -hex 32)

# ── 개표 서버 ──────────────────────────────
COUNT_SUPABASE_URL=
COUNT_SUPABASE_SERVICE_KEY=

# ── 서버 간 통신 ───────────────────────────
AUTH_TO_OPS_SECRET=       # 인증서버→운영서버 통신 시크릿
OPS_TO_COUNT_SECRET=      # 운영서버→개표서버 통신 시크릿
AUTH_SERVER_URL=http://localhost:3001
OPS_SERVER_URL=http://localhost:3002
COUNT_SERVER_URL=http://localhost:3003
```

### 5. README.md 작성

프로젝트 소개, 로컬 실행 방법, 환경변수 설정 방법을 한국어로 작성해주세요.
시스템 개요에 "3서버 분리 아키텍처로 투표자 익명성을 수학적으로 보장"한다는 내용을 포함해주세요.

---

## 작업 완료 후 확인 사항

- [ ] 세 개의 Next.js 앱이 각각 독립적으로 `npm run dev`로 실행되는가
- [ ] SQL 마이그레이션 파일이 Supabase에서 오류 없이 실행되는가
- [ ] 공통 타입이 각 앱에서 import 가능한가
- [ ] .env.example의 모든 변수가 문서화되어 있는가
