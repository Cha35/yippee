# CONTEXT.md — 팀 회비 관리 웹앱 인수인계

> 이 문서는 다른 도구(Codex, Cursor 등)나 새 세션에서 작업을 이어받기 위한 핸드오프 문서입니다.
> 대화 히스토리는 넘어가지 않으므로, 여기에 아키텍처·데이터모델·주요 결정·다음 할 일을 정리합니다.

## 1. 개요

축구팀(야구팀?) **회비/거래 관리 웹앱**. 카카오뱅크 모임통장 거래내역(CSV)을 올려 회비 납입 현황을 추적하고, 지출/기타수입을 정리하며, 다음 리그 비용 계획을 세운다.

- **완전 클라이언트 전용 SPA. 백엔드/DB 없음.** 모든 상태는 브라우저 `localStorage`에 저장.
- 배포: Vercel, `main` 브랜치 자동 배포.
- 개발 브랜치: **`final/league-fee`** → `main`으로 push (Vercel이 main을 배포).
  - 주의: 하네스가 지정한 `claude/jolly-hypatia-8l0uex` 브랜치는 **사용 안 함**. 실제 작업물은 전부 `final/league-fee`/`main`에 있음.

## 2. 기술 스택

- React 18 + TypeScript + Vite
- Tailwind CSS
- lucide-react (아이콘)
- papaparse (CSV 파싱)
- @anthropic-ai/sdk (`dangerouslyAllowBrowser: true`) — 미매칭 입금 AI 자동 분류(Claude Haiku)
- 상태 저장: 커스텀 `useLocalStorage` 훅

```bash
npm install
npm run dev      # 개발
npm run build    # tsc && vite build (배포 전 반드시 통과 확인)
```

## 3. 파일 구조

```
src/
  main.tsx                    # 진입점, <AdminProvider>로 App 감쌈
  App.tsx                     # 탭 네비, 전역 state(localStorage), AdminControl(PIN 버튼)
  auth.tsx                    # ★ 관리자 인증 (PIN). Supabase 교체 시 여기만 수정
  types.ts                    # 모든 타입 정의
  hooks/useLocalStorage.ts    # localStorage 동기화 훅 (setState 함수형 업데이트 지원)
  utils/
    calculations.ts           # 회비 계산 핵심 로직 (computeDuesStatuses 등)
    csvParser.ts              # 카카오뱅크 CSV 파싱
    claudeApi.ts              # Claude Haiku 미매칭 매칭
  data/
    initialMembers.ts         # 시드: 팀원 20명 (INITIAL_MEMBERS)
    initialTransactions.ts    # 시드: 실제 거래 100건 (INITIAL_TRANSACTIONS)
  components/
    Dashboard.tsx             # 대시보드(잔액, 납입률, 이번달 현황 월납/일시납 분리)
    MemberManager.tsx         # 팀원 관리 + 앱 설정(회비 시작월, 리그비, 팀원별 규칙)
    TransactionManager.tsx    # 입출금 내역: CSV 업로드, 목록, 미매칭 분류, AI
    DuesTracker.tsx           # 회비 납입 현황 그리드 + 셀 모달(이관/분할, 댓글)
    ExpenseManager.tsx        # 지출: 자동(출금) + 수동 + 기타수입, 카테고리 요약
    LeaguePlanner.tsx         # 다음 리그 비용 계획 계산기
```

## 4. 탭 구성 (App.tsx)

`대시보드 / 팀원 / 입출금 내역 / 회비 납입 현황 / 지출 / 리그계획`

## 5. 데이터 모델 (types.ts 요약)

- **Member**: `id, name, role('captain'|'member'), monthlyDues, annualDues?, paymentType('monthly'|'annual'), aliases[], active, joinDate(YYYY-MM)`
  - `exempt?`: 기본 회비 면제
  - `duesRules?: MemberDuesRule[]`: 특정월부터 회비 변경 규칙
- **MemberDuesRule**: `fromMonth, toMonth?(미설정=계속), monthlyDues(0=면제), note?`
- **Transaction**: `id, date(YYYY-MM-DD), type('입금'|'출금'), amount, balance, description(=CSV 내용), memo?(=CSV 메모), depositorName, memberId?, isManualEntry`
  - `category?('dues'|'general'|'interest')`, `reason?` — 미매칭 입금 분류
  - `duesAllocations?: DuesAllocation[]` — **회비 월 이관/분할**. 있으면 거래일 기준 자동집계 대신 이 배분만 회비로 집계
- **DuesAllocation**: `yearMonth, amount, reason?`
- **Settings**: `teamName, defaultMonthlyDues, leagueFeeStartMonth?, monthlyLeagueFee?, duesStartMonth?(이 달부터 미납 체크, 기본 2026-03)`
- **DuesStatus**(계산 산출물): `memberId, yearMonth, required, paid, status, manualOverride?, transactions[], exempt?, leagueFee*`
- **CellComment**: `id, cellKey('memberId:yearMonth'), name, text, createdAt` — 셀 댓글

### localStorage 키
`tdm:members`, `tdm:transactions`, `tdm:expenses`, `tdm:leaguePlan`, `tdm:settings`, `tdm:overrides`(수동 납입 상태), `tdm:comments`, `tdm:admin`(관리자 해제 여부), `tdm:seed-v1`(시드 강제주입 플래그), `tdm:migrate-duesStart`(백필 플래그), `anthropic_api_key`(AI용)

## 6. 핵심 도메인 규칙 (중요)

