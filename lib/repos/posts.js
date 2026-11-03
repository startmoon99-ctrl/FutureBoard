'use strict';
// 게시글 데이터 접근. 추천 · 조회 수는 counters 에 따로 두어 글 내용과 부딪히지 않게 센다.
// 관리자가 숨긴 글은 지우지 않고 hiddenAt 만 붙인다. 화면 데이터(snapshot)에서 빠지고, 되살릴 수 있다.

const db = require('../db');
const { fail } = require('../http');

const K = db.KEYS;
const REACTIONS = ['likes', 'views'];

const counterField = (id, field) => `post:${id}:${field}`;

// 같은 링크인지 비교할 때 쓰는 모양 (쿼리 · 해시 · 끝 슬래시 · 대소문자 무시)
const normalizeLink = (u) => u.replace(/[#?].*$/, '').replace(/\/+$/, '').toLowerCase();

const newId = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

async function get(id) {
  return db.hgetJson(K.posts, id);
}

// 숨긴 글은 없는 글처럼 다룬다
async function getVisible(id) {
  const post = await get(id);
  return post && !post.hiddenAt ? post : null;
}

// post: 검증을 마친 글 (id · createdAt 은 여기서 붙인다)
// 최초 발견자: 링크 색인에 처음 들어간 글. 익명 글은 고정 정체성이 없으므로 크레딧을 받지 않는다.
async function create(input) {
  const post = { ...input, id: newId(), createdAt: new Date().toISOString() };
  let discovery = null;

  if (post.link) {
    const key = normalizeLink(post.link);
    if (await db.hsetnx(K['post-links'], key, post.id)) {
      if (!post.anonymous) {
        post.firstDiscovery = true;
        discovery = { first: true };
      }
    } else {
      const first = await get(await db.hget(K['post-links'], key));
      if (first?.hiddenAt) {
        // 먼저 올린 글이 숨겨졌으면(스팸 등) 이 글이 최초 발견자가 된다
        await db.hset(K['post-links'], key, post.id);
        if (!post.anonymous) {
          post.firstDiscovery = true;
          discovery = { first: true };
        }
      } else {
        discovery = { first: false, by: first?.author || '누군가', at: first?.createdAt || post.createdAt };
      }
    }
  }

  await db.hsetJson(K.posts, post.id, post);
  return { post: { ...post, likes: 0, views: 0 }, discovery };
}

// 추천(likes) · 조회(views) 하나 올리고 두 숫자를 돌려준다
async function react(id, field) {
  if (!REACTIONS.includes(field)) throw fail(400, '알 수 없는 동작입니다');
  if (!(await getVisible(id))) throw fail(404, '글을 찾을 수 없습니다');
  await db.incr(counterField(id, field));
  const c = await db.counters(REACTIONS.map((f) => counterField(id, f)));
  return { likes: c[counterField(id, 'likes')], views: c[counterField(id, 'views')] };
}

// 관리자: 숨기기 · 되살리기
async function setHidden(id, hidden) {
  const post = await get(id);
  if (!post) throw fail(404, '글을 찾을 수 없습니다');
  if (hidden) post.hiddenAt = post.hiddenAt || new Date().toISOString();
  else {
    delete post.hiddenAt;
    // 숨긴 동안 같은 링크를 다른 사람이 올려 최초 발견자가 됐으면 그쪽을 유지한다
    if (post.firstDiscovery && (await db.hget(K['post-links'], normalizeLink(post.link))) !== post.id) post.firstDiscovery = false;
  }
  await db.hsetJson(K.posts, id, post);
  return post;
}

// 화면에 보낼 모양: 글 + 숫자
const withCounts = (post, counters) => ({
  ...post,
  likes: counters[counterField(post.id, 'likes')] || 0,
  views: counters[counterField(post.id, 'views')] || 0,
});

// 화면에 보낼 목록: 숨기지 않은 글을 오래된 순으로
const view = (all, counters) => Object.values(all)
  .filter((p) => !p.hiddenAt)
  .sort((a, z) => new Date(a.createdAt) - new Date(z.createdAt))
  .map((p) => withCounts(p, counters));

module.exports = { get, create, react, setHidden, withCounts, view, normalizeLink };
