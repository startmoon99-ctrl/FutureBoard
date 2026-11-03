# 데이터베이스 설계 (Step 4)

결정일 2026-11-03. 아직 아무것도 만들거나 옮기지 않았다. 이 문서는 Step 5(실제 이전)의 기준이다.

**상태: 보류 (2026-11-03).** Supabase 프로젝트는 아직 만들지 않았다. 테이블 SQL 은 [db/migrations/001_init.sql](../db/migrations/001_init.sql) 에 준비돼 있다(실행 전).
다시 시작할 때: Vercel → future-board → Storage → Create Database → Supabase (Seoul, Free, 세 환경 모두 연결, Prefix 없음) → SQL Editor 에서 001_init.sql 실행.

## 1. 결정

| 항목 | 결정 | 이유 |
| --- | --- | --- |
| 주 DB | **Supabase (Postgres)** | 글 · 댓글 · 회원 · 투표처럼 "누가 무엇을" 하는 관계 데이터를 다루려면 관계형 DB가 필요하다. H-Archive 에서 이미 써 봤고, 나중에 로그인(Supabase Auth) · 이미지 저장(Storage)을 같은 곳에서 쓸 수 있다 |
| 서버 → DB 연결 | **Supabase REST(PostgREST) 를 `fetch` 로 호출**, 여러 단계가 한 번에 일어나야 하는 일은 **SQL 함수(RPC)** | 외부 패키지 0개 원칙을 지킨다. HTTP 라서 Vercel 함수에서 연결 수 문제가 없다 |
| Upstash Redis | **횟수 제한(rate limit)에만** 남긴다 | 짧게 쓰고 사라지는 숫자는 Redis 가 맞다 |
| 열쇠 | `SUPABASE_SERVICE_ROLE_KEY` 는 **서버(Vercel 환경 변수)에만**. 화면 코드에는 어떤 키도 넣지 않는다 | 화면은 지금처럼 우리 API(`/api/*`)만 부른다 |
| 보안 | 모든 테이블에 **RLS 켜고 정책 없음** | 혹시 공개 키가 새도 테이블을 직접 읽거나 쓸 수 없다. 서버의 service role 만 접근 |

다른 선택지와 비교(참고):
- **Neon**: 순수 Postgres, Vercel 연결이 가장 단순. 대신 로그인 · 파일 저장을 따로 붙여야 한다.
- **Postgres 드라이버(`postgres`/`pg` 패키지)로 직접 연결**: SQL 을 자유롭게 쓸 수 있지만 패키지가 생기고, 서버리스에서는 연결 풀(Supavisor 6543 포트) 설정이 필요하다. PostgREST 로 부족해지면 그때 바꾼다 — `lib/db` 만 바뀐다.

### 확인이 필요한 것 (추측 — Step 5 시작 전에 확인)
- 무료 요금제 조건: 프로젝트 2개까지, 일주일 동안 요청이 없으면 일시 정지, 자동 백업 없음(유료부터)로 알고 있다. **H-Archive 가 이미 무료 프로젝트를 쓰고 있으면 개수 제한에 걸릴 수 있다.**
- 일시 정지 대비: 사이트에 방문이 있으면 정지되지 않는다. 그래도 관리자 모드의 "데이터 백업"을 주기적으로 받아 둔다.
- Vercel ↔ Supabase 연동(Marketplace)으로 환경 변수가 자동으로 들어오는지, 이름이 무엇인지.

## 2. 지금 데이터 → 테이블

