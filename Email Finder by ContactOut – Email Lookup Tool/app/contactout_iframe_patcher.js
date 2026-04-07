/**
 * ContactOut iframe Patcher - runs INSIDE the contactout.com iframe
 * This script modifies the sidebar UI from within to:
 * - Replace "Free Plan" with "Enterprise Plan"
 * - Show unlimited credits
 * - Remove restriction banners
 * - Unmask contact data
 */
(function() {
  'use strict';

  function patchUI() {
    // Walk all text nodes and elements
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    let node;
    while (node = walker.nextNode()) {
      // Plan name
      if (node.textContent.trim() === 'Free Plan') {
        node.textContent = 'Enterprise Plan';
      }
      if (node.textContent.trim() === 'Free') {
        const parent = node.parentElement;
        if (parent && (parent.className.includes('plan') || parent.className.includes('Plan') ||
            parent.closest('[class*="plan"], [class*="Plan"], [class*="header"], [class*="tier"]'))) {
          node.textContent = 'Enterprise';
        }
      }

      // Credit numbers: replace small numbers with infinity
      if (/^\s*\d{1,3}\s*$/.test(node.textContent)) {
        const parent = node.parentElement;
        if (parent) {
          const siblings = parent.parentElement ? parent.parentElement.textContent : '';
          if (/credit/i.test(siblings) || /export/i.test(siblings)) {
            node.textContent = '∞';
          }
        }
      }

      // Restriction text
      if (node.textContent.includes('restricted on the free plan') ||
          node.textContent.includes('Upgrade your plan to view') ||
          node.textContent.includes('Upgrade Now') ||
          node.textContent.includes('Run out of') ||
          node.textContent.includes('out of credits') ||
          node.textContent.includes('credits left') ||
          node.textContent.includes('daily limit') ||
          node.textContent.includes('limit reached')) {
        let container = node.parentElement;
        for (let i = 0; i < 8; i++) {
          if (container && container.parentElement &&
              container.parentElement.children.length <= 4 &&
              container.parentElement !== document.body) {
            container = container.parentElement;
          } else break;
        }
        if (container) container.style.display = 'none';
      }
    }

    // Hide upgrade buttons and restriction overlays
    const hideSelectors = [
      'button[class*="upgrade" i]', 'a[class*="upgrade" i]',
      '[class*="upgrade-banner" i]', '[class*="upgrade-cta" i]',
      '[class*="restricted" i]', '[class*="paywall" i]',
      '[class*="upsell" i]', '[class*="limit-banner" i]',
      '[class*="credit-warning" i]', '[class*="pro-badge" i]'
    ];

    hideSelectors.forEach(sel => {
      try {
        document.querySelectorAll(sel).forEach(el => {
          // Only hide if it's an upgrade/restriction element
          const text = el.textContent.toLowerCase();
          if (text.includes('upgrade') || text.includes('restricted') ||
              text.includes('limit') || text.includes('locked') ||
              text.includes('paywall') || text.includes('pro plan')) {
            el.style.display = 'none';
          }
        });
      } catch(e) {}
    });

    // Unmask blurred/hidden contact data
    document.querySelectorAll('[class*="blur" i], [class*="mask" i], [class*="locked" i], [style*="filter"]').forEach(el => {
      el.style.filter = 'none';
      el.style.webkitFilter = 'none';
      el.style.opacity = '1';
      el.style.pointerEvents = 'auto';
      el.style.userSelect = 'auto';
    });

    // Remove lock icons next to contact data
    document.querySelectorAll('[class*="lock-icon" i], [class*="locked-icon" i], svg[class*="lock" i]').forEach(el => {
      el.style.display = 'none';
    });
  }

  // --- Override fetch/XHR responses ---
  function interceptFetch() {
    const origFetch = window.fetch;
    window.fetch = function(...args) {
      return origFetch.apply(this, args).then(response => {
        const url = (typeof args[0] === 'string') ? args[0] : (args[0] && args[0].url ? args[0].url : '');
        if (url.includes('/api/user') || url.includes('/api/subscription') || url.includes('/api/credits') || url.includes('/api/plan')) {
          return response.clone().json().then(data => {
            patchUserData(data);
            return new Response(JSON.stringify(data), {
              status: response.status,
              statusText: response.statusText,
              headers: response.headers
            });
          }).catch(() => response);
        }
        return response;
      });
    };
  }

  function interceptXHR() {
    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method, url) {
      this._co_url = url;
      return origOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function() {
      if (this._co_url && (
        this._co_url.includes('/api/user') ||
        this._co_url.includes('/api/subscription') ||
        this._co_url.includes('/api/credits')
      )) {
        this.addEventListener('readystatechange', function() {
          if (this.readyState === 4) {
            try {
              const data = JSON.parse(this.responseText);
              patchUserData(data);
              Object.defineProperty(this, 'responseText', { value: JSON.stringify(data) });
              Object.defineProperty(this, 'response', { value: JSON.stringify(data) });
            } catch(e) {}
          }
        });
      }
      return origSend.apply(this, arguments);
    };
  }

  function patchUserData(obj) {
    if (!obj || typeof obj !== 'object') return;
    if ('credit' in obj) obj.credit = 999999999;
    if ('phoneCredit' in obj) obj.phoneCredit = 999999999;
    if ('aiCredit' in obj) obj.aiCredit = 999999999;
    if ('email_credits' in obj) obj.email_credits = 999999999;
    if ('phone_credits' in obj) obj.phone_credits = 999999999;
    if ('export_credits' in obj) obj.export_credits = 999999999;
    if ('exportCredits' in obj) obj.exportCredits = 999999999;
    if ('premium' in obj) obj.premium = 'true';
    if ('plan' in obj) { obj.plan = 'Enterprise'; obj.planName = 'Enterprise'; }
    if ('subscription' in obj) obj.subscription = 'enterprise';
    if ('allowSearch' in obj) obj.allowSearch = true;
    if ('is_restricted' in obj) obj.is_restricted = false;
    if ('restricted' in obj) obj.restricted = false;
    if ('canView' in obj) obj.canView = true;
    if (obj.data) patchUserData(obj.data);
    if (obj.user) patchUserData(obj.user);
  }

  // --- Intercept postMessage ---
  function interceptPostMessage() {
    window.addEventListener('message', function(e) {
      if (e.data && typeof e.data === 'object') {
        patchUserData(e.data);
      }
    }, true);
  }

  // --- Init ---
  function init() {
    // Only run on contactout.com
    if (!window.location.hostname.includes('contactout.com')) return;

    console.log('[ContactOut Patcher] Iframe patcher active');
    interceptFetch();
    interceptXHR();
    interceptPostMessage();

    // Patch UI repeatedly (React/Vue re-renders)
    setInterval(patchUI, 800);

    // Also patch on DOM changes
    const observer = new MutationObserver(patchUI);
    observer.observe(document.body || document.documentElement, {
      childList: true, subtree: true, characterData: true
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
