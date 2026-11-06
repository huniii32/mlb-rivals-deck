# 이벤트를 본인만 확인하는 설정

정식 사이트 `https://mlb-rivals-deck.pages.dev/`는 계속 이용할 수 있게 두고, 개발 브랜치 미리보기만 본인 계정으로 제한한다. 정식 사이트 배포와 이벤트 공개는 별개다. 웹사이트를 배포해도 이벤트 공개 전까지 실제 이벤트의 `published=false`를 유지한다.

## 지금 운영자 미리보기 열기

1. 대화에서 전달한 `event-preview-access-key.txt` 파일을 본인 기기에 보관한다.
2. https://feat-server-event-pilot.mlb-rivals-deck.pages.dev/event-demo/ 를 연다.
3. 파일에 있는 한 줄을 ‘개인 접속 키’에 붙여 넣고 ‘이벤트 페이지 열기’를 누른다.

운영자 화면이 먼저 열린다. 상단 ‘체험할 화면’에서 참가자 A/B로 바꾸어 직접 도전할 수도 있다. ‘접속 종료’를 누르면 다시 잠긴다. 로그인은 1시간 동안 유지되고 재배포하면 다시 접속 키를 입력해야 한다.

새 미리보기는 Cloudflare 계정 설정을 기다리지 않고 사용할 수 있다. 키는 무작위 256비트 값이며 원문은 저장소·URL·브라우저 JS에 포함하지 않는다. 저장소에는 SHA-256 검증값만 보관한다. 서버는 키를 확인한 후 HttpOnly·Secure·SameSite=Strict 쿠키에 만료 시간이 있는 서명된 세션을 발급한다. 비밀번호 역할을 하므로 본인만 보관한다.

접속 전에는 페이지뿐 아니라 JS·WASM 요청도 차단한다. 배포된 정적 자산은 암호화되어 있어 Functions가 실행되지 않더라도 데모가 그대로 노출되지 않는다. 세션 서명키와 자산 복호화 키는 각 빌드에서 생성하여 서버 전용 `_worker.js`에만 포함하고, 공개 자산·소스·로그에는 기록하지 않는다. `main` 빌드는 평소처럼 공개 웹사이트를 제공하며 이 보호 Worker나 데모를 포함하지 않는다.

키를 다시 발급할 때는 다음 명령으로 **저장소 밖의 새 파일**을 지정한다. 출력 파일을 커밋하거나 웹사이트에 올리지 않는다. 공개 검증값과 미리보기를 다시 배포해야 새 키가 적용된다.

```sh
node scripts/create-event-preview-key.mjs /개인/보관/경로/new-preview-key.txt
```

가상 덱으로 체험한 기록은 해당 주소의 브라우저에만 저장된다. 실제 참가 기록이나 경품 지급과 연결되지 않는다.

## 이전에 공개한 데모 주소 보호

과거에 만들어진 고유 배포 URL은 새 코드를 배포해도 수정되지 않는다. **이전 공개 데모까지 잠그려면 Cloudflare Access 설정이 별도로 필요하다.**

Cloudflare 대시보드 → **Workers & Pages → mlb-rivals-deck → Settings → General → Enable access policy**를 켠다. 생성된 Access 애플리케이션의 허용 정책은 **Include → Emails**에 본인 이메일 하나만 넣는다. Everyone, 전체 도메인, Bypass 정책은 사용하지 않는다.

대상은 `*.mlb-rivals-deck.pages.dev` 미리보기이며 정식 `mlb-rivals-deck.pages.dev`는 대상에 추가하지 않는다. 다음 과거 주소도 시크릿 창에서 Access 인증이 뜨는지 확인한다.

- `https://c23db93f.mlb-rivals-deck.pages.dev/event-demo/`
- `https://5c40cde3.mlb-rivals-deck.pages.dev/event-demo/`

Access 인증만으로 입장하도록 전환하려면 Preview 환경에 아래 세 변수를 모두 설정하고 재배포한다. 하나라도 설정하면 접속 키 방식으로 우회하지 않으며, Access 설정이 불완전하면 차단한다.

| 변수 | 입력값 |
|---|---|
| `EVENT_ACCESS_TEAM_DOMAIN` | `my-team.cloudflareaccess.com` 형식의 팀 도메인 |
| `EVENT_ACCESS_AUD` | Access 애플리케이션의 Audience Tag |
| `EVENT_ACCESS_EMAIL` | 본인 이메일 한 개 |

세 변수는 빌드와 Pages Functions 런타임에서 모두 사용할 수 있어야 한다. `VITE_` 접두사를 붙이지 않는다. 이 선택 설정 전에는 개인 접속 키로 새 미리보기를 이용할 수 있다.

## 실제 이벤트 서버 준비

[서버 적용 절차](events-server.md#supabase에-적용)에 따라 SQL, 본인 운영자 계정, 로그인 복귀 주소를 설정한다. 본인 로그인 계정 하나만 `sim_event_admins`에 등록한다. 현재 환경에는 Cloudflare·Supabase 관리 자격 증명이 없어 계정 설정과 원격 SQL 적용은 자동 수행하지 않았다.

`scripts/event-release-check.sql`은 읽기 전용 준비 점검이다. 운영 이벤트에는 테스트 참가자를 넣지 않는다. 실제 서버의 참여 흐름은 별도 검증용 Supabase / 이벤트 ID로 확인한다. 운영자 미리보기 접속 키는 실제 Supabase 운영 권한을 부여하지 않는다.

준비가 끝나도 ‘이벤트 공개’를 누르기 전에는 일반 사용자의 접근과 참여가 차단된다. 공개는 별도 최종 단계에서 진행한다.

출처: [Cloudflare Pages 미리보기 접근 보호](https://developers.cloudflare.com/pages/configuration/preview-deployments/#customize-preview-deployments-access).
