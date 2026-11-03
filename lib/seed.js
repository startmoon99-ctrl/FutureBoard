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
  stamp(seed.futureHistory);
  stamp(seed.debateArchive);
  stamp(seed.challengeArchive);
  return seed;
}

// 이미 저장된 문서에 나중에 추가된 항목(지난 기록 등)이 없으면 초기 데이터로 채운다. 있는 값은 건드리지 않는다.
function upgrade(name, doc) {
  if (name !== 'community') return false;
  let fresh = null;
  let changed = false;
  for (const key of ['futureHistory', 'debateArchive', 'challengeArchive']) {
    if (doc[key] === undefined) {
      fresh = fresh || seedCommunity();
      doc[key] = fresh[key];
      changed = true;
    }
  }
  return changed;
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
  upgrade,
};
