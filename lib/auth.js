'use strict';
// 인증 · 권한. 권한 확인은 이 파일의 requireAdmin() 하나로만 한다.
// 지금은 관리자 한 명(비밀번호 ADMIN_PASSWORD)뿐이다. 회원 계정이 생기면 여기에 사용자 세션을 더한다.
//  · 로컬에서 ADMIN_PASSWORD 를 정하지 않았으면 비밀번호 없이 들어간다 (내 PC 전용).
//  · Vercel 배포본에서 정하지 않았으면 관리자 모드를 잠근다.
// 로그인하면 서명한 쿠키를 준다. 서버에 세션을 저장하지 않으므로 Vercel 함수에서도 그대로 동작한다.

const crypto = require('crypto');
const { ADMIN_PASSWORD, ON_VERCEL, ADMIN_SESSION_DAYS } = require('./config');
const { fail } = require('./http');

const COOKIE = 'fb_admin';
const MAX_AGE = ADMIN_SESSION_DAYS * 24 * 3600;

// 비밀번호가 바뀌면 서명 키도 바뀌어 기존 로그인이 모두 풀린다
const secret = crypto.createHash('sha256').update('futureboard-admin:' + ADMIN_PASSWORD).digest();
const sign = (exp) => crypto.createHmac('sha256', secret).update(String(exp)).digest('base64url');

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return '';
}

const isSecure = (req) => ON_VERCEL || req.headers['x-forwarded-proto'] === 'https';

function status(req) {
  if (!ADMIN_PASSWORD) return { required: false, locked: ON_VERCEL, authed: !ON_VERCEL };
  const [exp, sig] = readCookie(req, COOKIE).split('.');
  const authed = !!exp && Number(exp) > Date.now() / 1000 && safeEqual(sig, sign(exp));
  return { required: true, locked: false, authed };
}

function requireAdmin(req) {
  const s = status(req);
  if (s.locked) throw fail(503, '관리자 비밀번호(ADMIN_PASSWORD)가 설정되지 않아 관리자 모드가 잠겨 있어요');
  if (!s.authed) throw fail(401, '관리자 로그인이 필요해요');
}

function setSession(req, res) {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  res.setHeader('Set-Cookie', `${COOKIE}=${exp}.${sign(exp)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}${isSecure(req) ? '; Secure' : ''}`);
}

function clearSession(req, res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isSecure(req) ? '; Secure' : ''}`);
}

const checkPassword = (input) => !!ADMIN_PASSWORD && safeEqual(input, ADMIN_PASSWORD);

module.exports = { status, requireAdmin, setSession, clearSession, checkPassword };
