# 퓨쳐보드 개발 지침

퓨쳐보드는 AI와 미래기술 커뮤니티다. 기획의 중심 질문은 **"오늘 인류의 미래가 얼마나 바뀌었지?"**.
가볍지만 수준은 낮지 않게, 활동량보다 가치 있는 행동(좋은 발견 · 정확한 예측)을 보상한다.

이 파일은 여러 AI 도구가 이어서 작업할 때의 기준이다. 앞부분은 원칙, 뒷부분은 코드 지도다.
사용자에게는 **한국어로** 답한다. 사용자는 개발자가 아니다.

## 실행 · 점검 · 배포

- 로컬: `START.bat` (= `node server.js --open`) → http://localhost:3000. 외부 패키지 없음, `npm install` 필요 없음.
- 점검: `npm run check` (문법 · 모듈 import/export · data-action 연결 · 서버 모듈) → `npm test` (서버를 실제로 띄워 저장소 4가지 상태로 핵심 흐름 확인).
  - `npm test -- data` 처럼 폴더를 주면 그 폴더의 예전 형식 데이터를 옮기는 것까지 확인한다 (복사본으로).
- 배포: GitHub `main`에 push → Vercel 자동 배포 (https://future-board-mu.vercel.app). push 전에 `npm run check` 와 `npm test` 를 통과시킨다.
- Vercel 환경 변수: `ADMIN_PASSWORD`(Production 필수), Upstash 연결값 `KV_REST_API_URL` · `KV_REST_API_TOKEN`(Storage 연결 시 자동).

## 구조 원칙

1. **기능 하나 = 파일 하나.** 화면은 `public/js/features/<기능>.js` 에 메인 블록 · 전용 페이지 · 동작이 함께 있다. 서버는 `lib/routes` (HTTP) + `lib/repos` (데이터).
2. **층을 건너뛰지 않는다.**
   - 화면 → 서버 호출은 `public/js/api.js` 로만. 기능 파일에 `fetch` 나 API 주소를 직접 쓰지 않는다.
   - 서버 라우트 → 저장소는 `lib/repos/*` 로만. 라우트에서 `lib/db` 를 직접 부르지 않는다. 저장소 키 이름은 `lib/db/index.js` 의 `KEYS` 에만 있다.
   - 권한 확인은 `lib/auth.js` 의 `requireAdmin()` 하나로. 횟수 제한은 `lib/rate-limit.js` 의 `limit(req, '종류')` 로.
3. **값은 한 곳에.** 서버 상수 · 제한값 · 횟수 제한 규칙은 `lib/config.js`. 블록 목록(주소 · 제목 · 아이콘 · 관리자 표시)은 `public/js/core.js` 의 `BLOCKS`.
   분류 목록은 서버 `lib/config.js CATEGORIES` 와 화면 `core.js CAT_COLORS` 두 곳이 같아야 한다.
4. **Community Data 와 Site Configuration 은 섞지 않는다.** 관리자 모드(구성 변경 · 게시 · 롤백)는 `site-config` 만 바꾸고, 글 · 댓글 · 투표는 절대 건드리지 않는다.
5. **데이터를 잃지 않는다.** 저장 구조를 바꿀 때는 `lib/db/migrate.js` 처럼 예전 데이터를 지우지 않고, "없을 때만 넣기"로 여러 번 실행해도 안전하게, 다 옮긴 뒤에 스키마 번호를 올린다. 테스트(`tests/smoke.js`)에 옮기기 전후 비교를 추가한다.
6. **숫자는 counters 로.** 추천 · 조회 · 투표 · 복사처럼 자주 오르는 숫자는 `db.incr()` (원자적 증가). 문서 전체를 읽고 다시 쓰지 않는다.
7. **댓글은 하나의 저장소.** 어디에 달린 댓글이든 `lib/repos/comments.js` 에 `target: '<종류>:<id>'` 로 저장한다.
8. **화면에 넣는 사용자 입력은 모두 `esc()`.** 링크는 서버에서 http(s) 만 받는다.
9. 큰 추상화나 프레임워크를 들이지 않는다. 지금 규모(개인 커뮤니티, 외부 패키지 없음)에 맞게 단순하게.

## 코드 지도

```
server.js            로컬 서버: .env.local · 정적 파일 · 보안 헤더 · /api → lib/app.js
api/index.js         Vercel 함수: /api/* → lib/app.js (vercel.json rewrite)
lib/app.js           API 입구: 라우트 등록 · 저장소 준비(이전) · 쓰기 가능 여부 · 오류 응답
lib/http.js          HttpError · sendJson · readBody · clientIp · 입력 정리(cleanStr, clampInt, oneOf) · 라우터
lib/config.js        환경(저장소 종류 · 키 접두어) · 분류 · 입력 길이 제한 · 횟수 제한 규칙
lib/auth.js          관리자 인증(서명 쿠키) · requireAdmin
lib/rate-limit.js    IP별 횟수 제한 (저장소에 세므로 서버 인스턴스를 넘어 적용)
lib/routes/          기능별 HTTP: posts(글 + GET /api/content) · debate · predictions · prompts · challenge
                     관리자: auth(로그인) · site-config(관리자 모드) · moderation(글 · 댓글 숨기기) · backup(데이터 내보내기)
lib/repos/           기능별 데이터: posts · comments(공용 댓글) · debate · predictions · prompts · challenge · site-config · backup
                     각 repo 가 자기 counters 키 이름과 화면 모양(view)을 가진다. snapshot 은 한 번에 읽어 view 들을 조립만 한다
lib/db/              index(데이터 접근 함수 · KEYS) · backends(file · memory · Upstash) · engine(메모리 Redis) · migrate(스키마 이전)
lib/seed.js          초기 데이터 (seed/*.json)
public/js/core.js    주소 · BLOCKS · 상태 · 유틸 · 브라우저 저장소
public/js/api.js     서버 호출 전부
public/js/widgets.js 여러 기능이 함께 쓰는 화면 조각 (블록 머리 · 페이지 틀 · 필터 · 그래프 · 글 목록 · 카드)
public/js/features/  기능별 블록 · 페이지 · 동작. index.js 에 등록
public/js/view-mode.js PC ↔ 모바일 화면 보기
public/js/app.js     시작점: 방문 기록 · 메뉴 · 주소 이동 · 동작 연결
public/admin.*       관리자 모드
scripts/check.js     정적 점검     tests/smoke.js  서버 통합 테스트 (+ mock-upstash.js)
```

### 저장 구조 (스키마 2, 키 접두어 `futureboard:` — Vercel preview 는 `futureboard-preview:`)

`site-config`(문서) · `posts`(해시 id→글) · `post-links`(해시 링크→처음 올린 글 id) · `comments`(해시 id→댓글 {target}) ·
`counters`(해시 `<종류>:<id>:<항목>`→숫자) · `debate` · `challenge` · `curated`(문서) · `predictions` · `prompts` · `challenge-entries`(해시) · `schema`.
예전 형식 `futureboard:community`(문서 하나)는 백업으로 남아 있다. 지우지 않는다.

글 · 댓글은 지우지 않는다. 관리자가 숨기면 `hiddenAt` 이 붙고 화면 데이터(snapshot)에서 빠진다. 관리자 모드의 '숨긴 글 · 댓글'에서 되살린다.
운영자 닉네임(`config.js RESERVED_NAMES`)은 관리자로 로그인했을 때만 쓸 수 있다.
'오늘 복사'는 한국 날짜별 칸(`prompt:<id>:copies:<YYYY-MM-DD>`)에 센다. 예전 `prompt:<id>:copiesToday` 는 쓰지 않는다.
횟수 제한의 IP 는 Vercel 에서만 `x-real-ip` 를 믿는다(Vercel 이 덮어씀, 2026-11-03 확인). 로컬은 실제 접속 주소. 테스트는 `TRUST_PROXY=1`.

## 자주 하는 변경

- **새 API**: `lib/routes/<기능>.js` 에 라우트(검증 · 권한 · limit) → `lib/repos/<기능>.js` 에 데이터 함수 → `lib/app.js` 에 등록 한 줄 → `public/js/api.js` 에 호출 함수 → `tests/smoke.js` 에 확인 추가.
- **새 메인 블록/페이지**: `core.js BLOCKS` 한 줄 → `features/<기능>.js` (block · page · actions) → `features/index.js` 등록 → `seed/site-config.json` 에 블록 (저장된 구성에는 자동으로 '숨김'으로 붙는다) → 페이지 주소를 `server.js SITE_PAGES` 와 `vercel.json` rewrites 에 추가.
- **페이지 필터 · 정렬**: `chips()` · `tabs()` · `searchBox()` 에 `{ key, field }` 를 주면 `state.page[key][field]` 가 바뀌고 다시 그려진다. 따로 동작을 만들 필요 없다.
- **새 숫자(추천 등)**: 그 기능 repo 에 키 이름 함수(`counterField`)를 두고 `db.incr()` 로 올린 뒤, 같은 repo 의 `view` 에서 붙인다. 키 이름을 다른 파일에 쓰지 않는다.
  (`lib/db/migrate.js` 에 있는 키 이름은 스키마 2 로 옮길 때의 고정된 복사본이다. 고치지 않는다.)

## 아직 없는 것 (추가할 때 위 원칙대로)

회원 계정 · 사용자 프로필 · 글 댓글 · 알림 · 신고 · Reputation 계산 · 서버 쪽 중복 투표 방지.
회원 계정을 넣을 때: `lib/auth.js` 에 사용자 세션, `lib/repos/users.js`, 글 · 댓글의 `author` 옆에 `authorId`, 추천 · 투표는 `counters` 와 함께 "누가 눌렀는지"(예: 해시 `likes:<postId>` → userId) 를 저장해 중복을 서버에서 막는다.
**회원 기능보다 먼저 Supabase(Postgres) 로 옮기기로 정했다(2026-11-03).** 설계 · 테이블 · 이전 순서는 [docs/db-design.md](docs/db-design.md).
`lib/repos` 만 바꾸면 되도록 라우트는 저장소를 모른다. 옮기기 전에는 새 기능도 지금 저장소(Redis)에 두되, 테이블로 옮기기 쉬운 모양으로 만든다.
