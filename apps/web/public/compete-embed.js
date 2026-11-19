/*
 * Daily Funded Compete — embeddable widgets (D108).
 *
 *   <script src="https://<your competition domain>/compete-embed.js" async></script>
 *   <div data-compete-widget="countdown|leaderboard|join" data-lang="en" data-theme="dark"></div>
 *
 * Each element becomes an iframe served from the competition domain (the domain this script
 * is loaded from). The page embedding it must be listed under "Widget websites" in the
 * operator panel; other sites are refused by the browser (CSP frame-ancestors).
 */
(function () {
  'use strict';
  var script = document.currentScript;
  if (!script || !script.src) return;
  var origin = new URL(script.src).origin;
  var KINDS = { countdown: 1, leaderboard: 1, join: 1 };
  var LANGS = { en: 1, nl: 1, es: 1 };
  var frames = {};
  var seq = 0;

  function mount(el) {
    if (el.getAttribute('data-compete-mounted')) return;
    var kind = el.getAttribute('data-compete-widget');
    if (!KINDS[kind]) return;
    var lang = (el.getAttribute('data-lang') || document.documentElement.lang || 'en').slice(0, 2);
    if (!LANGS[lang]) lang = 'en';
    var theme = el.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    var id = 'dfc-' + ++seq;
    var iframe = document.createElement('iframe');
    iframe.src = origin + '/' + lang + '/compete/widget/' + kind + '?theme=' + theme + '&id=' + id;
    iframe.title = el.getAttribute('data-title') || 'Trading competition';
    iframe.loading = 'lazy';
    iframe.setAttribute('allowtransparency', 'true');
    iframe.style.cssText =
      'border:0;width:100%;max-width:' +
      (kind === 'join' ? '360px' : '420px') +
      ';height:' +
      (kind === 'leaderboard' ? '480px' : kind === 'join' ? '200px' : '380px') +
      ';background:transparent;color-scheme:normal;display:block';
    el.setAttribute('data-compete-mounted', '1');
    el.appendChild(iframe);
    frames[id] = iframe;
  }

  // Height from the widget (it reports itself via postMessage); only from our origin.
  window.addEventListener('message', function (e) {
    if (e.origin !== origin || !e.data || e.data.type !== 'df-compete-widget') return;
    var f = frames[e.data.id];
    var h = Number(e.data.height);
    if (f && h > 0 && h < 4000) f.style.height = h + 'px';
  });

  function scan() {
    var els = document.querySelectorAll('[data-compete-widget]');
    for (var i = 0; i < els.length; i++) mount(els[i]);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan);
  else scan();
  if (window.MutationObserver)
    new MutationObserver(scan).observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
})();
