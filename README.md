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
server.js            로컬 서버 (정적 파일 + /api)        api/index.js  Vercel 함수
lib/                 서버: app(입구) · routes(HTTP) · repos(데이터 접근) · db(저장소 · 이전) · auth · config
public/              화면: index.html + js/ (기능별 features/), admin.* = 관리자 모드
scripts/check.js     정적 점검 (npm run check)         tests/  서버 통합 테스트 (npm test)
```

파일별 역할, 구조 원칙, 기능을 추가하는 순서는 [CLAUDE.md](CLAUDE.md) 에 있다.

커뮤니티 데이터(글 · 댓글 · 투표 …)와 사이트 구성(Draft · 게시본 · 버전 기록)은 따로 저장된다.
관리자 모드는 사이트 구성만 바꾼다. 어떤 UI 변경 · 롤백을 해도 커뮤니티 데이터는 남는다.

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
- 화면은 처음에 커뮤니티 데이터 전체를 한 번에 받는다 (`GET /api/content`). 글이 수천 개가 되면 페이지 단위로 받는 API 로 바꿔야 한다.
- AI World Pulse의 급상승 수치와 "토론 중" 인원은 시뮬레이션이다 (DEMO 표시).
- 초기 글 · 인물 · 예측은 분위기를 보여주기 위한 예시 콘텐츠다.
- 봇 대응은 최소한만 있다: IP별 횟수 제한(글 15초 · 댓글 5초 · 추천/투표 분당 60회 · 로그인 15분 10회), 숨은 입력칸(허니팟).

## 데이터 초기화

- 로컬: 서버를 끄고 `data` 폴더를 지운 뒤 다시 실행.
- 배포본: Upstash 콘솔에서 `futureboard:*` 키를 지우면 다음 접속 때 초기 데이터로 다시 채워진다.
- 예전 형식(문서 하나) 데이터는 옮긴 뒤에도 백업으로 남아 있다: 로컬 `data/community.json` · `data/site-config.json`, 배포본 `futureboard:community`.
