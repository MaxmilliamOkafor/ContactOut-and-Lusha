/**
 * OutreachPro — AI DM Response Generator v2
 *
 * Inspired by Auto Gmail's injection patterns:
 *   • waitForElement with MutationObserver (not polling)
 *   • Shadow DOM isolated UI (no CSS conflicts with LinkedIn)
 *   • Robust multi-strategy button injection
 *   • Context-aware conversation scraping
 *   • React-compatible message box insertion
 *
 * 100% local — no API calls, no tokens, no limits.
 */
(function () {
  'use strict';

  const TRAINING_KEY = 'outreach_dm_training_profiles';
  const AI_BTN_CLASS = 'outreach-dm-ai-btn';
  const PANEL_ID = 'outreach-dm-ai-panel';
  let aiPanel = null;
  let observer = null;
  let lastMsgUrl = '';
  let injectionAttempts = 0;
  const MAX_INJECTION_ATTEMPTS = 50;

  // Track the composer the user most recently interacted with, so that when
  // multiple chat bubbles are open we scrape and insert into the *current*
  // conversation — not whichever one appears first in the DOM.
  let lastActiveComposer = null;
  let activeScopeListenerAttached = false;

  const SCOPE_SELECTORS = [
    '.msg-overlay-conversation-bubble',
    'div[class*="msg-overlay-conversation-bubble"]',
    '.msg-convo-wrapper',
    '.msg-thread',
    'div[class*="msg-convo"]',
    'div[class*="messaging-thread"]',
  ];

  const COMPOSER_SELECTOR =
    '.msg-form__contenteditable div[contenteditable="true"], ' +
    '.msg-form__contenteditable, ' +
    'div[role="textbox"][contenteditable="true"], ' +
    'div[contenteditable="true"][class*="msg"]';

  function attachActiveScopeTracking() {
    if (activeScopeListenerAttached) return;
    activeScopeListenerAttached = true;
    const onActivity = (e) => {
      const t = e.target;
      if (!t || t.nodeType !== 1) return;
      const composer = t.closest && t.closest(COMPOSER_SELECTOR);
      if (composer) lastActiveComposer = composer;
    };
    document.addEventListener('focusin', onActivity, true);
    document.addEventListener('click', onActivity, true);
  }

  // Walk up from a node to the nearest chat-bubble / thread container.
  function closestScope(node) {
    if (!node || node.nodeType !== 1) return null;
    for (const sel of SCOPE_SELECTORS) {
      const hit = node.closest && node.closest(sel);
      if (hit) return hit;
    }
    return null;
  }

  // Determine which conversation the user is currently working in.
  // Priority: button's own bubble → last-focused composer's bubble →
  // visible non-minimized bubble → messaging-page thread → null (document).
  function findActiveScope(originEl) {
    // 1. The element that triggered the action (e.g. the clicked AI button).
    const fromOrigin = closestScope(originEl);
    if (fromOrigin) return fromOrigin;

    // 2. The composer the user last typed in.
    if (lastActiveComposer && document.contains(lastActiveComposer)) {
      const fromComposer = closestScope(lastActiveComposer);
      if (fromComposer) return fromComposer;
    }

    // 3. Any open, non-minimized overlay bubble.
    const bubbles = document.querySelectorAll(
      '.msg-overlay-conversation-bubble, div[class*="msg-overlay-conversation-bubble"]'
    );
    for (const b of bubbles) {
      const cls = b.className ? b.className.toString() : '';
      if (cls.includes('--is-minimized') || cls.includes('is-collapsed')) continue;
      const rect = b.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 80) return b;
    }

    // 4. Full messaging page thread.
    const thread = document.querySelector('.msg-thread, div[class*="messaging-thread"]');
    if (thread) return thread;

    return null;
  }

  // ═══════════════════════════════════════════
  //  0. WAIT-FOR-ELEMENT (Auto Gmail pattern)
  //  Uses MutationObserver to resolve when a selector appears
  // ═══════════════════════════════════════════
  function waitForElement(selector, { timeout = 15000, parent = document.body } = {}) {
    return new Promise((resolve, reject) => {
      const el = parent.querySelector(selector);
      if (el) return resolve(el);

      const obs = new MutationObserver(() => {
        const found = parent.querySelector(selector);
        if (found) {
          obs.disconnect();
          resolve(found);
        }
      });

      obs.observe(parent, { childList: true, subtree: true });

      setTimeout(() => {
        obs.disconnect();
        reject(new Error(`waitForElement timeout: ${selector}`));
      }, timeout);
    });
  }

  // ═══════════════════════════════════════════
  //  1. STYLES
  // ═══════════════════════════════════════════
  function injectDMStyles() {
    if (document.getElementById('outreach-dm-ai-css')) return;
    const style = document.createElement('style');
    style.id = 'outreach-dm-ai-css';
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

      .${AI_BTN_CLASS} {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 6px 14px; height: 32px;
        background: linear-gradient(135deg, #8B5CF6 0%, #6366F1 50%, #4F46E5 100%);
        border: none; border-radius: 16px;
        color: #fff; font-family: 'Inter', sans-serif;
        font-size: 12px; font-weight: 600;
        cursor: pointer; white-space: nowrap;
        box-shadow: 0 2px 10px rgba(99, 102, 241, 0.35);
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        z-index: 100; position: relative;
        animation: dm-ai-glow 3s ease-in-out infinite;
        line-height: 1;
        letter-spacing: 0.01em;
        -webkit-font-smoothing: antialiased;
      }
      .${AI_BTN_CLASS}:hover {
        transform: translateY(-1px) scale(1.04);
        box-shadow: 0 4px 18px rgba(99, 102, 241, 0.5);
        filter: brightness(1.1);
      }
      .${AI_BTN_CLASS}:active {
        transform: translateY(0) scale(0.98);
      }
      @keyframes dm-ai-glow {
        0%, 100% { box-shadow: 0 2px 10px rgba(99,102,241,0.35); }
        50% { box-shadow: 0 4px 16px rgba(99,102,241,0.55); }
      }
      @keyframes dm-ai-sparkle {
        0%, 100% { transform: scale(1) rotate(0deg); }
        25% { transform: scale(1.2) rotate(-5deg); }
        75% { transform: scale(1.1) rotate(5deg); }
      }

      /* Floating style variant */
      .${AI_BTN_CLASS}.floating {
        position: fixed !important;
        bottom: 80px !important;
        right: 30px !important;
        z-index: 2147483640 !important;
        height: 40px;
        padding: 8px 18px;
        font-size: 13px;
        border-radius: 20px;
        box-shadow: 0 4px 20px rgba(99, 102, 241, 0.4), 0 2px 8px rgba(0,0,0,0.1);
      }

      #${PANEL_ID} {
        position: fixed; bottom: 80px; right: 24px;
        width: 400px; max-height: 520px;
        background: #fff; border: 1px solid rgba(0,0,0,0.08);
        border-radius: 16px; z-index: 2147483641;
        box-shadow: 0 20px 60px rgba(0,0,0,0.15), 0 8px 24px rgba(0,0,0,0.08);
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        animation: dm-panel-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        overflow: hidden; display: flex; flex-direction: column;
        color: #1a1a2e;
      }
      /* dark mode */
      .theme--dark #${PANEL_ID}, html[data-color-theme="dark"] #${PANEL_ID} {
        background: #1e1e2e; border-color: rgba(255,255,255,0.08); color: #e0e0e8;
      }
      .theme--dark .dm-ai-body textarea, html[data-color-theme="dark"] .dm-ai-body textarea {
        background: #2a2a3e; border-color: rgba(255,255,255,0.12); color: #e0e0e8;
      }
      .theme--dark .dm-ai-profile-card, html[data-color-theme="dark"] .dm-ai-profile-card {
        background: #2a2a3e; border-color: rgba(255,255,255,0.1); color: #ccc;
      }
      .theme--dark .dm-ai-training-input, html[data-color-theme="dark"] .dm-ai-training-input {
        background: #2a2a3e !important; border-color: rgba(255,255,255,0.12) !important; color: #e0e0e8 !important;
      }
      .theme--dark .dm-ai-footer, html[data-color-theme="dark"] .dm-ai-footer {
        background: #16161e; border-color: rgba(255,255,255,0.06);
      }

      @keyframes dm-panel-in {
        from { opacity: 0; transform: translateY(16px) scale(0.96); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }

      .dm-ai-header {
        padding: 14px 18px;
        background: linear-gradient(135deg, #8B5CF6 0%, #6366F1 50%, #4F46E5 100%);
        color: #fff; border-radius: 16px 16px 0 0;
        display: flex; align-items: center; justify-content: space-between;
      }
      .dm-ai-header-title { font-size: 14px; font-weight: 700; display: flex; align-items: center; gap: 8px; }
      .dm-ai-header-close {
        background: rgba(255,255,255,0.2); border: none; color: #fff;
        width: 26px; height: 26px; border-radius: 50%; cursor: pointer;
        font-size: 14px; display: flex; align-items: center; justify-content: center;
        transition: background 0.2s;
      }
      .dm-ai-header-close:hover { background: rgba(255,255,255,0.35); }

      .dm-ai-tabs {
        display: flex; border-bottom: 1px solid rgba(0,0,0,0.06);
      }
      .dm-ai-tab {
        flex: 1; padding: 10px; text-align: center; font-size: 12px;
        font-weight: 600; cursor: pointer; border: none; background: none;
        color: #888; transition: all 0.2s; font-family: inherit;
        position: relative;
      }
      .dm-ai-tab.active {
        color: #6366F1;
      }
      .dm-ai-tab.active::after {
        content: ''; position: absolute; bottom: -1px; left: 20%; right: 20%;
        height: 2px; background: linear-gradient(90deg, #8B5CF6, #4F46E5); border-radius: 2px;
      }
      .dm-ai-tab:hover { color: #6366F1; background: rgba(99,102,241,0.04); }

      .dm-ai-body {
        padding: 14px 18px; flex: 1; overflow-y: auto;
        scrollbar-width: thin; scrollbar-color: #d4d4d8 transparent;
      }
      .dm-ai-body textarea {
        width: 100%; border: 1px solid #e8e8ed; border-radius: 10px;
        padding: 10px 12px; font-size: 13px; resize: vertical;
        font-family: 'Inter', sans-serif; outline: none;
        transition: border-color 0.2s, box-shadow 0.2s;
        min-height: 100px;
      }
      .dm-ai-body textarea:focus {
        border-color: #8B5CF6; box-shadow: 0 0 0 3px rgba(139,92,246,0.12);
      }
      .dm-ai-context-box {
        padding: 8px 10px; background: #f9f9fc; border-radius: 8px;
        font-size: 12px; color: #666; border: 1px solid #eee;
        line-height: 1.5; max-height: 60px; overflow-y: auto;
      }
      .dm-ai-outcome-select {
        width: 100%; padding: 8px 10px; border: 1px solid #e8e8ed;
        border-radius: 8px; font-size: 13px; font-family: 'Inter', sans-serif;
        outline: none; background: #fff; cursor: pointer;
        transition: border-color 0.2s;
      }
      .dm-ai-outcome-select:focus { border-color: #8B5CF6; }
      .dm-ai-actions {
        display: flex; align-items: center; gap: 8px; padding: 12px 18px;
        border-top: 1px solid rgba(0,0,0,0.06);
      }
      .dm-ai-gen-btn {
        padding: 8px 18px; border: none; border-radius: 10px; font-size: 13px;
        font-weight: 600; cursor: pointer; font-family: 'Inter', sans-serif;
        background: linear-gradient(135deg, #8B5CF6, #6366F1, #4F46E5);
        color: #fff; box-shadow: 0 2px 10px rgba(99,102,241,0.3);
        transition: transform 0.2s, box-shadow 0.2s, filter 0.2s;
      }
      .dm-ai-gen-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 16px rgba(99,102,241,0.4); filter: brightness(1.08); }
      .dm-ai-gen-btn:active { transform: translateY(0); }
      .dm-ai-sec-btn {
        padding: 8px 14px; border: 1px solid #e0e0e0; border-radius: 10px;
        font-size: 12px; font-weight: 600; cursor: pointer; background: #fff;
        color: #555; font-family: 'Inter', sans-serif;
        transition: all 0.2s;
      }
      .dm-ai-sec-btn:hover { border-color: #8B5CF6; color: #8B5CF6; background: rgba(139,92,246,0.04); }
      .dm-ai-insert-btn {
        padding: 8px 14px; border: none; border-radius: 10px;
        font-size: 12px; font-weight: 600; cursor: pointer;
        background: linear-gradient(135deg, #10B981, #059669);
        color: #fff; font-family: 'Inter', sans-serif;
        box-shadow: 0 2px 8px rgba(16,185,129,0.3);
        transition: all 0.2s;
      }
      .dm-ai-insert-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 14px rgba(16,185,129,0.4); }
      .dm-ai-footer {
        padding: 8px 18px; font-size: 10px; color: #999;
        text-align: center; border-top: 1px solid rgba(0,0,0,0.04);
        background: #fafafa;
      }
      .dm-ai-footer .hl { color: #6366F1; font-weight: 600; }

      /* Skeleton loader */
      .dm-ai-skel { height: 12px; margin: 8px 0; border-radius: 6px;
        background: linear-gradient(90deg,#f0f0f4 25%,#e8e8ed 50%,#f0f0f4 75%);
        background-size: 200% 100%; animation: dm-skel 1.5s infinite;
      }
      .dm-ai-skel.l { width: 100%; }
      .dm-ai-skel.m { width: 70%; }
      .dm-ai-skel.s { width: 40%; }
      @keyframes dm-skel { from{background-position:200% 0}to{background-position:-200% 0} }

      /* Profile cards */
      .dm-ai-profile-card {
        padding: 10px 12px; margin-bottom: 8px; border: 1px solid #eee;
        border-radius: 10px; background: #fdfdfe; cursor: pointer;
        transition: all 0.2s;
      }
      .dm-ai-profile-card:hover { border-color: #c7c7f0; background: #f8f7ff; transform: translateX(2px); }
      .dm-ai-profile-card .pname { font-size: 13px; font-weight: 600; }
      .dm-ai-profile-card .pdesc { font-size: 11px; color: #888; margin-top: 2px; }
      .dm-ai-profile-card .pcount { font-size: 10px; color: #aaa; margin-top: 4px; }

      /* Example pairs */
      .dm-ai-example-pair {
        padding: 8px; margin-bottom: 6px; border: 1px solid #eee;
        border-radius: 8px; background: #fafafa; position: relative;
      }
      .dm-ai-example-pair .ex-del {
        position: absolute; top: 6px; right: 6px; font-size: 9px;
        color: #EF4444; background: none; border: none; cursor: pointer;
        font-weight: 600; font-family: inherit;
      }
      .dm-ai-example-pair .ex-label { font-size: 10px; font-weight: 700; color: #777; }
      .dm-ai-example-pair .ex-text { font-size: 12px; color: #333; margin-top: 2px; }

      /* Training input */
      .dm-ai-training-input {
        width: 100%; padding: 8px 10px; border: 1px solid #e0e0e5;
        border-radius: 8px; font-size: 12px; font-family: 'Inter', sans-serif;
        outline: none; margin-bottom: 8px; box-sizing: border-box;
        transition: border-color 0.2s, box-shadow 0.2s;
      }
      .dm-ai-training-input:focus {
        border-color: #8B5CF6; box-shadow: 0 0 0 3px rgba(139,92,246,0.1);
      }

      /* Toast */
      .dm-ai-toast {
        position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
        padding: 10px 20px; border-radius: 10px; font-size: 13px;
        font-family: 'Inter', sans-serif; color: #fff; z-index: 2147483647;
        background: #333; box-shadow: 0 4px 20px rgba(0,0,0,0.2);
        animation: dm-toast-in 0.3s cubic-bezier(0.34,1.56,0.64,1);
        pointer-events: none;
      }
      .dm-ai-toast.success { background: linear-gradient(135deg, #10B981, #059669); }
      .dm-ai-toast.error { background: linear-gradient(135deg, #EF4444, #DC2626); }
      @keyframes dm-toast-in { from{opacity:0;transform:translateX(-50%) translateY(10px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }
    `;
    document.head.appendChild(style);
  }

  // ═══════════════════════════════════════════
  //  2. TRAINING PROFILES (local storage)
  // ═══════════════════════════════════════════
  const DEFAULT_PROFILES = [
    {
      id: 'book_meeting',
      name: '📅 Book a Meeting',
      description: 'Guide conversation toward scheduling a call',
      tone: 'professional',
      examples: [
        { inbound: "Thanks for reaching out! What exactly does your platform do?",
          response: "Short version: we help teams like yours cut recruitment time by around 3x. Easier to show than describe, 15 minutes on a call. Does Thursday or Friday work?" },
        { inbound: "Sounds interesting, but I'm pretty busy right now.",
          response: "No rush. How about a 10-minute call next week when things settle? Pick a day that works and I'll send a time." },
      ]
    },
    {
      id: 'build_rapport',
      name: '🤝 Build Rapport',
      description: 'Establish a genuine connection with the person',
      tone: 'casual',
      examples: [
        { inbound: "Hey, thanks for connecting!",
          response: "Likewise. Saw the work at [Company], the last launch looked solid. What are you focused on next?" },
      ]
    },
    {
      id: 'close_deal',
      name: '💼 Close / Pitch',
      description: 'Move toward a commitment or next step',
      tone: 'professional',
      examples: [
        { inbound: "We've been considering a few options.",
          response: "Makes sense, it's a real decision. Most of our clients see payback inside the first month, and I can intro you to one in your space if that's useful for the comparison. Want me to set that up?" },
      ]
    },
    {
      id: 'cold_outreach',
      name: '❄️ Cold Outreach',
      description: 'Initiate contact with someone new',
      tone: 'witty',
      examples: [
        { inbound: "",
          response: "Hi [Name], came across your work in [field] and thought it was worth reaching out. I'm working on something that might actually be relevant, mind if I send a quick overview?" },
      ]
    },
  ];

  async function getProfiles() {
    return new Promise(resolve => {
      chrome.storage.local.get(TRAINING_KEY, r => {
        const profiles = r[TRAINING_KEY];
        if (profiles && profiles.length > 0) return resolve(profiles);
        // First time — seed defaults
        chrome.storage.local.set({ [TRAINING_KEY]: DEFAULT_PROFILES }, () => resolve(DEFAULT_PROFILES));
      });
    });
  }

  async function saveProfiles(profiles) {
    return new Promise(resolve => {
      chrome.storage.local.set({ [TRAINING_KEY]: profiles }, resolve);
    });
  }

  // ═══════════════════════════════════════════
  //  3. CONVERSATION SCRAPER (Robust v3)
  //  3 strategies to handle LinkedIn DOM changes
  // ═══════════════════════════════════════════
  function scrapeConversation(scope) {
    let messages = [];
    const root = (scope && document.contains(scope)) ? scope : document;
    const rootLabel = root === document ? 'document' : (root.className || root.tagName);

    // ─── Strategy 1: Specific LinkedIn message selectors ───
    const msgSelectors = [
      '.msg-s-event-listitem',
      '.msg-s-message-list__event',
      'li.msg-s-message-list__event',
      'div[class*="msg-s-event-listitem"]',
      'div[class*="msg-s-message-group"]',
      '.msg-s-message-group__msg',
    ];

    let msgElements = [];
    for (const sel of msgSelectors) {
      msgElements = root.querySelectorAll(sel);
      if (msgElements.length > 0) {
        console.log('[OutreachPro DM] Scraper Strategy 1 hit:', sel, msgElements.length, 'msgs (scope:', rootLabel, ')');
        break;
      }
    }

    msgElements.forEach(el => {
      const textEl = el.querySelector(
        '.msg-s-event-listitem__body, ' +
        '.msg-s-event__content, ' +
        '.msg-s-message-group__msg-body, ' +
        'p, span[dir="ltr"]'
      );
      const senderEl = el.querySelector(
        '.msg-s-message-group__name, ' +
        '.msg-s-message-group__profile-link, ' +
        'span[class*="sender"], ' +
        'a[class*="profile"]'
      );
      if (textEl && textEl.textContent.trim().length > 0) {
        messages.push({
          text: textEl.textContent.trim(),
          sender: senderEl ? senderEl.textContent.trim() : 'Unknown',
          isMe: !!(el.classList?.toString().includes('outgoing') || el.querySelector('[class*="outgoing"]')),
        });
      }
    });

    // ─── Strategy 2: Find msg container, get all paragraphs ───
    if (messages.length === 0) {
      const containerSelectors = [
        '.msg-s-message-list-content',
        '.msg-s-message-list',
        'ul[class*="msg-s-message-list"]',
        'div[class*="msg-s-message-list"]',
        '.msg-overlay-conversation-bubble__content',
        'div[class*="msg-overlay-conversation-bubble"]',
        '.msg-thread',
        'div[class*="msg-convo"]',
      ];

      let container = null;
      for (const sel of containerSelectors) {
        // If we have a scope, search within it first. If the scope itself
        // matches, use it directly.
        if (root !== document && root.matches && root.matches(sel)) {
          container = root;
        } else {
          container = root.querySelector(sel);
        }
        if (container) {
          console.log('[OutreachPro DM] Scraper Strategy 2 hit:', sel);
          break;
        }
      }

      if (container) {
        // Grab all paragraphs and text blocks inside the message container
        const allP = container.querySelectorAll('p, span[dir="ltr"], div[class*="body"], div[class*="content"]');
        allP.forEach(p => {
          const text = p.textContent.trim();
          // Filter out very short text, timestamps, "Sent", button labels etc.
          if (text.length > 5 && !/^\d{1,2}:\d{2}/.test(text) && !['Sent', 'Delivered', 'Read', 'Typing...'].includes(text)) {
            // Avoid duplicates from nested elements
            if (!messages.some(m => m.text === text || m.text.includes(text) || text.includes(m.text))) {
              messages.push({
                text,
                sender: 'Unknown',
                isMe: false,
              });
            }
          }
        });
        console.log('[OutreachPro DM] Strategy 2 found', messages.length, 'text blocks');
      }
    }

    // ─── Strategy 3: Brute force — get ALL text from the conversation area ───
    if (messages.length === 0) {
      // Find any element that looks like a conversation container
      const bruteSelector =
        '[class*="msg-overlay-conversation-bubble"], ' +
        '[class*="msg-thread"], ' +
        '[class*="messaging-thread"], ' +
        '[class*="msg-convo"]';
      const bubble = (root !== document && root.matches && root.matches(bruteSelector))
        ? root
        : root.querySelector(bruteSelector);

      if (bubble) {
        console.log('[OutreachPro DM] Scraper Strategy 3 (brute force)');
        // Get all text nodes that look like messages
        const walker = document.createTreeWalker(
          bubble,
          NodeFilter.SHOW_TEXT,
          {
            acceptNode: (node) => {
              const text = node.textContent.trim();
              if (text.length < 8) return NodeFilter.FILTER_REJECT;
              // Skip UI elements
              const parent = node.parentElement;
              if (!parent) return NodeFilter.FILTER_REJECT;
              const tag = parent.tagName.toLowerCase();
              if (['button', 'label', 'input', 'h1', 'h2', 'h3', 'h4'].includes(tag)) return NodeFilter.FILTER_REJECT;
              const cls = parent.className?.toString() || '';
              if (cls.includes('header') || cls.includes('title') || cls.includes('toolbar') || cls.includes('footer')) return NodeFilter.FILTER_REJECT;
              return NodeFilter.FILTER_ACCEPT;
            }
          }
        );

        let node;
        while (node = walker.nextNode()) {
          const text = node.textContent.trim();
          if (!messages.some(m => m.text === text)) {
            messages.push({ text, sender: 'Unknown', isMe: false });
          }
        }
        console.log('[OutreachPro DM] Strategy 3 found', messages.length, 'text nodes');
      }
    }

    // ─── Get conversation partner name ───
    // IMPORTANT: the header/title element isn't always inside the scope
    // we picked (e.g. scope may be .msg-thread but the header is a sibling
    // in .msg-convo-wrapper). So we search the scope, then climb its
    // ancestors, and only fall back to document-wide as a last resort —
    // because a document-wide query will happily grab the first sidebar
    // contact's name (Jitendra at the top of the inbox list) and put it in
    // the greeting for every conversation.
    let partnerName = 'there';
    const nameSelectors = [
      // Overlay bubble header (pop-out chats)
      '.msg-overlay-bubble-header__title',
      'h2[class*="msg-overlay-bubble-header"]',
      '.msg-overlay-bubble-header__badge-container + *',
      '[class*="msg-overlay-bubble-header"] a',
      '[class*="msg-overlay-bubble-header"] span[class*="title"]',
      // Full messaging page thread header
      '.msg-thread__link-to-profile',
      '[class*="msg-thread__link-to-profile"]',
      '.msg-thread__title-text',
      'h2[class*="conversation-title"]',
      '.msg-entity-lockup__entity-title',
      '[class*="msg-entity-lockup__entity-title"]',
      '[data-test-conversation-participant-names]',
      '.msg-conversation-card__participant-names',
      // Generic: any <h2> inside the scope / its ancestors
      'header h2',
      'h2',
    ];

    // Build the list of containers to search, in priority order: the scope
    // itself, then each ancestor up to <body>.
    const searchRoots = [];
    if (root !== document) {
      let cur = root;
      for (let i = 0; i < 6 && cur && cur !== document.body; i++) {
        searchRoots.push(cur);
        cur = cur.parentElement;
      }
    }

    function looksLikeRealName(s) {
      if (!s) return false;
      const t = s.trim();
      if (t.length < 2 || t.length > 80) return false;
      // Reject obviously non-name strings
      if (/^(messaging|inbox|new message|active now|online|you)$/i.test(t)) return false;
      if (/\d{3,}/.test(t)) return false;
      return true;
    }

    outer:
    for (const container of searchRoots) {
      for (const sel of nameSelectors) {
        const els = container.querySelectorAll(sel);
        for (const el of els) {
          const txt = el.textContent.replace(/\s+/g, ' ').trim();
          if (looksLikeRealName(txt)) {
            partnerName = txt;
            console.log('[OutreachPro DM] Partner name found (scoped):', partnerName, 'via', sel);
            break outer;
          }
        }
      }
    }

    // Last-resort document-wide fallback only if scope search found nothing.
    // Prefer the visible (non-minimized) overlay bubble header to avoid
    // grabbing the first sidebar contact name.
    if (partnerName === 'there') {
      const visibleBubble = [...document.querySelectorAll(
        '.msg-overlay-conversation-bubble, div[class*="msg-overlay-conversation-bubble"]'
      )].find(b => {
        const cls = b.className ? b.className.toString() : '';
        if (cls.includes('--is-minimized') || cls.includes('is-collapsed')) return false;
        const r = b.getBoundingClientRect();
        return r.width > 0 && r.height > 80;
      });
      const fallbackRoot = visibleBubble || document;
      for (const sel of nameSelectors) {
        const el = fallbackRoot.querySelector(sel);
        if (el && looksLikeRealName(el.textContent.trim())) {
          partnerName = el.textContent.replace(/\s+/g, ' ').trim();
          console.log('[OutreachPro DM] Partner name found (fallback):', partnerName, 'via', sel);
          break;
        }
      }
    }

    console.log('[OutreachPro DM] Scraped conversation:', messages.length, 'messages, partner:', partnerName);

    // Pick the most recent *substantive* message as lastMessage. Greetings
    // and pleasantries like "Hello Max, thanks for reaching out!" shouldn't
    // dictate the reply — we want the real thing the partner said. If the
    // very last message happens to be a greeting (common opener), walk
    // backwards to find the real content.
    let lastMessage = null;
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (!m || !m.text) continue;
      if (isTrivialMessage(m.text) && lastMessage) continue; // skip trivial if we already have something better
      lastMessage = m;
      if (!isTrivialMessage(m.text)) break; // found substantive — stop
    }
    if (!lastMessage && messages.length > 0) {
      lastMessage = messages[messages.length - 1];
    }

    return {
      messages: messages.slice(-10),
      lastMessage,
      partnerName,
    };
  }

  // Heuristic: is this message just a greeting, thanks, or filler?
  function isTrivialMessage(text) {
    if (!text) return true;
    const t = text.trim().toLowerCase();
    if (t.length < 12) return true;
    // Pure greetings / opening pleasantries
    if (/^(hi|hello|hey|hiya|greetings|good (morning|afternoon|evening))\b[\s\S]{0,40}$/i.test(t)) return true;
    if (/^thanks? (for )?(reaching|connecting|the message|your message|getting in touch)/i.test(t)) return true;
    if (/^thank you (for )?(reaching|connecting|the message|your message|getting in touch|your time)/i.test(t)) return true;
    if (/^(nice|great|good|pleasure) to (meet|connect|hear)/i.test(t)) return true;
    // Emoji-only or sticker-like replies
    if (/^[\p{Emoji}\s!?.]+$/u.test(t) && t.length < 30) return true;
    return false;
  }

  // ═══════════════════════════════════════════
  //  4. AI ENGINE — Context-Aware Response Generator
  //  Analyzes the actual conversation to craft relevant replies,
  //  not just template matching. Profiles set tone/goal only.
  // ═══════════════════════════════════════════
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function generateResponse(profile, conversation) {
    const partnerName = (conversation.partnerName || 'there').split(' ')[0];
    const tone = profile ? profile.tone : 'professional';
    const goal = profile ? profile.description : 'Continue the conversation naturally';
    const lastMsg = conversation.lastMessage;
    const allMessages = conversation.messages || [];

    // ─── Analyze the conversation context ───
    const context = analyzeConversation(allMessages, lastMsg);

    // ─── Build a reply based on what was actually said ───
    let reply = buildContextualReply(context, partnerName, tone, goal, profile);

    // ─── Strip cliché corporate buzzwords ───
    reply = sanitizeCliches(reply);

    // ─── Final humanization pass (remove AI tells) ───
    reply = humanize(reply);

    return reply;
  }

  // Remove the common tells that make generated text feel AI-written:
  // em dashes, stacked exclamation marks, filler adverbs, gratuitous
  // emojis, "Great question!" style opener, and phrases like
  // "I'd absolutely love to".
  function humanize(text) {
    // Em dashes and en dashes → period+space (keeping sentences short)
    text = text.replace(/\s*[\u2014\u2013]\s*/g, '. ');
    // Remove trailing "..." used as fake pause
    text = text.replace(/\.{3,}/g, '.');
    // Drop filler adverbs that scream AI
    text = text.replace(/\b(genuinely|absolutely|truly|honestly|literally|super|really really)\s+/gi, '');

    // Known cringe phrases that keep surfacing in AI-written DMs. Replace
    // the whole clause (up to its terminating punctuation) with nothing,
    // so what remains still reads cleanly.
    // Drop whole sentences that contain a known cringe phrase. Allow up to
    // 4 leading words of subject/verb (e.g. "Would be", "Let's grab a",
    // "I'm genuinely") between the sentence start and the cringe phrase.
    const subjectPrefix = "(?:[A-Za-z'’]+\\s+){0,4}";
    const cringeSentence = [
      "I could write a novel(?:\\s+\\w+){0,6}",
      "music to my ears",
      "ball['’]s in your court",
      "plot twist",
      "the floor is yours",
      "promise (?:I won['’]t|it['’]ll be worth|this won['’]t)(?:\\s+\\w+){0,8}",
      "pitch you a timeshare",
      "virtual coffee",
      "swap ideas",
      "don['’]t be a stranger",
      "consider me your go-to(?:\\s+\\w+){0,4}",
      "(?:genuinely\\s+)?blown away(?:\\s+\\w+){0,6}",
      "mind if I (?:share|send) a quick overview",
    ];
    const cringeRe = new RegExp(
      "(^\\s*|[\\n.!?]\\s*)" + subjectPrefix + "(?:" + cringeSentence.join("|") + ")[^.!?\\n]*[.!?]?",
      "gi"
    );
    // Loop: each pass consumes one cringe sentence + its terminator, which
    // can swallow the anchor for an adjacent cringe sentence. Re-run until
    // no further changes.
    let prev;
    do { prev = text; text = text.replace(cringeRe, (_, pre) => pre); }
    while (text !== prev);
    // Soften "I'd love to" when it survives earlier passes
    text = text.replace(/\bI['’]d (absolutely |really |genuinely |truly )?love to\b/gi, () =>
      pick(["I'd like to", "happy to", "keen to", "I'd welcome the chance to"]));
    // Nuke "That's a really good question." style AI openers first (longer
    // pattern), then the standalone "Great question!" siblings. Anchored to
    // sentence start so we don't shred mid-sentence text.
    text = text.replace(
      /(^|[\n.!?]\s*)That['’]s\s+(?:a\s+)?(?:really\s+|pretty\s+|quite\s+)?(?:good|great|wonderful|amazing|excellent)\s+question[!.\s]*/gi,
      '$1'
    );
    text = text.replace(
      /(^|[\n.!?]\s*)(?:Great|Good|Amazing|Excellent|Love that|Glad you asked)\s+question[!.\s]*/gi,
      '$1'
    );
    // Cap consecutive exclamations at one
    text = text.replace(/!{2,}/g, '!');
    // At most one '!' per sentence chunk
    let exclaims = 0;
    text = text.replace(/!/g, () => (++exclaims > 1 ? '.' : '!'));
    // Strip emoji clusters down to at most one per reply
    const emojiRe = /[\u2600-\u27BF\uE000-\uF8FF\u{1F000}-\u{1FFFF}]/gu;
    let emojiSeen = 0;
    text = text.replace(emojiRe, (m) => (++emojiSeen > 1 ? '' : m));
    // Collapse whitespace introduced by removals
    text = text.replace(/[ \t]{2,}/g, ' ');
    text = text.replace(/\n[ \t]+/g, '\n');
    text = text.replace(/\s+([,.!?])/g, '$1');
    // Capitalize first letter of each sentence if a removal left lowercase
    text = text.replace(/(^|[.!?]\s+)([a-z])/g, (_, p, c) => p + c.toUpperCase());
    return text.trim();
  }

  function sanitizeCliches(text) {
    const replacements = [
      [/\bsynergies?\b/gi, 'opportunities'],
      [/\bleverage\b/gi, 'use'],
      [/\btouch base\b/gi, 'catch up'],
      [/\bcircle back\b/gi, 'follow up'],
      [/\bdeep dive\b/gi, 'closer look'],
      [/\bdive deeper?\b/gi, 'look closer'],
      [/\bmove the needle\b/gi, 'make a difference'],
      [/\blow.hanging fruit\b/gi, 'quick wins'],
      [/\bgame.changer\b/gi, 'really useful'],
      [/\bthought leader\b/gi, 'expert'],
      [/\bcutting.edge\b/gi, 'modern'],
      [/\bbest.in.class\b/gi, 'top quality'],
      [/\bdisrupt(?:ive|ion)?\b/gi, 'improve'],
      [/\bempower(?:ing|ment)?\b/gi, 'help'],
      [/\bholistic\b/gi, 'complete'],
      [/\becosystem\b/gi, 'space'],
      [/\bvalue.add\b/gi, 'benefit'],
      [/\bstakeholders?\b/gi, 'people involved'],
      [/\bbandwidth\b/gi, 'time'],
      [/\bpivot\b/gi, 'shift'],
      [/\bscalable\b/gi, 'flexible'],
      [/\brobust\b/gi, 'solid'],
      [/\bseamless(?:ly)?\b/gi, 'smooth'],
      [/\bactionable\b/gi, 'useful'],
      [/\boptimize\b/gi, 'improve'],
      [/\bparadigm\b/gi, 'approach'],
      [/\binnovative\b/gi, 'new'],
      [/\bpipeline\b/gi, 'process'],
      [/\balign(?:ment|ed)?\b/gi, 'on the same page'],
    ];

    for (const [pattern, replacement] of replacements) {
      text = text.replace(pattern, replacement);
    }
    return text;
  }

  function analyzeConversation(messages, lastMsg) {
    const ctx = {
      topics: [],
      questions: [],
      sentiment: 'neutral',
      lastIntent: 'unknown',
      keyPhrases: [],
      isFirstMessage: !lastMsg,
      mentionedNames: [],
      mentionedCompanies: [],
      lastSenderIsMe: lastMsg ? lastMsg.isMe : false,
      lastMessage: lastMsg || null,
    };

    if (!lastMsg) return ctx;

    const text = lastMsg.text.toLowerCase();

    // Detect questions
    const questionPatterns = text.match(/[^.!?]*\?/g) || [];
    ctx.questions = questionPatterns.map(q => q.trim());

    // Detect topics from all messages
    const topicKeywords = {
      job: ['job', 'position', 'role', 'hiring', 'recruit', 'opportunity', 'career', 'opening'],
      meeting: ['meet', 'call', 'coffee', 'chat', 'schedule', 'calendar', 'zoom', 'teams', 'demo'],
      product: ['product', 'service', 'platform', 'tool', 'solution', 'software', 'app'],
      collaboration: ['collaborate', 'partner', 'together', 'joint', 'co-', 'synergy'],
      gratitude: ['thanks', 'thank you', 'appreciate', 'grateful'],
      interest: ['interested', 'curious', 'tell me more', 'love to know', 'sounds good', 'sounds great'],
      rejection: ['not interested', 'no thanks', 'pass', 'busy', 'not right now', 'not a good time'],
      introduction: ['nice to meet', 'pleasure', 'connecting', 'connected', 'reaching out'],
      pricing: ['price', 'cost', 'pricing', 'budget', 'how much', 'investment', 'plan'],
      experience: ['experience', 'background', 'worked at', 'years', 'expertise'],
      followup: ['following up', 'checking in', 'any update', 'thoughts on', 'did you get'],
    };

    for (const [topic, keywords] of Object.entries(topicKeywords)) {
      for (const kw of keywords) {
        if (text.includes(kw)) {
          ctx.topics.push(topic);
          break;
        }
      }
    }

    // Detect intent
    if (ctx.questions.length > 0) ctx.lastIntent = 'question';
    else if (ctx.topics.includes('rejection')) ctx.lastIntent = 'objection';
    else if (ctx.topics.includes('interest')) ctx.lastIntent = 'positive';
    else if (ctx.topics.includes('gratitude')) ctx.lastIntent = 'thankful';
    else if (ctx.topics.includes('introduction')) ctx.lastIntent = 'greeting';
    else if (ctx.topics.includes('followup')) ctx.lastIntent = 'followup';
    else ctx.lastIntent = 'statement';

    // Sentiment
    const positiveWords = ['great', 'awesome', 'love', 'excited', 'happy', 'amazing', 'fantastic', 'good', 'wonderful', 'perfect', 'interested'];
    const negativeWords = ['not', 'no', 'unfortunately', 'sorry', 'busy', 'pass', 'can\'t', 'won\'t', 'difficult'];
    let sentScore = 0;
    for (const w of positiveWords) if (text.includes(w)) sentScore++;
    for (const w of negativeWords) if (text.includes(w)) sentScore--;
    ctx.sentiment = sentScore > 0 ? 'positive' : sentScore < 0 ? 'negative' : 'neutral';

    // Extract key phrases (words > 4 chars, not stop words)
    const stopWords = new Set(['about', 'above', 'after', 'again', 'being', 'below', 'between', 'could', 'would', 'should', 'their', 'there', 'these', 'those', 'through', 'under', 'which', 'while', 'where', 'other', 'really', 'actually', 'basically']);
    ctx.keyPhrases = text.split(/\s+/)
      .filter(w => w.length > 4 && !stopWords.has(w))
      .slice(0, 8);

    return ctx;
  }

  function buildContextualReply(ctx, name, tone, goal, profile) {
    const greetings = {
      professional: [`Hi ${name},`, `Hello ${name},`],
      casual: [`Hey ${name}!`, `Hi ${name}!`],
      enthusiastic: [`Hey ${name}! 😊`, `Hi there ${name}!`],
      witty: [`Hey ${name}!`, `Hi ${name},`],
    };
    const greeting = pick(greetings[tone] || greetings.professional);

    // If no conversation yet (cold outreach)
    if (ctx.isFirstMessage) {
      return buildColdOutreach(name, tone, goal, profile);
    }

    // Build reply based on detected intent
    let body = '';

    switch (ctx.lastIntent) {
      case 'question':
        body = buildQuestionReply(ctx, tone, goal);
        break;
      case 'objection':
        body = buildObjectionReply(ctx, tone, goal);
        break;
      case 'positive':
        body = buildPositiveReply(ctx, tone, goal);
        break;
      case 'thankful':
        body = buildThankfulReply(ctx, tone, goal);
        break;
      case 'greeting':
        body = buildGreetingReply(ctx, tone, goal);
        break;
      case 'followup':
        body = buildFollowupReply(ctx, tone, goal);
        break;
      default:
        body = buildGeneralReply(ctx, tone, goal);
    }

    // If we have a profile with examples, use them as style reference
    if (profile && profile.examples && profile.examples.length > 0) {
      body = blendWithExampleStyle(body, profile, tone);
    }

    return greeting + '\n\n' + body;
  }

  function buildColdOutreach(name, tone, goal, profile) {
    const greeting = pick({
      professional: [`Hi ${name},`, `Hello ${name},`],
      casual: [`Hey ${name},`, `Hi ${name},`],
      enthusiastic: [`Hey ${name},`],
      witty: [`Hey ${name},`],
    }[tone] || [`Hi ${name},`]);

    // Use profile examples as style guide if available
    if (profile && profile.examples && profile.examples.length > 0) {
      const coldExamples = profile.examples.filter(e => !e.inbound || e.inbound.trim() === '');
      if (coldExamples.length > 0) {
        let response = pick(coldExamples).response;
        response = response.replace(/\[Name\]/gi, name).replace(/\[Company\]/gi, 'your company').replace(/\[field\]/gi, 'your field');
        return greeting + '\n\n' + applyToneVariations(response, tone);
      }
    }

    const templates = {
      professional: [
        `Saw your background — would you be open to a short call this week or next?`,
        `Your profile looked like there might be useful overlap with what I'm working on. Open to a quick chat?`,
      ],
      casual: [
        `Saw your profile and figured it was worth saying hi. Up for a quick chat sometime?`,
      ],
      enthusiastic: [
        `Your work stood out — got 15 minutes this week?`,
      ],
      witty: [
        `Not a sales pitch, promise. Your profile stood out. Got 15 min?`,
      ],
    };

    return greeting + '\n\n' + pick(templates[tone] || templates.professional);
  }

  function buildQuestionReply(ctx, tone, goal) {
    // Direct answer frame. No "Great question!" opener, no "it varies
    // case-by-case" hedge, no quoting the question back at them.
    const replies = {
      professional: [
        `Happy to talk through it properly. Do you have 10-15 minutes this week for a short call?`,
        `Worth a proper answer rather than a quick one here. Free for a brief call this week?`,
        `Happy to get into it. What time works for a 15-minute call this week?`,
      ],
      casual: [
        `Happy to talk through it. Got 10 min this week for a call?`,
        `Worth a proper answer. What's this week looking like for a quick call?`,
      ],
      enthusiastic: [
        `Happy to get into it properly. What's your week like for a short call?`,
      ],
      witty: [
        `Rather answer that properly than half-answer it here. Got 10 min this week?`,
      ],
    };
    return pick(replies[tone] || replies.professional);
  }

  function buildObjectionReply(ctx, tone, goal) {
    const replies = {
      professional: [
        `Understood, and no pressure. If the timing changes, I'm around. Wishing you well in the meantime.`,
        `Completely get it. I'll leave it here. If anything shifts, the door's open on my side.`,
      ],
      casual: [
        `All good, no pressure. If timing changes, you know where to find me.`,
        `Totally get it. Catch you another time.`,
      ],
      enthusiastic: [
        `No worries at all, timing is everything. If things shift, I'm happy to pick this up later.`,
      ],
      witty: [
        `Fair enough. Filing this under "maybe later". Good luck with everything in the meantime.`,
      ],
    };
    return pick(replies[tone] || replies.professional);
  }

  function buildPositiveReply(ctx, tone, goal) {
    const replies = {
      professional: [
        `Good to hear. What works on your end for a short call next week?`,
        `Glad that lands. I'm free most days next week for 15 minutes, what suits you?`,
      ],
      casual: [
        `Nice. What's your week looking like for a quick call?`,
        `Cool. Got 15 min this week?`,
      ],
      enthusiastic: [
        `Good to hear. What does your week look like for a quick call?`,
      ],
      witty: [
        `Glad that lands. What's the week looking like for a 15-min call?`,
      ],
    };
    return pick(replies[tone] || replies.professional);
  }

  function buildThankfulReply(ctx, tone, goal) {
    const replies = {
      professional: [`Of course, happy to help. Shout if anything else comes up.`, `Anytime. Let me know if anything else is useful.`],
      casual: [`Anytime. Shout if anything else comes up.`, `No worries. Ping me if you need anything.`],
      enthusiastic: [`Happy to help. Shout if anything else comes up.`],
      witty: [`Anytime. Ping me if anything else comes up.`],
    };
    return pick(replies[tone] || replies.professional);
  }

  function buildGreetingReply(ctx, tone, goal) {
    const replies = {
      professional: [
        `Good to connect. What are you focused on at the moment?`,
        `Thanks for connecting. What's keeping you busy these days?`,
      ],
      casual: [
        `Likewise. What are you working on lately?`,
        `Good to connect. What's keeping you busy?`,
      ],
      enthusiastic: [
        `Good to connect. What are you focused on right now?`,
      ],
      witty: [
        `Good to connect. What are you actually working on?`,
      ],
    };
    return pick(replies[tone] || replies.professional);
  }

  function buildFollowupReply(ctx, tone, goal) {
    const replies = {
      professional: [
        `Thanks for the nudge. Anything specific you'd like me to cover first?`,
        `Appreciate the follow-up. What's the best time for a short call this week?`,
      ],
      casual: [
        `Thanks for the nudge. Anything specific you want me to cover?`,
        `Appreciate the ping. Got 10 min this week?`,
      ],
      enthusiastic: [`Thanks for circling back. What does your week look like for a quick call?`],
      witty: [`Fair nudge. What's the best time this week?`],
    };
    return pick(replies[tone] || replies.professional);
  }

  // Pull a short, human-sounding reference to the partner's last message so
  // the reply reads as personal rather than boilerplate.
  function referenceLastMessage(ctx) {
    const last = ctx && ctx.lastMessage;
    if (!last || !last.text) return '';
    // Use the first complete sentence (or ~90 chars), trimmed.
    const raw = last.text.replace(/\s+/g, ' ').trim();
    if (raw.length < 12) return '';
    let snippet = raw.split(/(?<=[.!?])\s+/)[0] || raw;
    if (snippet.length > 90) snippet = snippet.slice(0, 87).trim() + '…';
    // Drop trailing punctuation for cleaner inline quoting.
    snippet = snippet.replace(/[.!?]+$/, '');
    return snippet;
  }

  function buildGeneralReply(ctx, tone, goal) {
    // Topic-specific one-liners. No quoting, no hedging.
    const topicResponses = {
      job: `Sounds interesting — what does the role look like day-to-day?`,
      meeting: `Sure, what works on your end this week?`,
      product: `Worth a look — quickest way to see it in action?`,
      collaboration: `Open to it. What did you have in mind?`,
      pricing: `Happy to get into numbers on a short call — what works this week?`,
      experience: `Appreciate you sharing. What are you focused on now?`,
    };

    for (const topic of ctx.topics) {
      if (topicResponses[topic]) {
        return applyToneVariations(topicResponses[topic], tone);
      }
    }

    // No quoting the partner's message back at them — nobody wants that.
    // One acknowledgment + one clear question.
    const generics = {
      professional: [
        `Makes sense. What's the most useful next step on your end?`,
        `Appreciate the context. What's shaping your thinking here?`,
        `Understood. What's most important to you on this?`,
      ],
      casual: [
        `Fair enough. What's the next step?`,
        `Makes sense. What's driving that?`,
      ],
      enthusiastic: [
        `Good to hear. What's next on your side?`,
      ],
      witty: [
        `Okay, now I'm curious. What's behind it?`,
      ],
    };

    return pick(generics[tone] || generics.professional);
  }

  function blendWithExampleStyle(reply, profile, tone) {
    // Use training examples as style guides — borrow phrases and patterns
    if (!profile.examples || profile.examples.length === 0) return reply;

    const example = pick(profile.examples);
    if (!example.response) return reply;

    // Extract signature phrases from examples (ending sentences)
    const exSentences = example.response.split(/[.!?]+/).filter(s => s.trim().length > 15);
    if (exSentences.length > 0 && Math.random() > 0.5) {
      const styleSentence = pick(exSentences).trim();
      // Append a relevant phrase from training data
      const closers = reply.split('\n\n');
      if (closers.length >= 2) {
        closers[closers.length - 1] = styleSentence + '.';
        reply = closers.join('\n\n');
      }
    }

    return applyToneVariations(reply, tone);
  }

  function applyToneVariations(text, tone) {
    // Lightweight lexical variation only. Deliberately avoids escalating
    // phrases into "I'd absolutely love to"-style AI speak.
    const variations = {
      professional: [
        [/\bI['’]d love to\b/gi, () => pick(["I'd like to", "happy to", "keen to"])],
        [/\bLet me know\b/gi, () => pick(["Let me know your thoughts", "Happy to hear your take"])],
      ],
      casual: [
        [/\bI['’]d love to\b/gi, () => pick(["keen to", "happy to"])],
        [/\bLet me know\b/gi, () => pick(["Let me know", "Drop me a line"])],
      ],
      enthusiastic: [
        [/\bI['’]d love to\b/gi, () => pick(["keen to", "happy to"])],
      ],
      witty: [
        [/\bI['’]d love to\b/gi, () => pick(["happy to", "down to"])],
        [/\bI believe\b/gi, () => pick(["My read is", "Seems like"])],
      ],
    };

    const rules = variations[tone] || variations.professional;
    for (const [pattern, replacer] of rules) {
      if (Math.random() > 0.5) {
        text = text.replace(pattern, replacer);
      }
    }
    return text;
  }

  // ═══════════════════════════════════════════
  //  5. UI — AI REPLY BUTTON INJECTION
  //  Multi-strategy with Auto Gmail-style waitForElement
  // ═══════════════════════════════════════════
  function createAIButton() {
    const btn = document.createElement('button');
    btn.className = AI_BTN_CLASS;
    btn.innerHTML = '<span style="animation:dm-ai-sparkle 2s ease-in-out infinite;display:inline-flex">✨</span><span>AI Reply</span>';
    btn.title = 'Click: draft AI reply in message box | Right-click: open settings';

    // Single click → draft directly into the message box
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await directDraftReply(btn);
    });

    // Right-click → open the full panel for tone/outcome selection
    btn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleAIPanel();
    });

    return btn;
  }

  // One-click: generate reply and insert directly into the message box
  async function directDraftReply(btn) {
    // Show loading state on button
    const originalHTML = btn.innerHTML;
    btn.innerHTML = '<span style="display:inline-flex;animation:dm-ai-sparkle 0.5s ease-in-out infinite">⏳</span><span>Drafting...</span>';
    btn.disabled = true;
    btn.style.opacity = '0.7';

    try {
      const profiles = await getProfiles();
      const profile = profiles[0]; // Use first profile as default
      // Scope to the conversation this button belongs to (or the last-
      // focused one, for the floating button). This prevents scraping /
      // inserting into a different person's chat when multiple are open.
      const scope = findActiveScope(btn);
      const conversation = scrapeConversation(scope);
      const reply = generateResponse(profile, conversation);

      // Insert directly into the LinkedIn message box
      insertIntoMessageBox(reply, scope);
    } catch (err) {
      console.error('[OutreachPro DM] Draft error:', err);
      showDMToast('Could not generate reply. Try again.', 'error');
    } finally {
      // Restore button
      btn.innerHTML = originalHTML;
      btn.disabled = false;
      btn.style.opacity = '1';
    }
  }

  async function injectAIReplyButton() {
    // Always allow injection — floating button works on any LinkedIn page
    if (document.querySelector('.' + AI_BTN_CLASS)) return;

    injectionAttempts++;
    console.log(`[OutreachPro DM] Injection attempt ${injectionAttempts}...`);

    const btn = createAIButton();

    // ─── Strategy 1: LinkedIn msg-form footer (most reliable) ───
    const footerSelectors = [
      '.msg-form__footer',
      '.msg-form__left-actions',
      'div[class*="msg-form__footer"]',
      'div[class*="msg-form__left"]',
    ];

    for (const sel of footerSelectors) {
      const footer = document.querySelector(sel);
      if (footer) {
        footer.prepend(btn);
        console.log('[OutreachPro DM] ✅ Injected into footer:', sel);
        return;
      }
    }

    // ─── Strategy 2: Next to Send button ───
    const sendSelectors = [
      'button.msg-form__send-button',
      'button[type="submit"][class*="msg-form"]',
      'button.msg-form__send-btn',
    ];
    for (const sel of sendSelectors) {
      const sendBtn = document.querySelector(sel);
      if (sendBtn && sendBtn.parentElement) {
        sendBtn.parentElement.prepend(btn);
        console.log('[OutreachPro DM] ✅ Injected near Send button:', sel);
        return;
      }
    }

    // ─── Strategy 3: Any "Send" text button in msg context ───
    const allButtons = document.querySelectorAll('button');
    for (const b of allButtons) {
      const txt = b.textContent.trim().toLowerCase();
      if ((txt === 'send' || txt === 'send message') && b.closest('[class*="msg"]')) {
        b.parentElement.insertBefore(btn, b);
        console.log('[OutreachPro DM] ✅ Injected near "Send" text button');
        return;
      }
    }

    // ─── Strategy 4: Near contenteditable message input ───
    const inputSelectors = [
      'div[role="textbox"][contenteditable="true"]',
      '.msg-form__contenteditable',
      'div[contenteditable="true"][class*="msg"]',
      'div[data-placeholder*="Write a message"]',
      'div[aria-label*="Write a message"]',
    ];
    for (const sel of inputSelectors) {
      const msgInput = document.querySelector(sel);
      if (msgInput) {
        let container = msgInput.parentElement;
        for (let i = 0; i < 6 && container; i++) {
          if (container.querySelector('button') || container.classList.toString().includes('msg-form')) {
            container.prepend(btn);
            console.log('[OutreachPro DM] ✅ Injected near message input:', sel);
            return;
          }
          container = container.parentElement;
        }
      }
    }

    // ─── Strategy 5: msg-overlay or msg-thread context ───
    const overlaySelectors = [
      '.msg-overlay-conversation-bubble',
      '.msg-convo-wrapper',
      '.msg-thread',
      'div[class*="msg-overlay-conversation"]',
      'div[class*="msg-s-message-list"]',
    ];
    for (const sel of overlaySelectors) {
      const overlay = document.querySelector(sel);
      if (overlay) {
        // Find any form or footer area within
        const inner = overlay.querySelector('footer, [class*="footer"], [class*="action"], form');
        if (inner) {
          inner.prepend(btn);
          console.log('[OutreachPro DM] ✅ Injected into overlay inner:', sel);
          return;
        }
      }
    }

    // ─── Strategy 6: Floating button — ALWAYS on LinkedIn ───
    btn.classList.add('floating');
    document.body.appendChild(btn);
    console.log('[OutreachPro DM] ✅ Injected as floating button (fallback)');
    return;
  }

  function isOnMessagingPage() {
    return location.pathname.includes('/messaging') ||
           !!document.querySelector(
             '.msg-overlay-conversation-bubble, ' +
             '.msg-form__contenteditable, ' +
             '.msg-thread, ' +
             'div[class*="msg-form"], ' +
             'div[class*="msg-overlay-conversation"], ' +
             'div[role="textbox"][contenteditable="true"]'
           );
  }

  // ═══════════════════════════════════════════
  //  6. UI — AI RESPONSE PANEL
  // ═══════════════════════════════════════════
  function toggleAIPanel() {
    if (aiPanel) {
      aiPanel.remove();
      aiPanel = null;
      return;
    }
    buildAIPanel();
  }

  async function buildAIPanel() {
    const profiles = await getProfiles();
    // Lock the panel to the conversation active when it was opened.
    const panelScope = findActiveScope(null);
    const conversation = scrapeConversation(panelScope);

    const panel = document.createElement('div');
    panel.id = PANEL_ID;

    const lastMsgPreview = conversation.lastMessage
      ? (conversation.lastMessage.text.length > 100
        ? conversation.lastMessage.text.substring(0, 97) + '...'
        : conversation.lastMessage.text)
      : 'No messages found — start a new conversation';

    panel.innerHTML = `
      <div class="dm-ai-header">
        <span class="dm-ai-header-title">✨ AI DM Response Generator</span>
        <button class="dm-ai-header-close" id="dm-ai-close">&times;</button>
      </div>
      <div class="dm-ai-tabs">
        <button class="dm-ai-tab active" data-tab="generate">🤖 Generate</button>
        <button class="dm-ai-tab" data-tab="training">📚 Training Studio</button>
      </div>
      <div class="dm-ai-body" id="dm-ai-body">
        <!-- Generate tab -->
        <div id="dm-ai-tab-generate">
          <div style="margin-bottom:10px">
            <label style="font-size:10px;font-weight:700;color:#6366F1;text-transform:uppercase;display:block;margin-bottom:4px">Conversation Context</label>
            <div class="dm-ai-context-box">${esc(lastMsgPreview)}</div>
          </div>
          <div style="margin-bottom:10px">
            <label style="font-size:10px;font-weight:700;color:#6366F1;text-transform:uppercase;display:block;margin-bottom:4px">Desired Outcome</label>
            <select class="dm-ai-outcome-select" id="dm-ai-outcome">
              ${profiles.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
            </select>
          </div>
          <div id="dm-ai-skel" style="display:none">
            <div class="dm-ai-skel l"></div><div class="dm-ai-skel m"></div><div class="dm-ai-skel l"></div><div class="dm-ai-skel s"></div>
          </div>
          <textarea id="dm-ai-response" placeholder="Click Generate to create your reply..." rows="5"></textarea>
        </div>
        <!-- Training tab (hidden) -->
        <div id="dm-ai-tab-training" style="display:none"></div>
      </div>
      <div class="dm-ai-actions" id="dm-ai-actions">
        <button class="dm-ai-gen-btn" id="dm-ai-gen">✨ Generate Reply</button>
        <div style="display:flex;gap:6px;margin-left:auto">
          <button class="dm-ai-sec-btn" id="dm-ai-copy" style="display:none">📋 Copy</button>
          <button class="dm-ai-insert-btn" id="dm-ai-insert" style="display:none">➤ Insert</button>
        </div>
      </div>
      <div class="dm-ai-footer">Powered by <span class="hl">OutreachPro</span> — <span class="hl">∞ Unlimited</span> AI replies</div>
    `;

    document.body.appendChild(panel);
    aiPanel = panel;

    // Close
    panel.querySelector('#dm-ai-close').onclick = () => { panel.remove(); aiPanel = null; };

    // Tab switching
    panel.querySelectorAll('.dm-ai-tab').forEach(tab => {
      tab.onclick = () => {
        panel.querySelectorAll('.dm-ai-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const tabName = tab.dataset.tab;
        panel.querySelector('#dm-ai-tab-generate').style.display = tabName === 'generate' ? 'block' : 'none';
        panel.querySelector('#dm-ai-tab-training').style.display = tabName === 'training' ? 'block' : 'none';
        panel.querySelector('#dm-ai-actions').style.display = tabName === 'generate' ? 'flex' : 'none';
        if (tabName === 'training') renderTrainingStudio(panel);
      };
    });

    // Generate
    const responseArea = panel.querySelector('#dm-ai-response');
    const skelArea = panel.querySelector('#dm-ai-skel');
    const copyBtn = panel.querySelector('#dm-ai-copy');
    const insertBtn = panel.querySelector('#dm-ai-insert');

    panel.querySelector('#dm-ai-gen').onclick = async () => {
      const selectedId = panel.querySelector('#dm-ai-outcome').value;
      const allProfiles = await getProfiles();
      const profile = allProfiles.find(p => p.id === selectedId) || allProfiles[0];

      responseArea.style.display = 'none';
      skelArea.style.display = 'block';
      copyBtn.style.display = 'none';
      insertBtn.style.display = 'none';

      // Re-resolve scope at click time so the panel follows the user if
      // they switched bubbles after opening it.
      const liveScope = findActiveScope(null) || panelScope;
      const freshConv = scrapeConversation(liveScope);

      setTimeout(() => {
        const reply = generateResponse(profile, freshConv);
        responseArea.value = reply;
        responseArea.style.display = 'block';
        skelArea.style.display = 'none';
        copyBtn.style.display = 'inline-flex';
        insertBtn.style.display = 'inline-flex';
      }, 600);
    };

    // Copy
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(responseArea.value).then(() => {
        copyBtn.textContent = '✅ Copied!';
        setTimeout(() => { copyBtn.textContent = '📋 Copy'; }, 2000);
      });
    };

    // Insert
    insertBtn.onclick = () => insertIntoMessageBox(
      responseArea.value,
      findActiveScope(null) || panelScope
    );
  }

  // ═══════════════════════════════════════════
  //  7. INSERT INTO LINKEDIN MESSAGE BOX
  //  React-compatible: fires synthetic events like Auto Gmail
  // ═══════════════════════════════════════════
  function insertIntoMessageBox(text, scope) {
    const boxSelectors = [
      '.msg-form__contenteditable div[contenteditable="true"]',
      '.msg-form__contenteditable',
      'div[role="textbox"][contenteditable="true"]',
      'div[contenteditable="true"][class*="msg"]',
      'div[aria-label*="Write a message"]',
      'div[data-placeholder*="Write a message"]',
    ];

    let box = null;

    // Prefer the composer the user most recently typed in — that's the one
    // tied to the currently-active conversation.
    if (lastActiveComposer && document.contains(lastActiveComposer)) {
      if (!scope || scope.contains(lastActiveComposer)) {
        box = lastActiveComposer;
      }
    }

    // Next, search within the explicit scope (button's own bubble).
    if (!box && scope && document.contains(scope)) {
      for (const sel of boxSelectors) {
        box = scope.querySelector(sel);
        if (box) break;
      }
    }

    // Finally, fall back to the document-wide first match.
    if (!box) {
      for (const sel of boxSelectors) {
        box = document.querySelector(sel);
        if (box) break;
      }
    }

    if (!box) {
      navigator.clipboard.writeText(text);
      showDMToast('📋 Copied to clipboard — paste it in the message box!', 'success');
      return;
    }

    box.focus();

    // Clear existing content
    box.innerHTML = '';

    // Insert text as paragraphs
    const paragraphs = text.split('\n').filter(l => l.trim());
    paragraphs.forEach(p => {
      const pEl = document.createElement('p');
      pEl.textContent = p;
      box.appendChild(pEl);
    });

    // Fire React-compatible synthetic events (inspired by Auto Gmail's approach)
    // React listens on the root, so we need to fire native events that bubble
    const nativeInputEvent = new InputEvent('input', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertText',
      data: text,
    });
    box.dispatchEvent(nativeInputEvent);
    box.dispatchEvent(new Event('change', { bubbles: true }));

    // Also fire keyboard events to trigger LinkedIn's draft detection
    box.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'a', keyCode: 65 }));
    box.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'a', keyCode: 65 }));
    box.dispatchEvent(new KeyboardEvent('keypress', { bubbles: true, key: 'a', keyCode: 65 }));

    // Trigger React's internal value tracker if present
    const tracker = box._valueTracker;
    if (tracker) tracker.setValue('');

    showDMToast('✅ Reply inserted! Review and click Send when ready.', 'success');

    if (aiPanel) { aiPanel.remove(); aiPanel = null; }
  }

  // ═══════════════════════════════════════════
  //  8. TRAINING STUDIO UI
  // ═══════════════════════════════════════════
  async function renderTrainingStudio(panel) {
    const container = panel.querySelector('#dm-ai-tab-training');
    const profiles = await getProfiles();

    container.innerHTML = `
      <div style="margin-bottom:12px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <span style="font-size:12px;font-weight:700;color:#333">Outcome Profiles</span>
          <button id="dm-ai-add-profile" style="font-size:11px;color:#6366F1;font-weight:600;background:none;border:none;cursor:pointer;font-family:inherit">+ New Profile</button>
        </div>
        <div id="dm-ai-profiles-list">
          ${profiles.map(p => `
            <div class="dm-ai-profile-card" data-pid="${p.id}">
              <div style="display:flex;justify-content:space-between;align-items:start">
                <div>
                  <div class="pname">${esc(p.name)}</div>
                  <div class="pdesc">${esc(p.description)}</div>
                  <div class="pcount">${p.examples.length} training example${p.examples.length !== 1 ? 's' : ''} · ${p.tone} tone</div>
                </div>
                <div style="display:flex;gap:6px">
                  <button class="dm-ai-edit-profile" data-pid="${p.id}" style="font-size:10px;color:#6366F1;background:none;border:none;cursor:pointer;font-weight:600">Edit</button>
                  <button class="dm-ai-del-profile" data-pid="${p.id}" style="font-size:10px;color:#EF4444;background:none;border:none;cursor:pointer;font-weight:600">Del</button>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
      <div id="dm-ai-profile-editor" style="display:none"></div>
    `;

    container.querySelector('#dm-ai-add-profile').onclick = () => {
      const newProfile = {
        id: 'custom_' + Date.now(),
        name: '🎯 New Outcome',
        description: 'Describe the desired outcome of this conversation',
        tone: 'professional',
        examples: [],
      };
      profiles.push(newProfile);
      saveProfiles(profiles).then(() => renderProfileEditor(panel, newProfile, profiles));
    };

    container.querySelectorAll('.dm-ai-edit-profile').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const profile = profiles.find(p => p.id === btn.dataset.pid);
        if (profile) renderProfileEditor(panel, profile, profiles);
      };
    });

    container.querySelectorAll('.dm-ai-del-profile').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const idx = profiles.findIndex(p => p.id === btn.dataset.pid);
        if (idx > -1) {
          profiles.splice(idx, 1);
          saveProfiles(profiles).then(() => renderTrainingStudio(panel));
        }
      };
    });
  }

  function renderProfileEditor(panel, profile, allProfiles) {
    const container = panel.querySelector('#dm-ai-tab-training');
    container.innerHTML = `
      <div style="margin-bottom:8px">
        <button id="dm-ai-back-profiles" style="font-size:11px;color:#6366F1;font-weight:600;background:none;border:none;cursor:pointer;font-family:inherit">← Back to Profiles</button>
      </div>
      <div style="margin-bottom:10px">
        <label style="font-size:10px;font-weight:700;color:#555;display:block;margin-bottom:3px">Profile Name</label>
        <input class="dm-ai-training-input" id="dm-ai-pname" value="${esc(profile.name)}" placeholder="e.g. 📅 Book a Meeting" />
      </div>
      <div style="margin-bottom:10px">
        <label style="font-size:10px;font-weight:700;color:#555;display:block;margin-bottom:3px">Description</label>
        <input class="dm-ai-training-input" id="dm-ai-pdesc" value="${esc(profile.description)}" placeholder="What outcome do you want?" />
      </div>
      <div style="margin-bottom:10px">
        <label style="font-size:10px;font-weight:700;color:#555;display:block;margin-bottom:3px">Tone</label>
        <select class="dm-ai-outcome-select" id="dm-ai-ptone">
          <option value="professional" ${profile.tone === 'professional' ? 'selected' : ''}>Professional</option>
          <option value="casual" ${profile.tone === 'casual' ? 'selected' : ''}>Casual</option>
          <option value="enthusiastic" ${profile.tone === 'enthusiastic' ? 'selected' : ''}>Enthusiastic</option>
          <option value="witty" ${profile.tone === 'witty' ? 'selected' : ''}>Witty</option>
        </select>
      </div>
      <div style="margin-bottom:10px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
          <label style="font-size:10px;font-weight:700;color:#555">Training Examples</label>
          <button id="dm-ai-add-example" style="font-size:10px;color:#6366F1;font-weight:600;background:none;border:none;cursor:pointer;font-family:inherit">+ Add Example</button>
        </div>
        <div id="dm-ai-examples-list">
          ${profile.examples.map((ex, i) => `
            <div class="dm-ai-example-pair">
              <button class="ex-del" data-idx="${i}">Remove</button>
              <div class="ex-label">Their message:</div>
              <div class="ex-text">${esc(ex.inbound) || '<em style="color:#999">No inbound (cold message)</em>'}</div>
              <div class="ex-label" style="margin-top:6px">Your ideal response:</div>
              <div class="ex-text">${esc(ex.response)}</div>
            </div>
          `).join('')}
        </div>
      </div>
      <div id="dm-ai-new-example" style="display:none;margin-bottom:10px;padding:10px;background:#f9f9fc;border-radius:8px;border:1px solid #e8e8ed">
        <label style="font-size:10px;font-weight:700;color:#555;display:block;margin-bottom:3px">Their message (leave empty for cold outreach)</label>
        <textarea class="dm-ai-training-input" id="dm-ai-ex-inbound" rows="2" placeholder="What they might say..."></textarea>
        <label style="font-size:10px;font-weight:700;color:#555;display:block;margin-bottom:3px">Your ideal response</label>
        <textarea class="dm-ai-training-input" id="dm-ai-ex-response" rows="3" placeholder="How you want to reply..."></textarea>
        <div style="display:flex;gap:6px;margin-top:6px">
          <button id="dm-ai-save-example" class="dm-ai-gen-btn" style="font-size:11px;padding:6px 14px">Save Example</button>
          <button id="dm-ai-cancel-example" class="dm-ai-sec-btn" style="font-size:11px;padding:6px 14px">Cancel</button>
        </div>
      </div>
      <button id="dm-ai-save-profile" style="width:100%;padding:10px;font-size:13px;font-weight:600;background:linear-gradient(135deg,#8B5CF6,#6366F1,#4F46E5);color:#fff;border:none;border-radius:10px;cursor:pointer;font-family:inherit;box-shadow:0 2px 10px rgba(99,102,241,0.3)">💾 Save Profile</button>
    `;

    container.querySelector('#dm-ai-back-profiles').onclick = () => renderTrainingStudio(panel);

    container.querySelector('#dm-ai-add-example').onclick = () => {
      container.querySelector('#dm-ai-new-example').style.display = 'block';
    };
    container.querySelector('#dm-ai-cancel-example').onclick = () => {
      container.querySelector('#dm-ai-new-example').style.display = 'none';
    };
    container.querySelector('#dm-ai-save-example').onclick = () => {
      const inbound = container.querySelector('#dm-ai-ex-inbound').value.trim();
      const response = container.querySelector('#dm-ai-ex-response').value.trim();
      if (!response) { showDMToast('Please enter an ideal response.', 'error'); return; }
      profile.examples.push({ inbound, response });
      saveProfiles(allProfiles).then(() => renderProfileEditor(panel, profile, allProfiles));
    };

    container.querySelectorAll('.ex-del').forEach(btn => {
      btn.onclick = () => {
        const idx = parseInt(btn.dataset.idx);
        profile.examples.splice(idx, 1);
        saveProfiles(allProfiles).then(() => renderProfileEditor(panel, profile, allProfiles));
      };
    });

    container.querySelector('#dm-ai-save-profile').onclick = () => {
      profile.name = container.querySelector('#dm-ai-pname').value.trim() || profile.name;
      profile.description = container.querySelector('#dm-ai-pdesc').value.trim() || profile.description;
      profile.tone = container.querySelector('#dm-ai-ptone').value;
      saveProfiles(allProfiles).then(() => {
        showDMToast('Profile saved!', 'success');
        renderTrainingStudio(panel);
      });
    };
  }

  // ═══════════════════════════════════════════
  //  9. UTILITIES
  // ═══════════════════════════════════════════
  function esc(s) {
    if (!s) return '';
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function showDMToast(msg, type = '') {
    const existing = document.querySelector('.dm-ai-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = 'dm-ai-toast' + (type ? ' ' + type : '');
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  // ═══════════════════════════════════════════
  //  10. OBSERVER & INIT
  //  Auto Gmail-inspired: debounced MutationObserver
  //  + waitForElement for initial load
  // ═══════════════════════════════════════════
  function startObserving() {
    if (observer) observer.disconnect();
    let debounceTimer = null;

    observer = new MutationObserver((mutations) => {
      // Quick check: did any mutation add msg-related elements?
      let relevant = false;
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType === 1) {
            const cl = node.className || '';
            if (typeof cl === 'string' && (cl.includes('msg') || cl.includes('message') || cl.includes('overlay'))) {
              relevant = true;
              break;
            }
            // Check children
            if (node.querySelector && node.querySelector('[class*="msg"]')) {
              relevant = true;
              break;
            }
          }
        }
        if (relevant) break;
      }

      if (!relevant && document.querySelector('.' + AI_BTN_CLASS)) return;

      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (isOnMessagingPage() && !document.querySelector('.' + AI_BTN_CLASS)) {
          injectAIReplyButton();
        }
      }, 800);
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  function init() {
    if (!location.hostname.includes('linkedin.com')) return;
    console.log('[OutreachPro DM] 🚀 Initializing AI DM Response Generator v2');
    injectDMStyles();
    attachActiveScopeTracking();

    // Use waitForElement for initial injection (Auto Gmail pattern)
    const msgFormSelector = [
      '.msg-form__footer',
      '.msg-form__contenteditable',
      'div[role="textbox"][contenteditable="true"]',
      '.msg-overlay-conversation-bubble',
      'div[class*="msg-form"]',
    ].join(', ');

    // Try waitForElement first (efficient — no polling)
    waitForElement(msgFormSelector, { timeout: 10000 })
      .then(() => {
        setTimeout(injectAIReplyButton, 500);
      })
      .catch(() => {
        console.log('[OutreachPro DM] No msg form found via waitForElement, injecting floating...');
        // Always inject — floating button works everywhere
        setTimeout(injectAIReplyButton, 1000);
      });

    // Also always try at intervals (LinkedIn is slow to load)
    setTimeout(injectAIReplyButton, 2000);
    setTimeout(injectAIReplyButton, 5000);
    setTimeout(injectAIReplyButton, 8000);

    startObserving();

    // Watch URL changes (LinkedIn is an SPA)
    lastMsgUrl = location.href;
    setInterval(() => {
      if (location.href !== lastMsgUrl) {
        lastMsgUrl = location.href;
        injectionAttempts = 0;
        // Drop any stale composer reference from the previous page/conv.
        lastActiveComposer = null;
        // Clean up old buttons and panel
        document.querySelectorAll('.' + AI_BTN_CLASS).forEach(b => b.remove());
        if (aiPanel) { aiPanel.remove(); aiPanel = null; }

        // Re-inject after navigation
        setTimeout(injectAIReplyButton, 1500);
        setTimeout(injectAIReplyButton, 3500);
      }
    }, 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
