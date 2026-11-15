'use strict';
(() => {
  let locale = 'en';
  try { if (localStorage.getItem('luna.locale') === 'zh-CN') locale = 'zh-CN'; } catch {}
  document.documentElement.lang = locale;
  if (locale === 'en') {
    document.title = 'Collaboration workspace · Botdom demo';
    const description = document.querySelector('meta[name="description"]');
    if (description) description.content = 'An interactive Botdom collaboration demo with sample data and no connection to real tasks.';
    const title = document.querySelector('.workspace-header p');
    if (title) title.innerHTML = 'Collaboration workspace <span>Interactive concept · no real tasks</span>';
    const back = document.querySelector('.workspace-header .text-link');
    if (back) back.textContent = '← Back to product tour';
    const note = document.querySelector('.demo-disclaimer');
    if (note) note.textContent = 'All events use sample data. No models are called and your workspace is not changed. Select a role to see its task and handoffs.';
  }
  const scripts = locale === 'zh-CN'
    ? ['transfer-motion.js?v=20261027-3', 'collaboration.js?v=20261102-muster-2']
    : ['transfer-motion.en.js?v=1', 'collaboration.en.js?v=1'];
  function load(src) { return new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.src = src;
    script.onload = resolve; script.onerror = reject; document.body.append(script);
  }); }
  (async () => { for (const src of [...scripts, 'guide-integration.js']) await load(src); })().catch(() => {
    const root = document.querySelector('#collaborationApp');
    if (root) root.textContent = locale === 'zh-CN' ? '演示加载失败，请刷新重试。' : 'The demo could not load. Please refresh to try again.';
  });
})();
