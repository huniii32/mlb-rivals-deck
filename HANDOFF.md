# Rivals Deck — 세션 인계

> 새 세션은 이 파일부터 읽을 것. 직전 상태: 2026-09-13.

## 앱 상태
- 탭 순서: 라인업 - 스킬점수 - 랭킹공유 - 정보글 (2026-09-13 변경)
- 상단바: 테마 전환 옆 문의하기 · 공지사항(`src/data/patchnotes.json` 패치 내역) 모달
- Supabase 연동 완료 (2026-09-13): 테이블 생성·왕복 테스트 통과·GitHub Secrets 2종 등록·배포본 반영 푸시(e0efcae)
  - 스키마 `scripts/supabase_schema.sql`, 클라이언트 `src/lib/supabase.ts`
  - 로컬 `.env` 입력됨(gitignore). env 없으면 로컬 모드로 동작
- UI (2026-09-13): 탭 순서 라인업-스킬점수-랭킹공유-정보글 / 케미는 구장 하단(엑셀 명칭 토탈·타자케미스트리)
  / 연도 입력은 스펙 615·645·680행 인라인 / 카드 그림은 자체 일러스트(파란 메탈프레임+금 OVR+불꽃배경+유니폼 벡터, 사진 자동검색 삭제)
  / 스코어보드·랭킹 소수 첫째자리
  / 덱코행 라벨(전체·1B 등) 삭제·다이아 간격 확대 / 스킬B 토글 삭제(전원 S 상시 +3)
- 공개 URL: https://huniii32.github.io/mlb-rivals-deck/ (main 푸시 → Actions 자동배포, `deploy-pages.sh`는 예비)
- 시너지·라커룸 입력칸 추가됨 (팝업 스탯표, 자동합산 포함)
- 소식 섹션: 공식 공지 번들(`src/data/notices.json`, 크롤러가 생성·커밋) + 정보글 수동등록(localStorage)
- 공유: 덱→URL 해시 공유, 링크 열면 가져오기 (브라우저 왕복 검증됨). 내 덱 랭킹 내장. 전체 공개 랭킹은 백엔드 필요로 미구현
- 덱코 UI: 게임 덱스코어 화면식 — 팀/스페셜 탭 + 행별 임계값 다이아몬드 + 좌/우 다이아몬드 행별 택1 (다이아몬드 클릭, 재클릭 해제)

## 덱 공유·랭킹 설계 기록 (2026-09-10)
- 공유 방식: 덱 JSON → base64url → `#d=` 해시. 서버 없이 동작, 받는 쪽이 가져오면 자기 덱 목록에 추가
- 검증: 헤드리스 크롬 왕복 테스트 (덱 1→2, 선수명 유지 확인). 주의: 테스트 시 도구막대의 파일-가져오기 버튼과 공유-가져오기 버튼이 동명이라 셀렉터 구분 필요
- 내 덱 랭킹: `calcDeckTotal` (engine.ts) — 선발/계투/타자 이름 있는 선수만 평균×10, 총점=선발×0.4+계투×0.1+타자×0.5. ResultPanel과 동일 로직
- 전체 공개 랭킹(불특정다수 집계) 미구현 사유: 집계 서버 없음. 하려면 Supabase(Postgres 무료) + 익명 투고 API 필요. 스팸/어뷰징対策도 함께 설계해야 함
- 소식: 공식 공지는 크롤러→`src/data/notices.json` 번들 (배포 포함). 펨코는 JS/로그인 장벽으로 자동 수집 불가 → 정보글 탭 수동 등록
- seed 수집: `scripts/crawl_notices.py --max-posts N` → `data/seed_players.csv` (gitignore) + `src/data/notices.json` (커밋)
- 펨코: 검색이 JS/로그인 장벽이라 자동 수집 불가. 정보글 탭 수동 등록으로 대응
- 로컬: `WEB_PORT=5176 npm run dev` (5174 trading·5175 clink와 분리됨)
- 구조: 단일 페이지 (라인업 다이아몬드 → 카드 클릭 팝업 편집 → 우측 케미·팀덱코/스덱코 → 상세 결과 → 스킬점수접기식)
- 데이터: 브라우저 localStorage, 덱별 저장 (키 `rivals-decks-v1`), 스킬표는 전역 (`rivals-tables-v1`), 사진캐시 (`rivals-photos-v1`), 테마 (`rivals-theme`)
- 계산 엔진: `src/lib/engine.ts` (엑셀 수식 이식, 덱코 규칙 1496개 `src/data/deckrules.json`에서 파싱 검증됨)
- 데이터 동기화 (2026-09-12, 엑셀 260910 기준): 스킬 27종 추가(타자 559→582·투수 648→652, 기존 점수 변동 0) / 덱코 재추출 결과 조건·점수 100% 동일(684 conds 일치, 164건은 행9 임계값 라벨 추가(계산 무관)) / 강화·초월·포훈 키 일치 / 검증 61+17 통과 유지

