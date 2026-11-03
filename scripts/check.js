'use strict';
// 빌드 도구가 없는 프로젝트를 위한 점검 (npm run check). 외부 패키지 없음.
//  1. 모든 .js 문법
//  2. 사이트 모듈(public/js)의 import 가 실제로 있는 파일 · 내보낸 이름을 가리키는지
//  3. 가져오고 쓰지 않는 이름 (경고)
//  4. 화면의 data-action 중 처리하는 곳이 없는 것
//  5. 서버 모듈이 모두 불러와지는지

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let errors = 0;
let warnings = 0;
const error = (msg) => { errors += 1; console.log('  ERROR ' + msg); };
const warn = (msg) => { warnings += 1; console.log('  WARN  ' + msg); };
const rel = (f) => path.relative(ROOT, f).replace(/\\/g, '/');

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (['node_modules', '.git', 'data', '.vercel'].includes(name)) continue;
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith('.js')) out.push(full);
  }
  return out;
}

const files = walk(ROOT);

console.log('\n[1] 문법');
for (const f of files) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
  } catch (err) {
    error(`${rel(f)}: ${String(err.stderr).split('\n').slice(0, 5).join(' ')}`);
  }
}

console.log('\n[2] 사이트 모듈 import / export');
const SITE = path.join(ROOT, 'public');
const siteFiles = files.filter((f) => f.startsWith(SITE));
const exportsOf = (src) => {
  const names = new Set();
  for (const m of src.matchAll(/export\s+(?:async\s+)?(?:const|let|function\*?|class)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop();
      if (name) names.add(name);
    }
  }
  if (/export\s+default\b/.test(src)) names.add('default');
  return names;
};
const sources = Object.fromEntries(siteFiles.map((f) => [f, fs.readFileSync(f, 'utf8')]));
for (const [file, src] of Object.entries(sources)) {
  for (const m of src.matchAll(/import\s+([\s\S]*?)\s+from\s+['"](\.[^'"]+)['"]/g)) {
    const target = path.resolve(path.dirname(file), m[2]);
    if (!sources[target]) {
      error(`${rel(file)}: 없는 파일을 가져옴 '${m[2]}'`);
      continue;
    }
    const exported = exportsOf(sources[target]);
    const clause = m[1];
    const named = clause.match(/\{([\s\S]*)\}/);
    const imported = [];
    if (named) {
      for (const part of named[1].split(',')) {
        const [orig, alias] = part.trim().split(/\s+as\s+/);
        if (orig) imported.push([orig, alias || orig]);
      }
    }
    const def = clause.replace(/\{[\s\S]*\}/, '').replace(/,/g, '').trim();
    if (def) imported.push(['default', def]);
    for (const [orig, local] of imported) {
      if (!exported.has(orig)) error(`${rel(file)}: '${rel(target)}' 에 '${orig}' 가 없음`);
      // 'obj.name' 은 다른 것이지만 '...name' 은 같은 이름이다
      const uses = src.match(new RegExp(`(?<![\\w$])(?<![^.]\\.)${local.replace(/\$/g, '\\$')}(?![\\w$])`, 'g'))?.length || 0;
      if (uses < 2) warn(`${rel(file)}: '${local}' 을 가져오고 쓰지 않음`);
    }
  }
}

console.log('\n[3] 화면 동작(data-action) 연결');
const handled = new Set();
for (const src of Object.values(sources)) {
  for (const m of src.matchAll(/^\s*(?:async\s+)?'([a-z-]+)'(?:\s*\(|\s*:)/gm)) handled.add(m[1]);
}
const used = new Set();
const html = ['index.html', 'admin.html'].map((f) => fs.readFileSync(path.join(ROOT, 'public', f), 'utf8')).join('\n');
for (const src of [...Object.values(sources), html]) {
  for (const m of src.matchAll(/data-action="([a-z-]+)"/g)) used.add(m[1]);
}
for (const name of used) if (!handled.has(name)) error(`data-action="${name}" 를 처리하는 곳이 없음`);
for (const m of html.matchAll(/<script[^>]+src="([^"]+)"/g)) {
  if (!fs.existsSync(path.join(ROOT, 'public', m[1]))) error(`HTML 이 없는 스크립트를 불러옴: ${m[1]}`);
}

console.log('\n[4] 서버 모듈 불러오기');
try {
  execFileSync(process.execPath, ['-e', "require('./lib/app'); require('./api/index.js')"], {
    cwd: ROOT,
    stdio: 'pipe',
    env: { PATH: process.env.PATH, SYSTEMROOT: process.env.SYSTEMROOT, NO_ENV_FILE: '1', DATA_DIR: path.join(require('os').tmpdir(), 'futureboard-check') },
  });
} catch (err) {
  error('서버 모듈: ' + String(err.stderr).split('\n').slice(0, 6).join(' '));
}

console.log(`\n오류 ${errors}건, 경고 ${warnings}건`);
process.exit(errors ? 1 : 0);
