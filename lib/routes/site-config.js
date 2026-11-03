'use strict';
// 사이트 구성: 공개 구성 읽기, 관리자 모드의 Draft 저장 · 게시 · 롤백

const db = require('../db');
const siteConfig = require('../repos/site-config');
const { requireAdmin } = require('../auth');
const { sendJson, readBody, fail, cleanStr } = require('../http');
const { LIMITS } = require('../config');

const clone = (v) => JSON.parse(JSON.stringify(v));

const adminState = (c) => ({
  draft: c.draft,
  published: c.published,
  publishedVersion: c.publishedVersion,
  draftUpdatedAt: c.draftUpdatedAt,
  versions: c.versions,
  storage: db.kind,
});

module.exports = (route) => {
  route('GET', /^\/api\/config$/, async (req, res, m, url) => {
    const mode = url.searchParams.get('mode') === 'draft' ? 'draft' : 'published';
    if (mode === 'draft') requireAdmin(req);
    sendJson(res, 200, (await siteConfig.get())[mode]);
  });

  route('GET', /^\/api\/admin\/state$/, async (req, res) => {
    requireAdmin(req);
    sendJson(res, 200, adminState(await siteConfig.get()));
  });

  route('PUT', /^\/api\/admin\/draft$/, async (req, res) => {
    requireAdmin(req);
    const body = await readBody(req);
    sendJson(res, 200, await siteConfig.update((c) => {
      c.draft = siteConfig.sanitize(body.config, c.draft);
      c.draftUpdatedAt = new Date().toISOString();
      return adminState(c);
    }));
  });

  route('POST', /^\/api\/admin\/draft\/reset$/, async (req, res) => {
    requireAdmin(req);
    sendJson(res, 200, await siteConfig.update((c) => {
      c.draft = clone(c.published);
      c.draftUpdatedAt = new Date().toISOString();
      return adminState(c);
    }));
  });

  route('POST', /^\/api\/admin\/publish$/, async (req, res) => {
    requireAdmin(req);
    const body = await readBody(req);
    const state = await siteConfig.update((c) => {
      siteConfig.pushVersion(c, c.draft, cleanStr(body.note, '구성 변경', LIMITS.publishNote));
      return adminState(c);
    });
    console.log(`  · v${state.publishedVersion} 게시됨`);
    sendJson(res, 200, state);
  });

  // 롤백은 UI 구성만 되돌린다. Community Data는 건드리지 않는다.
  route('POST', /^\/api\/admin\/rollback$/, async (req, res) => {
    requireAdmin(req);
    const body = await readBody(req);
    const state = await siteConfig.update((c) => {
      const target = c.versions.find((v) => v.version === Number(body.version));
      if (!target) throw fail(404, '해당 버전을 찾을 수 없습니다');
      siteConfig.pushVersion(c, target.config, `v${target.version} 구성으로 롤백`);
      return adminState(c);
    });
    console.log(`  · v${body.version} 구성으로 롤백 → v${state.publishedVersion}`);
    sendJson(res, 200, state);
  });
};
