# 퓨쳐보드

AI와 미래기술 커뮤니티. 기획서 v0.2의 첫 번째 프로토타입(43번)에서 시작했다.

- 로컬: `START.bat` 더블클릭 → http://localhost:3000
- 배포: GitHub `main`에 push 하면 Vercel이 자동으로 배포한다 (H-Archive와 같은 방식)

외부 패키지가 없다. Node.js만 있으면 되고 `npm install`이 필요 없다.

## 주소

| 주소 | 내용 |
| --- | --- |
| `/` | 메인: 관리자가 고른 블록들 (Published 구성) |
| `/pulse` `/future` `/away` `/debate` `/predictions` `/community` `/prompts` `/challenge` `/people` | 블록마다 하나씩 있는 전용 페이지. 메인 블록의 "전체 보기"와 상단 메뉴가 연결된다 |
| `/admin` | 관리자 모드 (블록 편집 · Draft · 미리보기 · 게시 · 롤백) |
| `/preview`, `/preview/…` | Draft 미리보기 (관리자만) |

## 구조

```
START.bat            로컬 실행 (이미 켜져 있으면 브라우저만 연다)
server.js            로컬 서버: 정적 파일 + /api 를 lib/app.js 로 넘김
api/index.js         Vercel 함수: /api/* 를 lib/app.js 로 넘김 (vercel.json rewrite)
lib/app.js           API 처리 (로컬과 배포본이 같은 코드)
lib/store.js         저장소: 로컬은 data 폴더, 배포본은 Upstash Redis
lib/auth.js          관리자 비밀번호 · 로그인 쿠키
lib/seed.js          저장소가 비어 있을 때 넣는 초기 데이터 (seed/*.json)
public/              화면 (index.html + js/ = 사이트, admin.* = 관리자 모드)
  js/core.js         공통: 화면 모드 · 상태 · 페이지 주소 · 유틸 · API
  js/widgets.js      메인과 페이지가 함께 쓰는 조각 (글 목록, 예측 카드, 그래프 …)
  js/home.js         메인 블록
  js/pages.js        블록별 전용 페이지
  js/app.js          주소 이동(새로고침 없이 화면만 바꿈) · 사용자 동작 · 시작
vercel.json          배포 설정: public/ 을 그대로 내보내고 /api · /admin · /preview 를 연결
```

데이터는 문서 두 개로 완전히 나뉜다.

- `community`: Community Data — 글, 댓글, 투표, 예측, 프롬프트 …
- `site-config`: Site Configuration — Draft, 게시본, 버전 기록

관리자 모드는 `site-config`만 바꾼다. 어떤 UI 변경 · 롤백을 해도 커뮤니티 데이터는 남는다.

## 환경 변수

`.env.example` 참고. 로컬은 `.env.local`(git 에 올라가지 않음), 배포본은 Vercel → Settings → Environment Variables.

| 이름 | 로컬 | Vercel |
| --- | --- | --- |
| `ADMIN_PASSWORD` | 비우면 비밀번호 없이 관리자 모드 | **필수**. 없으면 관리자 모드가 잠긴다 |
| `KV_REST_API_URL` · `KV_REST_API_TOKEN` | 비우면 `data` 폴더에 저장 | Vercel → Storage 에서 Upstash Redis 를 연결하면 자동으로 들어간다 |

Vercel에 저장소가 아직 연결되지 않았으면 사이트는 초기 데이터로 보이기만 하고 글쓰기 · 투표는 거절된다.

## 배포 (처음 한 번)

1. GitHub에 빈 저장소를 만들고 이 폴더를 push 한다.
2. Vercel → Add New → Project → 그 저장소를 Import. Framework Preset은 **Other**, 나머지는 그대로 두고 Deploy.
3. 프로젝트 → Settings → Environment Variables 에 `ADMIN_PASSWORD` 추가.
4. 프로젝트 → Storage → Create Database → **Upstash for Redis** → 이 프로젝트에 연결.
5. Deployments → 가장 최근 배포 → Redeploy (환경 변수는 다시 배포해야 적용된다).

## 프로토타입의 한계

- 회원 계정이 없다. 투표 · 추천 중복 방지, 연속 방문, "내가 없는 동안"은 브라우저(localStorage) 기준이다.
- 데이터는 문서 두 개를 통째로 읽고 쓴다. 동시에 들어온 쓰기는 버전 비교로 다시 시도해 잃어버리지 않지만, 사용자가 많아지면 글 · 댓글 · 투표를 각각의 테이블로 나눠야 한다.
- AI World Pulse의 급상승 수치와 "토론 중" 인원은 시뮬레이션이다 (DEMO 표시).
- 초기 글 · 인물 · 예측은 분위기를 보여주기 위한 예시 콘텐츠다.
- 봇 대응은 최소한만 있다: 글 15초 · 댓글 5초 간격 제한(배포본에서는 함수 인스턴스마다 따로 센다), 숨은 입력칸(허니팟).

## 데이터 초기화

- 로컬: 서버를 끄고 `data` 폴더를 지운 뒤 다시 실행.
- 배포본: Upstash 콘솔에서 `futureboard:*` 키를 지우면 다음 접속 때 초기 데이터로 다시 채워진다.