| 지금 (Redis 키) | 테이블 | 비고 |
| --- | --- | --- |
| `posts` + `counters post:<id>:likes/views` | `posts` (likes, views 열) | 숫자는 열로. `update … set likes = likes + 1` 이 원자적이다 |
| `post-links` | 없음 → `posts` 의 고유 색인 | "최초 발견 글은 링크당 하나"를 DB 가 보장 |
| `comments` (`target: 'debate:<id>'`) | `comments` (target_type, target_id) | 지금처럼 어디에 달린 댓글이든 한 테이블 |
| `debate` + `counters debate:<id>:yes/no` | `debates` (yes, no 열, is_current) | 지난 질문(`curated.debateArchive`)도 이 테이블로 합칠 수 있다 (나중) |
| `predictions` + 카운터 | `predictions` | |
| `prompts` + `prompt:<id>:copies` / `:copies:<날짜>` | `prompts.copies` + `prompt_copies_daily` | 날짜별 칸이 표로 바뀐다 |
| `challenge` + `challenge-entries` + `entry:<id>:votes` | `challenges` + `challenge_entries` | |
| `curated` (미래 변화 · Pulse · 선구자 · 지난 기록) | `curated` (jsonb 한 줄) | 운영자가 통째로 관리하는 내용이라 지금은 문서 그대로 둔다 |
| `site-config` (+ `:ver`) | `site_config` (한 줄) + `site_config_versions` | Community Data 와 계속 분리 |
| `schema` | `meta` | |
| `hit:*` (횟수 제한) | Upstash 에 그대로 | |

id 는 지금 값(`p-welcome`, `pmw0…`, `c-01`)을 그대로 쓴다(`text`). 주소 `?open=<id>` 와 브라우저 기록(localStorage)이 계속 맞는다.

## 3. 스키마 초안

Step 5 에서 `db/migrations/001_init.sql` 로 만든다. 아래는 초안이다(아직 실행하지 않음).

```sql
-- 회원은 Step 7 에서. 지금은 author_name(닉네임)만 쓰고 author_id 는 비워 둔다.
create table users (
  id          uuid primary key default gen_random_uuid(),
  auth_id     uuid unique,                -- Supabase Auth 사용자 (Step 7 에서 결정)
  nickname    text not null unique,
  role        text not null default 'user' check (role in ('user', 'moderator', 'admin')),
  created_at  timestamptz not null default now()
);

create table posts (
  id               text primary key,
  category         text not null,
  title            text not null,
  body             text not null default '',
  author_name      text not null,
  author_id        uuid references users(id),
  anonymous        boolean not null default false,
  ai_label         text not null,
  link             text not null default '',
  link_normalized  text,                    -- 같은 링크 비교용
  first_discovery  boolean not null default false,
  pinned           boolean not null default false,
  likes            integer not null default 0,
  views            integer not null default 0,
  created_at       timestamptz not null default now(),
  hidden_at        timestamptz             -- 관리자가 숨김. 지우지 않는다
);
create index posts_created on posts (created_at desc) where hidden_at is null;
create index posts_category on posts (category, created_at desc) where hidden_at is null;
create unique index posts_first_link on posts (link_normalized) where first_discovery and hidden_at is null;

create table comments (
  id           text primary key,
  target_type  text not null,              -- 'debate' | 'post' | …
  target_id    text not null,
  parent_id    text references comments(id), -- 답글 (나중)
  author_name  text not null,
  author_id    uuid references users(id),
  text         text not null,
  choice       text check (choice in ('yes', 'no')),
  created_at   timestamptz not null default now(),
  hidden_at    timestamptz
);
create index comments_target on comments (target_type, target_id, created_at) where hidden_at is null;

create table debates (
  id          text primary key,
  question    text not null,
  yes_label   text not null,
  no_label    text not null,
  yes         integer not null default 0,
  no          integer not null default 0,
  is_current  boolean not null default false,
  created_at  timestamptz not null default now()
);
create unique index debates_one_current on debates (is_current) where is_current;

create table predictions (
  id          text primary key,
  category    text not null,
  question    text not null,
  deadline    date,
  status      text not null default 'open' check (status in ('open', 'resolved')),
  result      text check (result in ('yes', 'no')),
  sort_order  integer not null default 0,
  yes         integer not null default 0,
  no          integer not null default 0,
  created_at  timestamptz not null default now()
);

create table prompts (
  id          text primary key,
  category    text not null,
  title       text not null,
  text        text not null,
  author_name text not null,
  sort_order  integer not null default 0,
  copies      integer not null default 0,
  created_at  timestamptz not null default now()
);
create table prompt_copies_daily (
  prompt_id  text not null references prompts(id),
  day        date not null,                -- 한국 날짜
  copies     integer not null default 0,
  primary key (prompt_id, day)
);

create table challenges (
  id          text primary key,
  theme       text not null,
  rule        text not null default '',
  next_theme  text not null default '',
  is_current  boolean not null default false,
  created_at  timestamptz not null default now()
);
create table challenge_entries (
  id            text primary key,
  challenge_id  text not null references challenges(id),
  title         text not null,
  author_name   text not null,
  tool          text not null default '',
  emoji         text not null default '',
  colors        text[] not null default '{}',
  votes         integer not null default 0,
  created_at    timestamptz not null default now()
);
create index challenge_entries_by_challenge on challenge_entries (challenge_id);

-- 운영자가 정리하는 내용 · 사이트 구성 · 메타
create table curated (id int primary key default 1 check (id = 1), data jsonb not null);
create table site_config (
  id                 int primary key default 1 check (id = 1),
  draft              jsonb not null,
  published          jsonb not null,
  published_version  integer not null,
  draft_updated_at   timestamptz,
  rev                integer not null default 0   -- 동시 저장 충돌 방지 (지금의 site-config:ver)
);
create table site_config_versions (
  version       integer primary key,
  config        jsonb not null,
  note          text not null,
  published_at  timestamptz not null default now()
);
create table meta (key text primary key, value text not null);

-- 모든 테이블: RLS 켜고 정책은 만들지 않는다 (서버의 service role 만 접근)
alter table users enable row level security;
-- … 나머지 테이블도 같은 줄
```

