'use strict';
// 투표형 기능의 데이터 접근: 오늘의 질문 · 미래 예측 · 프롬프트 복사 · 챌린지 출품작.
// 정의(질문 · 예측 · 프롬프트 · 출품작)는 각자의 키에, 숫자는 모두 counters 에 둔다.

const db = require('../db');
const { fail } = require('../http');
const comments = require('./comments');

const K = db.KEYS;

async function countPair(prefix, a, b) {
  const c = await db.counters([`${prefix}:${a}`, `${prefix}:${b}`]);
  return { [a]: c[`${prefix}:${a}`], [b]: c[`${prefix}:${b}`] };
}

// ---------- 오늘의 질문 ----------

async function currentDebate() {
  const d = await db.getJson(K.debate);
  if (!d) throw fail(404, '오늘의 질문이 없습니다');
  return d;
}

async function voteDebate(choice) {
  const d = await currentDebate();
  await db.incr(`debate:${d.id}:${choice}`);
  return countPair(`debate:${d.id}`, 'yes', 'no');
}

async function commentDebate({ author, text, choice }) {
  const d = await currentDebate();
  return comments.create({ target: `debate:${d.id}`, author, text, choice });
}

// ---------- 미래 예측 ----------

async function votePrediction(id, choice) {
  const p = await db.hgetJson(K.predictions, id);
  if (!p) throw fail(404, '예측을 찾을 수 없습니다');
  if (p.status !== 'open') throw fail(400, '이미 판정이 끝난 예측입니다');
  await db.incr(`prediction:${id}:${choice}`);
  return countPair(`prediction:${id}`, 'yes', 'no');
}

// ---------- 프롬프트 ----------

// '오늘 복사'는 날짜(한국 시간)마다 따로 센다. 날이 바뀌면 새 칸에서 0부터 시작한다.
const kstDay = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const promptCounters = (id) => ({ copies: `prompt:${id}:copies`, copiesToday: `prompt:${id}:copies:${kstDay()}` });

async function copyPrompt(id) {
  if (!(await db.hgetJson(K.prompts, id))) throw fail(404, '프롬프트를 찾을 수 없습니다');
  const f = promptCounters(id);
  await db.batch([
    ['HINCRBY', K.counters, f.copies, '1'],
    ['HINCRBY', K.counters, f.copiesToday, '1'],
  ]);
  const c = await db.counters([f.copies, f.copiesToday]);
  return { copies: c[f.copies], copiesToday: c[f.copiesToday] };
}

// ---------- 챌린지 ----------

async function voteEntry(id) {
  if (!(await db.hgetJson(K['challenge-entries'], id))) throw fail(404, '출품작을 찾을 수 없습니다');
  return { votes: await db.incr(`entry:${id}:votes`) };
}

module.exports = { voteDebate, commentDebate, votePrediction, copyPrompt, promptCounters, voteEntry };
