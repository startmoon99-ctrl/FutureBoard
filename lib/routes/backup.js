'use strict';
// 관리자: 데이터 내보내기 (백업용 JSON 파일 내려받기)

const backup = require('../repos/backup');
const { requireAdmin } = require('../auth');
const { sendJson } = require('../http');

module.exports = (route) => {
  route('GET', /^\/api\/admin\/export$/, async (req, res) => {
    requireAdmin(req);
    const dump = await backup.exportAll();
    const day = dump.exportedAt.slice(0, 10);
    res.setHeader('Content-Disposition', `attachment; filename="futureboard-backup-${day}.json"`);
    console.log('  · 데이터 내보내기');
    sendJson(res, 200, dump);
  });
};