1. **회비 시작월(`duesStartMonth`, 기본 2026-03)**: 이전 달(1·2월)은 다른 통장에서 걷어서 미납 체크 안 함(전부 납입 처리). 그리드에서 기본 숨김 + "N월 보기" 토글.
2. **월납 vs 일시납(annual)**: 일시납은 연회비를 한 번에 냄 → 월별 미납 없음. 대시보드 이번달 현황에서 월납/일시납 분리, 납입률은 월납자 기준.
3. **팀원별 규칙(면제/감면)**: `effectiveMonthlyDues(member, ym)` = 해당 월 범위(fromMonth~toMonth)에 맞는 최근 규칙 적용, 없으면 `exempt ? 0 : monthlyDues`. 0이면 "면제"(회색 셀). 면제 시 리그비 추가징수도 면제.
   - 예) 주전 포수: exempt=true + 규칙{from:2026-05, 30000} → 4월까지 면제, 5월부터 징수
   - 예) 부상자: 규칙{from:2026-04, to:2026-06, 15000, note:부상} → 한시 감면
4. **입금 이관/분할(`duesAllocations`)**: 한 거래를 다른 달 회비로 옮기거나 나눔. `duesContribution(tx, ym)`이 배분 우선 계산. DuesTracker 셀 모달에서 편집.
   - 예) "강우혁 4월"로 적힌 4/24 입금을 5월 회비로 이관
   - 예) 김경원 2/24 5만원을 3·4월 회비로 분할
5. **미매칭 입금 분류(TransactionManager)**: 이름 자동매칭 실패한 입금을 회비/일반입금/이자로 분류.
   - **회비 분류 시 팀원+적용월을 연결**해야 납입현황에 반영됨(안 하면 사라짐 — 과거 버그).
   - 일반/이자는 지출 탭 "기타 수입"에 표시. "분류 완료 입금" 섹션에서 추적/수정/취소.
6. **거래 내용 표시(`txContent`)**: 시드 데이터는 `description`에 거래구분("일반이체")이 들어가고 실제 내용은 `depositorName`에 있음. `txContent()`가 description이 일반값(일반이체/일반입금/간편이체/예금이자 등)이면 depositorName을 대신 표시. 실제 CSV 업로드는 `description`=내용이라 정상.
7. **지출 요약**: 상단 카테고리 카드/총액 = 수동 지출 + 거래내역 자동 출금 합산. 자동 출금은 키워드로 카테고리 추정(`categorizeOutflow`).
8. **CSV 파서**: 카카오뱅크 컬럼 `거래일시|구분|거래금액|거래 후 잔액|거래구분|내용|메모`. `구분`=입출금, `내용`→description, `메모`→memo. 중복(date|amount|depositorName) 자동 제거.
   - 원본은 **암호화된 xlsx**(CDFV2). 앱은 CSV만 받음 → 현재는 수동으로 복호화(비밀번호 `950613`, `msoffcrypto`+`openpyxl`) 후 CSV 변환 필요.

## 7. 권한(관리자/열람자) — 라이트 버전

- **`src/auth.tsx`** 한 곳에 집약. `ADMIN_PIN = '435Anton12!@'`, `useAdmin()` 훅(`isAdmin, unlock, lock`), `localStorage['tdm:admin']`.
- 우상단 **AdminControl** 버튼(App.tsx): 열람 모드 ↔ PIN 입력 ↔ 관리자.
- `isAdmin`으로 각 컴포넌트의 등록/수정/삭제 UI를 게이팅. 열람자는 조회 + **회비 셀 댓글**만 가능.
- ⚠️ **진짜 보안 아님**: 클라이언트 체크라 devtools로 우회 가능. localStorage라 링크 공유해도 데이터 자체가 공유되지 않음(댓글도 기기 로컬).

## 8. 다음 할 일 (우선순위)

### ★ 1순위: Supabase 연동 (진짜 공유 + 진짜 권한)
현재 구조의 근본 한계 해결:
- **공유 DB**에 팀 데이터 저장 → 링크로 실시간 열람
- **관리자만 쓰기**(서버 검증) → PIN 클라 체크를 서버 인증으로 교체
- **댓글 테이블** → 열람자도 중앙 저장되는 댓글 작성

교체 포인트:
- `src/auth.tsx`: `unlock()`을 Supabase Auth(비번/매직링크)로, `ADMIN_PIN` 제거. `isAdmin` 게이팅은 그대로 재사용.
- `useLocalStorage` 사용처(App.tsx의 members/transactions/expenses/settings/leaguePlan/overrides/comments)를 Supabase 테이블 read/write로 교체. 단일 팀이면 "app_state" 단일 row(JSON) + "comments" 테이블 정도로 시작 가능.
- 쓰기는 RLS 또는 서버리스 함수로 관리자만 허용.

### 그 외 백로그(차차 고도화)
- 유니폼 품목 단가표 기반 **입금액 자동 추정 → 관리자 확인 후 반영**(예: 143,000 = 회비30,000 + 풀세트93,000 …). 품목 예: 상의41,000/하의26,000/모자15,000/상하모세트77,000/풀세트93,000/언더11,000/벨트4,000/양말3,000.
- 자금 흐름 투명성: 잔액이 회비/유니폼/리그비 등 어떤 목적별로 쌓였는지 대시보드에 표시.
- 앱 내에서 암호화 xlsx 직접 업로드(브라우저 복호화).

## 9. 작업 규칙

- 커밋 전 `npm run build` 통과 확인(tsc 엄격).
- `final/league-fee`에서 작업 → `git push origin final/league-fee:main` (Vercel 배포).
- 커밋 서명: `git config user.email noreply@anthropic.com && git config user.name Claude` (하네스 요구).
