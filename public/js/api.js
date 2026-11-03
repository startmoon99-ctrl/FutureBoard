// 서버 API 호출은 모두 이 파일을 거친다. 주소나 요청 모양이 바뀌면 여기만 고친다.

export async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || '요청에 실패했어요'), { status: res.status });
  return data;
}

const post = (path, body) => request(path, { method: 'POST', body });

export const api = {
  // 사이트 구성 · 콘텐츠
  config: (mode) => request('/api/config?mode=' + mode),
  content: () => request('/api/content'),

  // 게시글
  createPost: (input) => post('/api/posts', input),
  likePost: (id) => post(`/api/posts/${encodeURIComponent(id)}/like`),
  viewPost: (id) => post(`/api/posts/${encodeURIComponent(id)}/view`),

  // 오늘의 질문
  voteDebate: (choice) => post('/api/debate/vote', { choice }),
  commentDebate: (input) => post('/api/debate/comment', input),

  // 예측 · 프롬프트 · 챌린지
  votePrediction: (id, choice) => post(`/api/predictions/${encodeURIComponent(id)}/vote`, { choice }),
  copyPrompt: (id) => post(`/api/prompts/${encodeURIComponent(id)}/copy`),
  voteEntry: (id) => post(`/api/challenge/${encodeURIComponent(id)}/vote`),

  // 관리자 모드
  admin: {
    session: () => request('/api/admin/session'),
    login: (password) => post('/api/admin/login', { password }),
    logout: () => post('/api/admin/logout'),
    state: () => request('/api/admin/state'),
    saveDraft: (config) => request('/api/admin/draft', { method: 'PUT', body: { config } }),
    resetDraft: () => post('/api/admin/draft/reset'),
    publish: (note) => post('/api/admin/publish', { note }),
    rollback: (version) => post('/api/admin/rollback', { version }),
    // 글 · 댓글 숨기기 (hidden: false 면 되살리기)
    hidden: () => request('/api/admin/hidden'),
    hidePost: (id, hidden = true) => post(`/api/admin/posts/${encodeURIComponent(id)}/hide`, { hidden }),
    hideComment: (id, hidden = true) => post(`/api/admin/comments/${encodeURIComponent(id)}/hide`, { hidden }),
  },
};
