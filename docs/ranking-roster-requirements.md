# 공개 덱 최소 인원

신규 등록과 기존 랭킹 업데이트에 이름이 입력된 타자 9명, 선발투수 5명, 중계투수 3명, 마무리 1명 이상을 요구한다. 중계는 승리조·추격조·롱릴리프 합산이다. 추가 불펜의 빈 슬롯은 허용한다. 선수 역할은 기존 `bullpenRole()` 판정과 동일하게 명시한 역할을 우선하며 구버전에는 포지션·행 번호를 사용한다.

- 저장창에서 역할별 현재/필수 인원과 부족 인원을 표시한다.
- 작성 중인 덱은 기기에 저장할 수 있다. 공개 연동 덱이 조건 미달이 되면 서버 업데이트를 보내지 않으며 마지막 공개 내용과 연동 정보를 보존한다. 조건을 채운 뒤 수정하면 자동 업데이트를 재개한다.
- 기존 공개 덱을 삭제하거나 비공개로 돌리지 않는다. 불완전한 기존 덱도 비밀번호로 복원하여 편집할 수 있지만 다음 공개 업데이트부터 조건을 충족해야 한다.

## 서버 적용

Supabase SQL Editor에서 `scripts/supabase_mig_ranking_roster.sql`을 한 번 실행한다. 웹 배포만으로 DB 트리거가 설치되지는 않는다. 이 환경에는 Supabase 스키마 관리 권한이 없어 원격 적용은 운영자가 실행해야 한다.

마이그레이션은 기존 행이나 이벤트 기록을 수정하지 않는다. `rankings`의 INSERT 및 공개 데이터 UPDATE에 트리거를 설치해 현재 비밀번호 RPC, 예전 토큰·소유 코드 RPC, 직접 쓰기 경로에 동일 조건을 강제한다. 중복 슬롯·잘못된 역할/행 구조는 거부하고, 표시 인원은 요청의 `p_named` 대신 실제 이름이 입력된 슬롯 수로 계산한다. 재실행해도 기존 기록을 보존한다.

확인 SQL:

```sql
select tgname, tgenabled
from pg_trigger
where tgrelid='public.rankings'::regclass
  and tgname='rankings_require_roster' and not tgisinternal;
```

`rankings_require_roster / O`가 표시되면 트리거가 활성화된 상태다. 운영 이벤트에 테스트 참가 기록을 추가하지 않는다.

## 검증

`npm test`, `npm run test:db`, `npm run build`와 `scripts/verify-renewal-browser.cjs`, `scripts/verify-events-browser.cjs`로 최소 인원, 빈 이름, 불펜 역할 이동, 자동 업데이트 보류·재개, 기존 행 보존, 타자/투수 독립 순위, 이벤트 참여와 응모권 발급 구분을 확인한다. 브라우저 검증은 로컬 DB 또는 가로챈 요청만 사용한다.