## 계산 로직 검증 (2026-09-10, `scripts/verify-full.ts` 61개 + `verify-engine.ts` 17개 통과)
- 검증 기준: 복구된 엑셀 원본의 전행 실데이터·캐시값 (덱코합/J/O/포훈적중/총점 D4=780·D5=780·D6=371·D7=575.5 전부 일치)
- 구조 확인: 투수행은 21행 헤더(변화/구위) 참조 — 엔진 매핑과 일치. 투수 특훈=Y/Z열(AA/AP 미사용)도 일치
- **엑셀 원본 결함 2건 발견 및 대응**:
  1. FA 계열 띄어쓰기 불일치 (드롭다운 `FA 시그니처 블랙` vs 표키 `FA시그니처 블랙`) → 엑셀은 #N/A. 앱은 공백제거 매칭으로 수정됨
  2. 강화 100셀·초월 120셀 미계산(0) → 스킬점수 탭에 초월·강화·포훈 표 편집기 추가.
   WBC·슈모 구멍 해결 (2026-09-13 게임 화면 17장 실측): 강화 WBC시그니처 실측입력, 초월 WBC시블랙·WBC시그니처·슈프림모먼트 원본복사, 나머지는 검증된 등급Alias (WBC시블랙·슈모→원본). WBC프라임·투수 WBC시그니처는 사진 없어 경고 유지. 검증 65+18 통과
   - 투수 WBC시그니처 강화 변화/구위 실측입력 (2026-09-13 버그사항2 16장: +20 합계 21). 초월 LV1~9 확인(합계 4.0, LV10~15 무보너스). 블랙3종 초월·강화, 슈모 초월·강화는 기존값과 일치 확인. 남은 구멍은 WBC프라임만. 검증 69+18 통과
- **가정 (원작자 미확인)** : 최종G/H/I=자동합산(수동 재지정 가능), 시너지·라커룸=스탯별 수동가산, 평균은 이름 있는 선수만
- **AN-AP·AQ/AR 추론 (2026-09-10, 확신도 포함)**:
  - 근거1: 워크북 전체 수식 중 AN/AP/AQ/AR열을 참조하는 곳이 AR 정의식以外 하나도 없음 → G/H/I(수동 최종값)를 계산하기 위한 메모용 입력칸
  - 근거2: 게임 육성수치표 행 중 엑셀 열이 없는 것은 포지션훈련/시너지/라커룸. AN-AP는 스탯별(파워/정확/선구) 숫자 0~7 → 이 중 하나의 시스템값을 적는 칸일 확률 높음. 타자는 선구(AP) 거의 공란, 투수는 변화/구위 둘 다 기입 — 포지션훈련 분포와 부합하는 패턴
  - 근거3: AQ 그룹 헤더=스킬, 전행 O, AR=O면+3, AQ10 잔류값 'S3' → 스킬 장착/조건 충족 보너스가 유력. 단 조건식 없이 수동 O라 정확한 조건은 불명
  - 결론: AN-AP=포지션훈련 확정 (2026-09-12 사용자 확인). 스탯별 숫자 그대로 `extra` 칸(편집팝업 '포지션훈련'열)에 기입. AQ 스킬보너스 +3은 전원 S라 상시 적용 (2026-09-13 사용자 확인, 토글 삭제·엔진 고정)
  - 원작자 확인 질문: "AN칸은 포지션훈련인가요? AQ에 O 치는 조건이 뭔가요?"

