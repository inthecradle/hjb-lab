(() => {
  'use strict';

  // Local development uses the same ports as the other Labs.
  // After publication, set the inverse card's data-public-url in index.html.
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  const ports = { lyapunov: 5173, evolution: 5174, inverse: 5176 };
  document.querySelectorAll('[data-lab]').forEach(card => {
    const port = ports[card.dataset.lab];
    const url = local && location.port === '5175' && port
      ? `http://127.0.0.1:${port}/`
      : card.dataset.publicUrl;
    if (!url) return;
    if (card.tagName === 'A') {
      card.href = url;
      return;
    }
    const link = document.createElement('a');
    link.className = 'series-lab';
    link.dataset.lab = card.dataset.lab;
    link.href = url;
    link.innerHTML = card.innerHTML;
    const marker = link.querySelector('small');
    marker.textContent = '↗';
    marker.setAttribute('aria-hidden', 'true');
    card.replaceWith(link);
  });

  document.querySelectorAll('a[href="#about"]').forEach(link => {
    link.addEventListener('click', () => {
      document.getElementById('mathDetails').open = true;
    });
  });
  // Also reveal the model assumptions when arriving via a direct anchor link.
  const revealAbout = () => {
    if (location.hash === '#about') document.getElementById('mathDetails').open = true;
  };
  window.addEventListener('hashchange', revealAbout);
  revealAbout();
})();
