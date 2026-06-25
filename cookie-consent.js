/* ═══════════════════════════════════════════════════════════
   Network Sloth — Cookie Consent Manager
   SINGLE SOURCE OF TRUTH for consent state + AdSense loading.
   Include this file on every page with: <script src="cookie-consent.js"></script>

   - Shows the consent banner once, on whichever page the visitor
     lands on first, if no preference is stored yet.
   - On "Accept": loads the AdSense script and pushes every
     <ins class="adsbygoogle"> currently on the page.
   - On "Reject": does nothing further — AdSense never loads.
   - Exposes window.NSCookieConsent so other UI on the site
     (e.g. the "Cookie Consent Manager" controls on the Cookie
     Policy page) can read/change consent without duplicating
     any of this logic.

   Replace ADSENSE_PUB_ID with your real ca-pub-XXXXXXXX ID
   before going live — it is the ONLY place it needs to be set.
═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var STORAGE_KEY    = 'ns_cookie_consent';
  var ADSENSE_PUB_ID = 'ca-pub-XXXXXXXXXX'; // ← Replace with your publisher ID

  /* ── Consent storage ─────────────────────────────────── */
  function getConsent()    { try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; } }
  function storeConsent(v) { try { localStorage.setItem(STORAGE_KEY, v); } catch (e) {} }

  /* ── AdSense loading / rendering ─────────────────────── */
  function loadAdSense() {
    if (document.getElementById('ns-adsense-script')) return;
    var s         = document.createElement('script');
    s.id          = 'ns-adsense-script';
    s.async       = true;
    s.crossOrigin = 'anonymous';
    s.src         = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + ADSENSE_PUB_ID;
    document.head.appendChild(s);
  }

  /* Push every ad unit on THIS page — generic, so it works on
     any page regardless of how many <ins> tags it has, and
     never double-pushes the same unit. */
  function pushAds() {
    var ins = document.querySelectorAll('ins.adsbygoogle:not([data-ns-pushed])');
    ins.forEach(function (el) {
      el.setAttribute('data-ns-pushed', 'true');
      try { (window.adsbygoogle = window.adsbygoogle || []).push({}); }
      catch (e) {}
    });
  }

  function activateAds() {
    loadAdSense();
    /* Small delay gives the async script a chance to parse before push */
    setTimeout(pushAds, 800);
  }

  /* ── Listener registry ────────────────────────────────
     Lets other scripts on the same page (e.g. the consent
     manager controls on cookie-policy.html) react when the
     preference changes, without polling localStorage. */
  var listeners = [];
  function onChange(fn) { if (typeof fn === 'function') listeners.push(fn); }
  function notify() {
    var val = getConsent();
    listeners.forEach(function (fn) { try { fn(val); } catch (e) {} });
  }

  /* ── Public API ────────────────────────────────────────
     Set up before banner/page logic runs so it's available
     the instant the script loads, even from an inline
     <script> later in the same page. */
  window.NSCookieConsent = {
    get: getConsent,
    accept: function () { setConsent(true); },
    reject: function () { setConsent(false); },
    onChange: onChange
  };

  function setConsent(accepted) {
    storeConsent(accepted ? 'accepted' : 'rejected');
    removeBanner();
    if (accepted) activateAds();
    notify();
  }

  /* ── Banner removal ───────────────────────────────────── */
  function removeBanner() {
    var b = document.getElementById('ns-cookie-banner');
    if (b) {
      b.style.animation = 'nsCookieSlideOut 0.3s ease forwards';
      setTimeout(function () { if (b.parentNode) b.parentNode.removeChild(b); }, 320);
    }
  }

  /* ── Banner CSS (injected once, only if the banner is needed) ── */
  function injectStyles() {
    if (document.getElementById('ns-cookie-banner-styles')) return;
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
  }

  /* ── Banner markup + wiring ───────────────────────────── */
  function injectBanner() {
    /* Don't show it twice if it's already on the page */
    if (document.getElementById('ns-cookie-banner')) return;
    injectStyles();

    /* This site is a flat structure (every page lives at the
       root, e.g. /index.html, /cookie-policy.html) so the policy
       links below are plain relative filenames. If pages ever
       move into subdirectories, update these two paths. */
    var bannerHtml = [
      '<div id="ns-cookie-banner" role="dialog" aria-live="polite" aria-label="Cookie consent">',
      '  <div class="ns-cb-icon">🍪</div>',
      '  <div class="ns-cb-text">',
      '    <div class="ns-cb-title">This site uses cookies</div>',
      '    <div class="ns-cb-body">',
      '      Network Sloth is free. To keep it that way we use <strong style="color:#eddfc0">Google AdSense</strong> for unobtrusive ads.',
      '      Accepting allows personalised ads via advertising cookies. Rejecting means no tracking cookies — all tools still work.',
      '      <a href="cookie-policy.html">Cookie Policy</a> &nbsp;·&nbsp;',
      '      <a href="privacy-policy.html">Privacy Policy</a>',
      '    </div>',
      '  </div>',
      '  <div class="ns-cb-actions">',
      '    <button id="ns-cb-accept">✓ Accept</button>',
      '    <button id="ns-cb-reject">✗ Reject</button>',
      '    <button class="ns-cb-dismiss" id="ns-cb-dismiss" title="Dismiss (no preference saved)">×</button>',
      '  </div>',
      '</div>'
    ].join('\n');

    var div = document.createElement('div');
    div.innerHTML = bannerHtml;
    document.body.appendChild(div.firstChild);

    document.getElementById('ns-cb-accept').addEventListener('click', function () { setConsent(true); });
    document.getElementById('ns-cb-reject').addEventListener('click', function () { setConsent(false); });
    /* Dismiss without saving — banner reappears next visit */
    document.getElementById('ns-cb-dismiss').addEventListener('click', removeBanner);
  }

  function showBannerWhenReady() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', injectBanner);
    } else {
      injectBanner();
    }
  }

  /* ── Boot: honour any saved preference ─────────────────
     'accepted' → load AdSense + push any ad units on this page
     'rejected' → do nothing, ever
     unset      → show the banner                              */
  var stored = getConsent();
  if (stored === 'accepted') {
    activateAds();
  } else if (stored !== 'rejected') {
    showBannerWhenReady();
  }

}());
