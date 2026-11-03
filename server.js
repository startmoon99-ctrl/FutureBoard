'use strict';
// 퓨쳐보드 로컬 서버 (외부 패키지 없음). START.bat 이 실행한다.
// /api/* 는 lib/app.js 가 처리하고(Vercel 배포본과 같은 코드), 나머지는 public/ 의 정적 파일이다.

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { exec } = require('child_process');

// .env.local 이 있으면 환경 변수로 읽는다 (ADMIN_PASSWORD, Upstash 연결값 등). git 에는 올라가지 않는다.
// 테스트(tests/smoke.js)는 NO_ENV_FILE 로 이 파일을 건너뛴다 — 실제 저장소에 연결되지 않게.
const ENV_FILE = path.join(__dirname, '.env.local');
if (!process.env.NO_ENV_FILE && fs.existsSync(ENV_FILE)) {
  for (const line of fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

const { handleApi } = require('./lib/app');
const db = require('./lib/db');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const SHOULD_OPEN = process.argv.includes('--open');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

// vercel.json 의 rewrites 와 같은 규칙. 사이트의 페이지 주소는 모두 index.html 이 받고 화면은 public/js 가 고른다.
const SITE_PAGES = /^\/(preview)?\/?(pulse|future|away|debate|predictions|community|prompts|challenge|people)?$/;
const pageFile = (pathname) => (pathname === '/admin' ? 'admin.html' : SITE_PAGES.test(pathname) ? 'index.html' : null);

function sendFile(res, file) {
  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}

// vercel.json 의 headers 와 같은 보안 헤더
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

const server = http.createServer((req, res) => {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
  const pathname = new URL(req.url, 'http://localhost').pathname.replace(/\/+$/, '') || '/';
  if (pathname.startsWith('/api/')) return handleApi(req, res);

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405);
    return res.end();
  }
  const page = pageFile(pathname);
  if (page) return sendFile(res, path.join(PUBLIC_DIR, page));

  let file;
  try {
    file = path.normalize(path.join(PUBLIC_DIR, decodeURIComponent(pathname)));
  } catch {
    file = '';
  }
  if (!file.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403);
    return res.end();
  }
  return sendFile(res, file);
});

function openBrowser(target) {
  const cmd = process.platform === 'win32' ? `start "" "${target}"` : process.platform === 'darwin' ? `open "${target}"` : `xdg-open "${target}"`;
  exec(cmd, () => {});
}

function lanAddresses() {
  return Object.values(os.networkInterfaces()).flat()
    .filter((a) => a && a.family === 'IPv4' && !a.internal)
    .map((a) => a.address);
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    // 퓨쳐보드가 이미 실행 중인 경우는 START.bat 이 먼저 걸러내므로, 여기까지 오면 다른 프로그램이 포트를 쓰는 것이다
    console.log(`\n  [안내] ${PORT}번 포트가 이미 사용 중입니다.`);
    process.exit(2);
  }
  throw err;
});

server.listen(PORT, () => {
  const storageLabel = { file: 'data 폴더 (이 PC)', redis: 'Upstash Redis (배포본과 같은 데이터)', none: '없음' }[db.kind];
  console.log('');
  console.log('  퓨쳐보드 실행 중');
  console.log(`  · 사이트         http://localhost:${PORT}`);
  console.log(`  · 관리자 모드    http://localhost:${PORT}/admin${process.env.ADMIN_PASSWORD ? '  (비밀번호 필요)' : ''}`);
  for (const ip of lanAddresses()) console.log(`  · 같은 Wi-Fi 휴대폰  http://${ip}:${PORT}`);
  console.log(`  · 데이터 저장    ${storageLabel}`);
  console.log('  · 종료하려면 이 창을 닫거나 Ctrl+C 를 누르세요');
  console.log('');
  if (SHOULD_OPEN) openBrowser(`http://localhost:${PORT}`);
});
