-- 퓨쳐보드 테이블 만들기 (Supabase → SQL Editor 에 통째로 붙여 넣고 Run)
-- 설계: docs/db-design.md. 여러 번 실행해도 안전하다 (이미 있으면 건너뜀).
-- 데이터는 넣지 않는다. 옮기기는 Step 5 의 옮기기 스크립트가 한다.
--
-- extra: 지금 데이터에 있는데 열로 만들지 않은 값을 잃지 않도록 그대로 담아 두는 칸.

-- ---------- 회원 (Step 7 에서 사용. 지금은 비어 있음) ----------
create table if not exists users (
  id          uuid primary key default gen_random_uuid(),
  auth_id     uuid unique,
  nickname    text not null unique,
  role        text not null default 'user' check (role in ('user', 'moderator', 'admin')),
  created_at  timestamptz not null default now()
);

-- ---------- 커뮤니티 ----------
create table if not exists posts (
  id               text primary key,
  category         text not null,
  title            text not null,
  body             text not null default '',
  author_name      text not null,
  author_id        uuid references users(id),
  anonymous        boolean not null default false,
  ai_label         text not null default '직접 작성',
  link             text not null default '',
  link_normalized  text,
  first_discovery  boolean not null default false,
  pinned           boolean not null default false,
  likes            integer not null default 0,
  views            integer not null default 0,
  extra            jsonb not null default '{}',
  created_at       timestamptz not null default now(),
  hidden_at        timestamptz
);
create index if not exists posts_created on posts (created_at desc) where hidden_at is null;
create index if not exists posts_category on posts (category, created_at desc) where hidden_at is null;
create index if not exists posts_link on posts (link_normalized) where link_normalized is not null;
create unique index if not exists posts_first_link on posts (link_normalized) where first_discovery and hidden_at is null;

create table if not exists comments (
  id           text primary key,
  target_type  text not null,
  target_id    text not null,
  parent_id    text references comments(id),
  author_name  text not null,
  author_id    uuid references users(id),
  text         text not null,
  choice       text check (choice in ('yes', 'no')),
  extra        jsonb not null default '{}',
  created_at   timestamptz not null default now(),
  hidden_at    timestamptz
);
create index if not exists comments_target on comments (target_type, target_id, created_at) where hidden_at is null;

create table if not exists debates (
  id          text primary key,
  question    text not null,
  yes_label   text not null,
  no_label    text not null,
  yes         integer not null default 0,
  no          integer not null default 0,
  is_current  boolean not null default false,
  extra       jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create unique index if not exists debates_one_current on debates (is_current) where is_current;

create table if not exists predictions (
  id          text primary key,
  category    text not null default '',
  question    text not null,
  deadline    date,
  status      text not null default 'open' check (status in ('open', 'resolved')),
  result      text check (result in ('yes', 'no')),
  sort_order  integer not null default 0,
  yes         integer not null default 0,
  no          integer not null default 0,
  extra       jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

create table if not exists prompts (
  id           text primary key,
  category     text not null default '',
  title        text not null,
  text         text not null,
  author_name  text not null,
  sort_order   integer not null default 0,
  copies       integer not null default 0,
  extra        jsonb not null default '{}',
  created_at   timestamptz not null default now()
);
create table if not exists prompt_copies_daily (
  prompt_id  text not null references prompts(id),
  day        date not null,
  copies     integer not null default 0,
  primary key (prompt_id, day)
);

create table if not exists challenges (
  id          text primary key,
  theme       text not null,
  rule        text not null default '',
  next_theme  text not null default '',
  is_current  boolean not null default false,
  extra       jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create unique index if not exists challenges_one_current on challenges (is_current) where is_current;

create table if not exists challenge_entries (
  id            text primary key,
  challenge_id  text not null references challenges(id),
  title         text not null,
  author_name   text not null,
  tool          text not null default '',
  emoji         text not null default '',
  colors        text[] not null default '{}',
  votes         integer not null default 0,
  extra         jsonb not null default '{}',
  created_at    timestamptz not null default now()
);
create index if not exists challenge_entries_by_challenge on challenge_entries (challenge_id);

-- ---------- 운영자 정리 내용 · 사이트 구성 · 메타 ----------
create table if not exists curated (
  id    int primary key default 1 check (id = 1),
  data  jsonb not null
);

create table if not exists site_config (
  id                 int primary key default 1 check (id = 1),
  draft              jsonb not null,
  published          jsonb not null,
  published_version  integer not null,
  draft_updated_at   timestamptz,
  rev                integer not null default 0
);
create table if not exists site_config_versions (
  version       integer primary key,
  config        jsonb not null,
  note          text not null,
  published_at  timestamptz not null default now()
);

create table if not exists meta (
  key    text primary key,
  value  text not null
);

-- ---------- 보안: 모든 테이블 RLS 켜기, 정책 없음 ----------
-- 서버(service role 키)만 읽고 쓴다. 공개 키로는 아무것도 못 한다.
alter table users                enable row level security;
alter table posts                enable row level security;
alter table comments             enable row level security;
alter table debates              enable row level security;
alter table predictions          enable row level security;
alter table prompts              enable row level security;
alter table prompt_copies_daily  enable row level security;
alter table challenges           enable row level security;
alter table challenge_entries    enable row level security;
alter table curated              enable row level security;
alter table site_config          enable row level security;
alter table site_config_versions enable row level security;
alter table meta                 enable row level security;

insert into meta (key, value) values ('schema', '1') on conflict (key) do nothing;
