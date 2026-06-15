# WWVS — Claude Code 시작 가이드

## 사용 순서

Claude Code를 열고, 아래 순서대로 각 프롬프트 파일의 내용을 붙여넣으세요.
한 프롬프트가 완료된 후 다음 프롬프트로 넘어가세요.

---

## STEP 1: 01_project_init_and_database.md

→ 모노레포 초기화 + Supabase DB 스키마 전체 생성
→ 예상 소요 시간: 20~30분
→ 완료 확인: 세 Next.js 앱이 실행되고 SQL이 오류 없이 돌아가면 OK

## STEP 2: 02_auth_server.md

→ 인증서버 구현 (OTP + RI 발급)
→ 예상 소요 시간: 30~40분
→ 완료 확인: OTP 발송 → 검증 → RI 반환 흐름이 Postman으로 확인되면 OK

## STEP 3: 03_ops_and_count_server.md

→ 운영서버 + 개표서버 구현
→ 예상 소요 시간: 40~60분
→ 완료 확인: 전체 투표 흐름 end-to-end 테스트 통과

---

## 사전 준비 사항

Claude Code 시작 전에 아래를 준비해두세요:

### 1. Supabase 프로젝트
- 기존 계정에서 새 프로젝트 생성 (또는 기존 프로젝트 사용)
- 3개 서버를 동일 Supabase 인스턴스에서 운영해도 됩니다 (스키마 분리)
- 서비스 키(service_role key) 복사해두기

### 2. Twilio 계정 (SMS 발송)
- https://www.twilio.com 에서 무료 계정 생성
- Account SID, Auth Token, 발신 번호 준비
- 한국 번호로 SMS를 보내려면 국제 발신 허용 설정 필요
- **대안**: 개발 단계에서는 OTP를 콘솔에 출력하는 방식으로 Twilio 없이 테스트 가능
  → Claude Code에 "Twilio 대신 개발 모드에서는 OTP를 콘솔 로그로 출력"이라고 추가 요청

### 3. 환경변수 준비
.env.example을 복사하여 .env.local 파일을 만들고
HMAC 시크릿 생성:
```bash
# 터미널에서 실행
openssl rand -hex 32
# 결과값을 OPS_HMAC_SECRET, AUTH_TO_OPS_SECRET, OPS_TO_COUNT_SECRET에 사용
```

---

## Claude Code 활용 팁

### 프롬프트 실행 중 오류가 나면
"위 오류를 수정하고 계속 진행해줘" 라고 입력하면 됩니다.

### 특정 부분만 수정하고 싶으면
"ops-server의 /api/vote/submit 엔드포인트만 다시 작성해줘" 처럼 구체적으로 요청

### 테스트 데이터 넣기
"테스트용 선거 데이터와 투표인 명부를 Supabase에 seed 해줘" 라고 요청

### 막히는 부분이 있으면
이 채팅창으로 돌아와서 물어보세요.
현재 구현된 코드를 복사해서 보여주면 같이 디버깅할 수 있습니다.

---

## Phase 1 완료 기준

아래 시나리오가 실제로 작동하면 MVP 완성입니다:

```
1. 브라우저에서 인증서버(localhost:3001) 접속
2. 전화번호 입력 → OTP 수신 → 인증 완료
3. 자동으로 운영서버(localhost:3002)로 이동
4. 투표용지 표시 → 항목 선택 → 투표 제출
5. 투표확인서(신규 RI 포함) 화면에 표시
6. 개표서버(localhost:3003/verify)에서
   신규 RI를 입력해서 본인 투표 확인
```

이것이 작동하면 "1인 1표 + 비밀투표 + 검증 가능"이 모두 구현된 것입니다.

---

## 다음 단계 (Phase 2 예고)

Phase 1 완료 후 진행할 내용:
- HMAC 검증 강화
- 투표 중단 복구 로직 완성
- 관리자 대시보드 추가
- Vercel + Railway 실 배포
- 외부 보안 검토
