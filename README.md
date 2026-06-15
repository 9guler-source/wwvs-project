# WWVS — Who Whom Voting System

모바일 전화번호 기반 익명 전자투표 시스템입니다.  
**3서버 분리 아키텍처로 투표자 익명성을 수학적으로 보장**합니다.

## 시스템 개요

```
[투표자]
   │
   ▼
┌──────────────┐   RI 발급   ┌──────────────┐   RI 검증   ┌──────────────┐
│  인증 서버    │ ──────────▶ │  운영 서버    │ ──────────▶ │  개표 서버    │
│ (auth-server)│            │ (ops-server) │            │(count-server)│
│              │            │              │            │              │
│ • 전화번호 OTP│            │ • 투표용지   │            │ • 투표 기록  │
│ • 투표권 확인│            │ • RI 장부    │            │ • 개표 결과  │
└──────────────┘            └──────────────┘            └──────────────┘
     auth_db                     ops_db                     count_db
```

각 서버는 서로 다른 Supabase 프로젝트를 사용합니다.  
인증 서버는 투표자의 신원만 알고, 개표 서버는 누가 어떻게 투표했는지 알 수 없습니다.  
RI(Registration Identifier)를 통해 중복 투표 방지와 익명성을 동시에 보장합니다.

## 폴더 구조

```
wwvs/
├── apps/
│   ├── auth-server/        # 인증 서버 — 포트 3001
│   ├── ops-server/         # 운영 서버 — 포트 3002
│   └── count-server/       # 개표 서버 — 포트 3003
├── packages/
│   └── shared/             # 공통 타입, 유틸리티
├── supabase/
│   └── migrations/         # DB 마이그레이션 SQL
├── .env.example
└── package.json
```

## 로컬 실행 방법

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경변수 설정

루트의 `.env.example`을 복사하여 각 앱 디렉토리에 `.env.local` 파일을 만듭니다.

```bash
# 인증 서버
cp .env.example apps/auth-server/.env.local

# 운영 서버
cp .env.example apps/ops-server/.env.local

# 개표 서버
cp .env.example apps/count-server/.env.local
```

각 `.env.local` 파일에 아래 값을 채워 넣으세요:

| 변수 | 설명 |
|------|------|
| `AUTH_SUPABASE_URL` | 인증 서버용 Supabase 프로젝트 URL |
| `AUTH_SUPABASE_SERVICE_KEY` | 인증 서버용 service_role 키 |
| `OPS_SUPABASE_URL` | 운영 서버용 Supabase 프로젝트 URL |
| `OPS_SUPABASE_SERVICE_KEY` | 운영 서버용 service_role 키 |
| `COUNT_SUPABASE_URL` | 개표 서버용 Supabase 프로젝트 URL |
| `COUNT_SUPABASE_SERVICE_KEY` | 개표 서버용 service_role 키 |
| `TWILIO_ACCOUNT_SID` | Twilio 계정 SID |
| `TWILIO_AUTH_TOKEN` | Twilio 인증 토큰 |
| `TWILIO_PHONE_NUMBER` | SMS 발송 번호 |
| `OPS_HMAC_SECRET` | 투표확인서 서명 시크릿 (`openssl rand -hex 32`) |
| `AUTH_TO_OPS_SECRET` | 인증↔운영 서버 간 통신 시크릿 |
| `OPS_TO_COUNT_SECRET` | 운영↔개표 서버 간 통신 시크릿 |

### 3. DB 마이그레이션

`supabase/migrations/001_initial_schema.sql`을 각 Supabase 프로젝트의 SQL 에디터에서 실행합니다.
- **auth_db 섹션**: 인증 서버용 Supabase 프로젝트
- **ops_db 섹션**: 운영 서버용 Supabase 프로젝트
- **count_db 섹션**: 개표 서버용 Supabase 프로젝트

### 4. 개별 서버 실행

```bash
# 인증 서버 (포트 3001)
npm run dev:auth

# 운영 서버 (포트 3002)
npm run dev:ops

# 개표 서버 (포트 3003)
npm run dev:count

# 전체 동시 실행
npm run dev:all
```

## 기술 스택

- **프레임워크**: Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **데이터베이스**: Supabase (PostgreSQL, Tokyo 리전)
- **SMS**: Twilio API (OTP 발송)
- **배포**: Vercel

## 보안 설계 원칙

1. **서버 분리**: 3개의 독립 서버가 각각 별도의 DB를 사용하여 정보 교차 추적 불가
2. **RI 치환**: 인증에 사용된 RI는 투표 시 새로운 RI로 교체되어 연결 고리 차단
3. **RLS**: 모든 테이블에 Row Level Security 적용, `service_role` 키로만 접근 가능
4. **HMAC 서명**: 투표확인서에 서버 비밀키로 서명하여 위변조 방지
5. **전화번호 해시**: DB에는 해시된 전화번호만 저장
