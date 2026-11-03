// 기능 목록. 기능 하나 = 파일 하나 (메인 블록 · 전용 페이지 · 동작이 함께 있다).
//
// 기능 모듈의 모양 (필요한 것만)
//   type         블록 종류 (core.js BLOCKS 의 키, 사이트 구성의 block.type)
//   block(b, c)  메인 블록 HTML     b: 블록 설정(제목 · 개수), c: 커뮤니티 데이터
//   page(c)      전용 페이지 HTML
//   actions      { 'data-action 이름': (el, event) => … }
//   forms        { 'data-form 이름': (form, data) => … }
//   onEnter(p)   페이지에 들어올 때 주소의 쿼리(p)를 상태로 옮긴다. 스크롤할 요소 id 를 돌려줄 수 있다
//   start()      사이트가 시작할 때 한 번
//   afterRender() 화면을 그린 뒤마다
import pulse from './pulse.js';
import future from './future.js';
import away from './away.js';
import debate from './debate.js';
import predictions from './predictions.js';
import community from './community.js';
import prompts from './prompts.js';
import challenge from './challenge.js';
import people from './people.js';

export const FEATURES = [pulse, future, away, debate, predictions, community, prompts, challenge, people];
export const byType = Object.fromEntries(FEATURES.map((f) => [f.type, f]));

// 모든 기능의 동작 · 폼을 한 표로 (이름이 겹치면 시작할 때 알려준다)
export const actions = {};
export const forms = {};
for (const f of FEATURES) {
  for (const [name, fn] of Object.entries(f.actions || {})) {
    if (actions[name]) console.error(`동작 이름이 겹칩니다: ${name}`);
    actions[name] = fn;
  }
  Object.assign(forms, f.forms || {});
}
