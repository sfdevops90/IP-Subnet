/* ═══════════════════════════════════════════════════════════
   Network Sloth — Cookie Consent Banner
   Loads AdSense only after explicit user acceptance.
   Replace ADSENSE_PUBLISHER_ID with your ca-pub-XXXXXXXX ID.
═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var STORAGE_KEY       = 'ns_cookie_consent';
  var ADSENSE_PUB_ID    = 'ca-pub-XXXXXXXXXX'; // ← Replace with your publisher ID

  /* ── Helpers ─────────────────────────────────────────── */
  function getConsent()          { try { return localStorage.getItem(STORAGE_KEY); } catch(e) { return null; } }
  function setConsent(val)       { try { localStorage.setItem(STORAGE_KEY, val); } catch(e) {} }
  function removeBanner()        { var b = document.getElementById('ns-cookie-banner'); if (b) { b.style.animation = 'nsCookieSlideOut 0.3s ease forwards'; setTimeout(function(){ if(b.parentNode) b.parentNode.removeChild(b); }, 320); } }

  function loadAdSense() {
    if (document.getElementById('ns-adsense-script')) return;
    var s = document.createElement('script');
    s.id          = 'ns-adsense-script';
    s.async       = true;
    s.defer       = true;
    s.crossOrigin = 'anonymous';
    s.src         = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + ADSENSE_PUB_ID;
    document.head.appendChild(s);
  }

  /* ── Check stored preference on every page load ──────── */
  var stored = getConsent();
  if (stored === 'accepted') { loadAdSense(); return; }
  if (stored === 'rejected') { return; }

  /* ── No preference yet — inject CSS + banner ─────────── */
  var css = [
    '@keyframes nsCookieSlideIn  { from { transform:translateY(100%); opacity:0 } to { transform:translateY(0); opacity:1 } }',
    '@keyframes nsCookieSlideOut { from { transform:translateY(0);    opacity:1 } to { transform:translateY(100%); opacity:0 } }',
    '#ns-cookie-banner {',
    '  position: fixed; bottom: 0; left: 0; right: 0; z-index: 9999;',
    '  background: #1d150b;',
    '  border-top: 2px solid #5cb870;',
    '  box-shadow: 0 -4px 32px rgba(0,0,0,0.6);',
    '  padding: 1rem 1.5rem;',
    '  display: flex; align-items: center; gap: 1.25rem; flex-wrap: wrap;',
    '  animation: nsCookieSlideIn 0.35s ease forwards;',
    '  font-family: "Nunito", sans-serif;',
    '}',
    '#ns-cookie-banner .ns-cb-icon { font-size: 1.6rem; flex-shrink: 0; line-height: 1; }',
    '#ns-cookie-banner .ns-cb-text { flex: 1; min-width: 220px; }',
    '#ns-cookie-banner .ns-cb-title {',
    '  font-size: 0.82rem; font-weight: 800; letter-spacing: 0.5px;',
    '  color: #eddfc0; margin-bottom: 0.22rem;',
    '}',
    '#ns-cookie-banner .ns-cb-body {',
    '  font-size: 0.75rem; color: #9a7d52; line-height: 1.55; max-width: 680px;',
    '}',
    '#ns-cookie-banner .ns-cb-body a { color: #5cb870; text-decoration: none; border-bottom: 1px solid rgba(92,184,112,0.35); }',
    '#ns-cookie-banner .ns-cb-body a:hover { border-color: #5cb870; }',
    '#ns-cookie-banner .ns-cb-actions { display: flex; gap: 0.6rem; align-items: center; flex-shrink: 0; flex-wrap: wrap; }',
    '#ns-cb-accept {',
    '  padding: 0.55rem 1.5rem;',
    '  background: #5cb870; color: #0d0a05;',
    '  border: none; border-radius: 4px;',
    '  font-family: "Nunito", sans-serif; font-size: 0.82rem; font-weight: 800;',
    '  letter-spacing: 1.5px; text-transform: uppercase;',
    '  cursor: pointer; transition: all 0.18s; white-space: nowrap;',
    '}',
    '#ns-cb-accept:hover { background: #00f0c2; box-shadow: 0 0 18px rgba(92,184,112,0.45); transform: translateY(-1px); }',
    '#ns-cb-reject {',
    '  padding: 0.55rem 1.1rem;',
    '  background: transparent; color: #9a7d52;',
    '  border: 1px solid #3a2a14; border-radius: 4px;',
    '  font-family: "Nunito", sans-serif; font-size: 0.78rem; font-weight: 700;',
    '  letter-spacing: 1px; text-transform: uppercase;',
    '  cursor: pointer; transition: all 0.18s; white-space: nowrap;',
    '}',
    '#ns-cb-reject:hover { border-color: #9a7d52; color: #eddfc0; }',
    '#ns-cookie-banner .ns-cb-dismiss {',
    '  width: 26px; height: 26px; display: flex; align-items: center; justify-content: center;',
    '  background: transparent; border: 1px solid #3a2a14; border-radius: 3px;',
    '  color: #4a3818; font-size: 1rem; cursor: pointer;',
    '  transition: all 0.15s; flex-shrink: 0; padding: 0; line-height: 1;',
    '  font-family: monospace;',
    '}',
    '#ns-cookie-banner .ns-cb-dismiss:hover { border-color: #9a7d52; color: #9a7d52; }',
    '@media (max-width: 600px) {',
    '  #ns-cookie-banner { padding: 0.9rem 1rem; gap: 0.85rem; }',
    '  #ns-cookie-banner .ns-cb-text { min-width: 0; }',
    '  #ns-cookie-banner .ns-cb-actions { width: 100%; justify-content: flex-end; }',
    '}'
  ].join('\n');

  var styleEl = document.createElement('style');
  styleEl.id  = 'ns-cookie-banner-styles';
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  /* Detect the right path for policy pages (handles subdirectory deployments) */
  var policyBase = (function() {
    var path = window.location.pathname;
    /* If we're not at the root index, go up one level */
    var isRoot = path === '/' || path.match(/index\.html?$/);
    return isRoot ? '' : '../';
  }());

  var bannerHtml = [
    '<div id="ns-cookie-banner" role="dialog" aria-live="polite" aria-label="Cookie consent">',
    '  <div class="ns-cb-icon">🍪</div>',
    '  <div class="ns-cb-text">',
    '    <div class="ns-cb-title">This site uses cookies</div>',
    '    <div class="ns-cb-body">',
    '      Network Sloth is free. To keep it that way we use <strong style="color:#eddfc0">Google AdSense</strong> for unobtrusive ads.',
    '      Accepting allows personalised ads via advertising cookies. Rejecting means no tracking cookies — all tools still work.',
    '      <a href="' + policyBase + 'cookie-policy.html">Cookie Policy</a> &nbsp;·&nbsp;',
    '      <a href="' + policyBase + 'privacy-policy.html">Privacy Policy</a>',
    '    </div>',
    '  </div>',
    '  <div class="ns-cb-actions">',
    '    <button id="ns-cb-accept">✓ Accept</button>',
    '    <button id="ns-cb-reject">✗ Reject</button>',
    '    <button class="ns-cb-dismiss" id="ns-cb-dismiss" title="Dismiss (no preference saved)">×</button>',
    '  </div>',
    '</div>'
  ].join('\n');

  /* Inject once the DOM is ready */
  function injectBanner() {
    var div = document.createElement('div');
    div.innerHTML = bannerHtml;
    document.body.appendChild(div.firstChild);

    document.getElementById('ns-cb-accept').addEventListener('click', function () {
      setConsent('accepted');
      loadAdSense();
      removeBanner();
    });

    document.getElementById('ns-cb-reject').addEventListener('click', function () {
      setConsent('rejected');
      removeBanner();
    });

    /* Dismiss without saving — banner reappears next visit */
    document.getElementById('ns-cb-dismiss').addEventListener('click', function () {
      removeBanner();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectBanner);
  } else {
    injectBanner();
  }

}());
