'use strict';
// 저장소가 비어 있을 때 넣는 초기 데이터. require 로 읽어야 Vercel 함수 번들에 포함된다.

const communitySeed = require('../seed/community.json');
const siteConfigSeed = require('../seed/site-config.json');

const clone = (v) => JSON.parse(JSON.stringify(v));

function seedCommunity() {
  const seed = clone(communitySeed);
  const now = Date.now();
  const stamp = (items) => (items || []).forEach((it) => {
    if (typeof it.minutesAgo === 'number') {
      it.createdAt = new Date(now - it.minutesAgo * 60000).toISOString();
      delete it.minutesAgo;
    }
  });
  stamp(seed.posts);
  stamp(seed.prompts);
  stamp(seed.predictions);
  stamp(seed.debate.comments);
  stamp(seed.challenge.entries);
  return seed;
}

function seedSiteConfig() {
  const base = clone(siteConfigSeed);
  const at = new Date().toISOString();
  return {
    draft: clone(base),
    published: clone(base),
    publishedVersion: 1,
    draftUpdatedAt: at,
    versions: [{ version: 1, publishedAt: at, note: '초기 구성', config: clone(base) }],
  };
}

module.exports = {
  community: seedCommunity,
  'site-config': seedSiteConfig,
};