## 폰 스크린샷 분석 (~/다운로드/IMG_9852~9855.PNG)
- 선수 도감: **30,922장** (6970/30922) → 마스터 수집 대상 규모
- 육성 수치표: 6스탯(파워/정확/선구/인내/주루/수비) × 기본/훈련/강화/덱스코어/스킬/특훈/초월/**포지션훈련/시너지/라커룸/라커룸효과**
- 엑셀에 없는 `시너지·라커룸` 행 → 추후 수동 보너스칸 추가 검토

## 선수 마스터 수집 계획 (합의됨)
- 우선순위: Steam 에셋 → 네트워크(API) → 공식공지 HTML(seed) → 자동캡처/OCR → 수동(안 함)
- 팩트체크 완료: Steam판 존재 ✓, nProtect GameGuard 명시 ✓ (스토어 페이지 조회)
- **스팀 실측 완료 (2026-09-13)**: Unity IL2CPP ✓ (`GameAssembly.dll` 29MB + `global-metadata.dat` 19MB)
  - `MLBRIVALS_Data/StreamingAssets/aa/StandaloneWindows64/` 번들 **3066개 전부 UnityFS 정상** → "암호화" 썰은 오정보. UnityPy 파싱·TextAsset 평문 추출 검증됨
  - `catalog.json` 33MB 파싱: `.bytes` 키 1113개 전수 확인 → **선수 스탯 마스터 테이블 없음**. 인게임 밸런스표 + 오프라인 라인업만 존재
  - 결론: **스탯은 서버 제공 확정적**. 번일 추출로 얻을 수 있는 건 카드 이미지(`PlayerImage/ACT·MUG/팀/연도/선수ID`, 3만 장 규모)·스킬 테이블뿐
  - 스탯 수집 루트: MITM(1순위) 또는 에뮬+ADB+PaddleOCR(이미 설치됨)
- 원칙: GameGuard 환경에서 인젝션·후킹·메모리변조 금지. 정적 파일 + 정상 트래픽 관찰만
- 스키마 원칙: **player/card 분리** (오타니 '26 WBC시그 ≠ '26 라이브)
- 마스터 용도: 자동완성 + 기본스탯. 스킬점수·덱코 계산은 엑셀 확보분으로 충분
- 3만 행은 프론트 탑재 불가 → Supabase 등 DB + 검색 API 필요 (미구현)

## 랭킹 글 소유권 · 기기 간 연동 (2026-09-26)
### 진행 상태 (2026-09-26 갱신) — 방식 A(비밀코드) + 토큰 비공개화를 `feat/owner-codes` 브랜치에 구현함 (main 미병합·미배포)
- SQL: `scripts/supabase_mig_owner_codes.sql` (PGlite 로컬 검증 121개 통과, 멱등·원자적). **운영 DB에는 사용자가 Supabase SQL Editor에서 직접 실행해야 함** — 실행 전엔 클라이언트를 배포하지 말 것(새 RPC 없음). 옛 RPC는 유지되므로 SQL만 먼저 실행해도 현재 배포본은 안 깨짐
- 클라이언트: 랭킹 탭 "내 덱 코드" 카드(만들기·보기·복사·다른 기기에서 불러오기), `src/lib/ownerCode.ts`, `rankSync`의 owned 링크(`update_ranking_owned`, 코드는 기기 밖으로 RPC 인자로만 나감), 코드 만들기 시 기존 토큰 글 자동 claim(옛 토큰은 서버에서 폐기)
- 실행 후 확인(읽기 전용 프로브): `select=*`에 owner_token 없음, `list_my_rankings`/`claim_ranking` 존재. 그 다음 병합·배포·공지(v0.7)
- 알려진 한계: 이 수정 전에 이미 토큰을 긁어간 사람은 진짜 주인이 claim 하기 전까지 그 글을 고칠 수 있음(계정 없이는 불가피). `rankings.client_id` 공개 유지, `admin_check` 무차별 대입 가능(별도 조치 필요), client_id 위조로 레이트리밋 우회 가능
- 아래는 설계 당시 기록(원문 유지)

### (설계 기록) 방식만 정리했던 시점
### 지금 구현된 것 (v0.6, main 배포됨)
- 랭킹 행 ↔ 내 덱 연결은 이 브라우저 localStorage `rivals-my-ranks-v1` = `{ 행id: { token, deckId, sig } }` (`src/lib/rankSync.ts`)
- 앱 전역 자동 반영 `useRankSync`: 연동 덱이 바뀌면 3초 뒤 `update_ranking` (sig=내용 해시가 같으면 요청 안 함, 행이 없으면 연동 해제)
- 다른 기기: **파일로 이동** — 내보내기/전체 내보내기 파일에 `rank{id,token}` 포함, 가져오기에서 복원 (`src/lib/deckFile.ts`, 묶음 형식 `rivals-decks-bundle`). 가져온 직후엔 sig를 채워 옛 파일이 서버 최신본을 덮지 않게 함. 공유 링크(`#d=`)·서버로 가는 `p_deck`에는 rank 미포함(파싱 단계에서 제거)
- 서버는 익명(로그인 없음)이라 "누가 올렸나"를 사람 단위로 못 알아봄 → 토큰이 유일한 소유 증명. 그래서 기기를 옮기려면 토큰을 옮겨야 함(파일)
- 사용자는 "백엔드에서 알아서 되는 줄 알았다"고 함 → 파일 없는 방식을 원함. 아래 두 방식 중 택일 대기

### ⚠ 발견된 보안 문제 (2026-09-26 확인, 기존부터 있던 것 — 이번 변경 무관, 아직 미수정)
- `rankings.owner_token`이 **anon(공개 키)으로 읽힘**: `select=*` 응답에 `owner_token`·`client_id` 포함, 25행 전부 토큰 값이 조회됨(36자 UUID)
- 결과: 누구나 남의 행을 `update_ranking`/`delete_ranking`으로 수정·삭제 가능 (RPC는 토큰만 확인). 내보내기 파일의 "토큰 비밀" 안내도 서버가 이미 노출 중이라 실효가 약함
- 원인: `supabase_schema.sql`의 `rankings public read` 정책(select using true)이 전 컬럼에 적용. 앱은 `RANK_COLS`로 컬럼을 골라 읽지만 공개 API는 아무 컬럼이나 요청 가능
- Realtime(postgres_changes)도 변경 행 전체를 보내므로 **컬럼 revoke만으로는 부족할 수 있음** → 토큰을 rankings 밖 별도 테이블로 분리하는 게 안전
- 수정 방향(어느 방식을 택하든 선행 권장): ① `ranking_owners(ranking_id uuid pk references rankings on delete cascade, secret_hash text not null)` 생성, RLS 켜고 정책 없음 + anon/authenticated 권한 전부 revoke ② 기존 `owner_token`을 해시(`encode(digest(owner_token,'sha256'),'hex')`, pgcrypto)해서 이관 ③ `update_ranking`/`delete_ranking`을 `security definer`로 유지하되 `digest(p_token)`와 비교 ④ `rankings.owner_token` 컬럼 삭제 ⑤ `client_id`도 anon 읽기 차단(레이트리밋 전용). 기존 사용자 localStorage의 토큰은 그대로 유효(해시 비교라서)
- 이 마이그레이션은 Supabase SQL Editor에서 사용자가 직접 실행해야 함 (에이전트는 DB 쓰기 권한 없음). 새 SQL 파일은 `scripts/supabase_mig_*.sql` 규칙으로

### 방식 A — 비밀코드 (로그인 없음, 가벼움)
- 아이디어: 사용자당 "내 덱 코드" 하나. 서버가 코드 해시로 내 글들을 알아봄. 다른 기기에서 코드 입력 → 파일 없이 연결
- 스키마: `owners(id uuid pk, code_hash text unique, created_at)` + `rankings.owner_id` (또는 위 `ranking_owners`를 owner 단위로 확장). 기존 행은 토큰 해시로 남겨 두고, 새 코드로 "가져오기(claim)" 시 `claim_ranking(p_id, p_token, p_code)`로 이관
- RPC: `create_owner()` → 서버가 고엔트로피 코드 생성(예: 4×4자, 약 80비트)해 1회만 반환 / `insert_ranking(p_code, ...)` / `update_ranking(p_id, p_code, ...)` / `delete_ranking(p_id, p_code)` / `list_my_rankings(p_code)` (내 행 id·이름·deck_json 반환 → 새 기기가 서버 행에서 로컬 덱을 만들어 연결, 파일 불필요)
- 보안: **사용자가 정한 짧은 코드는 금지, 서버 생성 코드만** (무차별 대입 방지). 해시는 서버에서만 비교, 코드 조회 컬럼은 anon 차단. 실패 시도 제한(`client_id` 기준 테이블, 분당 N회) 필수
- 클라이언트: 링크 저장 형식 `{ 행id: { deckId, sig } }` + 전역 `rivals-owner-code`. 등록 첫 시점에 코드 표시·복사 안내("잃어버리면 복구 불가"), 랭킹 탭에 "내 코드로 불러오기" 입력칸. 자동 반영 로직(`syncLinks`)은 토큰 → 코드로 인자만 교체
- 장점: 로그인·이메일 없음, 사이트 성격 유지, 파일 불필요. 단점: 코드 분실=복구 불가, 코드 유출=글 탈취(전체 덱 공유하는 셈), SQL 추가 실행 필요
- 작업량 추정: 중 (SQL 1개 + rankSync/SharePanel/App 수정 + 테스트 + 공지)

### 방식 B — 계정 (Supabase Auth, 가장 편함·가장 큼)
- 로그인: Google OAuth 또는 이메일 매직링크. `rankings.user_id uuid default auth.uid()`, RLS로 `update/delete using (user_id = auth.uid())` → 토큰 RPC 불필요. insert는 기존 레이트리밋 RPC 유지(로그인 필수로)
- 기존 행 이전: 로그인 후 `claim_ranking(p_id, p_token)`이 토큰이 맞으면 `user_id`를 세팅 (미이전 행은 그대로 남음)
- 덱까지 클라우드에 저장하려면 `user_decks` 테이블 추가(실제 다기기 동기화). 지금 "덱은 브라우저에만 저장, 남이 못 봄" 성격이 바뀜 → 개인정보·약관·이메일 보관 정책 고려
- 소유자 작업(에이전트 불가): Supabase 대시보드에서 Auth provider 켜기, Google OAuth 클라이언트 발급, Site URL/Redirect URL에 `https://huniii32.github.io/mlb-rivals-deck/` 등록
- 장점: 잃어버릴 비밀 없음, 운영자 차단·정리 가능, 다기기 자동. 단점: 작업 큼, 로그인 마찰, 정적 호스팅에서 세션·리다이렉트 처리

### 권장 순서 (결정은 사용자)
1. **보안 수정(토큰 비공개화) 먼저** — 어떤 방식이든 선행. 이걸 안 하면 A·B 모두 무의미
2. 그다음 방식 A(비밀코드) — 사이트 성격을 유지하면서 파일 없이 해결
3. 사용자·운영 규모가 커지거나 클라우드 저장이 필요해지면 방식 B 검토 (A의 코드→계정 이전 경로 설계해 둘 것)
- 열린 질문: ① 보안 수정 SQL을 언제 실행할지 ② A/B 중 무엇 ③ 이미 중복된 글(#17 등)은 수동 정리 vs 운영자용 정리 도구(관리자 비밀번호 기반 삭제 RPC가 문의판엔 있음, 랭킹엔 없음)

## 다음 할 일
1. ~~이 PC에 Steam 없음 → Steam 설치 + MLB 9 Innings Rivals 26 (15GB) 다운로드 필요 (사용자 차례)~~ 설치 확인됨 (2026-09-13)
2. MITM 노트북 단독 캡처 (진행 중, 2026-09-13): mitmproxy 12.2.3 설치·CA 생성됨. 사용자 차례 = CA 인증서 설치(`~\.mitmproxy\mitmproxy-ca-cert.cer` → 신뢰 루트) → 프록시 ON → `mitmdump -p 8080 -w C:\project\tools\rivals.mitm` → 게임 도감 스크롤 → 프록시 OFF
3. 캡처 후: `scripts/parse_mitm.py` (준비됨) → 카드 JSON → 스탯 테이블화. GameGuard가 프록시 하에서 게임을 막으면 에뮬+ADB+PaddleOCR 플랜B
4. 병행 가능: 공식공지 테이블 크롤러 (seed DB용)


## 다음 개발 후보 (2026-09-13 정리, 우선순위순)
1. 중복 등록 방지 — 같은 덱 등록 시 새 행 대신 갱신 (저렴, 추천)
2. 공유 스킬함 — 커스텀 스킬 전원 공유 (skill_customs 테이블, kind+name 유니크)
3. 모바일 다듬기 — 구장 카드·덱코표 반응형
4. 공개판 스팸 대책 — 등록 간격 제한 (rankings/inquiries created_at 기준)
5. 덱 1:1 비교 — 내 덱 vs 남 덱 차이 표
6. 문의판 realtime — rankings처럼 구독+폴링 (현재 수동 새로고침)
7. 랭킹 만료/시즌제 — 오래된 등록 정리
8. PWA/오프라인 — 설치형 + 캐시 (후순위)

완료됨(2026-09-13): 탭 정리·문의/공지·Supabase랭킹·엑셀가져오기·덱코합계·미리보기·실시간랭킹·330/345·스킬퍼지검색·랭킹삭제/자동반영·문의관리자·스킬3탭

## 공유 구조
- 불특정다수 공개이나 덱은 각자 브라우저 저장 (서버 없음, 섞일 일 없음)
- 사진: Wikimedia Commons 자동조회 + 수동 URL. 게임 이미지·뉴스사 사진 내장 금지 (저작권)
- 배경: NASA Target Field 항공사진 (퍼블릭도메인)
