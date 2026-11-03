'use strict';
// 사이트 구성(Site Configuration) 데이터 접근: draft · published · 버전 기록.
// 커뮤니티 데이터와 완전히 따로 저장되므로 여기의 어떤 변경 · 롤백도 글 · 투표를 건드리지 않는다.

const db = require('../db');
const seeds = require('../seed');
const { cleanStr, clampInt } = require('../http');
const { LIMITS } = require('../config');

const K = db.KEYS;
const clone = (v) => JSON.parse(JSON.stringify(v));

// 블록 목록의 기준: seed/site-config.json. 새 블록 종류를 추가하면 저장된 구성의 draft 끝에 '숨김'으로 붙는다.
const CATALOG = seeds['site-config']().draft.blocks;

function ensureCatalog(doc) {
  const have = new Set(doc.draft.blocks.map((b) => b.id));
  for (const b of CATALOG) if (!have.has(b.id)) doc.draft.blocks.push({ ...clone(b), visible: false });
  return doc;
}

async function get() {
  return ensureCatalog((await db.getJson(K['site-config'])) || seeds['site-config']());
}

// fn(doc) 이 doc 을 고치고 돌려줄 값을 반환한다. 동시에 고쳐도 버전 비교로 잃어버리지 않는다.
function update(fn) {
  return db.updateJson(K['site-config'], (doc) => fn(ensureCatalog(doc)), { fallback: () => seeds['site-config']() });
}

// 관리자가 보낸 구성을 정리한다. 블록은 숨길 수만 있고 삭제 · 생성은 할 수 없다.
function sanitize(input, base) {
  const src = input && typeof input === 'object' ? input : {};
  const known = new Map(base.blocks.map((b) => [b.id, b]));
  const seen = new Set();
  const blocks = [];

  for (const b of Array.isArray(src.blocks) ? src.blocks : []) {
    const orig = b && known.get(b.id);
    if (!orig || seen.has(orig.id)) continue;
    seen.add(orig.id);
    blocks.push({
      id: orig.id,
      type: orig.type,
      title: cleanStr(b.title, orig.title, LIMITS.blockTitle),
      visible: b.visible !== false,
      limit: clampInt(b.limit, 1, LIMITS.blockItems, orig.limit),
      size: b.size === 'half' ? 'half' : 'full',
    });
  }
  for (const orig of base.blocks) if (!seen.has(orig.id)) blocks.push(clone(orig));

  return {
    siteTitle: cleanStr(src.siteTitle, base.siteTitle, LIMITS.siteTitle),
    tagline: cleanStr(src.tagline, base.tagline, LIMITS.tagline),
    blocks,
  };
}

// 게시: config 를 새 버전으로 published 에 올린다
function pushVersion(doc, config, note) {
  const version = Math.max(...doc.versions.map((v) => v.version), doc.publishedVersion) + 1;
  doc.published = clone(config);
  doc.publishedVersion = version;
  doc.versions.push({ version, publishedAt: new Date().toISOString(), note, config: clone(config) });
  if (doc.versions.length > LIMITS.keptVersions) doc.versions = doc.versions.slice(-LIMITS.keptVersions);
  return version;
}

module.exports = { get, update, sanitize, pushVersion };
