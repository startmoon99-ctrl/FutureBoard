// 화면 보기 전환: 휴대폰에서 PC 화면('desktop'), PC 에서 모바일 화면('mobile')
// 실제 적용(뷰포트 폭 바꾸기)은 index.html <head> 의 스크립트가 그리기 전에 한다. 휴대폰 판단 기준을 그쪽과 같게 유지한다.
import { IS_EMBEDDED, IS_PHONE_FRAME, $, esc } from './core.js';

const SCREEN_MIN = Math.min(screen.width, screen.height);
const IS_PHONE = SCREEN_MIN > 0 && SCREEN_MIN < 768 && matchMedia('(pointer: coarse)').matches;

const viewMode = {
  get() {
    try { return localStorage.getItem('fb_view'); } catch { return null; }
  },
  set(v) {
    try {
      if (v) localStorage.setItem('fb_view', v);
      else localStorage.removeItem('fb_view');
    } catch { /* 저장소를 못 쓰면 전환하지 않는다 */ }
  },
};

const FORCED_DESKTOP = !IS_EMBEDDED && IS_PHONE && viewMode.get() === 'desktop';
export const PHONE_STAGE = !IS_EMBEDDED && !IS_PHONE && viewMode.get() === 'mobile';

// 머리의 전환 버튼 · 휴대폰에서 PC 화면일 때 아래쪽 돌아가기 버튼
export function renderViewToggle() {
  // 틀 안(관리자 미리보기 · 휴대폰 틀)에서는 바깥 화면이 전환 버튼을 가진다
  const toDesktop = IS_PHONE && !FORCED_DESKTOP;
  const vt = $('#view-toggle');
  vt.hidden = IS_EMBEDDED;
  vt.innerHTML = toDesktop ? '🖥 PC<span class="vt-label"> 화면</span>' : '📱 모바일<span class="vt-label"> 화면</span>';
  vt.title = toDesktop ? 'PC 화면으로 보기' : '모바일 화면으로 보기';
  $('#view-return').hidden = !FORCED_DESKTOP;
  if (IS_EMBEDDED && !IS_PHONE_FRAME) document.querySelectorAll('a[href="/admin"]').forEach((a) => { a.hidden = true; });
}

export function toggleView() {
  if (IS_PHONE) viewMode.set(FORCED_DESKTOP ? null : 'desktop');
  else viewMode.set(PHONE_STAGE ? null : 'mobile');
  location.reload();
}

// PC 에서 모바일 화면 보기: 페이지를 390px 폭의 틀(iframe) 안에 다시 띄운다.
// 틀 안은 진짜 좁은 화면이라 모바일 레이아웃이 그대로 적용된다.
export function showPhoneStage() {
  const params = new URLSearchParams(location.search);
  params.set('frame', 'phone');
  const src = location.pathname + '?' + params + location.hash;
  document.body.className = 'phone-stage';
  document.body.innerHTML = `
    <div class="stage-bar">
      <span class="stage-label">📱 모바일 화면 보기 <span class="muted">· 390 × 844</span></span>
      <button class="btn btn-primary" data-action="toggle-view">🖥 PC 화면으로</button>
    </div>
    <div class="stage-device"><iframe src="${esc(src)}" title="모바일 화면"></iframe></div>
    <p class="stage-note">프로토타입 확인용 화면이에요. 실제 휴대폰과 글자 크기·스크롤 느낌은 조금 다를 수 있어요.</p>`;
  document.documentElement.classList.remove('stage-pending');
}