### 숫자 올리기 · 여러 단계 작업은 SQL 함수로 (RPC)
- `incr(table, id, column)` 대신 기능별 함수: `like_post(id)`, `vote_debate(choice)`, `vote_prediction(id, choice)`, `copy_prompt(id, day)`, `vote_entry(id)` — 올린 뒤 새 숫자를 돌려준다.
- `create_post(...)`: 최초 발견 판단(같은 링크의 보이는 최초 글이 없으면 이 글이 최초)과 저장을 한 번에.
- `publish_site_config(note)` · `rollback_site_config(version)`: 지금의 CAS(동시 저장 충돌 방지) 대신 트랜잭션.

## 4. Step 7(회원) 때 더할 것

```sql
create table post_likes        (post_id text references posts(id), user_id uuid references users(id), created_at timestamptz default now(), primary key (post_id, user_id));
create table debate_votes      (debate_id text references debates(id), user_id uuid references users(id), choice text not null, primary key (debate_id, user_id));
create table prediction_votes  (prediction_id text references predictions(id), user_id uuid references users(id), choice text not null, created_at timestamptz default now(), primary key (prediction_id, user_id));
create table entry_votes       (entry_id text references challenge_entries(id), user_id uuid references users(id), primary key (entry_id, user_id));
```
- 기본키가 (무엇, 누구)라서 **한 사람이 두 번 투표하는 것을 DB 가 막는다.** 투표할 때 이 표에 넣고, 성공했을 때만 숫자 열을 올린다(같은 함수 안에서).
- 예측 적중률 · 선구자 랭킹은 `prediction_votes` 와 판정 결과로 계산한다(지금 `curated.people` 은 예시 데이터).
- Step 8: `reports`(신고) · `notifications`(user_id, read_at) · `bookmarks` · `follows` · 이미지는 Supabase Storage(테이블에는 주소만).

## 5. Step 5 이전 순서 (데이터를 잃지 않게)

1. Supabase 프로젝트 만들기 → 위 스키마 실행 → Vercel 환경 변수 연결 (Production · Preview).
2. `lib/db` 에 Supabase 접근 함수, `lib/repos/*` 를 하나씩 Supabase 로 바꾼다. **라우트와 화면은 그대로.**
3. 옮기기 스크립트: Redis 의 지금 데이터를 읽어 테이블에 넣는다. 이미 있는 id 는 건너뛴다(여러 번 실행해도 안전). Redis 데이터는 **지우지 않는다**(백업).
4. 검증: 옮기기 전 `/api/content` 와 옮긴 뒤 `/api/content` 가 **글자 하나까지 같은지** 비교 (Step 3 에서 쓴 방법). 관리자 "데이터 내보내기" 파일도 미리 받아 둔다.
5. 먼저 Preview 배포에서 확인 → Production 전환.
6. 로컬 개발: Supabase 프로젝트를 하나 더(개발용) 두거나, 지금처럼 파일 저장을 유지할지 Step 5 에서 정한다.
