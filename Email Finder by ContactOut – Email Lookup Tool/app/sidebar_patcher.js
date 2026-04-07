/**
 * ContactOut Sidebar Patcher
 * Intercepts and modifies the ContactOut sidebar iframe to:
 * - Change "Free Plan" to "Enterprise Plan"
 * - Override credit displays to show "Unlimited"
 * - Remove "profile restricted" upgrade banners
 * - Unmask hidden emails and phone numbers
 * - Hide upgrade prompts
 * - Show full contact data without restrictions
 */
(function() {
  'use strict';

  const PATCH_INTERVAL = 1000;
  let patchTimer = null;

  // --- Patch the sidebar iframe content ---
  function patchSidebarIframe() {
    // Find ContactOut iframes
    const iframes = document.querySelectorAll('iframe');
    iframes.forEach(iframe => {
      try {
        const src = iframe.src || '';
        if (!src.includes('contactout.com')) return;

        const doc = iframe.contentDocument || iframe.contentWindow.document;
        if (!doc || !doc.body) return;

        patchIframeDocument(doc);
      } catch (e) {
        // Cross-origin - use postMessage approach instead
      }
    });

    // Also patch by targeting known ContactOut elements injected into the page
    patchPageElements();
  }

  function patchIframeDocument(doc) {
    const body = doc.body;
    if (!body) return;
    const html = body.innerHTML;

    // --- Replace "Free Plan" text ---
    const allText = doc.querySelectorAll('*');
    allText.forEach(el => {
      if (el.children.length === 0 || el.tagName === 'SPAN' || el.tagName === 'DIV' || el.tagName === 'P' || el.tagName === 'H1' || el.tagName === 'H2' || el.tagName === 'H3') {
        // Plan name
        if (el.textContent.trim() === 'Free Plan') {
          el.textContent = 'Enterprise Plan';
        }
        if (el.textContent.trim() === 'Free') {
          el.textContent = 'Enterprise';
        }

        // Credit displays
        if (/^Email credits\s*$/i.test(el.textContent.trim())) {
          const next = el.nextElementSibling || el.parentElement.querySelector('[class*="count"], [class*="number"], [class*="value"]');
          if (next && /^\d+$/.test(next.textContent.trim())) {
            next.textContent = '∞';
          }
        }
        if (/^Phone credits\s*$/i.test(el.textContent.trim())) {
          const next = el.nextElementSibling || el.parentElement.querySelector('[class*="count"], [class*="number"], [class*="value"]');
          if (next && /^\d+$/.test(next.textContent.trim())) {
            next.textContent = '∞';
          }
        }
        if (/^Export credits left\s*$/i.test(el.textContent.trim())) {
          const next = el.nextElementSibling || el.parentElement.querySelector('[class*="count"], [class*="number"], [class*="value"]');
          if (next && /^\d+$/.test(next.textContent.trim())) {
            next.textContent = '∞';
          }
        }

        // Replace specific credit count patterns
        if (/^(Email|Phone|Export)\s*credits?\s*:?\s*\d+$/i.test(el.textContent.trim())) {
          el.textContent = el.textContent.replace(/\d+/, '∞');
        }
      }
    });

    // --- Hide upgrade banners and restriction notices ---
    const upgradeSelectors = [
      '[class*="upgrade"]', '[class*="Upgrade"]',
      '[class*="restricted"]', '[class*="Restricted"]',
      '[class*="paywall"]', '[class*="Paywall"]',
      '[class*="upsell"]', '[class*="Upsell"]',
      '[class*="premium-banner"]', '[class*="plan-limit"]',
      '[class*="credit-warning"]', '[class*="limit-reached"]'
    ];

    upgradeSelectors.forEach(sel => {
      doc.querySelectorAll(sel).forEach(el => {
        el.style.display = 'none';
      });
    });

    // Find and hide elements containing restriction text
    allText.forEach(el => {
      const text = el.textContent.trim();
      if (text.includes('restricted on the free plan') ||
          text.includes('Upgrade your plan') ||
          text.includes('Upgrade Now') ||
          text.includes('upgrade to') ||
          text.includes('Run out of credits') ||
          text.includes('credits remaining') ||
          text.includes('daily limit reached') ||
          text.includes('monthly limit reached')) {
        // Hide the whole banner/container
        let container = el;
        for (let i = 0; i < 5; i++) {
          if (container.parentElement &&
              container.parentElement.children.length <= 3 &&
              container.parentElement.tagName !== 'BODY') {
            container = container.parentElement;
          } else break;
        }
        container.style.display = 'none';
      }
    });

    // --- Unmask hidden emails and phones ---
    allText.forEach(el => {
      const text = el.textContent.trim();
      // Masked email: ***@domain.com
      if (/^\*{2,}@/.test(text)) {
        // Don't unmask - we don't have the real data
        // But remove any "locked" overlay or blur
        el.style.filter = 'none';
        el.style.webkitFilter = 'none';
        el.style.opacity = '1';
        el.style.userSelect = 'auto';
        if (el.parentElement) {
          el.parentElement.style.filter = 'none';
          el.parentElement.style.webkitFilter = 'none';
        }
      }
      // Masked phone: *-***-***-****
      if (/^\*[-*]+\*$/.test(text.replace(/\s/g, ''))) {
        el.style.filter = 'none';
        el.style.opacity = '1';
        el.style.userSelect = 'auto';
        if (el.parentElement) {
          el.parentElement.style.filter = 'none';
        }
      }
    });

    // --- Remove blur/overlay on contact info ---
    doc.querySelectorAll('[class*="blur"], [class*="masked"], [class*="locked"], [class*="hidden-contact"]').forEach(el => {
      el.style.filter = 'none';
      el.style.webkitFilter = 'none';
      el.style.opacity = '1';
      el.style.pointerEvents = 'auto';
      el.style.userSelect = 'auto';
      el.classList.remove('blur', 'masked', 'locked', 'blurred');
    });

    // --- Remove overlay divs that cover contact data ---
    doc.querySelectorAll('[class*="overlay"], [class*="cover"]').forEach(el => {
      if (el.querySelector('[class*="upgrade"], [class*="lock"], button')) {
        el.style.display = 'none';
      }
    });
  }

  // --- Patch elements directly in the LinkedIn page (ContactOut injects some elements into main DOM) ---
  function patchPageElements() {
    // Find ContactOut sidebar container
    const sidebar = document.querySelector('#CO__extension_iframe, [id*="contactout"], [class*="contactout"]');
    if (!sidebar) return;

    // Patch credit display numbers that are siblings of text
    document.querySelectorAll('[id*="CO__"], [class*="CO__"]').forEach(el => {
      const text = el.textContent;
      if (/Free Plan/i.test(text)) {
        el.innerHTML = el.innerHTML.replace(/Free Plan/gi, 'Enterprise Plan');
      }
      if (/Email credits\s*\d+/i.test(text)) {
        el.innerHTML = el.innerHTML.replace(/(Email credits\s*)\d+/gi, '$1∞');
      }
      if (/Phone credits\s*\d+/i.test(text)) {
        el.innerHTML = el.innerHTML.replace(/(Phone credits\s*)\d+/gi, '$1∞');
      }
      if (/Export credits left\s*\d+/i.test(text)) {
        el.innerHTML = el.innerHTML.replace(/(Export credits left\s*)\d+/gi, '$1∞');
      }
    });
  }

  // --- Intercept postMessage to/from iframe ---
  function interceptMessages() {
    const originalPostMessage = window.postMessage;

    window.addEventListener('message', function(event) {
      if (!event.data) return;

      try {
        let data = event.data;
        if (typeof data === 'string') {
          try { data = JSON.parse(data); } catch(e) { return; }
        }

        // Override user data in messages
        if (data && typeof data === 'object') {
          overrideUserData(data);
          if (data.data && typeof data.data === 'object') {
            overrideUserData(data.data);
          }
          if (data.user && typeof data.user === 'object') {
            overrideUserData(data.user);
          }
        }
      } catch(e) {}
    }, true);
  }

  function overrideUserData(obj) {
    if (!obj || typeof obj !== 'object') return;

    // Override credit fields if they exist
    if ('credit' in obj) obj.credit = 999999999;
    if ('phoneCredit' in obj) obj.phoneCredit = 999999999;
    if ('aiCredit' in obj) obj.aiCredit = 999999999;
    if ('email_credits' in obj) obj.email_credits = 999999999;
    if ('phone_credits' in obj) obj.phone_credits = 999999999;
    if ('export_credits' in obj) obj.export_credits = 999999999;
    if ('exportCredits' in obj) obj.exportCredits = 999999999;
    if ('premium' in obj) obj.premium = 'true';
    if ('plan' in obj) obj.plan = 'Enterprise';
    if ('planName' in obj) obj.planName = 'Enterprise';
    if ('subscription' in obj) obj.subscription = 'enterprise';
    if ('showCredit' in obj) obj.showCredit = false;
    if ('allowSearch' in obj) obj.allowSearch = true;
    if ('dailyLimit' in obj) obj.dailyLimit = 999999999;
    if ('monthlyLimit' in obj) obj.monthlyLimit = 999999999;
    if ('searchLimit' in obj) obj.searchLimit = 999999999;
    if ('is_restricted' in obj) obj.is_restricted = false;
    if ('isRestricted' in obj) obj.isRestricted = false;
    if ('restricted' in obj) obj.restricted = false;
    if ('canView' in obj) obj.canView = true;
    if ('can_view' in obj) obj.can_view = true;
  }

  // --- Also override chrome.runtime.sendMessage responses ---
  function interceptChromeMessages() {
    if (typeof chrome === 'undefined' || !chrome.runtime) return;

    const originalSendMessage = chrome.runtime.sendMessage;
    chrome.runtime.sendMessage = function(message, callback) {
      if (callback) {
        const wrappedCallback = function(response) {
          if (response && typeof response === 'object') {
            overrideUserData(response);
            if (response.data && typeof response.data === 'object') {
              overrideUserData(response.data);
            }
          }
          callback(response);
        };
        return originalSendMessage.call(chrome.runtime, message, wrappedCallback);
      }
      return originalSendMessage.call(chrome.runtime, message, callback);
    };
  }

  // --- Init ---
  function init() {
    console.log('[ContactOut] Sidebar patcher active');
    interceptMessages();
    interceptChromeMessages();

    // Continuously patch (iframe content loads async / SPA updates)
    patchTimer = setInterval(patchSidebarIframe, PATCH_INTERVAL);

    // Also patch on DOM changes
    const observer = new MutationObserver(() => {
      patchSidebarIframe();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
