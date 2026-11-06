# 이벤트를 본인만 확인하는 설정

정식 사이트 `https://mlb-rivals-deck.pages.dev/`는 계속 이용할 수 있게 두고, 개발 브랜치 미리보기만 본인 계정으로 제한한다. 정식 사이트 배포와 이벤트 공개는 별개다. 웹사이트를 배포해도 이벤트 공개 전까지 실제 이벤트의 `published=false`를 유지한다.

## 1. 기존 데모 주소부터 잠그기

Cloudflare 대시보드 → **Workers & Pages → mlb-rivals-deck → Settings → General → Enable access policy**를 켠다.

만들어진 Access 애플리케이션의 허용 정책을 확인한다. **Include → Emails**에 본인 이메일 하나만 넣고 Everyone, 전체 이메일 도메인, Bypass 정책은 사용하지 않는다. Cloudflare 계정 멤버 전체를 허용하는 기본 정책이 있으면 본인 이메일 정책으로 제한한다. Cloudflare One / Zero Trust의 Access applications에서 이 정책을 관리할 수 있다.

적용 대상은 `*.mlb-rivals-deck.pages.dev` 미리보기다. 정식 `mlb-rivals-deck.pages.dev`는 대상에 추가하지 않는다. 별도로 연결한 미리보기 커스텀 도메인이 있다면 같은 보호가 필요하다.

이 단계가 **이전 배포의 고유 주소**까지 보호한다. 새 배포만 올리면 예전 주소는 사라지지 않는다. 다음 링크를 시크릿 창에서 열어 이벤트 화면 대신 Access 인증이 뜨는지 확인한다.

- `https://feat-server-event-pilot.mlb-rivals-deck.pages.dev/event-demo/`
- `https://c23db93f.mlb-rivals-deck.pages.dev/event-demo/`
- `https://5c40cde3.mlb-rivals-deck.pages.dev/event-demo/`

## 2. 새 미리보기에서 본인 확인 설정

Pages 프로젝트의 **Preview 환경**에 아래 변수를 추가한다. Production에는 추가하지 않는다. `VITE_` 접두사를 붙이지 않는다. 이메일·설정을 브라우저 JS에 넣지 않으며 `service_role`이나 Cloudflare API 토큰은 필요 없다.

| 변수 | 입력값 |
|---|---|
| `EVENT_ACCESS_TEAM_DOMAIN` | Cloudflare One의 팀 도메인. 예: `my-team.cloudflareaccess.com` (https:// 및 경로 제외) |
| `EVENT_ACCESS_AUD` | 위 Access 애플리케이션의 Application Audience (AUD) Tag |
| `EVENT_ACCESS_EMAIL` | 접근을 허용할 본인 이메일 한 개 |

세 변수는 빌드 및 Pages Functions 런타임에서 모두 사용할 수 있어야 한다. 빌드에만 저장하면 런타임에서는 차단된다. 설정 후 `feat/server-event-pilot` 미리보기를 재배포한다. **Functions의 요청 한도 초과 시 동작도 Fail closed로 설정**한다. 주된 접근 보호는 1번 Access 정책이며 Worker는 그 인증 결과를 다시 검증한다.

설정 전의 새 빌드는 데모 파일 자체를 제외하고 잠금 안내만 업로드한다. 설정 후에는 Access가 본인 이메일 인증을 수행하고, Worker가 서명·만료·AUD·이메일을 모두 확인한 다음 페이지와 자산을 제공한다. 인증 오류, 잘못된 설정, 키 조회 실패는 허용으로 바뀌지 않는다. 응답은 `private, no-store`로 캐시하지 않는다.

데모 주소의 참가자 A/B·운영자 전환은 본인에게만 보이는 **가상 체험**이다. 실제 참가 기록으로 이전되지 않는다.

## 3. 실제 이벤트 서버 준비

[서버 적용 절차](events-server.md#supabase에-적용)에 따라 SQL, 본인 운영자 계정, 로그인 복귀 주소를 설정한다. 본인 로그인 계정 하나만 `sim_event_admins`에 등록한다. 현재 환경에는 Cloudflare·Supabase 관리 자격 증명이 없어 이 계정 설정과 원격 SQL 적용은 자동 수행하지 않았다.

`scripts/event-release-check.sql`은 읽기 전용 준비 점검이다. SQL Editor에서 실행하여 미공개 상태, 운영자 1명, 규칙 데이터와 비공개 조회 차단이 준비됐는지 확인한다. 운영 이벤트에는 테스트 참가자를 넣지 않는다. 실제 서버의 참여 흐름은 별도 검증용 Supabase / 이벤트 ID로 확인한다.

준비가 끝나도 ‘이벤트 공개’를 누르기 전에는 일반 사용자의 접근과 참여가 차단된다. 공개는 별도 최종 배포 단계에서 진행한다.

출처: [Cloudflare Pages 미리보기 접근 보호](https://developers.cloudflare.com/pages/configuration/preview-deployments/#customize-preview-deployments-access).
