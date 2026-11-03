'use strict';
// 테스트용 가짜 Upstash REST 서버. lib/db/engine.js 로 명령을 처리한다.
// EVAL 은 스크립트 첫 줄 표시(--cas · --hit)로 어떤 스크립트인지 알아본다.

const http = require('http');
const { createEngine } = require('../lib/db/engine');

function startMockUpstash({ port = 0, token = 'test-token', initial = {} } = {}) {
  const engine = createEngine(initial);

  const run = (cmd) => {
    if (String(cmd[0]).toUpperCase() !== 'EVAL') return engine.exec(cmd);
    const [, script, numKeys, ...rest] = cmd;
    const keys = rest.slice(0, Number(numKeys));
    const args = rest.slice(Number(numKeys));
    if (script.startsWith('--cas')) return engine.exec(['CAS', keys[0], keys[1], args[0], args[1]]);
    if (script.startsWith('--hit')) return engine.exec(['HIT', keys[0], args[0]]);
    throw new Error('모르는 스크립트');
  };

  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const send = (status, data) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
      };
      if (req.headers.authorization !== `Bearer ${token}`) return send(401, { error: 'Unauthorized' });
      try {
        const parsed = JSON.parse(body);
        // 실제 네트워크처럼 응답을 조금씩 늦춰 동시 요청이 겹치게 한다
        setTimeout(() => {
          try {
            if (req.url === '/pipeline') send(200, parsed.map((c) => ({ result: run(c) })));
            else send(200, { result: run(parsed) });
          } catch (err) {
            send(400, { error: err.message });
          }
        }, 2 + Math.random() * 10);
      } catch (err) {
        send(400, { error: err.message });
      }
    });
  });

  return new Promise((resolve) => server.listen(port, () => resolve({ server, engine, url: `http://127.0.0.1:${server.address().port}`, token })));
}

module.exports = { startMockUpstash };
