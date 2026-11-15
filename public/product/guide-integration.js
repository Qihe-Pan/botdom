'use strict';
// The product presentation is bundled locally; no hosted Site or login is needed.
(() => {
  if (window.parent === window) return;
  document.addEventListener('click',event => {
    const link=event.target.closest('a[data-guide-chapter]');
    if (!link) return;
    event.preventDefault();
    window.parent.postMessage({type:'luna-product-guide',chapter:link.dataset.guideChapter},location.origin);
  });
  window.addEventListener('message',event => {
    if (event.source !== window.parent || event.origin !== location.origin) return;
    if (event.data?.type === 'luna-product-visibility' && event.data.visible === false) {
      window.dispatchEvent(new Event('luna-product-paused'));
    }
  });
  document.addEventListener('keydown',event => {
    if (event.key === 'Escape' && !document.querySelector('dialog[open]')) {
      event.preventDefault();
      window.parent.postMessage({type:'luna-guide-close'},location.origin);
    }
  });
})();
