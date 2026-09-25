/**
 * OutreachPro — AI DM Response Generator v2
 *
 * Inspired by Auto Gmail's injection patterns:
 *   • MutationObserver-driven injection (incl. chats inside shadow roots)
 *   • Shadow DOM isolated UI (no CSS conflicts with LinkedIn)
 *   • Robust multi-strategy button injection
 *   • Context-aware conversation scraping
 *   • React-compatible message box insertion
 *
 * 100% local — no API calls, no tokens, no limits.
 */
(function () {
  'use strict';

  const AI_REPLY_VERSION = '1.6';
  const TRAINING_KEY = 'outreach_dm_training_profiles';
  const AI_BTN_CLASS = 'outreach-dm-ai-btn';
  const PANEL_ID = 'outreach-dm-ai-panel';
  let aiPanel = null;
  let observer = null;
  let lastMsgUrl = '';
  // Profile chosen last in the panel; one-click drafting uses it too.
  const DEFAULT_PROFILE_KEY = 'outreach_dm_default_profile';

  // Set to true to trace scraping/injection in the page console.
  // Turn on from the page console: localStorage.setItem('outreachDmDebug', '1')
  const DEBUG = (() => { try { return localStorage.getItem('outreachDmDebug') === '1'; } catch (e) { return false; } })();
  function log(...args) {
    if (DEBUG) console.log('[OutreachPro DM]', ...args);
  }

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

  // Message composers only — not the feed's post/comment boxes, which are
  // also div[role="textbox"].
  const COMPOSER_SELECTOR =
    '.msg-form__contenteditable div[contenteditable="true"], ' +
    '.msg-form__contenteditable, ' +
    '.msg-form [contenteditable="true"], ' +
    'div[contenteditable="true"][class*="msg"], ' +
    '[data-outreach-dm-unit] [contenteditable="true"], ' +
    '[data-outreach-dm-unit] textarea';

  function attachActiveScopeTracking() {
    if (activeScopeListenerAttached) return;
    activeScopeListenerAttached = true;
    const onActivity = (e) => {
      // composedPath()[0] is the real target even inside a shadow root
      // (e.target is retargeted to the shadow host at document level).
      const t = (e.composedPath && e.composedPath()[0]) || e.target;
      if (!t || t.nodeType !== 1) return;
      const composer = t.closest && t.closest(COMPOSER_SELECTOR);
      if (composer) lastActiveComposer = composer;
    };
    document.addEventListener('focusin', onActivity, true);
    document.addEventListener('click', onActivity, true);
  }

  // ─── Shadow DOM support ───
  // Newer LinkedIn pages render chat pop-ups inside an open shadow root
  // (#interop-outlet). document.querySelector can't see into it and
  // document.contains() is false for nodes inside it, which made the
  // extension miss those chats entirely and fall back to the clipboard.
  // All chat lookups go through these helpers instead.
  const shadowRoots = new Set();

  function syncShadowRoots() {
    for (const r of shadowRoots) if (!r.host || !r.host.isConnected) shadowRoots.delete(r);
    if (!document.body) return;
    const queue = [document.body, ...shadowRoots];
    while (queue.length) {
      const walker = document.createTreeWalker(queue.shift(), NodeFilter.SHOW_ELEMENT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const sr = n.shadowRoot;
        if (sr && !shadowRoots.has(sr)) {
          shadowRoots.add(sr);
          onNewShadowRoot(sr);
          queue.push(sr);
        }
      }
    }
  }

  function onNewShadowRoot(sr) {
    // Mutations inside a shadow root don't reach the document observer.
    if (observer) observer.observe(sr, { childList: true, subtree: true });
    ensureStylesIn(sr);
  }

  // Page CSS doesn't apply inside a shadow root: copy our stylesheet in.
  function ensureStylesIn(root) {
    const src = document.getElementById('outreach-dm-ai-css');
    if (!src || !root.getElementById || root.getElementById('outreach-dm-ai-css')) return;
    root.appendChild(src.cloneNode(true));
  }

  function deepQueryAll(selector) {
    const out = new Set(document.querySelectorAll(selector));
    for (const r of shadowRoots) r.querySelectorAll(selector).forEach(el => out.add(el));
    return [...out];
  }

  function deepQuery(selector) {
    return document.querySelector(selector) || deepQueryAll(selector)[0] || null;
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
    if (lastActiveComposer && lastActiveComposer.isConnected) {
      const fromComposer = closestScope(lastActiveComposer);
      if (fromComposer) return fromComposer;
    }

    // 3. Any open, non-minimized overlay bubble.
    const bubbles = deepQueryAll(
      '.msg-overlay-conversation-bubble, div[class*="msg-overlay-conversation-bubble"]'
    );
    for (const b of bubbles) {
      const cls = b.className ? b.className.toString() : '';
      if (cls.includes('--is-minimized') || cls.includes('is-collapsed')) continue;
      const rect = b.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 80) return b;
    }

    // 4. Full messaging page thread.
    const thread = deepQuery('.msg-thread, div[class*="messaging-thread"]');
    if (thread) return thread;

    return null;
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
      .outreach-dm-controls {
        display: inline-flex; align-items: center; gap: 4px;
        margin-right: 6px; vertical-align: middle; flex-shrink: 0;
      }
      .outreach-dm-controls.floating {
        position: fixed !important; bottom: 80px !important; right: 30px !important;
        z-index: 2147483640 !important;
      }
      .outreach-dm-tone {
        height: 28px; border-radius: 14px; padding: 0 6px;
        border: 1px solid rgba(99, 102, 241, 0.55); background: transparent;
        color: inherit; font: 600 11px 'Inter', sans-serif; cursor: pointer;
      }
      .outreach-dm-tone option { color: #111; background: #fff; }
      .outreach-dm-send {
        width: 28px; height: 28px; border-radius: 50%; border: none;
        background: linear-gradient(135deg, #10B981, #059669); color: #fff;
        font-size: 12px; cursor: pointer; line-height: 28px; padding: 0;
        box-shadow: 0 2px 8px rgba(16, 185, 129, 0.35);
      }
      .outreach-dm-send:hover { filter: brightness(1.1); }
      .outreach-dm-send:disabled { opacity: 0.6; cursor: default; }
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
          response: "Hi [Name], came across your work in [field] and thought it was worth reaching out. I'm working on something that might be relevant to you. Open to a quick chat?" },
      ]
    },
  ];

  // Seed examples shipped by earlier versions. Installs that still hold them
  // verbatim (i.e. the user never edited them) get the current seeds
  // instead, so old "Great question! I'd love to walk you through..." text
  // stops leaking into cold outreach. Edited examples are never touched.
  const LEGACY_SEED_RESPONSES = {
    "Great question! We help companies like yours streamline their recruitment pipeline by 3x. I'd love to walk you through a quick 15-min demo — would Thursday or Friday work better for you?": ['book_meeting', 0],
    "Totally understand — I know how hectic things can get! How about we pencil in a brief 10-minute chat next week? I promise it'll be worth your time. What day works best?": ['book_meeting', 1],
    "Likewise! I've been following your work at [Company] — really impressive stuff with the product launch last quarter. Would love to hear more about what you're working on next!": ['build_rapport', 0],
    "Completely understand — it's a big decision! What I can share is that our clients typically see ROI within the first 30 days. Happy to connect you with a reference in your industry. Would that help with evaluating?": ['close_deal', 0],
    "Hi [Name]! I came across your profile and was genuinely impressed by your work in [field]. I'm working on something that could be a perfect fit — mind if I share a quick overview?": ['cold_outreach', 0],
    "Hi [Name], came across your work in [field] and thought it was worth reaching out. I'm working on something that might actually be relevant, mind if I send a quick overview?": ['cold_outreach', 0],
  };

  function migrateLegacySeeds(profiles) {
    let changed = false;
    for (const p of profiles) {
      for (const ex of (p.examples || [])) {
        const target = LEGACY_SEED_RESPONSES[ex.response];
        if (!target) continue;
        const seed = DEFAULT_PROFILES.find(d => d.id === target[0]);
        const fresh = seed && seed.examples[target[1]];
        if (fresh && fresh.response !== ex.response) {
          ex.response = fresh.response;
          changed = true;
        }
      }
    }
    return changed;
  }

  async function getProfiles() {
    return new Promise(resolve => {
      chrome.storage.local.get(TRAINING_KEY, r => {
        const profiles = r[TRAINING_KEY];
        if (profiles && profiles.length > 0) {
          if (migrateLegacySeeds(profiles)) {
            chrome.storage.local.set({ [TRAINING_KEY]: profiles });
          }
          return resolve(profiles);
        }
        // First time — seed defaults
        chrome.storage.local.set({ [TRAINING_KEY]: DEFAULT_PROFILES }, () => resolve(DEFAULT_PROFILES));
      });
    });
  }

  // The profile one-click drafting uses: the one last picked in the panel,
  // falling back to the first profile.
  async function getActiveProfile() {
    const profiles = await getProfiles();
    const savedId = await new Promise(resolve => {
      try {
        chrome.storage.local.get(DEFAULT_PROFILE_KEY, r => resolve(r && r[DEFAULT_PROFILE_KEY]));
      } catch (e) { resolve(null); }
    });
    return profiles.find(p => p.id === savedId) || profiles[0];
  }

  // ─── My details: facts used to answer questions accurately ───
  const DETAILS_KEY = 'outreach_dm_my_details';        // typed by the user
  const AUTO_DETAILS_KEY = 'outreach_dm_my_details_auto'; // found in my messages
  const DETAIL_FIELDS = [
    ['cvLink', 'CV / resume link', 'https://…'],
    ['calendarLink', 'Booking link', 'https://linke.to/Schedule'],
    ['email', 'Email', 'you@example.com'],
    ['phone', 'Phone', '+44 …'],
    ['signOffName', 'Sign-off name', 'Maxmilliam'],
    ['currentRole', 'Current role', 'Senior Backend Engineer'],
    ['lookingFor', "What I'm looking for", 'Backend or Platform Engineering roles in Europe'],
    ['rightToWork', 'Nationality / visa status', 'I am an EU citizen. No visa is required for my employment.'],
    ['notice', 'Notice period', 'one month'],
    ['location', 'Current location', 'London'],
    ['relocate', 'Willing to relocate', 'Yes, I am willing to relocate.'],
    ['relocateContract', 'Relocate for a contract role', 'Yes, I am willing to relocate for a contract role.'],
    ['salary', 'Expected salary / daily rate', '£60,000 GBP'],
    ['interviewFormat', 'Interview format', 'Yes, I am happy to attend both face-to-face and telephone interviews.'],
    ['offers', 'Offers or interviews in hand', 'I currently do not have any other offers or interviews in hand.'],
    ['interviewAvailability', 'Availability for interview', 'I am available to attend interviews at your convenience after my notice period.'],
  ];

  // Maxmilliam's standing answers. Anything typed in "My details" wins;
  // current location is deliberately left for him to fill in.
  const DEFAULT_DETAILS = {
    email: 'maxokafordev@gmail.com',
    calendarLink: 'https://linke.to/Schedule',
    signOffName: 'Maxmilliam',
    rightToWork: 'I am an EU citizen. No visa is required for my employment.',
    notice: 'one month',
    relocate: 'Yes, I am willing to relocate.',
    relocateContract: 'Yes, I am willing to relocate for a contract role.',
    salary: '£60,000 GBP',
    interviewFormat: 'Yes, I am happy to attend both face-to-face and telephone interviews.',
    offers: 'I currently do not have any other offers or interviews in hand.',
    interviewAvailability: 'I am available to attend interviews at your convenience after my notice period.',
  };

  function storageGet(key) {
    return new Promise(resolve => {
      try { chrome.storage.local.get(key, r => resolve((r && r[key]) || null)); } catch (e) { resolve(null); }
    });
  }
  function storageSet(obj) {
    try { chrome.storage.local.set(obj); } catch (e) { /* ignore */ }
  }

  // Typed details win; then anything found earlier in my messages; then
  // what's in this conversation. Newly found values are remembered.
  async function getMyDetails(conversation) {
    const manual = (await storageGet(DETAILS_KEY)) || {};
    const auto = (await storageGet(AUTO_DETAILS_KEY)) || {};
    const found = extractDetailsFromText(conversation ? conversation.myMessagesText : '');
    const merged = { ...auto };
    let changed = false;
    for (const [k, v] of Object.entries(found)) {
      if (v && auto[k] !== v) { merged[k] = v; changed = true; }
    }
    if (changed) storageSet({ [AUTO_DETAILS_KEY]: merged });
    const out = { ...DEFAULT_DETAILS, ...merged };
    for (const [k, v] of Object.entries(manual)) if (v && String(v).trim()) out[k] = String(v).trim();
    return out;
  }

  let currentTone = 'professional';
  async function loadTone() {
    const t = await storageGet(TONE_KEY);
    if (t && TONES[t]) currentTone = t;
    return currentTone;
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
  // ─── Class-name-free chat detection ───
  // LinkedIn renames its CSS classes from time to time, and when the
  // msg-form / msg-s-* classes change the button silently disappears. These
  // helpers find a chat the way a person would instead: an editable message
  // box with a "Send" button next to it.
  const UNIT_ATTR = 'data-outreach-dm-unit';
  // Editors that are not chats: feed posts/comments, invitation notes, search.
  const NOT_A_CHAT = /comment|post|share your thoughts|what do you want to talk about|add a note|search|we know each other|invitation/i;

  function isVisible(el) {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function isSendButton(b) {
    if (!b || b.classList.contains(AI_BTN_CLASS) || b.closest('.outreach-dm-controls')) return false;
    const label = (b.getAttribute('aria-label') || '').trim();
    const text = (b.innerText || b.textContent || '').trim();
    return /^send( message| reply)?$/i.test(text) || /^send( message| reply)?$/i.test(label);
  }

  // [{ unit, composer, sendBtn }] for every visible chat composer.
  function findSemanticComposers() {
    const out = [];
    for (const ed of deepQueryAll('[contenteditable="true"], textarea')) {
      if (!isVisible(ed) || ed.closest('#' + PANEL_ID)) continue;
      // LinkedIn's invitation window (note box + Send) is not a chat.
      if (ed.id === 'custom-message') continue;
      const dlg = ed.closest('[role="dialog"], .artdeco-modal, .send-invite');
      if (dlg && /invitation|add a note|how do you know|send without a note/i.test(dlg.innerText || '')) continue;
      if (ed.parentElement && ed.parentElement.closest('[contenteditable="true"]')) continue; // inner node of an editor
      const label = ['aria-label', 'aria-placeholder', 'data-placeholder', 'placeholder']
        .map(a => ed.getAttribute(a) || '').join(' ');
      if (NOT_A_CHAT.test(label)) continue;
      // Smallest container that holds both the editor and a Send button.
      let cur = ed.parentElement;
      for (let i = 0; i < 8 && cur && cur !== document.body; i++, cur = cur.parentElement) {
        const sendBtn = [...cur.querySelectorAll('button')].find(isSendButton);
        if (sendBtn) {
          out.push({ unit: cur, composer: ed, sendBtn });
          break;
        }
      }
    }
    return out;
  }

  // Where the button goes: the toolbar row holding Send and the attach /
  // GIF / emoji buttons — in its left-hand group when it has one.
  function toolbarAnchor(unit, sendBtn) {
    let row = sendBtn.parentElement;
    while (row && row !== unit && row.querySelectorAll('button').length < 3) row = row.parentElement;
    if (!row || row === unit) return sendBtn.parentElement;
    const left = [...row.children].find(ch => ch.querySelector && ch.querySelector('button') && !ch.contains(sendBtn));
    return left || row;
  }

  // The open conversation around a composer, found by position: climb while
  // the container stays in the composer's column. The next level up would
  // take in the inbox list (full page) or other chat bubbles (overlay).
  function paneFor(composer) {
    if (!composer || !composer.isConnected) return null;
    const c = composer.getBoundingClientRect();
    if (!c.width) return null;
    let best = null;
    for (let cur = composer.parentElement, i = 0; cur && cur !== document.body && i < 25; cur = cur.parentElement, i++) {
      const r = cur.getBoundingClientRect();
      if (r.left < c.left - 48 || r.right > c.right + 96) break;
      best = cur;
    }
    return best;
  }

  // "Maxmilliam Okafor" → name; "Let's meet at" → '' (names are capitalised).
  function nameLike(s) {
    const n = cleanPersonName(String(s || '').replace(/\b(premium|verified|view .*profile)\b/gi, ' '));
    if (!looksLikeRealName(n)) return '';
    const words = n.split(' ');
    if (words.length > 5) return '';
    const particle = /^(de|da|di|del|der|den|van|von|le|la|bin|al|el|du|dos|das|y)$/i;
    return words.every(w => particle.test(w) || /^\p{Lu}/u.test(w)) ? n : '';
  }

  // Read a conversation from its visible text. Each message group starts
  // with a header line — "Maxmilliam Okafor • 2:16 PM" (or the name and
  // time on two lines, or LinkedIn's screen-reader "… sent the following
  // message at 2:16 PM") — and date headings like "SEP 15" / "TODAY"
  // separate days.
  // Day headings LinkedIn puts between messages.
  const DATE_HEADING_RE = /^(today|yesterday|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun|(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(,?\s+\d{4})?)$/i;

  // "TODAY" → 0, "YESTERDAY" → 1, "Monday" → days since, "SEP 24" → days since.
  function daysAgoFromLabel(label) {
    const t = String(label || '').trim().toLowerCase();
    if (!DATE_HEADING_RE.test(t)) return null;
    if (t === 'today') return 0;
    if (t === 'yesterday') return 1;
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const long = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    let wi = long.indexOf(t);
    if (wi < 0) wi = long.findIndex(d => d.slice(0, 3) === t);
    if (wi >= 0) {
      const diff = (now.getDay() - wi + 7) % 7;
      return diff === 0 ? 7 : diff;
    }
    const m = t.match(/^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:,?\s+(\d{4}))?$/);
    if (!m) return null;
    const mon = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(m[1].slice(0, 3));
    const year = m[3] ? +m[3] : now.getFullYear();
    let d = new Date(year, mon, +m[2]);
    if (!m[3] && d > startOfToday) d = new Date(year - 1, mon, +m[2]);
    return Math.max(0, Math.round((startOfToday - d) / 86400000));
  }

  function parseChatText(text) {
    const TIME = '\\d{1,2}:\\d{2}\\s?(?:[AaPp]\\.?[Mm]\\.?)?';
    const headerOneLine = new RegExp('^(.+?)(?:\\s*[•·]\\s*|\\s+sent the following messages? at\\s+|\\s+)(' + TIME + ')$', 'i');
    const timeOnly = new RegExp('^[•·]?\\s*' + TIME + '$', 'i');
    const DATE_HEADING = DATE_HEADING_RE;
    const NOISE = /^(seen|sent|delivered|read)\b.*|^view .+ profile$|^(active now|online|typing\.*|send|gif|write a message…?|press enter to send\.?)$/i;

    const lines = text.split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const groups = [];
    let cur = null;
    let day = null; // days ago, from the latest date heading
    const start = sender => {
      if (cur && !cur.lines.length) {
        if (sameName(cur.sender, sender)) return; // screen-reader + visible header
        groups.pop();
      }
      cur = { sender, lines: [], day };
      groups.push(cur);
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (DATE_HEADING.test(line)) {
        day = daysAgoFromLabel(line);
        continue;
      }
      if (NOISE.test(line)) continue;

      const m = line.match(headerOneLine);
      if (m && /[•·]|sent the following|[ap]\.?m\.?$/i.test(line) && nameLike(m[1])) {
        start(nameLike(m[1]));
        continue;
      }
      if (timeOnly.test(line)) {
        // Name on the previous line, time on this one.
        const prev = lines[i - 1] || '';
        const nm = nameLike(prev);
        if (nm) {
          if (cur && cur.lines[cur.lines.length - 1] === prev) cur.lines.pop();
          start(nm);
        }
        continue;
      }
      if (!cur) continue; // header / profile card above the first message
      if (!cur.lines.length && sameName(line, cur.sender)) continue;
      cur.lines.push(line);
    }
    return groups.filter(g => g.lines.length).map(g => ({ sender: g.sender, text: g.lines.join('\n'), day: g.day }));
  }

  // Visible text of an element. innerText keeps paragraph breaks
  // ("review:\nhttps://…"), where textContent glues paragraphs together.
  // innerText is empty for hidden nodes, so fall back to textContent.
  function readText(el) {
    if (!el) return '';
    let t = el.innerText;
    if (!t || !t.trim()) t = el.textContent || '';
    return t.replace(/ /g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  // "Evan Farren (She/Her) • 1st" → "Evan Farren"
  function cleanPersonName(raw) {
    if (!raw) return '';
    return String(raw).split('\n')[0]
      .replace(/\(.*?\)/g, ' ')
      .replace(/[•·|].*$/, ' ')
      .replace(/\b(1st|2nd|3rd\+?)\b/gi, ' ')
      .replace(/[^\p{L}\p{M}\s'.-]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function firstNameOf(full) {
    const parts = cleanPersonName(full).split(' ').filter(Boolean);
    while (parts.length > 1 && /^(dr|mr|mrs|ms|miss|prof|sir)\.?$/i.test(parts[0])) parts.shift();
    return parts[0] || '';
  }

  // The signed-in user's name, from the global-nav avatar's alt text.
  function getMyName() {
    const strip = alt => cleanPersonName(String(alt || '').replace(/^(photo|picture|image) of\s+/i, ''));
    // In the messaging iframe the nav bar is in the top document.
    const top = topWindow();
    const docs = top ? [document, top.document] : [document];
    for (const doc of docs) {
      const img = doc.querySelector(
        'img.global-nav__me-photo, .global-nav__me img, img[class*="global-nav__me-photo"]'
      );
      const direct = img && strip(img.getAttribute('alt'));
      if (looksLikeRealName(direct)) return direct;
      // Layouts without those classes: the avatar in the "Me" nav item.
      for (const el of doc.querySelectorAll('header a, header button, nav a, nav button')) {
        if (!/^me\b/i.test((el.innerText || '').trim())) continue;
        const av = el.querySelector('img[alt]');
        const n = av && strip(av.getAttribute('alt'));
        if (looksLikeRealName(n) && !/^me$/i.test(n)) return n;
      }
    }
    return '';
  }

  function sameName(a, b) {
    const x = cleanPersonName(a).toLowerCase();
    const y = cleanPersonName(b).toLowerCase();
    if (!x || !y) return false;
    return x === y || x.startsWith(y + ' ') || y.startsWith(x + ' ');
  }

  function looksLikeRealName(s) {
    if (!s) return false;
    const t = s.trim();
    if (t.length < 2 || t.length > 60) return false;
    if (/^(messaging|inbox|new message|active now|online|you|linkedin member)$/i.test(t)) return false;
    return !/\d{3,}/.test(t);
  }

  // Containers to search for per-conversation details (header, headline):
  // the scope, then a few ancestors — the header is often a sibling of the
  // message list rather than inside it.
  function scopeAncestors(root) {
    const out = [];
    let cur = root;
    for (let i = 0; i < 4 && cur && cur !== document.body && cur !== document; i++) {
      out.push(cur);
      cur = cur.parentElement;
    }
    return out;
  }

  function scrapeConversation(scope, composer) {
    const messages = [];
    const root = (scope && scope.isConnected) ? scope : document;
    const myName = getMyName();
    // LinkedIn marks messages from the other person with --other on some
    // layouts; used when the sender name can't be compared.
    const hasOtherMarkers = !!root.querySelector('.msg-s-event-listitem--other');

    function whoIsIt(sender, itemEl) {
      if (myName && sender) return sameName(sender, myName);
      if (hasOtherMarkers && itemEl) {
        return !(itemEl.className || '').toString().includes('--other');
      }
      return null; // unknown
    }

    // ─── Strategy 1: message groups. Only the first message of a group
    // carries the sender's name, so carry it forward to the rest. ───
    let currentSender = '';
    let currentDay = null;
    root.querySelectorAll('li.msg-s-message-list__event').forEach(ev => {
      // Day heading ("TODAY", "SEP 24") at the top of this event, if any.
      for (const h of ev.querySelectorAll('.msg-s-message-list__time-heading, time')) {
        const d = daysAgoFromLabel(readText(h));
        if (d !== null) { currentDay = d; break; }
      }
      const nameEl = ev.querySelector('.msg-s-message-group__name, .msg-s-message-group__profile-link');
      if (nameEl) currentSender = cleanPersonName(readText(nameEl));
      ev.querySelectorAll('.msg-s-event-listitem').forEach(item => {
        const text = readText(item.querySelector('.msg-s-event-listitem__body, .msg-s-event__content'));
        if (!text) return;
        messages.push({ text, sender: currentSender || 'Unknown', isMe: whoIsIt(currentSender, item), day: currentDay });
      });
    });
    if (messages.length) log('Scraper: grouped events', messages.length);

    // ─── Strategy 1b: bare message items (layouts without list events) ───
    if (messages.length === 0) {
      root.querySelectorAll('.msg-s-event-listitem, div[class*="msg-s-event-listitem"]').forEach(item => {
        const text = readText(item.querySelector(
          '.msg-s-event-listitem__body, .msg-s-event__content, .msg-s-message-group__msg-body'
        ));
        if (!text) return;
        const nameEl = item.querySelector('.msg-s-message-group__name, .msg-s-message-group__profile-link');
        if (nameEl) currentSender = cleanPersonName(readText(nameEl));
        messages.push({ text, sender: currentSender || 'Unknown', isMe: whoIsIt(currentSender, item) });
      });
      if (messages.length) log('Scraper: bare items', messages.length);
    }

    // ─── Strategy 1c: read the open chat from its visible text. Works when
    // LinkedIn's message classes change: the pane is found by position
    // around the composer, messages by their "Name • time" headers. ───
    let pane = null;
    let paneTitle = '';
    let paneCompany = '';
    let paneDegree = '';
    let paneHeadline = '';
    if (messages.length === 0 && composer && composer.isConnected) {
      pane = paneFor(composer);
      if (pane) {
        let text = readText(pane);
        // Drop the composer + toolbar at the bottom (and any draft in it).
        let unit = composer.closest('[' + UNIT_ATTR + ']') || composer;
        const tail = readText(unit);
        const cut = tail ? text.lastIndexOf(tail) : -1;
        if (cut > 0) text = text.slice(0, cut);

        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        // The pane's first name-like line is the conversation title.
        paneTitle = lines.slice(0, 4).map(nameLike).find(n => n && !(myName && sameName(n, myName))) || '';
        const firstHeader = lines.findIndex(l => /\d{1,2}:\d{2}/.test(l));
        const intro = lines.slice(0, firstHeader > 0 ? firstHeader : 8);
        const co = intro.map(l => l.match(/(?:\s(?:at)\s|\s?@\s?)([^|,•·\n]{2,40})/i)).find(Boolean);
        if (co) paneCompany = co[1].trim().replace(/[.\s]+$/, '');
        // Profile card: "Name (She/Her) · 1st" then their headline.
        const degIdx = intro.findIndex(l => /[·•]\s*(1st|2nd|3rd\+?)\b/i.test(l));
        if (degIdx >= 0) {
          paneDegree = intro[degIdx].match(/[·•]\s*(1st|2nd|3rd\+?)\b/i)[1].toLowerCase();
          const next = intro[degIdx + 1];
          if (next && !nameLike(next) && !DATE_HEADING_RE.test(next)) paneHeadline = next;
        }

        for (const g of parseChatText(text)) {
          let isMe = null;
          if (myName) isMe = sameName(g.sender, myName);
          else if (paneTitle) isMe = !sameName(g.sender, paneTitle);
          messages.push({ text: g.text, sender: g.sender, isMe, day: g.day });
        }
        if (messages.length) log('Scraper: visible-text reader', messages.length, 'title:', paneTitle);
      }
    }

    // ─── Strategy 2: message list container, paragraph by paragraph ───
    if (messages.length === 0) {
      const containerSelectors = [
        '.msg-s-message-list-content',
        '.msg-s-message-list',
        'ul[class*="msg-s-message-list"]',
        'div[class*="msg-s-message-list"]',
        '.msg-overlay-conversation-bubble__content',
      ];
      let container = null;
      for (const sel of containerSelectors) {
        container = (root !== document && root.matches && root.matches(sel)) ? root : root.querySelector(sel);
        if (container) break;
      }
      if (container) {
        container.querySelectorAll('p, span[dir="ltr"]').forEach(p => {
          const text = readText(p);
          if (text.length <= 5 || /^\d{1,2}:\d{2}/.test(text)) return;
          if (['Sent', 'Delivered', 'Read', 'Seen', 'Typing...'].includes(text)) return;
          if (messages.some(m => m.text === text || m.text.includes(text) || text.includes(m.text))) return;
          messages.push({ text, sender: 'Unknown', isMe: null });
        });
        log('Scraper: container paragraphs', messages.length);
      }
    }

    // ─── Partner name ───
    // 1. The most recent sender in this conversation who isn't me — taken
    //    from the messages themselves, so it can't be another chat's name.
    let partnerName = '';
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.isMe === false && looksLikeRealName(m.sender) && m.sender !== 'Unknown') {
        partnerName = m.sender;
        break;
      }
    }

    // 2. This conversation's own header. Searched within the scope and a few
    //    ancestors only — never document-wide, which would pick up names
    //    from the inbox sidebar or other chat bubbles.
    const headerSelectors = [
      '.msg-overlay-bubble-header__title',
      'h2[class*="msg-overlay-bubble-header"]',
      '[class*="msg-overlay-bubble-header"] a',
      '.msg-thread__link-to-profile',
      '[class*="msg-thread__link-to-profile"]',
      '.msg-thread__title-text',
      '.msg-entity-lockup__entity-title',
      '[class*="msg-entity-lockup__entity-title"]',
      '[data-test-conversation-participant-names]',
    ];
    const containers = root !== document ? scopeAncestors(root) : [];
    if (!partnerName) {
      outer:
      for (const container of containers) {
        for (const sel of headerSelectors) {
          for (const el of container.querySelectorAll(sel)) {
            const name = cleanPersonName(readText(el));
            if (looksLikeRealName(name) && !(myName && sameName(name, myName))) {
              partnerName = name;
              break outer;
            }
          }
        }
      }
    }

    // 3. The title of the open chat pane.
    if (!partnerName && paneTitle) partnerName = paneTitle;

    // ─── Partner's company, from their headline ("… at Optum", "… @ AWS") ───
    let partnerCompany = paneCompany;
    const headlineSelectors = [
      '.msg-entity-lockup__entity-info',
      '.msg-thread__subtitle',
      '.msg-overlay-bubble-header__subtitle',
      '.msg-s-profile-card .artdeco-entity-lockup__subtitle',
    ];
    let partnerHeadline = paneHeadline;
    outerCo:
    for (const container of containers) {
      for (const sel of headlineSelectors) {
        const el = container.querySelector(sel);
        const line = el ? readText(el).split('\n')[0].trim() : '';
        if (!line) continue;
        if (!partnerHeadline) partnerHeadline = line;
        const m = line.match(/(?:\s(?:at)\s|\s?@\s?)([^|,•·\n]{2,40})/i);
        if (m && !partnerCompany) partnerCompany = m[1].trim().replace(/[.\s]+$/, '');
        if (partnerCompany) break outerCo;
      }
    }

    // Connection degree ("· 1st") from this conversation's header/profile card.
    let partnerDegree = paneDegree;
    if (!partnerDegree) {
      // Profile card first, then the thread's container, then the whole
      // conversation column around the composer.
      const sources = [];
      const card = root.querySelector && root.querySelector('.msg-s-profile-card');
      if (card) sources.push(card);
      if (containers.length) sources.push(containers[containers.length - 1]);
      const col = composer && composer.isConnected ? paneFor(composer) : null;
      if (col) sources.push(col);
      for (const el of sources) {
        const dm = readText(el).slice(0, 2000).match(/[·•]\s*(1st|2nd|3rd\+?)\b/i);
        if (dm) { partnerDegree = dm[1].toLowerCase(); break; }
      }
    }

    // ─── Whose turn is it? ───
    const senderKnown = messages.some(m => m.isMe !== null);
    let lastMessage = null;
    let lastFromMe = false;
    let myOpener = '';
    let myLatest = '';
    let myMessagesText = '';

    if (senderKnown) {
      const mine = messages.filter(m => m.isMe === true);
      myOpener = mine.length ? mine[0].text : '';
      myLatest = mine.length ? mine[mine.length - 1].text : '';
      myMessagesText = mine.map(m => m.text).join('\n');
      lastFromMe = messages.length > 0 && messages[messages.length - 1].isMe === true;

      // The partner's latest "turn": their consecutive messages, most
      // recent run. People often split one thought over several messages
      // ("Hello!" / "How can I help?"), so read them together.
      let end = messages.length - 1;
      while (end >= 0 && messages[end].isMe !== false) end--;
      if (end >= 0) {
        let start = end;
        while (start > 0 && messages[start - 1].isMe === false) start--;
        const run = messages.slice(start, end + 1);
        lastMessage = {
          text: run.map(m => m.text).join('\n'),
          sender: run[run.length - 1].sender,
          isMe: false,
        };
      }
    } else {
      // Sender unknown: use the most recent message that says something —
      // skipping trailing pleasantries like "Thanks!" when there's more.
      for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i];
        if (isTrivialMessage(m.text) && lastMessage) continue;
        lastMessage = m;
        if (!isTrivialMessage(m.text)) break;
      }
    }

    log('Scraped:', messages.length, 'messages; partner:', partnerName || '(unknown)',
      '; last from me:', lastFromMe);

    const mineAll = messages.filter(m => m.isMe === true);
    return {
      messages: messages.slice(-10),
      lastMessage,
      partnerName: partnerName || 'there',
      partnerCompany,
      partnerHeadline,
      partnerDegree,
      partnerReplied: messages.some(m => m.isMe === false),
      myCount: mineAll.length,
      // Days since my latest message (null if the date isn't shown).
      lastMineDaysAgo: mineAll.length ? (mineAll[mineAll.length - 1].day ?? null) : null,
      lastFromMe,
      myOpener,
      myLatest,
      myMessagesText,
    };
  }

  // Heuristic: is this message just a greeting, thanks, or filler?
  function isTrivialMessage(text) {
    if (!text) return true;
    const t = text.trim().toLowerCase();
    if (t.length < 12) return true;
    if (/^(hi|hello|hey|hiya|greetings|good (morning|afternoon|evening))\b[\s\S]{0,40}$/i.test(t)) return true;
    if (/^thanks? (for )?(reaching|connecting|the message|your message|getting in touch)/i.test(t)) return true;
    if (/^thank you (for )?(reaching|connecting|the message|your message|getting in touch|your time)/i.test(t)) return true;
    if (/^(nice|great|good|pleasure) to (meet|connect|hear)/i.test(t)) return true;
    // Emoji / thumbs-up style replies
    if (/^[\p{Extended_Pictographic}\s!?.]+$/u.test(t) && t.length < 30) return true;
    return false;
  }

  // ═══════════════════════════════════════════
  //  4. AI ENGINE — Context-Aware Response Generator
  //  Analyzes the actual conversation to craft relevant replies,
  //  not just template matching. Profiles set tone/goal only.
  // ═══════════════════════════════════════════
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  // Tones offered in the selector. Each maps onto the template banks
  // (friendly = the warm bank; direct = professional, trimmed to the facts).
  const TONES = { professional: 'Professional', friendly: 'Friendly', casual: 'Casual', direct: 'Direct' };
  const TONE_KEY = 'outreach_dm_tone';

  function bankFor(style, profile) {
    if (!style) return (profile && profile.tone) || 'professional';
    return { professional: 'professional', friendly: 'enthusiastic', casual: 'casual', direct: 'professional' }[style] || 'professional';
  }

  // Direct: keep the substance, drop the pleasantries.
  function makeDirect(body) {
    // ("Thanks for connecting" is the point of an accepted-invite message — keep it.)
    const soft = /^(thanks(?! for connecting)|thank you(?! for connecting)|appreciate|looking forward|happy to share|let me know if|shout if|glad)/i;
    const paras = body.split('\n\n')
      .map(p => splitSentences(p).filter(s => !soft.test(s)).join(' '))
      .filter(Boolean);
    return paras.length ? paras.join('\n\n') : body;
  }

  // opts.tone: selector tone (overrides the profile's); opts.details: my
  // details (CV link, notice period…) used to answer their questions.
  // opts.channel: 'linkedin' (default) or 'email'.
  function generateResponse(profile, conversation, opts = {}) {
    const meta = opts.meta || {};
    const channel = opts.channel === 'email' ? 'email' : 'linkedin';
    const d = opts.details || {};
    const partnerName = firstNameOf(conversation.partnerName) || 'there';
    const lastText = (conversation.lastMessage && conversation.lastMessage.text) || '';

    // Nothing to answer: automated notifications, newsletters, no-reply senders.
    if (!conversation.lastFromMe && (isAutomated(lastText) || conversation.noReplySender)) {
      meta.noReply = true;
      meta.intent = 'none';
      return '';
    }
    // Templates write English only; flag other languages rather than
    // replying in the wrong one.
    meta.language = detectNonEnglish(lastText);

    // Interview confirmed and now over, not yet thanked → the thank-you,
    // exactly as specified (no tone or other additions).
    const interview = findInterview(conversation.messages || []);
    if (interview && interview.past && !interview.thanked) {
      meta.intent = 'thankyou';
      const who = interview.interviewer || partnerName;
      return britishise(buildInterviewThankYou(who, interview.role, d.signOffName || 'Maxmilliam'));
    }
    const style = TONES[opts.tone] ? opts.tone : null;
    const tone = bankFor(style, profile);
    const goal = profile ? profile.description : 'Continue the conversation naturally';
    const lastMsg = conversation.lastMessage;
    const allMessages = conversation.messages || [];

    // ─── Analyze the conversation context ───
    const context = analyzeConversation(allMessages, lastMsg);
    context.partnerCompany = conversation.partnerCompany || '';
    context.myOpener = conversation.myOpener || '';
    context.myLatest = conversation.myLatest || '';
    context.myMessagesText = conversation.myMessagesText || '';
    context.details = d;
    context.style = style;
    context.channel = channel;
    // Their latest turn confirms an upcoming interview → confirm it back.
    if (interview && !interview.past && !conversation.lastFromMe && CONFIRM_CUE.test(lastText) && /\binterview/i.test(lastText)) {
      context.lastIntent = 'interviewConfirmed';
      context.interview = interview;
    }
    if (style === 'direct') context.matchLength = 's';
    // I sent the last message and they haven't replied: write a follow-up,
    // not a reply to their older message.
    context.partnerHeadline = conversation.partnerHeadline || '';
    context.partnerKey = conversation.partnerName || '';
    if (conversation.lastFromMe) {
      // They accepted my invite (my note is the only message, they're now a
      // 1st-degree connection, no reply yet): thank them and move forward —
      // never "bump" someone who just said yes.
      // If the page doesn't show the degree, a thread holding only my short
      // invite note (LinkedIn notes are ≤300 characters and mention
      // connecting) means they accepted it: the thread only appears then.
      const noteOnly = !conversation.partnerReplied && conversation.myCount === 1;
      const degree = conversation.partnerDegree;
      const inviteNote = (conversation.myLatest || '').length <= 300 && /\bconnect/i.test(conversation.myLatest || '');
      const accepted = noteOnly && (degree === '1st' || (!degree && inviteNote));
      context.lastIntent = accepted ? 'accepted' : 'awaiting';
      context.isFirstMessage = false;
      // A follow-up within a couple of days of my last message reads as spam.
      context.tooSoon = !accepted && conversation.lastMineDaysAgo !== null && conversation.lastMineDaysAgo < 3;
      // By email, if I sent the last message recently there's nothing to reply to.
      if (channel === 'email' && context.tooSoon) {
        meta.noReply = true;
        meta.intent = 'none';
        return '';
      }
    }
    meta.intent = context.lastIntent;
    meta.tooSoon = !!context.tooSoon;
    meta.lastMineDaysAgo = conversation.lastMineDaysAgo;

    // ─── Build a reply based on what was actually said ───
    let reply = buildContextualReply(context, partnerName, tone, goal, profile);

    // ─── Strip cliché corporate buzzwords ───
    reply = sanitizeCliches(reply);

    // ─── Final humanization pass (remove AI tells) ───
    reply = humanize(reply);

    // ─── British English throughout ───
    return britishise(reply);
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
      "(?:in case )?it got buried",
      "(?:in case )?it slipped through",
      "bumping this(?: up)?",
      "before it sinks",
      "just (?:a )?(?:quick )?ping",
      "circling back",
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
    text = text.replace(emojiRe, () => (++emojiSeen, '')); // plain text: no emojis
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
      // How much reply is warranted. 's' = one short sentence, 'm' = two
      // sentences, 'l' = three or more. Based on the partner's message
      // length and complexity so we mirror the conversation's tempo.
      matchLength: 's',
    };

    if (!lastMsg) return ctx;

    // Work out the target reply length from what the partner wrote.
    const raw = (lastMsg.text || '').trim();
    const words = raw ? raw.split(/\s+/).length : 0;
    const sentences = raw ? (raw.match(/[.!?]+/g) || []).length || 1 : 0;
    if (words >= 60 || sentences >= 4) ctx.matchLength = 'l';
    else if (words >= 20 || sentences >= 2) ctx.matchLength = 'm';
    else ctx.matchLength = 's';

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
      interest: ['interested', 'curious', 'tell me more', 'love to know', 'sounds good', 'sounds great', 'sounds interesting', 'sound interesting', 'keen to', 'would love'],
      rejection: ['not interested', 'no thanks', 'no thank you', 'not a good fit', 'not the right time', 'not right now',
        'not a good time', 'too busy', 'busy right now', 'busy at the moment', 'pass on this', "we're all set", 'not looking'],
      introduction: ['nice to meet', 'pleasure', 'connect', 'connecting', 'connected', 'connection', 'reaching out', 'great to connect', 'good to connect'],
      pricing: ['price', 'cost', 'pricing', 'budget', 'how much', 'investment', 'plan'],
      experience: ['experience', 'background', 'worked at', 'years', 'expertise'],
      followup: ['following up', 'checking in', 'any update', 'thoughts on', 'did you get'],
    };

    // Match keywords on word boundaries, not raw substrings — otherwise
    // "appreciate" trips the product keyword "app", "payroll" trips "role",
    // and so on, badly skewing topic/intent detection.
    const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const mentions = (haystack, kw) => new RegExp('\\b' + escapeRe(kw) + '\\b', 'i').test(haystack);
    for (const [topic, keywords] of Object.entries(topicKeywords)) {
      for (const kw of keywords) {
        if (mentions(text, kw)) {
          ctx.topics.push(topic);
          break;
        }
      }
    }

    // Detect intent. Substantive topics (a job, a product, scheduling, a
    // pricing question, etc.) take priority over opening pleasantries —
    // otherwise a message like "Thanks for getting back to me. Here's the
    // job description..." would be classified as a throwaway "thankful"
    // reply just because it opens with "Thanks". Gratitude / greeting /
    // introduction only win when the message is *only* a pleasantry.
    const substantiveTopics = ['job', 'meeting', 'product', 'collaboration', 'pricing', 'experience'];
    const hasSubstantive = ctx.topics.some(t => substantiveTopics.includes(t));

    // Everything they asked of me, in order (CV, notice period, …).
    ctx.requests = detectRequests(lastMsg.text);
    // Did they propose a time? ("I'm free Tuesday at 11am…")
    ctx.proposedSlot = extractProposedSlot(lastMsg.text);
    // Are they offering to help? ("How can I assist you?")
    ctx.offersHelp = /\bhow (?:can|may|could) i (?:help|assist|be of (?:help|assistance))\b|\bwhat can i do for you\b|\blet me know how i (?:can|could) help\b/i.test(lastMsg.text);
    const platform = lastMsg.text.match(/\b(Microsoft Teams|Teams|Zoom|Google Meet)\b/i);
    ctx.meetingPlatform = platform ? platform[1].replace(/^microsoft /i, '').replace(/^(\w)/, c => c.toUpperCase()) : '';
    ctx.partnerSendsLink = /\bi(?:'ll| will| can)\s+(?:share|send)\b[^.!?]{0,40}\b(?:link|invite|invitation)\b/i.test(lastMsg.text);
    ctx.sharedDetails = /https?:\/\/|\bjob description\b|\battached\b|\bsharing\b/i.test(lastMsg.text);

    // They'll send / follow up themselves ("I'll email you the details").
    ctx.theyWillSend = /(?:^|[.!?\n]\s*)(?:i|we)(?:'ll| will| can| shall)\s+(?:send|email|share|forward|get back|follow up|reach out|be in touch)\b/i.test(lastMsg.text);

    // "Tuesday, 22 August" when 22 August is a Wednesday → flag it first.
    ctx.mismatch = findWeekdayMismatch(lastMsg.text);

    if (ctx.mismatch) ctx.lastIntent = 'mismatch';
    else if (ctx.proposedSlot) ctx.lastIntent = 'scheduling';
    else if (ctx.topics.includes('rejection')) ctx.lastIntent = 'objection';
    else if (ctx.offersHelp) ctx.lastIntent = 'offer';
    else if (ctx.questions.length > 0) ctx.lastIntent = 'question';
    else if (ctx.topics.includes('followup')) ctx.lastIntent = 'followup';
    else if (ctx.topics.includes('interest')) ctx.lastIntent = 'positive';
    else if (hasSubstantive) ctx.lastIntent = 'statement'; // routed to buildGeneralReply, which picks the topic
    else if (ctx.topics.includes('gratitude')) ctx.lastIntent = 'thankful';
    else if (ctx.topics.includes('introduction')) ctx.lastIntent = 'greeting';
    else ctx.lastIntent = 'statement';
    // A plain "I'll send it over" with nothing else asked of me.
    if (ctx.theyWillSend && ['statement', 'thankful', 'greeting'].includes(ctx.lastIntent)) ctx.lastIntent = 'theyWillSend';

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
      casual: [`Hey ${name},`, `Hi ${name},`],
      enthusiastic: [`Hi ${name},`, `Hey ${name},`],
      witty: [`Hey ${name},`, `Hi ${name},`],
    };
    const styleGreetings = {
      professional: [`Hi ${name},`, `Hello ${name},`],
      friendly: [`Hi ${name}!`],
      casual: [`Hey ${name},`],
      direct: [`Hi ${name},`],
    };
    const greeting = pick((ctx.style && styleGreetings[ctx.style]) || greetings[tone] || greetings.professional);

    // If no conversation yet (cold outreach)
    if (ctx.isFirstMessage) {
      return buildColdOutreach(name, tone, goal, profile, ctx);
    }

    // Build reply based on detected intent
    let body = '';

    // They asked for specific things → answer each one (unless it's a no).
    const answerable = (ctx.requests || []).filter(r => r.type !== 'cvReceived');
    const keep = ['awaiting', 'objection', 'mismatch', 'interviewConfirmed', 'accepted'];
    const intent = (!keep.includes(ctx.lastIntent) && (answerable.length || isShortlistRequest((ctx.lastMessage && ctx.lastMessage.text) || '')))
      ? 'answer' : ctx.lastIntent;

    switch (intent) {
      case 'answer':
        body = buildAnswerReply(ctx, ctx.style || 'professional');
        break;
      case 'awaiting':
        body = buildNudgeReply(ctx, tone);
        break;
      case 'mismatch': {
        const mm = ctx.mismatch;
        const d = ctx.details || {};
        body = `Just to flag, ${mm.dateLabel} is a ${mm.actualLabel.split(' ')[0]}, not a ${mm.stated}. Did you mean ${mm.actualLabel} or ${mm.altLabel}?\n\nIf neither suits, I could also do:\n${proposeTimeOptions().join('\n')}`
          + (d.calendarLink ? `\n\nOr feel free to pick a slot here: ${d.calendarLink}` : '');
        break;
      }
      case 'interviewConfirmed': {
        const w = ctx.interview.when;
        body = `Thanks for confirming. Looking forward to speaking on ${ukDateLabel(w.y, w.m, w.d)} at ${quoteTime(w)}.`;
        break;
      }
      case 'accepted':
        body = buildAcceptedReply(ctx, ctx.style || (tone === 'casual' ? 'casual' : 'professional'));
        break;
      case 'theyWillSend':
        body = /get back|follow up|be in touch|reach out/i.test((ctx.lastMessage && ctx.lastMessage.text) || '')
          ? (tone === 'casual' ? 'Sounds good, speak soon.' : 'Sounds good, thanks. Speak soon.')
          : (tone === 'casual' ? "Sounds good, I'll keep an eye out for it." : "Sounds good, thanks. I'll keep an eye out for it.");
        break;
      case 'scheduling':
        body = buildSchedulingReply(ctx, tone);
        break;
      case 'offer':
        body = buildOfferReply(ctx, tone);
        break;
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

    if (ctx.style === 'direct') body = makeDirect(body);
    // Email gets a sign-off ("Maxmilliam", or "Best regards," when they're
    // formal); LinkedIn chat doesn't.
    const signOff = ctx.channel === 'email' ? '\n\n' + signOffFor(ctx, ctx.details || {}) : '';
    return greeting + '\n\n' + body + signOff;
  }

  // Find a time the partner proposed: "Tuesday at 11am", "Wednesday before
  // 12pm", "are you free Thursday?". Needs scheduling context nearby so a
  // passing mention ("I was at a conference on Tuesday") doesn't count.
  function extractProposedSlot(text) {
    if (!text) return null;
    const schedulingContext = /\b(availab\w*|free|works?|suit\w*|slot|call|meet\w*|chat|interview|catch up|calendar|schedul\w*|teams|zoom)\b/i;
    if (!schedulingContext.test(text)) return null;

    const DAY_WORDS = 'monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow';
    const DAY = '(' + DAY_WORDS + ')';
    const TIME = '(\\d{1,2}(?::\\d{2})?\\s?(?:am|pm)|noon|midday)';
    // The words between a day and its time may not contain another day:
    // "busy Tuesday but Wednesday at 2pm" must give Wednesday, not Tuesday.
    const GAP = '(?:(?!\\b(?:' + DAY_WORDS + ')\\b)[^.!?\\n]){0,25}?';
    const withTime = new RegExp('\\b' + DAY + '\\b' + GAP + '\\b(at|before|after|from|around)?\\s*' + TIME, 'gi');
    const cap = s => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
    // "I'm busy Tuesday", "can't do Thursday", "not free on Monday"
    const ruledOut = idx => /\b(not|busy|unavailable|can't|cannot|can not|except|out of office|ooo)\b[^.!?\n]{0,12}$/i
      .test(text.slice(Math.max(0, idx - 30), idx));

    // Prefer an exact "at <time>" slot over a "before/after" window.
    let best = null;
    let m;
    while ((m = withTime.exec(text))) {
      if (ruledOut(m.index)) continue;
      const prep = (m[2] || 'at').toLowerCase();
      const time = m[3].replace(/\s+/g, '').toLowerCase();
      const slot = { text: `${cap(m[1])} ${prep} ${time}`, hasTime: true, window: prep === 'before' || prep === 'after' };
      if (!slot.window) return slot;
      if (!best) best = slot;
    }
    if (best) return best;

    // A day on its own, when they're clearly asking about availability.
    const dayOnly = text.match(new RegExp('\\b(?:free|available|work for you|suit you)\\b[^.!?\\n]{0,20}\\b' + DAY + '\\b', 'i'))
      || text.match(new RegExp('\\b' + DAY + '\\b[^.!?\\n]{0,20}\\b(?:work|suit)s? (?:for )?you\\b', 'i'));
    if (dayOnly && !ruledOut(dayOnly.index + dayOnly[0].toLowerCase().lastIndexOf(dayOnly[1].toLowerCase()))
        && !/\b(not|n't)\b/i.test(dayOnly[0])) {
      return { text: cap(dayOnly[1]), hasTime: false, window: false };
    }
    return null;
  }

  // They proposed a time → accept it (the draft is always reviewed before
  // sending, so the user can swap the slot if it doesn't suit).
  function buildSchedulingReply(ctx, tone) {
    const slot = ctx.proposedSlot;
    const parts = [];

    if (ctx.sharedDetails) {
      parts.push(ctx.topics.includes('job') ? 'Thanks for sending the job description over.' : 'Thanks for sending that over.');
    }

    if (!slot.hasTime) {
      parts.push(`${slot.text} works for me. What time suits you?`);
      return parts.join(' ');
    }
    parts.push(slot.window
      ? `${slot.text} works for me, happy to fit in wherever suits you in that window.`
      : `${slot.text} works well for me.`);

    let closer;
    if (ctx.partnerSendsLink) {
      closer = ctx.meetingPlatform
        ? `Looking forward to it, I'll keep an eye out for the ${ctx.meetingPlatform} invite.`
        : `Looking forward to it, I'll keep an eye out for the invite.`;
    } else if (ctx.meetingPlatform) {
      closer = `Feel free to send the ${ctx.meetingPlatform} link whenever suits.`;
    } else {
      closer = tone === 'casual' ? 'Speak then.' : 'Looking forward to speaking then.';
    }
    return parts.join(' ') + '\n\n' + closer;
  }

  // What I said I'm looking for: "…looking for Backend or Platform
  // Engineering roles in Europe" → "Backend or Platform Engineering roles in Europe".
  function extractSeeking(text) {
    const m = (text || '').match(/\b(?:looking for|seeking|exploring|open to)\s+(?:new\s+)?([^.!?\n]{3,80}?\b(?:roles?|positions?|opportunities|jobs?)\b(?:\s+(?:in|across|within|at)\s+[A-Z][\w&.' -]{1,30}?(?=[.,!?\n]|$))?)/i);
    return m ? m[1].replace(/\s+/g, ' ').trim() : '';
  }

  // Why did I reach out? Read from my own messages (latest first, then my
  // opener), so "how can I help?" gets a real answer instead of a dodge.
  function specificPurpose(text) {
    const o = (text || '').toLowerCase();
    if (!o) return '';
    if (extractSeeking(text)) return 'whether there might be a fit for me on your team';
    if (/collaborat|partner(ship)?\b|work together/.test(o)) return 'whether there might be a way for us to collaborate';
    if (/\b(role|position|job|opening|opportunit\w*|hiring|vacanc\w*)\b/.test(o)) return 'whether there might be a fit for me on your team';
    if (/\b(advice|insight|perspective|learn|mentor\w*)\b/.test(o)) return "get your perspective on a couple of things I'm working on";
    return '';
  }

  function outreachPurpose(ctx) {
    return specificPurpose(ctx.myLatest) || specificPurpose(ctx.myOpener)
      || "whether there's a way we could help each other";
  }

  function buildOfferReply(ctx, tone) {
    const purpose = outreachPurpose(ctx);
    const where = ctx.partnerCompany ? ` at ${ctx.partnerCompany}` : '';
    const replies = {
      professional: `Thanks, appreciate that. I'd like to hear a bit more about what you're working on${where} and see ${purpose}.\n\nWould you be open to a quick 15-minute call this week?`,
      casual: `Thanks, appreciate it. Mostly keen to hear what you're working on${where} and see ${purpose}. Up for a quick call this week?`,
      enthusiastic: `Thanks, really appreciate that. I'd like to hear more about what you're working on${where} and see ${purpose}.\n\nWould a quick 15-minute call this week work?`,
      witty: `Appreciate the offer. Short version: I'd like to hear what you're working on${where} and see ${purpose}. Got 15 minutes this week?`,
    };
    return replies[tone] || replies.professional;
  }

  // "Leading EMEA&LATAM Strategy and Operations at LinkedIn" →
  // "your work leading EMEA&LATAM Strategy and Operations at LinkedIn"
  function headlinePhrase(headline, company) {
    let h = String(headline || '').split(/\s[|•·]\s|\|/)[0].trim();
    h = h.replace(/\s+(?:at|@)\s+.*$/i, '').trim();
    if (!h || h.length > 70) return '';
    const at = company ? ` at ${company}` : '';
    // "Leading EMEA strategy" is something they do; "Engineering Manager" is a
    // job title even though it starts with -ing.
    const [w1, w2 = ''] = h.split(/\s+/);
    const VERBS = /^(leading|building|helping|driving|scaling|connecting|hiring|recruiting|managing|running|growing|empowering|supporting|designing|creating|making|bringing|shaping|transforming|delivering|developing|partnering|championing|enabling|advising|coaching|investing|founding)$/i;
    const TITLE_WORD = /^(manager|lead|partner|director|engineer|specialist|coordinator|consultant|officer|associate|executive|analyst|advisor|adviser|head|recruiter|team)$/i;
    if (VERBS.test(w1) && !TITLE_WORD.test(w2)) return `your work ${h.charAt(0).toLowerCase() + h.slice(1)}${at}`;
    return `your work as ${/^[aeiou]/i.test(h) ? 'an' : 'a'} ${h}${at}`;
  }

  // They accepted my connection request: thank them, say why, suggest a chat.
  function buildAcceptedReply(ctx, style) {
    const about = headlinePhrase(ctx.partnerHeadline, ctx.partnerCompany)
      || (ctx.partnerCompany ? `what you're working on at ${ctx.partnerCompany}` : "what you're working on at the moment");
    const purpose = outreachPurpose(ctx);
    const replies = {
      professional: `Thanks for connecting. I'd like to hear more about ${about} and see ${purpose}.\n\nWould you be open to a quick 15-minute call sometime in the next couple of weeks?`,
      friendly: `Thanks for connecting, glad we did! I'd like to hear more about ${about} and see ${purpose}.\n\nWould a quick call sometime in the next couple of weeks work for you?`,
      casual: `Thanks for connecting! Keen to hear more about ${about} and see ${purpose}. Up for a quick chat sometime?`,
      direct: `Thanks for connecting. I'd like to hear more about ${about} and see ${purpose}. Open to a 15-minute call?`,
    };
    return replies[style] || replies.professional;
  }

  // I sent the last message and haven't heard back.
  // Different people get different wording; clicking again for the same
  // person moves to the next version.
  const variantClicks = new Map();
  function variantFor(key, n) {
    let h = 0;
    for (const c of String(key || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const k = String(key || '');
    const clicks = variantClicks.get(k) || 0;
    variantClicks.set(k, clicks + 1);
    return n ? (h + clicks) % n : 0;
  }

  // I sent the last message and they haven't replied (a few days on).
  // Professional, specific to what I actually asked for, and varied.
  function buildNudgeReply(ctx, tone) {
    const seeking = extractSeeking(ctx.myMessagesText);
    const company = ctx.partnerCompany;
    const about = headlinePhrase(ctx.partnerHeadline, company) || (company ? `your work at ${company}` : '');
    const purpose = specificPurpose(ctx.myLatest) || specificPurpose(ctx.myOpener);
    const short = tone === 'casual' || ctx.style === 'direct';
    let options;

    if (seeking) {
      options = short ? [
        `Following up on my last message. If you're recruiting for ${seeking}, I'd be keen to chat.`,
        `A quick follow-up: I'm exploring ${seeking}. If anything on your side fits, I'd be glad to talk.`,
      ] : [
        `I wanted to follow up on my earlier message. I'm currently exploring ${seeking}, and I'd welcome a brief conversation if you're recruiting for anything similar.`,
        `Following up on my previous message: if you have any openings in ${seeking.replace(/\broles?\b|\bpositions?\b|\bopportunities\b|\bjobs?\b/i, '').replace(/\s+/g, ' ').trim()}, I'd be glad to share more about my background.`,
        `I appreciate you're busy, so I'll keep this brief. I'm exploring ${seeking} and would value a short conversation if there's a potential fit on your side.`,
      ].concat(company ? [`I wanted to follow up on my earlier note. If ${company} is hiring for ${seeking}, I'd be glad to discuss how my experience could help.`] : []);
    } else if (/collaborate/.test(purpose || '')) {
      const topic = about || 'your work';
      options = short ? [
        `Following up on my last message. Open to a short chat about ${topic}?`,
        `A quick follow-up: I'd still like to hear more about ${topic} and see if there's scope to work together.`,
      ] : [
        `I wanted to follow up on my earlier message. I'd welcome the chance to learn more about ${topic} and explore whether there's scope to collaborate.`,
        `Following up on my previous note: I'd value a short conversation about ${topic} if you're open to it.`,
        `I appreciate your time is limited, so I'll keep this brief. Would you be open to a 15-minute conversation about ${topic} in the coming weeks?`,
      ];
    } else {
      options = short ? [
        'Following up on my last message. Happy to find a time that suits you.',
        'A quick follow-up on my last message, in case a short chat would be useful.',
      ] : [
        "I wanted to follow up on my earlier message in case it's of interest. Happy to find a time that suits you.",
        "Following up on my previous note. If a short conversation would be useful, I'd be glad to arrange one at a time that suits you.",
        "I appreciate you're busy, so I'll keep this brief. Would you be open to a short conversation in the coming weeks?",
      ];
    }
    return options[variantFor('nudge:' + (ctx.partnerKey || ''), options.length)];
  }


  // ═══════════════════════════════════════════
  //  ANSWER ENGINE — reply to what they actually asked
  //  Every question / request in their latest turn gets its own answer, in
  //  order, using the user's real details. Unknown facts are never made up:
  //  we ask back, or leave a visible [placeholder] that blocks Insert & Send.
  // ═══════════════════════════════════════════

  // Facts about me pulled from my own past messages: links I've shared,
  // my email, what I said I'm looking for.
  function extractDetailsFromText(text) {
    const d = {};
    if (!text) return d;
    const email = text.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/);
    if (email) d.email = email[0];
    const URL_RE = /https?:\/\/[\w\-.~:/?#[\]@!$&'()*+,;=%]+/;
    for (const line of text.split('\n')) {
      const url = line.match(URL_RE);
      if (!url) continue;
      const u = url[0].replace(/[.,;:!?)\]]+$/, '');
      if (!d.cvLink && /\b(resume|résumé|cv|curriculum)\b/i.test(line + ' ' + u)) d.cvLink = u;
      else if (!d.calendarLink && /(calendly|cal\.com|tidycal|schedul|book|let'?s chat|meeting|calendar)/i.test(line + ' ' + u)) d.calendarLink = u;
    }
    const phone = text.match(/(?:phone|mobile|tel|whatsapp|📞|📱)[:\s]*([+\d][\d\s().-]{7,}\d)/i);
    if (phone) d.phone = phone[1].trim();
    const role = text.match(/\bI(?:'m| am) an? ((?:[A-Z][\w+#/-]*\s){0,4}(?:Engineer|Developer|Architect|Manager|Designer|Scientist|Analyst|Consultant|Lead|Director|Specialist))\b/);
    if (role) d.currentRole = role[1].trim();
    const seeking = extractSeeking(text);
    if (seeking) d.lookingFor = seeking;
    const years = text.match(/\b(\d{1,2})\+?\s+years(?: of)?(?: [a-z]+)? experience/i);
    if (years) d.years = years[1];
    return d;
  }

  function splitSentences(text) {
    return String(text || '')
      .split(/\n+/)
      .flatMap(line => line.split(/(?<=[.!?])\s+/))
      .map(s => s.trim())
      .filter(Boolean);
  }

  // A sentence that asks something of me (vs. one that just states a fact).
  const ASK_CUE = /\?|\b(could|can|would|will) you\b|\bplease\b|\b(send|share|forward|provide|let me know|tell me|confirm)\b|\bwhat('s| is| are)\b|\bdo you\b|\bare you\b|\bhave you\b|\bwhen\b|\bwhere\b|\bhow (much|soon|long)\b/i;
  // Their own plans ("I'll email you the details") are not requests.
  const OWN_ACTION = /^(i|we)(?:'ll| will| can| have| am|'m| would| shall)\b/i;

  const REQUEST_TYPES = [
    ['cvReceived', /\b(thanks for|received|got|reviewed|looked (?:at|over)|read|went through)\b[^.?!]{0,25}\b(cv|resume|résumé)\b/i, false],
    ['cv', /\b(cv|resume|résumé)\b/i, true],
    ['email', /\be-?mail(?: address)?\b/i, true],
    ['phone', /\b(?:phone|mobile|contact) (?:number|no\.?)\b|\bnumber (?:to|i can) (?:call|reach)\b|\bcall you on\b/i, true],
    ['salary', /\b(salary|compensation|comp expectations?|package|day rate|hourly rate|rate expectations?|pay expectations?|expected (?:salary|pay|rate))\b/i, true],
    ['notice', /\b(notice period|(?:your|the) notice|how much notice|notice (?:do|would) you (?:need to )?give|when (?:could|can|would) you (?:start|join)|start date|available to (?:start|join)|earliest (?:start|you could start))\b/i, true],
    ['rtw', /\b(right to work|work permit|visa|sponsor(?:ship)?|authori[sz]ed to work|work authori[sz]ation|eligible to work)\b/i, true],
    ['relocate', /\brelocat\w*/i, true],
    ['location', /\b(remote|hybrid|on-?site|in the office|office days|where are you (?:based|located)|based (?:in|out of)|(?:current )?location|commut\w*)\b/i, true],
    ['interviewFormat', /\b(face[- ]to[- ]face|telephone interview|phone interview|video interview|interview format|in[- ]person interview)\b/i, true],
    ['offers', /\b(other offers?|offers? in hand|interviews? in hand|other (?:processes|interviews)|in the pipeline|interviewing elsewhere)\b/i, true],
    ['interviewAvailability', /\b(availability for (?:an? )?interview|available (?:for|to) (?:an? )?interview|interview availability)\b/i, true],
    ['timeOptions', /\b(?:suggest|propose|send|share|give me|provide)\b[^.?!]{0,25}\b(?:times?|dates?|slots?)\b|\bwhat (?:dates?|times?|days?) (?:would |could )?(?:work|suit|are good)|\b(?:dates?|times?|slots?) that (?:work|suit)/i, true],
    ['availability', /\b(when (?:are|would) you (?:be )?(?:free|available)|your availability|good time (?:for|to)|what time works|free for a (?:quick )?(?:call|chat)|available for a (?:quick )?(?:call|chat)|(?:schedule|set up|arrange|book) a (?:quick )?(?:call|chat|time|meeting)|(?:jump|hop) on a (?:quick )?call)\b/i, true],
    ['experience', /\b(experience (?:with|in)|worked with|familiar with|background in|hands-on with)\b/i, true],
    ['interest', /\b(interested in|open to|would you consider|keen on)\b[^.?!]{0,40}\b(role|position|opportunit\w*|job|move|change)\b|\bare you (?:still )?(?:looking|open to new|interested)\b/i, true],
  ];

  // [{ type, sentence }] in the order they were asked, one per type.
  function detectRequests(text) {
    const out = [];
    const seen = new Set();
    for (const sentence of splitSentences(text)) {
      const asking = ASK_CUE.test(sentence) && !OWN_ACTION.test(sentence);
      for (const [type, re, needsAsk] of REQUEST_TYPES) {
        if (seen.has(type) || !re.test(sentence) || (needsAsk && !asking)) continue;
        // "Thanks for your CV" is not a request to send it.
        if (type === 'cv' && seen.has('cvReceived')) continue;
        seen.add(type);
        out.push({ type, sentence });
      }
    }
    return out;
  }

  // Tech named in their question that I've mentioned myself.
  function sharedTech(sentence, myText) {
    const stop = /^(do|does|did|you|your|have|has|any|with|in|and|or|the|a|an|experience|worked|familiar|background|hands|on|what|how|much|are|is|we|our|i|my|also|really|years?|of|for|to|using|use)$/i;
    const words = (sentence.match(/[A-Za-z][\w+#.]*[\w+#]/g) || []).filter(w => !stop.test(w));
    const hits = [];
    for (const w of words) {
      const re = new RegExp('(^|[^\\w])' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\w])', 'i');
      if (re.test(myText) && !hits.some(h => h.toLowerCase() === w.toLowerCase())) hits.push(w);
    }
    return hits;
  }

  // Tools/tech named after "experience with …": capitalised or tech-looking words.
  function askedTech(sentence) {
    const m = String(sentence).match(/\b(?:experience (?:with|in)|worked with|familiar with|background in|hands-on with)\b([^?.!]*)/i);
    const tail = m ? m[1] : '';
    const stop = /^(and|or|the|a|an|any|some|of|in|with|at|for|to|you|your|it|them|both|also|other|similar|tools?|stack|technolog\w*|frameworks?)$/i;
    return (tail.match(/[A-Za-z][\w+#.]*[\w+#]|[A-Za-z]/g) || [])
      .filter(w => !stop.test(w) && (/^[A-Z]/.test(w) || /[\d+#]/.test(w) || /(js|sql|db|ops)$/i.test(w)))
      .filter((w, i, arr) => arr.findIndex(x => x.toLowerCase() === w.toLowerCase()) === i);
  }

  const asSentence = s => {
    const t = String(s || '').trim();
    if (!t) return '';
    const cap = t.charAt(0).toUpperCase() + t.slice(1);
    return /[.!?]$/.test(cap) ? cap : cap + '.';
  };

  function joinList(items) {
    if (items.length <= 1) return items.join('');
    return items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
  }

  // One answer per request. Returns { text, asksBack }.
  function locationSentence(d) {
    if (!d.location) return 'I am currently located in [insert current location].';
    return /^i\b/i.test(d.location) ? asSentence(d.location) : `I am currently located in ${d.location}.`;
  }

  // One answer per request, from my details. Unknown facts get a plausible,
  // non-disqualifying answer or a polite deferral — never an invented fact.
  function answerRequest(req, ctx, d) {
    const myText = [ctx.myMessagesText, d.currentRole, d.lookingFor].filter(Boolean).join('\n');
    switch (req.type) {
      case 'cvReceived':
        return { text: 'Glad it came through.' };
      case 'cv':
        return { text: d.cvLink ? `Here is my CV: ${d.cvLink}` : "I'll send my CV over shortly." };
      case 'email':
        return { text: d.email ? `My email is ${d.email}.` : "I'll send my email address over shortly." };
      case 'phone':
        if (d.phone) return { text: `You can reach me on ${d.phone}.` };
        return { text: d.email ? `The best way to reach me is by email at ${d.email}.` : "Happy to share my number once we've arranged a call." };
      case 'salary':
        return d.salary
          ? { text: `My expected salary is ${d.salary}.` }
          : { text: "On compensation, I'd rather hear the budgeted range for the role first. What range are you working with?", asksBack: true };
      case 'notice': {
        const n = (d.notice || '').trim();
        if (!n) return { text: 'I can be flexible on my start date.' };
        if (/^(immediate|now|available now|asap|straight away)/i.test(n)) return { text: 'I can start immediately.' };
        return { text: /\b(notice|start|available)\b/i.test(n) ? asSentence(n) : `I am available to start after my notice period of ${n}.` };
      }
      case 'rtw':
        return { text: d.rightToWork ? asSentence(d.rightToWork) : 'I have the right to work, and happy to share details.' };
      case 'location':
        return { text: locationSentence(d) };
      case 'relocate':
        return { text: /\bcontract\b/i.test(req.sentence) && d.relocateContract ? asSentence(d.relocateContract) : asSentence(d.relocate || 'Yes, I am willing to relocate.') };
      case 'interviewFormat':
        return { text: asSentence(d.interviewFormat || 'Yes, I am happy to attend both face-to-face and telephone interviews.') };
      case 'offers':
        return { text: asSentence(d.offers || 'I currently do not have any other offers or interviews in hand.') };
      case 'interviewAvailability':
        return { text: asSentence(d.interviewAvailability || 'I am available to attend interviews at your convenience.') };
      case 'availability':
        return d.calendarLink
          ? { text: `Here is my booking link, feel free to pick any slot that suits: ${d.calendarLink}` }
          : { text: timeOptionsText(d) };
      case 'timeOptions':
        return { text: timeOptionsText(d) };
      case 'experience': {
        // Confirm what I've mentioned myself; for the rest, a plausible,
        // non-disqualifying answer (never a claimed specific).
        const asked = askedTech(req.sentence);
        const known = sharedTech(req.sentence, myText).filter(t => asked.some(a => a.toLowerCase() === t.toLowerCase()));
        const unknown = asked.filter(a => !known.some(k => k.toLowerCase() === a.toLowerCase()));
        const out = [];
        if (known.length) {
          const yrs = d.years ? `, with ${d.years} years of experience overall` : '';
          out.push(`Yes, I've worked with ${joinList(known)}${yrs}.`);
        }
        if (unknown.length) out.push(`I pick up new tools quickly, so ${joinList(unknown)} wouldn't be a problem.`);
        return { text: out.join(' ') || "Yes, and I'm happy to go into specifics on a call." };
      }
      case 'interest':
        return (d.lookingFor)
          ? { text: `Yes, I'm open to it. It sounds in line with the ${d.lookingFor} I'm looking for.` }
          : { text: "Yes, I'm open to hearing more." };
      default:
        return { text: '' };
    }
  }

  // Answer each request in order (or the full shortlisting block), then
  // accept a proposed time if there was one. No filler closers.
  function buildAnswerReply(ctx, style) {
    const d = ctx.details || {};
    const theirs = (ctx.lastMessage && ctx.lastMessage.text) || '';
    if (isShortlistRequest(theirs)) return buildShortlistReply(d);

    const parts = [];
    if (ctx.sharedDetails) {
      parts.push(ctx.topics.includes('job') ? 'Thanks for sending the job description over.' : 'Thanks for sending that over.');
    }

    const types = ctx.requests.map(r => r.type);
    const answers = [];
    for (const req of ctx.requests) {
      // A proposed time covers "when are you free"; explicit time options
      // already include the booking link.
      if (req.type === 'availability' && (ctx.proposedSlot || types.includes('timeOptions'))) continue;
      const a = answerRequest(req, ctx, d);
      if (a.text) answers.push(a.text);
    }
    // Several answers read best one per line (and a link never runs into
    // the next sentence); a single answer stays inline.
    const answerText = answers.join(answers.length > 1 ? '\n' : ' ');
    let body = parts.length
      ? parts.join(' ') + (answerText ? (answers.length > 1 ? '\n\n' : ' ') + answerText : '')
      : answerText;
    if (ctx.proposedSlot) {
      const sched = buildSchedulingReply({ ...ctx, sharedDetails: false }, style === 'casual' ? 'casual' : 'professional');
      body = body ? body + '\n' + sched : sched;
    } else if (types.includes('interest') && !types.includes('availability') && !types.includes('timeOptions') && style !== 'direct') {
      body += '\n\nHappy to jump on a call to go through it.';
    }
    return body;
  }


  // Reviewer-facing gaps in a draft ("[notice period]") — Insert & Send
  // refuses to send until they're filled in.
  function findPlaceholders(text) {
    return (String(text || '').match(/\[[^\]\n]{2,140}\]/g) || []);
  }

  // ═══════════════════════════════════════════
  //  MAXMILLIAM'S REPLY RULES
  //  British English, plain text, sign-off, UK-time scheduling, automatic
  //  post-interview thank-you, and the standard CV shortlisting answers.
  // ═══════════════════════════════════════════

  // ─── UK time (BST in summer, GMT otherwise) ───
  function londonOffsetMin(date) {
    try {
      const tz = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', timeZoneName: 'short' })
        .formatToParts(date).find(p => p.type === 'timeZoneName').value;
      return /BST|GMT\+1|UTC\+1/.test(tz) ? 60 : 0;
    } catch (e) {
      return 0;
    }
  }
  const ukLabel = date => (londonOffsetMin(date) ? 'BST' : 'GMT');

  // Calendar fields of an instant, as seen in the UK.
  function ukParts(date) {
    const d = new Date(date.getTime() + londonOffsetMin(date) * 60000);
    return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), dow: d.getUTCDay(), h: d.getUTCHours(), min: d.getUTCMinutes() };
  }

  // The instant for a UK wall-clock time.
  function ukInstant(y, m, d, h, min) {
    const guess = new Date(Date.UTC(y, m, d, h, min));
    return new Date(guess.getTime() - londonOffsetMin(guess) * 60000);
  }

  const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
  const monthIndex = s => ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(String(s).slice(0, 3).toLowerCase());
  const pad2 = n => String(n).padStart(2, '0');

  // "Monday 29 September"
  function ukDateLabel(y, m, d) {
    const dow = new Date(Date.UTC(y, m, d)).getUTCDay();
    return `${DOW[dow]} ${d} ${MONTHS[m]}`;
  }

  // Three options, Monday–Friday, 12:00–18:00 UK time, 2–3 days from today
  // (never today, never a weekend; if those days fall on a weekend, the
  // next weekdays).
  function proposeTimeOptions(now = new Date()) {
    const t = ukParts(now);
    const days = [];
    for (let off = 2; days.length < 2 && off < 10; off++) {
      const dt = new Date(Date.UTC(t.y, t.m, t.d + off));
      const dow = dt.getUTCDay();
      if (dow === 0 || dow === 6) continue;
      days.push({ y: dt.getUTCFullYear(), m: dt.getUTCMonth(), d: dt.getUTCDate() });
    }
    const slots = [[days[0], 12], [days[0], 15], [days[1], 14]];
    return slots.map(([day, h]) => {
      const inst = ukInstant(day.y, day.m, day.d, h, 0);
      return `${ukDateLabel(day.y, day.m, day.d)} at ${pad2(h)}:00 ${ukLabel(inst)}`;
    });
  }

  function timeOptionsText(d) {
    const link = d.calendarLink ? `\n\nAlternatively, feel free to pick a slot here: ${d.calendarLink}` : '';
    return 'I could do any of the following:\n' + proposeTimeOptions().join('\n') + link;
  }

  // "Tuesday, 22 August" when 22 August is a Wednesday.
  function findWeekdayMismatch(text, now = new Date()) {
    const DAY = '(monday|tuesday|wednesday|thursday|friday|saturday|sunday)';
    const ORD = '(\\d{1,2})(?:st|nd|rd|th)?';
    const patterns = [
      new RegExp('\\b' + DAY + ',?\\s+(?:the\\s+)?' + ORD + '\\s+(?:of\\s+)?' + MONTH_RE + '\\b(?:,?\\s+(\\d{4}))?', 'i'),
      new RegExp('\\b' + DAY + ',?\\s+' + MONTH_RE + '\\s+' + ORD + '\\b(?:,?\\s+(\\d{4}))?', 'i'),
    ];
    const t = ukParts(now);
    for (let i = 0; i < patterns.length; i++) {
      const m = String(text || '').match(patterns[i]);
      if (!m) continue;
      const stated = DOW.findIndex(x => x.toLowerCase() === m[1].toLowerCase());
      const day = +(i === 0 ? m[2] : m[3]);
      const mon = monthIndex(i === 0 ? m[3] : m[2]);
      let year = m[4] ? +m[4] : t.y;
      // No year given and the date is well in the past → they mean next year.
      if (!m[4] && Date.UTC(year, mon, day) < Date.UTC(t.y, t.m, t.d) - 30 * 86400000) year++;
      const actual = new Date(Date.UTC(year, mon, day)).getUTCDay();
      if (actual === stated) return null;
      // The stated weekday in that same week, for "did you mean…".
      let alt = new Date(Date.UTC(year, mon, day + (stated - actual)));
      if (alt.getTime() < Date.UTC(t.y, t.m, t.d)) alt = new Date(alt.getTime() + 7 * 86400000);
      return {
        stated: DOW[stated],
        dateLabel: `${day} ${MONTHS[mon]}`,
        actualLabel: ukDateLabel(year, mon, day),
        altLabel: ukDateLabel(alt.getUTCFullYear(), alt.getUTCMonth(), alt.getUTCDate()),
      };
    }
    return null;
  }

  // ─── Interview confirmation + automatic thank-you ───
  const ZONES = { bst: 60, gmt: 0, utc: 0, cet: 60, cest: 120, eet: 120, eest: 180, est: -300, edt: -240, cst: -360, cdt: -300, pst: -480, pdt: -420, ist: 330 };

  // US daylight saving: second Sunday of March to first Sunday of November.
  function usDaylight(date) {
    const y = date.getUTCFullYear();
    const nthSunday = (mon, n) => {
      const first = new Date(Date.UTC(y, mon, 1)).getUTCDay();
      return Date.UTC(y, mon, 1 + ((7 - first) % 7) + (n - 1) * 7);
    };
    const t = date.getTime();
    return t >= nthSunday(2, 2) && t < nthSunday(10, 1);
  }

  // Parse the interview time from a confirmation message.
  // msgDate: the message's own UK date {y, m, d}, for "Tuesday" / "tomorrow".
  function parseInterviewTime(text, msgDate) {
    const s = String(text || '');
    let y = msgDate.y, m = msgDate.m, d = msgDate.d, found = false;

    const explicit = s.match(new RegExp('\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?' + MONTH_RE + '\\b(?:,?\\s+(\\d{4}))?', 'i'))
      || s.match(new RegExp('\\b' + MONTH_RE + '\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(\\d{4}))?', 'i'));
    if (explicit) {
      const dayFirst = /^\d/.test(explicit[1]);
      d = +(dayFirst ? explicit[1] : explicit[2]);
      m = monthIndex(dayFirst ? explicit[2] : explicit[1]);
      y = explicit[3] ? +explicit[3] : msgDate.y;
      if (!explicit[3] && Date.UTC(y, m, d) < Date.UTC(msgDate.y, msgDate.m, msgDate.d) - 30 * 86400000) y++;
      found = true;
    } else if (/\btomorrow\b/i.test(s)) {
      const dt = new Date(Date.UTC(msgDate.y, msgDate.m, msgDate.d + 1));
      y = dt.getUTCFullYear(); m = dt.getUTCMonth(); d = dt.getUTCDate(); found = true;
    } else if (/\btoday\b/i.test(s)) {
      found = true;
    } else {
      const wd = s.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
      if (wd) {
        const target = DOW.findIndex(x => x.toLowerCase() === wd[1].toLowerCase());
        const base = new Date(Date.UTC(msgDate.y, msgDate.m, msgDate.d));
        const add = (target - base.getUTCDay() + 7) % 7;
        const dt = new Date(Date.UTC(msgDate.y, msgDate.m, msgDate.d + add));
        y = dt.getUTCFullYear(); m = dt.getUTCMonth(); d = dt.getUTCDate(); found = true;
      }
    }
    if (!found) return null;

    // Start time: "11:00", "2:30 pm", "11am", "at 11". A bare number only
    // counts after "at"/"from", so "1 to 2 interviewers" isn't a time.
    const to24 = (h, ap, bare) => {
      h = +h;
      if (/pm/i.test(ap || '') && h < 12) h += 12;
      else if (/am/i.test(ap || '') && h === 12) h = 0;
      else if (!ap && bare && h >= 1 && h <= 7) h += 12; // "at 3" in business hours = 15:00
      return h;
    };
    const cand = /(?:\b(at|from|@)\s*)?\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?(?![\d:])/gi;
    let start = null;
    let c;
    while ((c = cand.exec(s))) {
      if (!(c[3] || c[4] || c[1])) continue;
      if (+c[2] > 23 || (c[3] && +c[3] > 59)) continue;
      start = { h: to24(c[2], c[4], !c[3] && !c[4]), min: +(c[3] || 0), end: cand.lastIndex, ap: c[4] };
      break;
    }
    if (!start) return null;
    const sh = start.h;
    const smin = start.min;
    let durationMin = 30;
    const endM = s.slice(start.end).match(/^\s*(?:-|–|to|until|till)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (endM) {
      const eh = to24(endM[1], endM[3] || start.ap, !endM[2] && !endM[3] && !start.ap);
      const diff = (eh * 60 + +(endM[2] || 0)) - (sh * 60 + smin);
      if (diff > 0 && diff <= 8 * 60) durationMin = diff;
    } else {
      const dur = s.match(/\b(\d{1,3})\s*(?:-\s*)?min(?:ute)?s?\b/i) || s.match(/\b(an|one|1|two|2)\s*(?:-\s*)?hours?\b/i);
      if (dur) durationMin = /min/i.test(dur[0]) ? +dur[1] : (/(two|2)/i.test(dur[1]) ? 120 : 60);
    }

    // Stated timezone, else UK time.
    const zm = s.match(/\b(BST|GMT|UTC|CET|CEST|EET|EEST|EST|EDT|CST|CDT|PST|PDT)\b(?:\s*([+-]\d{1,2}))?/i);
    let startAt;
    let zoneLabel;
    if (zm) {
      // People write "CET"/"EST" all year; in summer they mean CEST/EDT.
      const z = zm[1].toLowerCase();
      const probe = new Date(Date.UTC(y, m, d, 12));
      let off = ZONES[z] + (zm[2] ? +zm[2] * 60 : 0);
      if ((z === 'cet' || z === 'eet') && londonOffsetMin(probe)) off += 60;
      if (['est', 'cst', 'pst'].includes(z) && usDaylight(probe)) off += 60;
      startAt = new Date(Date.UTC(y, m, d, sh, smin) - off * 60000);
      zoneLabel = zm[1].toUpperCase();
    } else {
      startAt = ukInstant(y, m, d, sh, smin);
      zoneLabel = ukLabel(startAt);
    }
    return { start: startAt, end: new Date(startAt.getTime() + durationMin * 60000), y, m, d, h: sh, min: smin, zoneLabel, explicitZone: !!zm };
  }

  const CONFIRM_CUE = /confirmed for your interview|your interview (?:is|has been) (?:scheduled|confirmed|booked|set)|interview (?:is|has been) (?:scheduled|confirmed|booked)|(?:confirm|confirming|confirmed) (?:your|the) interview|interview (?:invite|invitation|confirmation)|(?:zoom|teams|google meet|meet) (?:link|invite|invitation)|join (?:the )?(?:zoom|teams|meet)/i;

  // The interview in this thread, if one was confirmed.
  function findInterview(messages, now = new Date()) {
    const today = ukParts(now);
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.isMe !== false || !/\binterview/i.test(msg.text) || !CONFIRM_CUE.test(msg.text)) continue;
      const base = new Date(Date.UTC(today.y, today.m, today.d - (msg.day || 0)));
      const when = parseInterviewTime(msg.text, { y: base.getUTCFullYear(), m: base.getUTCMonth(), d: base.getUTCDate() });
      if (!when) continue;
      const thanked = messages.slice(i + 1).some(x => x.isMe === true &&
        /thank(?:s| you) for (?:the interview|your time|taking the time|speaking)|enjoyed (?:our|the) (?:conversation|chat|call)/i.test(x.text));
      const role = (msg.text.match(/\b(?:for|about) the ((?:[A-Z][\w&/+.-]*\s?){1,6})\s(?:role|position|opening)\b/)
        || msg.text.match(/\b((?:[A-Z][\w&/+.-]*\s){0,5}[A-Z][\w&/+.-]*) (?:role|position)\b/) || [])[1];
      // Named interviewer: one other person named → them; otherwise the sender.
      const named = [...msg.text.matchAll(/\b(?:with|interviewer(?:s)? (?:is|are|will be)?:?)\s+([A-Z][a-z]+)(?:\s+[A-Z][a-z]+)?/g)].map(x => x[1]);
      const notNames = /^(teams|zoom|google|microsoft|meet|us|me|you|the|our|your|linkedin|hr|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december)$/i;
      const uniq = [...new Set(named)].filter(n => !notNames.test(n));
      return {
        when,
        past: now.getTime() > when.end.getTime(),
        thanked,
        role: role ? role.trim() : '',
        interviewer: uniq.length === 1 ? uniq[0] : '',
      };
    }
    return null;
  }

  function buildInterviewThankYou(firstName, role, signOff) {
    const about = role ? `the ${role} role and the team` : 'the role and the team';
    return `Hi ${firstName},\n\nI just wanted to say thank you for the interview. I really enjoyed our conversation and learnt a lot about ${about}.\n\nI appreciate your time and insights.\n\nBest regards,\n${signOff}`;
  }

  // "11:00 CET (10:00 BST)" — make the UK equivalent explicit.
  function quoteTime(when) {
    const own = `${pad2(when.h)}:${pad2(when.min)} ${when.zoneLabel}`;
    if (!when.explicitZone || /^(BST|GMT)$/.test(when.zoneLabel)) return `${pad2(when.h)}:${pad2(when.min)} ${ukLabel(when.start)}`;
    const uk = ukParts(when.start);
    return `${own} (${pad2(uk.h)}:${pad2(uk.min)} ${ukLabel(when.start)})`;
  }

  // ─── CV shortlisting ───
  const SHORTLIST_ITEMS = [
    ['rtw', /\b(nationality|citizenship|visa|right to work|work permit|sponsor(?:ship)?|eligible to work)\b/i],
    ['notice', /\b(notice|start date|when (?:could|can|would) you (?:start|join)|availability to start|available to start)\b/i],
    ['location', /\b(current location|where are you (?:based|located)|currently (?:based|located)|location)\b/i],
    ['relocate', /\brelocat\w*/i],
    ['salary', /\b(salary|daily rate|day rate|rate expectations?|compensation|expected (?:salary|rate|pay))\b/i],
    ['interviewFormat', /\b(face[- ]to[- ]face|telephone|phone interview|video interview|interview format|in[- ]person)\b/i],
    ['offers', /\b(other offers?|offers? in hand|interviews? in hand|other (?:processes|interviews)|in the pipeline)\b/i],
    ['interviewAvailability', /\b(availability for (?:an? )?interview|available (?:for|to) (?:an? )?interview|interview availability)\b/i],
  ];

  function shortlistTopics(text) {
    return SHORTLIST_ITEMS.filter(([, re]) => re.test(text)).map(([k]) => k);
  }

  function isShortlistRequest(text) {
    return shortlistTopics(text).length >= 3 ||
      /\bshortlist\w*|\b(?:the )?following (?:details|information|questions)|\bbelow (?:details|questions)|\bstandard (?:questions|details)\b/i.test(text);
  }

  // The full shortlisting answer, as a written reply in prose paragraphs.
  function buildShortlistReply(d) {
    const loc = d.location
      ? (/^i\b/i.test(d.location) ? asSentence(d.location) : `I am currently located in ${d.location}.`)
      : 'I am currently located in [insert current location].';
    const p1 = [asSentence(d.rightToWork), `I am available to start after my notice period of ${d.notice || '[notice period]'}.`, loc].join(' ');
    const p2 = [asSentence(d.relocate), asSentence(d.relocateContract), d.salary ? `My expected salary is ${d.salary}.` : '']
      .filter(Boolean).join(' ');
    const p3 = [asSentence(d.interviewFormat), asSentence(d.interviewAvailability), asSentence(d.offers)].filter(Boolean).join(' ');
    return ['Thanks for getting in touch. Please see my details below.', p1, p2, p3].filter(Boolean).join('\n\n');
  }

  // ─── British English ───
  const BRITISH = [
    [/\b(organi|personali|reali|recogni|priori|apologi|speciali|summari|finali|customi|minimi|maximi|utili|categori|emphasi|familiari|criti|memori|standardi)z(e|es|ed|ing|ation|ations)\b/gi, '$1s$2'],
    [/\banalyz(e|es|ed|ing)\b/gi, 'analys$1'],
    [/\b(col|fav|behavi|hon|lab|neighb|hum|flav)or(s|ed|ing|ite|ites|al)?\b/gi, '$1our$2'],
    [/\bcenter(s|ed)?\b/gi, 'centre$1'],
    [/\binquir(y|ies)\b/gi, 'enquir$1'],
    [/\blearned\b/gi, 'learnt'],
    [/\bcancel(ed|ing)\b/gi, 'cancell$1'],
    [/\btravel(ed|ing|er)\b/gi, 'travell$1'],
    [/\bfulfill\b/gi, 'fulfil'],
    [/\benroll\b/gi, 'enrol'],
    [/\bgray\b/gi, 'grey'],
    // "while" as a conjunction → "whilst" (not "a while", "worth your while")
    [/(^|[^\w])(?<!\b(?:a|your|the|for a|in a|after a|quite a|little)\s)while\b/gi, '$1whilst'],
  ];
  function britishise(text) {
    // Links and email addresses are left exactly as they are.
    return String(text || '').split(/(https?:\/\/\S+|[\w.+-]+@[\w-]+(?:\.[\w-]+)+)/).map((part, i) => {
      if (i % 2) return part;
      let out = part;
      for (const [re, rep] of BRITISH) {
        out = out.replace(re, (...m) => {
          const matched = m[0];
          const res = matched.replace(re, rep);
          // Keep a capital on the word itself ("While" → "Whilst").
          const first = matched.search(/[a-z]/i);
          if (first >= 0 && matched[first] === matched[first].toUpperCase()) {
            const at = res.search(/[a-z]/i);
            return res.slice(0, at) + res.charAt(at).toUpperCase() + res.slice(at + 1);
          }
          return res;
        });
      }
      return out;
    }).join('');
  }

  // ─── Sign-off: "Maxmilliam", or "Best/Kind regards," when they're formal ───
  function signOffFor(ctx, d) {
    const name = d.signOffName || 'Maxmilliam';
    const theirs = (ctx.lastMessage && ctx.lastMessage.text) || '';
    const formal = theirs.match(/\b(kind|best|warm) regards\b|\bregards,|\byours sincerely\b/i);
    if (!formal) return name;
    const word = /kind/i.test(formal[0]) ? 'Kind' : 'Best';
    return `${word} regards,\n${name}`;
  }

  // ─── Messages that need no reply ───
  function isAutomated(text) {
    return /\b(this is an automated|automated message|do not reply|no-?reply|unsubscribe|sponsored message)\b/i.test(String(text || ''));
  }

  // ─── Language check (templates write English only) ───
  const LANG_HINTS = {
    German: /\b(und|nicht|ich|sie|mit|für|wir|ist|danke|vielen|gerne|bitte|herzliche|grüße)\b/gi,
    French: /\b(je|vous|nous|est|pour|avec|merci|bonjour|cordialement|votre|poste)\b/gi,
    Spanish: /\b(que|para|con|usted|gracias|hola|saludos|puesto|tienes|estoy)\b/gi,
    Dutch: /\b(het|een|ik|niet|met|voor|bedankt|groeten|graag|jij|jouw)\b/gi,
    Italian: /\b(che|per|grazie|ciao|sono|della|lavoro|saluti|posizione)\b/gi,
    Portuguese: /\b(você|obrigado|obrigada|olá|não|para|vaga|trabalho)\b/gi,
    Polish: /\b(nie|się|jest|dziękuję|dzień dobry|pozdrawiam|praca|stanowisko)\b/gi,
  };
  function detectNonEnglish(text) {
    const t = String(text || '');
    const words = t.split(/\s+/).filter(Boolean).length;
    if (words < 4) return '';
    const english = (t.match(/\b(the|and|you|your|for|with|are|is|to|of|thanks|hi|would|could|we|our)\b/gi) || []).length;
    let best = '', score = 0;
    for (const [lang, re] of Object.entries(LANG_HINTS)) {
      const n = (t.match(re) || []).length;
      if (n > score) { score = n; best = lang; }
    }
    return score >= 2 && score > english ? best : '';
  }

  function buildColdOutreach(name, tone, goal, profile, ctx) {
    const company = (ctx && ctx.partnerCompany) || '';
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
        let response = pick(coldExamples).response
          // The example usually opens with its own "Hi [Name]," — we
          // already add a greeting, so drop it to avoid "Hi Priya, Hi Priya!".
          .replace(/^\s*(?:hi|hey|hello)\b[^,!.\n]{0,30}[,!.]?\s*/i, '');
        // Fill placeholders we know; drop the ones we don't instead of
        // writing "your work in your field".
        response = response
          .replace(/\[Name\]/gi, name)
          .replace(/\[Company\]/gi, company || '\u0000')
          .replace(/\s+(?:in|at|with)\s+(?:\[field\]|\u0000)/gi, '')
          .replace(/\u0000/g, 'your company')
          .replace(/\[field\]/gi, 'your field');
        response = response.charAt(0).toUpperCase() + response.slice(1);
        return greeting + '\n\n' + applyToneVariations(response, tone);
      }
    }

    const templates = {
      professional: [
        company
          ? `Saw what you're doing at ${company} and thought it was worth reaching out. Would you be open to a short call this week or next?`
          : `Saw your background — would you be open to a short call this week or next?`,
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
    // Scale length to what the partner wrote. Short question → short answer;
    // detailed question → acknowledge, give a bit of context, then propose
    // a call. No "Great question!", no "it varies case-by-case" hedge, no
    // quoting the question back at them.
    const t = ctx.topics || [];
    const casual = tone === 'casual' || tone === 'witty';
    const raw = (ctx.lastMessage && ctx.lastMessage.text) || '';
    // "How are you?" / "How's your week going?"
    if (/\bhow(?:'s| is| are| has| have)\s+(?:you|it going|things|your (?:week|day|weekend))\b[^?]{0,20}\?/i.test(raw)
        && raw.replace(/\s+/g, ' ').trim().length < 90) {
      return casual ? "Doing well, thanks! How about you?" : "Doing well, thanks. How about you?";
    }
    // "When are you free?" → answer it.
    if (t.includes('meeting')) {
      const link = (ctx.details || {}).calendarLink;
      return link
        ? `Happy to. Here is my booking link, feel free to pick any slot that suits: ${link}`
        : timeOptionsText(ctx.details || {});
    }
    // "How much is it?" → the pricing reply, sized to the question.
    if (t.includes('pricing')) {
      return ctx.matchLength === 's'
        ? `Happy to go through numbers. It depends a little on your setup, so a quick call is easiest. What works this week?`
        : `Happy to go through numbers properly. Pricing depends on a couple of things specific to your setup, so a generic figure here wouldn't be much use. A short call and I can give you something realistic. What works this week?`;
    }
    // "Are you open to new roles?" → yes, tell me more.
    if (t.includes('job')) {
      return casual
        ? `Open to hearing more. What's the role, and what's the team working on right now?`
        : `I'm open to hearing more. Could you share a bit about the role and what the team is working on at the moment?`;
    }

    // Anything else: we can't know the answer, so politely defer rather
    // than invent one.
    return ctx.style === 'direct'
      ? "Happy to go into that on a call."
      : "Good to go into that properly. Happy to cover it on a call if that works for you.";
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
      professional: {
        s: [
          `Good to hear. What works for a short call this week?`,
          `Glad that lands. Got 15 minutes this week?`,
        ],
        m: [
          `Good to hear. I'm free most days next week for 15 minutes — any slots that suit you?`,
          `Glad that lands. Happy to find a time this week or next, just send over a couple of options that work.`,
        ],
        l: [
          `Good to hear, thanks for the detail. Happy to take it forward — I'd suggest a short call so we can line things up properly rather than go back and forth here.\n\nI'm free most mornings this week and flexible next — anything work on your end?`,
        ],
      },
      casual: {
        s: [`Nice. Got 15 min this week?`, `Cool. What works this week?`],
        m: [`Nice one. What's your week looking like for a quick call?`],
        l: [
          `Good to hear, thanks for the detail. Happy to take it forward — easier on a quick call than here. What's your week looking like?`,
        ],
      },
      enthusiastic: {
        s: [`Good to hear. Got 15 min this week?`],
        m: [`Good to hear. What does your week look like for a quick call?`],
        l: [
          `Good to hear, thanks for the detail. Happy to move this forward — a short call would be the easiest next step, what works on your end?`,
        ],
      },
      witty: {
        s: [`Glad that lands. Got 15 min this week?`],
        m: [`Glad that lands. What's the week looking like for a 15-min call?`],
        l: [
          `Glad that lands. Easier on a short call than ping-ponging in DMs — what's the week looking like?`,
        ],
      },
    };
    const bank = replies[tone] || replies.professional;
    const len = ctx.matchLength || 's';
    return pick(bank[len] || bank.s);
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

  function buildGeneralReply(ctx, tone, goal) {
    const len = ctx.matchLength || 's';

    // Topic-specific replies. Short default; longer variants add real
    // context when the partner wrote a lot.
    const topicResponses = {
      job: {
        s: `Sounds interesting — what does the role look like day-to-day?`,
        m: `Sounds interesting. Would help to understand what the role looks like day-to-day and what the team's working on right now.`,
        l: `Thanks for laying this out. A few things stand out as a good fit, though I'd want to understand the day-to-day and what success looks like in the first 6 months before committing either way.\n\nIs there a good time this week for a short call?`,
      },
      meeting: {
        s: `Sure, what works on your end this week?`,
        m: `Happy to find a time. I'm free most of this week and early next — anything suit on your end?`,
        l: `Happy to find a time. I've got openings most mornings this week and flexibility next — send me two or three slots that suit and I'll confirm one.`,
      },
      product: {
        s: `Worth a look — quickest way to see it in action?`,
        m: `Worth a look. What's the quickest way to see it in action — a demo, a trial, or something else?`,
        l: `Thanks for the detail, it does sound relevant to what I'm working on. Easiest next step would be seeing it in action — a short demo or a walkthrough of a live setup would be more useful than reading about it.\n\nWhat do you usually do for that?`,
      },
      collaboration: {
        s: `Open to it. What did you have in mind?`,
        m: `Open to it in principle. What did you have in mind and what would the split of the work look like?`,
        l: `Open to it in principle. Would help to understand what you're picturing in terms of scope, the split of work, and what success looks like on each side before committing.\n\nHappy to jump on a short call to scope it out.`,
      },
      pricing: {
        s: `Happy to get into numbers on a short call — what works this week?`,
        m: `Happy to get into numbers. Easier on a call so I can tailor it to your setup rather than quote a generic figure — what works this week?`,
        l: `Happy to get into numbers properly. Pricing depends on a couple of things specific to your setup (volume, integrations, timeline), so a generic figure here wouldn't be useful. A short call and I can give you something realistic.\n\nWhat suits this week?`,
      },
      experience: {
        s: `Appreciate you sharing. What are you focused on now?`,
        m: `Appreciate the context. What are you focused on now, and what's the next thing you're hoping to take on?`,
        l: `Thanks for sharing that, good to have the background. What are you focused on now, and what's next on your side? Happy to compare notes if useful.`,
      },
    };

    for (const topic of ctx.topics) {
      if (topicResponses[topic]) {
        const bank = topicResponses[topic];
        return applyToneVariations(bank[len] || bank.s, tone);
      }
    }

    // Fallback: acknowledgment + direct question. Longer tiers add one
    // contextual beat rather than padding with quotes or fluff.
    const generics = {
      professional: {
        s: [
          `Makes sense. What's the most useful next step on your end?`,
          `Appreciate the context. What's shaping your thinking here?`,
          `Understood. What's most important to you on this?`,
        ],
        m: [
          `Makes sense, appreciate you laying it out. What's the most useful next step on your end?`,
          `That tracks. Before suggesting anything, it'd help to know what's shaping your thinking here.`,
        ],
        l: [
          `Thanks for taking the time to explain that properly, it helps. Rather than jump straight to a suggestion, I'd want to understand what's shaping your thinking and what a good outcome looks like on your end.\n\nHappy to jump on a short call if that's easier than typing it out.`,
          `Appreciate the detail, that's useful context. A few things stand out, but I'd rather not pitch anything before understanding what you're actually optimising for.\n\nWhat would be the most useful next step for you?`,
        ],
      },
      casual: {
        s: [
          `Fair enough. What's the next step?`,
          `Makes sense. What's driving that?`,
        ],
        m: [
          `Fair enough, appreciate the detail. What's the next step on your side?`,
          `Makes sense. What's driving it, and what are you hoping to land on?`,
        ],
        l: [
          `Thanks for laying that out. Before I throw ideas at you, what's driving it and what would a good outcome actually look like for you?\n\nHappy to jump on a quick call if easier.`,
        ],
      },
      enthusiastic: {
        s: [`Good to hear. What's next on your side?`],
        m: [`Good to hear, appreciate the detail. What's next on your side?`],
        l: [
          `Thanks for the detail, good context. What's next on your side, and what would be most useful from me at this point?`,
        ],
      },
      witty: {
        s: [`Okay, now I'm curious. What's behind it?`],
        m: [`Okay, now I'm properly curious. What's behind it and where do you want to take it?`],
        l: [
          `Appreciate the detail, now I'm properly curious. What's driving it and where are you hoping it lands?\n\nHappy to jump on a short call if easier than typing.`,
        ],
      },
    };

    const bank = generics[tone] || generics.professional;
    return pick(bank[len] || bank.s);
  }

  function blendWithExampleStyle(reply, profile, tone) {
    // Apply only lightweight, tone-level lexical variation. We deliberately
    // do NOT splice raw sentences from training examples into the reply:
    // the previous implementation replaced the reply's closing line with a
    // random sentence from a stored example, which produced out-of-context
    // closers (e.g. swapping "Is there a good time this week for a short
    // call?" for "Would Thursday work?" from an unrelated example). Cold
    // outreach already uses example *content* via buildColdOutreach; for
    // inbound replies, examples should influence tone, not content.
    if (!profile.examples || profile.examples.length === 0) return reply;
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
  //  One button per chat composer
  // ═══════════════════════════════════════════
  // A chat composer is LinkedIn's messaging form. Generic contenteditable
  // textboxes are deliberately NOT treated as composers: the feed's post and
  // comment boxes are also div[role="textbox"], and an "AI Reply" button
  // there would make no sense.
  const MSG_FORM_SELECTOR = 'form.msg-form, div.msg-form';

  const CONTROLS_CLASS = 'outreach-dm-controls';
  const TONE_SELECT_CLASS = 'outreach-dm-tone';
  const SEND_BTN_CLASS = 'outreach-dm-send';

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const norm = s => String(s || '').replace(/\s+/g, ' ').trim();

  // Our last draft per composer, so Insert & Send knows whether the box holds
  // a draft the user has already seen (send it as-is, edits included) or
  // something else (e.g. an old draft LinkedIn restored — replace it).
  const lastDrafts = new WeakMap();

  // [✨ AI Reply] [tone ▾] [➤] — one group per chat.
  function createAIControls() {
    const group = document.createElement('span');
    group.className = CONTROLS_CLASS;

    const btn = document.createElement('button');
    btn.type = 'button'; // never submit the surrounding LinkedIn form
    btn.className = AI_BTN_CLASS;
    btn.innerHTML = '<span style="animation:dm-ai-sparkle 2s ease-in-out infinite;display:inline-flex">✨</span><span>AI Reply</span>';
    btn.title = `AI Reply ${AI_REPLY_VERSION}: draft a reply to this conversation (right-click: outcome, My details, training)`;
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await directDraftReply(btn);
    });
    btn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleAIPanel(btn);
    });

    const select = document.createElement('select');
    select.className = TONE_SELECT_CLASS;
    select.title = 'Reply tone';
    select.setAttribute('aria-label', 'Reply tone');
    for (const [value, label] of Object.entries(TONES)) {
      const o = document.createElement('option');
      o.value = value;
      o.textContent = label;
      select.appendChild(o);
    }
    select.value = currentTone;
    ['click', 'mousedown', 'keydown'].forEach(ev => select.addEventListener(ev, e => e.stopPropagation()));
    select.addEventListener('change', () => onToneChange(select, btn));

    const send = document.createElement('button');
    send.type = 'button';
    send.className = SEND_BTN_CLASS;
    send.textContent = '➤';
    send.title = 'Insert & Send — sends your reviewed draft, or drafts a reply and sends it';
    send.setAttribute('aria-label', 'Insert and send AI reply');
    send.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await insertAndSend(send, btn);
    });

    group.append(btn, select, send);
    return group;
  }

  // Draft a reply for the chat `origin` belongs to and put it in the box.
  async function draftInto(origin) {
    const profile = await getActiveProfile();
    const { scope, composer } = resolveTarget(origin);
    const conversation = scrapeConversation(scope, composer);
    const details = await getMyDetails(conversation);
    // What was read — senders and lengths only, never message text.
    log('Draft for', conversation.partnerName, '| tone:', currentTone, '| composer found:', !!composer,
      '| messages:', conversation.messages.map(m => `${m.isMe ? 'me' : m.isMe === false ? 'them' : '?'}:${m.text.length}ch`).join(' '));
    const meta = {};
    const reply = generateResponse(profile, conversation, { tone: currentTone, details, meta });
    if (meta.noReply) {
      showDMToast('No reply needed: this looks like an automated message.', 'success');
      return { reply: '', conversation, composer, meta };
    }
    insertIntoMessageBox(reply, scope, composer);
    if (composer) {
      lastDrafts.set(composer, { text: reply, partner: conversation.partnerName, tooSoon: meta.tooSoon, daysAgo: meta.lastMineDaysAgo, language: meta.language });
    }

    const gaps = findPlaceholders(reply);
    if (meta.language) {
      showDMToast(`${firstNameOf(conversation.partnerName) || 'They'} wrote in ${meta.language}. This draft is in English, so translate it before sending.`, 'error');
    } else if (meta.tooSoon) {
      showDMToast(`You messaged ${firstNameOf(conversation.partnerName) || 'them'} ${whenLabel(meta.lastMineDaysAgo)} — give it a few days before sending a follow-up.`, 'error');
    } else if (!conversation.messages.length) {
      showDMToast("Couldn't read this chat's messages, so this is a first-message draft.", 'error');
    } else if (gaps.length) {
      showDMToast(`Fill in ${gaps.join(', ')} — or save it once in My details (right-click AI Reply).`, 'error');
    }
    return { reply, conversation, composer, meta };
  }

  function setBusy(btn, busy, label) {
    if (busy) {
      btn.dataset.busy = '1';
      btn.dataset.html = btn.innerHTML;
      btn.innerHTML = `<span style="display:inline-flex;animation:dm-ai-sparkle 0.5s ease-in-out infinite">⏳</span><span>${label}</span>`;
      btn.disabled = true;
      btn.style.opacity = '0.7';
    } else {
      if (btn.dataset.html) btn.innerHTML = btn.dataset.html;
      btn.disabled = false;
      btn.style.opacity = '1';
      delete btn.dataset.busy;
      delete btn.dataset.html;
    }
  }

  // One-click: generate a reply and insert it into this chat's message box
  async function directDraftReply(btn) {
    if (btn.dataset.busy === '1') return;
    setBusy(btn, true, 'Drafting...');
    try {
      await draftInto(btn);
    } catch (err) {
      console.error('[OutreachPro DM] Draft error:', err);
      showDMToast('Could not generate reply. Try again.', 'error');
    } finally {
      setBusy(btn, false);
    }
  }

  // New tone: remember it everywhere, and redo our draft in this chat if the
  // user hasn't edited it (never overwrite their edits).
  async function onToneChange(select, aiBtn) {
    currentTone = TONES[select.value] ? select.value : 'professional';
    storageSet({ [TONE_KEY]: currentTone });
    deepQueryAll('select.' + TONE_SELECT_CLASS).forEach(s => { if (s !== select) s.value = currentTone; });

    const { composer } = resolveTarget(select);
    const prev = composer && lastDrafts.get(composer);
    if (prev && norm(readText(composer)) === norm(prev.text)) {
      await directDraftReply(aiBtn);
    } else {
      showDMToast(`Tone: ${TONES[currentTone]}`, 'success');
    }
  }

  function whenLabel(days) {
    if (days === 0) return 'today';
    if (days === 1) return 'yesterday';
    return days == null ? 'recently' : `${days} days ago`;
  }

  // LinkedIn's own Send button for this composer.
  function findSendFor(composer) {
    let cur = composer.closest('[' + UNIT_ATTR + '], ' + MSG_FORM_SELECTOR) || composer.parentElement;
    for (let i = 0; cur && i < 6; i++, cur = cur.parentElement) {
      const b = cur.querySelector('.msg-form__send-button, button.msg-form__send-btn') ||
        [...cur.querySelectorAll('button')].find(isSendButton);
      if (b) return b;
    }
    return null;
  }

  // Click Send once LinkedIn has enabled it; "sent" = LinkedIn cleared the box.
  async function clickSend(composer) {
    const btn = findSendFor(composer);
    if (!btn) return 'no-button';
    const disabled = () => btn.disabled || btn.getAttribute('aria-disabled') === 'true';
    for (let i = 0; i < 40 && disabled(); i++) await sleep(50);
    if (disabled()) return 'disabled';
    btn.click();
    for (let i = 0; i < 80; i++) {
      await sleep(50);
      if (!norm(readText(composer))) return 'sent';
    }
    return 'unconfirmed';
  }

  async function insertAndSend(sendBtn, aiBtn) {
    if (sendBtn.dataset.busy === '1') return;
    sendBtn.dataset.busy = '1';
    sendBtn.disabled = true;
    try {
      const { scope, composer } = resolveTarget(sendBtn);
      if (!composer) {
        showDMToast("Couldn't find this chat's message box — nothing sent.", 'error');
        return;
      }
      // Send the box as-is only if it holds our draft for this same chat
      // (the user has seen it, maybe edited it). Otherwise draft fresh.
      const prev = lastDrafts.get(composer);
      const partner = scrapeConversation(scope, composer).partnerName;
      const reviewed = prev && prev.partner === partner && norm(readText(composer));
      if (!reviewed) {
        setBusy(aiBtn, true, 'Drafting...');
        let res;
        try { res = await draftInto(sendBtn); } finally { setBusy(aiBtn, false); }
        if (res && res.meta && res.meta.noReply) return;
      }

      const text = readText(composer);
      const gaps = findPlaceholders(text);
      if (gaps.length) {
        showDMToast(`Not sent: fill in ${gaps.join(', ')} first.`, 'error');
        composer.focus();
        return;
      }
      const entry = lastDrafts.get(composer);
      if (entry && entry.language) {
        showDMToast(`Not sent: they wrote in ${entry.language}. Translate the draft, then press Send.`, 'error');
        composer.focus();
        return;
      }
      if (entry && entry.tooSoon) {
        showDMToast(`Not sent: you already messaged them ${whenLabel(entry.daysAgo)}. A follow-up this soon can feel pushy — press Send yourself if you're sure.`, 'error');
        composer.focus();
        return;
      }
      if (!norm(text)) {
        showDMToast('Nothing to send.', 'error');
        return;
      }

      const result = await clickSend(composer);
      if (result === 'sent') {
        lastDrafts.delete(composer);
        showDMToast('✅ Sent', 'success');
      } else if (result === 'unconfirmed') {
        showDMToast("Clicked Send but couldn't confirm it went — check the chat.", 'error');
      } else {
        showDMToast('Reply inserted, but Send was unavailable — press Send to send it.', 'error');
      }
    } catch (err) {
      console.error('[OutreachPro DM] Insert & Send error:', err);
      showDMToast('Could not send. Try again.', 'error');
    } finally {
      sendBtn.disabled = false;
      delete sendBtn.dataset.busy;
    }
  }



  // The composer belonging to the same chat as `btn`. Each chat gets its own
  // button, so this is exact; the floating fallback button uses the composer
  // the user last typed in.
  function composerFor(btn) {
    const unit = btn && btn.closest ? btn.closest('[' + UNIT_ATTR + '], ' + MSG_FORM_SELECTOR) : null;
    const inUnit = unit && unit.querySelector('[contenteditable="true"], textarea');
    if (inUnit) return inUnit;
    if (lastActiveComposer && lastActiveComposer.isConnected) return lastActiveComposer;
    return null;
  }

  // Conversation scope + composer for an action started from `btn`.
  function resolveTarget(btn) {
    const composer = composerFor(btn);
    const scope = closestScope(btn) || closestScope(composer) || paneFor(composer) || findActiveScope(null);
    return { scope, composer };
  }



  function findMsgForms() {
    syncShadowRoots();
    return deepQueryAll(MSG_FORM_SELECTOR)
      .filter(f => f.querySelector('[contenteditable="true"]'));
  }

  // Give every open chat composer its own AI Reply button. With several
  // chat bubbles open, each button drafts for its own conversation.
  function injectAIReplyButton() {
    const forms = findMsgForms();
    let added = 0;

    for (const form of forms) {
      if (form.querySelector('.' + AI_BTN_CLASS)) continue;
      const sendBtn = form.querySelector('.msg-form__send-button, button[type="submit"]');
      const anchor =
        form.querySelector('.msg-form__footer') ||
        form.querySelector('.msg-form__left-actions') ||
        form.querySelector('div[class*="msg-form__footer"]') ||
        (sendBtn && sendBtn.parentElement);
      if (!anchor) continue;
      const rootNode = form.getRootNode();
      if (rootNode !== document) ensureStylesIn(rootNode);
      form.setAttribute(UNIT_ATTR, '1');
      anchor.prepend(createAIControls());
      added++;
    }

    // Chats LinkedIn renders without the msg-form classes: an editable box
    // with a Send button next to it.
    for (const { unit, sendBtn } of findSemanticComposers()) {
      if (unit.querySelector('.' + AI_BTN_CLASS)) continue;
      const known = unit.closest('[' + UNIT_ATTR + ']');
      if (known && known.querySelector('.' + AI_BTN_CLASS)) continue;
      const rootNode = unit.getRootNode();
      if (rootNode !== document) ensureStylesIn(rootNode);
      unit.setAttribute(UNIT_ATTR, '1');
      toolbarAnchor(unit, sendBtn).prepend(createAIControls());
      added++;
    }
    if (added) log('Injected AI Reply into', added, 'composer(s)');

    // Floating fallback: only when a chat composer exists that we could not
    // anchor into (e.g. LinkedIn changed its markup). Never on pages with no
    // chat open.
    const anchored = deepQueryAll('.' + CONTROLS_CLASS + ':not(.floating)').length > 0;
    const floating = document.querySelector('.' + CONTROLS_CLASS + '.floating');
    const looseComposer = deepQuery(
      '.msg-form__contenteditable, [class*="msg-form"] [contenteditable="true"]'
    );
    if (anchored || !looseComposer) {
      if (floating) floating.remove();
      return;
    }
    if (!floating) {
      const b = createAIControls();
      b.classList.add('floating');
      document.body.appendChild(b);
      log('Injected floating AI Reply (composer without a known footer)');
    }
  }

  // ═══════════════════════════════════════════
  //  6. UI — AI RESPONSE PANEL
  // ═══════════════════════════════════════════
  function toggleAIPanel(originBtn) {
    if (aiPanel) {
      aiPanel.remove();
      aiPanel = null;
      return;
    }
    buildAIPanel(originBtn);
  }

  async function buildAIPanel(originBtn) {
    const profiles = await getProfiles();
    const activeProfile = await getActiveProfile();
    // The panel belongs to the chat whose AI Reply button opened it.
    const target = () => resolveTarget(originBtn);
    const initial = target();
    const conversation = scrapeConversation(initial.scope, initial.composer);

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
        <button class="dm-ai-tab" data-tab="details">👤 My details</button>
        <button class="dm-ai-tab" data-tab="training">📚 Training</button>
      </div>
      <div class="dm-ai-body" id="dm-ai-body">
        <!-- Generate tab -->
        <div id="dm-ai-tab-generate">
          <div style="margin-bottom:10px">
            <label style="font-size:10px;font-weight:700;color:#6366F1;text-transform:uppercase;display:block;margin-bottom:4px">Conversation Context</label>
            <div class="dm-ai-context-box">${esc(lastMsgPreview)}</div>
          </div>
          <div style="margin-bottom:10px;display:flex;gap:8px">
            <div style="flex:2">
              <label style="font-size:10px;font-weight:700;color:#6366F1;text-transform:uppercase;display:block;margin-bottom:4px">Desired Outcome</label>
              <select class="dm-ai-outcome-select" id="dm-ai-outcome">
                ${profiles.map(p => `<option value="${esc(p.id)}"${activeProfile && p.id === activeProfile.id ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}
              </select>
            </div>
            <div style="flex:1">
              <label style="font-size:10px;font-weight:700;color:#6366F1;text-transform:uppercase;display:block;margin-bottom:4px">Tone</label>
              <select class="dm-ai-outcome-select ${TONE_SELECT_CLASS}-panel" id="dm-ai-tone">
                ${Object.entries(TONES).map(([v, l]) => `<option value="${v}"${v === currentTone ? ' selected' : ''}>${l}</option>`).join('')}
              </select>
            </div>
          </div>
          <div id="dm-ai-skel" style="display:none">
            <div class="dm-ai-skel l"></div><div class="dm-ai-skel m"></div><div class="dm-ai-skel l"></div><div class="dm-ai-skel s"></div>
          </div>
          <textarea id="dm-ai-response" placeholder="Click Generate to create your reply..." rows="5"></textarea>
        </div>
        <!-- My details tab (hidden) -->
        <div id="dm-ai-tab-details" style="display:none"></div>
        <!-- Training tab (hidden) -->
        <div id="dm-ai-tab-training" style="display:none"></div>
      </div>
      <div class="dm-ai-actions" id="dm-ai-actions">
        <button class="dm-ai-gen-btn" id="dm-ai-gen">✨ Generate Reply</button>
        <div style="display:flex;gap:6px;margin-left:auto">
          <button class="dm-ai-sec-btn" id="dm-ai-copy" style="display:none">📋 Copy</button>
          <button class="dm-ai-sec-btn" id="dm-ai-insert" style="display:none">Insert</button>
          <button class="dm-ai-insert-btn" id="dm-ai-insert-send" style="display:none">➤ Insert &amp; Send</button>
        </div>
      </div>
      <div class="dm-ai-footer">OutreachPro AI Reply <span class="hl">v${AI_REPLY_VERSION}</span></div>
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
        panel.querySelector('#dm-ai-tab-details').style.display = tabName === 'details' ? 'block' : 'none';
        panel.querySelector('#dm-ai-tab-training').style.display = tabName === 'training' ? 'block' : 'none';
        panel.querySelector('#dm-ai-actions').style.display = tabName === 'generate' ? 'flex' : 'none';
        if (tabName === 'details') renderMyDetails(panel, conversation);
        if (tabName === 'training') renderTrainingStudio(panel);
      };
    });

    // Generate
    const responseArea = panel.querySelector('#dm-ai-response');
    const skelArea = panel.querySelector('#dm-ai-skel');
    const copyBtn = panel.querySelector('#dm-ai-copy');
    const insertBtn = panel.querySelector('#dm-ai-insert');
    const insertSendBtn = panel.querySelector('#dm-ai-insert-send');

    // Tone, shared with every chat's selector.
    panel.querySelector('#dm-ai-tone').onchange = e => {
      currentTone = TONES[e.target.value] ? e.target.value : 'professional';
      storageSet({ [TONE_KEY]: currentTone });
      deepQueryAll('select.' + TONE_SELECT_CLASS).forEach(s => { s.value = currentTone; });
    };

    panel.querySelector('#dm-ai-gen').onclick = async () => {
      const selectedId = panel.querySelector('#dm-ai-outcome').value;
      const allProfiles = await getProfiles();
      const profile = allProfiles.find(p => p.id === selectedId) || allProfiles[0];

      responseArea.style.display = 'none';
      skelArea.style.display = 'block';
      copyBtn.style.display = 'none';
      insertBtn.style.display = 'none';
      insertSendBtn.style.display = 'none';

      // Remember this choice for one-click drafting too.
      try { chrome.storage.local.set({ [DEFAULT_PROFILE_KEY]: profile.id }); } catch (e) { /* ignore */ }

      // Re-scrape at click time: new messages may have arrived.
      const live = target();
      const freshConv = scrapeConversation(live.scope, live.composer);
      const details = await getMyDetails(freshConv);

      setTimeout(() => {
        const meta = {};
        const reply = generateResponse(profile, freshConv, { tone: currentTone, details, meta });
        panel.dataset.tooSoon = meta.tooSoon ? '1' : '';
        panel.dataset.daysAgo = meta.lastMineDaysAgo == null ? '' : String(meta.lastMineDaysAgo);
        responseArea.value = reply;
        responseArea.style.display = 'block';
        skelArea.style.display = 'none';
        copyBtn.style.display = 'inline-flex';
        insertBtn.style.display = 'inline-flex';
        insertSendBtn.style.display = 'inline-flex';
        const gaps = findPlaceholders(reply);
        if (gaps.length) showDMToast(`Fill in ${gaps.join(', ')} — or save it in My details.`, 'error');
      }, 250);
    };

    // Copy
    copyBtn.onclick = () => {
      Promise.resolve(navigator.clipboard && navigator.clipboard.writeText(responseArea.value)).then(() => {
        copyBtn.textContent = '✅ Copied!';
        setTimeout(() => { copyBtn.textContent = '📋 Copy'; }, 2000);
      });
    };

    // Insert
    insertBtn.onclick = () => {
      const { scope, composer } = target();
      insertIntoMessageBox(responseArea.value, scope, composer);
      if (composer) lastDrafts.set(composer, { text: responseArea.value, partner: conversation.partnerName });
    };

    // Insert & Send: what's in the textarea is what gets sent (reviewed here).
    insertSendBtn.onclick = async () => {
      const text = responseArea.value;
      const gaps = findPlaceholders(text);
      if (gaps.length) {
        showDMToast(`Not sent: fill in ${gaps.join(', ')} first.`, 'error');
        responseArea.focus();
        return;
      }
      if (!norm(text)) return;
      if (panel.dataset.tooSoon === '1') {
        const d = panel.dataset.daysAgo === '' ? null : +panel.dataset.daysAgo;
        showDMToast(`Not sent: you already messaged them ${whenLabel(d)}. Use Insert and press Send yourself if you're sure.`, 'error');
        return;
      }
      const { scope, composer } = target();
      if (!composer) {
        showDMToast("Couldn't find this chat's message box — nothing sent.", 'error');
        return;
      }
      insertIntoMessageBox(text, scope, composer);
      const result = await clickSend(composer);
      if (result === 'sent') showDMToast('✅ Sent', 'success');
      else if (result === 'unconfirmed') showDMToast("Clicked Send but couldn't confirm it went — check the chat.", 'error');
      else showDMToast('Reply inserted, but Send was unavailable — press Send to send it.', 'error');
    };
  }

  // ═══════════════════════════════════════════
  //  7. INSERT INTO LINKEDIN MESSAGE BOX
  //  React-compatible: fires synthetic events like Auto Gmail
  // ═══════════════════════════════════════════
  function insertIntoMessageBox(text, scope, composer) {
    const boxSelectors = [
      '.msg-form__contenteditable[contenteditable="true"]',
      '.msg-form__contenteditable div[contenteditable="true"]',
      '.msg-form [contenteditable="true"]',
      'div[contenteditable="true"][aria-label*="Write a message"]',
      '[' + UNIT_ATTR + '] [contenteditable="true"]',
      '[' + UNIT_ATTR + '] textarea',
    ];
    const attached = el => !!(el && el.isConnected);

    // 1. The composer of the chat the button belongs to (exact).
    let box = attached(composer) ? composer : null;
    // 2. Within this conversation's scope.
    if (!box && attached(scope)) {
      for (const sel of boxSelectors) {
        box = scope.querySelector(sel);
        if (box) break;
      }
    }
    // 3. The composer the user last typed in.
    if (!box && attached(lastActiveComposer)) box = lastActiveComposer;
    // 4. The only visible chat composer on the page — safe because it's
    //    unambiguous. With two or more chats open we never guess.
    if (!box) {
      syncShadowRoots();
      const visible = deepQueryAll(boxSelectors.join(', ')).filter(el => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      if (visible.length === 1) box = visible[0];
    }
    // Last resort only: copy so nothing is lost.
    if (!box) {
      copyToClipboard(text);
      showDMToast('📋 Copied to clipboard — paste it in the message box!', 'success');
      return;
    }

    writeIntoComposer(box, text);
    showDMToast('✅ Reply inserted! Review and click Send when ready.', 'success');
    if (aiPanel) { aiPanel.remove(); aiPanel = null; }
  }

  // Replace the composer's content with `text`. execCommand('insertText')
  // goes through the browser's real editing pipeline, so LinkedIn's editor
  // sees a genuine edit (draft saved, Send button enabled). If it's
  // unavailable, build paragraphs by hand and fire an input event.
  function writeIntoComposer(box, text) {
    if (box.tagName === 'TEXTAREA') {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      box.focus();
      setter.call(box, text);
      box.dispatchEvent(new Event('input', { bubbles: true }));
      box.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    box.focus();
    const sel = window.getSelection();
    let ok = false;
    try {
      // Select the editor's existing content (the stale draft). selectAll
      // acts on the focused editor, which also works inside shadow roots
      // where a Range built from outside may not take.
      document.execCommand('selectAll', false, null);
      ok = document.execCommand('insertText', false, text);
    } catch (e) { ok = false; }

    const normalize = s => (s || '').replace(/\s+/g, ' ').trim();
    if (ok && normalize(box.innerText).includes(normalize(text).slice(0, 40))) return;

    // Fallback: one <p> per line; blank lines become empty paragraphs so the
    // gap between greeting and body survives.
    box.innerHTML = '';
    for (const line of text.split('\n')) {
      const p = document.createElement('p');
      if (line.trim()) p.textContent = line;
      else p.appendChild(document.createElement('br'));
      box.appendChild(p);
    }
    box.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: text }));
    box.dispatchEvent(new Event('change', { bubbles: true }));

    // Caret at the end, ready for edits.
    const end = document.createRange();
    end.selectNodeContents(box);
    end.collapse(false);
    sel.removeAllRanges();
    sel.addRange(end);
  }

  function copyToClipboard(text) {
    try {
      navigator.clipboard.writeText(text).catch(() => {});
    } catch (e) { /* clipboard unavailable */ }
  }


  // ═══════════════════════════════════════════
  //  8. TRAINING STUDIO UI
  // ═══════════════════════════════════════════
  // "My details": the facts used to answer questions. Placeholders show what
  // was found automatically in my own messages; typed values win.
  async function renderMyDetails(panel, conversation) {
    const box = panel.querySelector('#dm-ai-tab-details');
    const manual = (await storageGet(DETAILS_KEY)) || {};
    const found = await getMyDetails(conversation); // includes auto-found values
    box.innerHTML = `
      <div style="font-size:11px;color:#666;margin-bottom:10px;line-height:1.4">
        Used to answer questions like "can you send your CV?" or "what's your notice period?".
        Grey text = found in your own messages; type to override.
      </div>
      ${DETAIL_FIELDS.map(([key, label, ex]) => `
        <label style="font-size:10px;font-weight:700;color:#6366F1;text-transform:uppercase;display:block;margin:8px 0 3px">${esc(label)}</label>
        <input class="dm-ai-detail" data-key="${key}" value="${esc(manual[key] || '')}"
          placeholder="${esc(found[key] && !manual[key] ? found[key] : 'e.g. ' + ex)}"
          style="width:100%;box-sizing:border-box;padding:7px 9px;border:1px solid #ddd;border-radius:8px;font:12px Inter,sans-serif">
      `).join('')}
      <button id="dm-ai-save-details" class="dm-ai-gen-btn" style="margin-top:12px;width:100%">Save details</button>
    `;
    box.querySelectorAll('input').forEach(i => ['keydown', 'keyup', 'keypress'].forEach(ev => i.addEventListener(ev, e => e.stopPropagation())));
    box.querySelector('#dm-ai-save-details').onclick = () => {
      const out = {};
      box.querySelectorAll('.dm-ai-detail').forEach(i => { if (i.value.trim()) out[i.dataset.key] = i.value.trim(); });
      storageSet({ [DETAILS_KEY]: out });
      showDMToast('✅ Details saved', 'success');
    };
  }

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
            // A new shadow host (e.g. LinkedIn's #interop-outlet), or a new
            // editor whatever LinkedIn calls its classes this month.
            if (node.shadowRoot || node.id === 'interop-outlet' || node.isContentEditable ||
                (node.querySelector && node.querySelector('[contenteditable="true"]'))) {
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

      if (!relevant) return;

      // A new chat bubble / thread may have appeared: make sure every
      // composer has its own button (cheap when nothing is missing).
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(injectAIReplyButton, 400);
    });

    observer.observe(document.body, { childList: true, subtree: true });
    for (const sr of shadowRoots) observer.observe(sr, { childList: true, subtree: true });
  }

  // ═══════════════════════════════════════════
  //  GMAIL — AI Reply in reply windows
  //  Same engine, email channel: sign-off, no-reply detection, and the
  //  interview thank-you drafted automatically when Reply opens.
  // ═══════════════════════════════════════════
  const GMAIL_UNIT_ATTR = 'data-outreach-gmail-unit';
  const GMAIL_BODY_SEL = 'div[contenteditable="true"][g_editable="true"], div[contenteditable="true"][aria-label="Message Body"], div[contenteditable="true"][aria-label="Message body"]';
  const gmailSeen = new WeakSet();       // compose bodies already offered an auto-draft
  const gmailDrafts = new WeakMap();     // body → our last draft text

  function gmailMyEmail() {
    const acct = document.querySelector('a[aria-label^="Google Account"], a[aria-label*="Google Account:"]');
    const m = acct && (acct.getAttribute('aria-label') || '').match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/);
    return (m ? m[0] : DEFAULT_DETAILS.email).toLowerCase();
  }

  function gmailSendFor(body) {
    let cur = body.parentElement;
    for (let i = 0; cur && i < 14; i++, cur = cur.parentElement) {
      const b = cur.querySelector('div[role="button"][data-tooltip^="Send"], div[role="button"][aria-label^="Send"]');
      if (b) return { send: b, unit: cur };
    }
    return null;
  }

  // "Thu, 24 Sept 2026, 10:15" / "Sep 24, 2026, 10:15 AM" → Date (UK time)
  function gmailParseDate(label) {
    const s = String(label || '');
    const T = '(\\d{1,2}):(\\d{2})\\s*(am|pm)?';
    let m = s.match(new RegExp('(\\d{1,2})\\s+' + MONTH_RE + '\\w*\\.?\\s+(\\d{4}),?\\s*(?:at\\s+)?' + T, 'i'));
    let day, mon, year, h, min, ap;
    if (m) { [, day, mon, year, h, min, ap] = m; } else {
      m = s.match(new RegExp(MONTH_RE + '\\w*\\.?\\s+(\\d{1,2}),?\\s+(\\d{4}),?\\s*(?:at\\s+)?' + T, 'i'));
      if (!m) return null;
      [, mon, day, year, h, min, ap] = m;
    }
    h = +h;
    if (/pm/i.test(ap || '') && h < 12) h += 12;
    if (/am/i.test(ap || '') && h === 12) h = 0;
    return ukInstant(+year, monthIndex(mon), +day, h, +min);
  }

  function ukDaysAgo(date) {
    const a = ukParts(date);
    const b = ukParts(new Date());
    return Math.round((Date.UTC(b.y, b.m, b.d) - Date.UTC(a.y, a.m, a.d)) / 86400000);
  }

  // Drop quoted history ("On … wrote:", "> …", Outlook headers) and signatures.
  function stripQuoted(text) {
    const lines = String(text || '').split('\n');
    const out = [];
    for (const line of lines) {
      if (/^On .{3,200}wrote:\s*$/.test(line) || /^-{2,}\s*Original Message/i.test(line) || /^From:\s.+/.test(line) && out.length) break;
      if (/^--\s*$/.test(line)) break;
      if (/^>/.test(line)) continue;
      out.push(line);
    }
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  // The open thread in the same shape the LinkedIn scraper returns.
  function gmailConversation() {
    const main = document.querySelector('div[role="main"]') || document.body;
    const me = gmailMyEmail();
    const messages = [];
    main.querySelectorAll('div.adn').forEach(el => {
      const from = el.querySelector('span.gD');
      if (!from) return;
      const email = (from.getAttribute('email') || '').toLowerCase();
      const dateEl = el.querySelector('span.g3');
      const when = dateEl ? gmailParseDate(dateEl.getAttribute('title') || readText(dateEl)) : null;
      const bodyEl = el.querySelector('div.a3s');
      const text = stripQuoted(readText(bodyEl || el.querySelector('span.y2')));
      if (!text) return;
      messages.push({
        text,
        sender: cleanPersonName(from.getAttribute('name') || readText(from)),
        email,
        isMe: email ? email === me : null,
        day: when ? ukDaysAgo(when) : null,
      });
    });

    const mine = messages.filter(m => m.isMe === true);
    const lastFromMe = messages.length > 0 && messages[messages.length - 1].isMe === true;
    let end = messages.length - 1;
    while (end >= 0 && messages[end].isMe !== false) end--;
    let lastMessage = null;
    let partner = null;
    if (end >= 0) {
      let start = end;
      while (start > 0 && messages[start - 1].isMe === false) start--;
      const run = messages.slice(start, end + 1);
      partner = run[run.length - 1];
      lastMessage = { text: run.map(m => m.text).join('\n'), sender: partner.sender, isMe: false };
    }
    const partnerEmail = partner ? partner.email : '';
    return {
      messages: messages.slice(-10),
      lastMessage,
      partnerName: partner && looksLikeRealName(partner.sender) && !/@/.test(partner.sender) ? partner.sender : 'there',
      partnerEmail,
      noReplySender: /(^|[.+_-])(no-?reply|do-?not-?reply|notifications?|mailer-daemon|newsletters?|news|updates|marketing)@/i.test(partnerEmail),
      partnerCompany: '',
      partnerHeadline: '',
      partnerDegree: '',
      partnerReplied: messages.some(m => m.isMe === false),
      myCount: mine.length,
      lastMineDaysAgo: mine.length ? (mine[mine.length - 1].day ?? null) : null,
      lastFromMe,
      myOpener: mine.length ? mine[0].text : '',
      myLatest: mine.length ? mine[mine.length - 1].text : '',
      myMessagesText: mine.map(m => m.text).join('\n'),
      subject: readText(document.querySelector('h2.hP')),
    };
  }

  // Put the draft above Gmail's signature / quoted text, never over it.
  function gmailInsert(body, text) {
    body.querySelectorAll('.outreach-dm-draft').forEach(n => n.remove());
    const wrap = document.createElement('div');
    wrap.className = 'outreach-dm-draft';
    for (const line of text.split('\n')) {
      const div = document.createElement('div');
      if (line.trim()) div.textContent = line;
      else div.appendChild(document.createElement('br'));
      wrap.appendChild(div);
    }
    const rest = [...body.childNodes].some(n => (n.textContent || '').trim() || (n.querySelector && n.querySelector('img')));
    if (rest) {
      const gap = document.createElement('div');
      gap.appendChild(document.createElement('br'));
      wrap.appendChild(gap);
    }
    body.prepend(wrap);
    body.focus();
    const sel = window.getSelection();
    const r = document.createRange();
    r.selectNodeContents(wrap.lastChild && rest ? wrap.children[wrap.children.length - 2] || wrap : wrap);
    r.collapse(false);
    sel.removeAllRanges();
    sel.addRange(r);
    body.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    gmailDrafts.set(body, text);
  }

  function gmailBodyText(body) {
    const clone = body.cloneNode(true);
    clone.querySelectorAll('.gmail_signature, .gmail_quote, .gmail_extra, [data-smartmail]').forEach(n => n.remove());
    return norm(clone.textContent);
  }

  // Draft for the compose window `btn` belongs to. auto: only the thank-you.
  async function gmailDraft(body, { auto = false } = {}) {
    const conv = gmailConversation();
    if (!conv.messages.length) {
      if (!auto) showDMToast('Open an email thread and click Reply to draft a reply.', 'error');
      return null;
    }
    const profile = await getActiveProfile();
    const details = await getMyDetails(conv);
    const meta = {};
    const reply = generateResponse(profile, conv, { tone: currentTone, details, meta, channel: 'email' });
    if (auto && meta.intent !== 'thankyou') return meta;
    if (meta.noReply || !reply) {
      if (!auto) showDMToast(conv.lastFromMe ? 'No reply needed: you sent the last email.' : 'No reply needed: this looks like an automated email.', 'success');
      return meta;
    }
    gmailInsert(body, reply);
    const gaps = findPlaceholders(reply);
    if (meta.language) showDMToast(`${firstNameOf(conv.partnerName) || 'They'} wrote in ${meta.language}. This draft is in English, so translate it before sending.`, 'error');
    else if (gaps.length) showDMToast(`Fill in ${gaps.join(', ')} before sending.`, 'error');
    else if (meta.intent === 'thankyou') showDMToast('Drafted your interview thank-you. Review it, then press Send.', 'success');
    return meta;
  }

  function createGmailControls(body) {
    const group = document.createElement('span');
    group.className = CONTROLS_CLASS;
    group.style.marginLeft = '8px';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = AI_BTN_CLASS;
    btn.innerHTML = '<span style="display:inline-flex">✨</span><span>AI Reply</span>';
    btn.title = `AI Reply ${AI_REPLY_VERSION}: draft a reply to this email thread`;
    btn.addEventListener('click', async e => {
      e.preventDefault();
      e.stopPropagation();
      if (btn.dataset.busy === '1') return;
      setBusy(btn, true, 'Drafting...');
      try { await gmailDraft(body); } catch (err) {
        console.error('[OutreachPro Gmail] Draft error:', err);
        showDMToast('Could not generate reply. Try again.', 'error');
      } finally { setBusy(btn, false); }
    });

    const select = document.createElement('select');
    select.className = TONE_SELECT_CLASS;
    select.title = 'Reply tone';
    for (const [value, label] of Object.entries(TONES)) {
      const o = document.createElement('option');
      o.value = value;
      o.textContent = label;
      select.appendChild(o);
    }
    select.value = currentTone;
    ['click', 'mousedown', 'keydown'].forEach(ev => select.addEventListener(ev, e => e.stopPropagation()));
    select.addEventListener('change', async () => {
      currentTone = TONES[select.value] ? select.value : 'professional';
      storageSet({ [TONE_KEY]: currentTone });
      document.querySelectorAll('select.' + TONE_SELECT_CLASS).forEach(s => { s.value = currentTone; });
      // Redo our draft in the new tone unless it has been edited.
      const draft = body.querySelector('.outreach-dm-draft');
      if (draft && norm(draft.textContent) === norm((gmailDrafts.get(body) || '').replace(/\n/g, ' '))) {
        btn.click();
      } else {
        showDMToast(`Tone: ${TONES[currentTone]}`, 'success');
      }
    });

    group.append(btn, select);
    return group;
  }

  function gmailInject() {
    for (const body of document.querySelectorAll(GMAIL_BODY_SEL)) {
      if (!isVisible(body)) continue;
      const found = gmailSendFor(body);
      if (!found) continue;
      const { send, unit } = found;
      if (!unit.querySelector('.' + CONTROLS_CLASS)) {
        unit.setAttribute(GMAIL_UNIT_ATTR, '1');
        const group = createGmailControls(body);
        const td = send.closest('td');
        if (td && td.parentElement && td.parentElement.tagName === 'TR') {
          const cell = document.createElement('td');
          cell.appendChild(group);
          td.after(cell);
        } else {
          (send.parentElement || send).after(group);
        }
      }
      // A reply window just opened on a thread whose interview is over →
      // draft the thank-you straight away (only into an empty reply).
      const isReply = !!document.querySelector('h2.hP') && !(unit.querySelector('input[name="subjectbox"]') && isVisible(unit.querySelector('input[name="subjectbox"]')));
      if (isReply && !gmailSeen.has(body)) {
        gmailSeen.add(body);
        if (!gmailBodyText(body)) gmailDraft(body, { auto: true }).catch(() => {});
      }
    }
  }

  function initGmail() {
    if (window.__outreachDmInit) return;
    window.__outreachDmInit = true;
    injectDMStyles();
    loadTone().then(t => document.querySelectorAll('select.' + TONE_SELECT_CLASS).forEach(s => { s.value = t; }));
    let timer = null;
    new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(gmailInject, 300);
    }).observe(document.body, { childList: true, subtree: true });
    setTimeout(gmailInject, 300);
    setInterval(gmailInject, 2500);
  }

  // The top LinkedIn window, when this frame may read it (same origin).
  function topWindow() {
    try {
      if (window.top && window.top !== window && window.top.location.hostname) return window.top;
    } catch (e) { /* cross-origin frame */ }
    return null;
  }

  function init() {
    // Runs in every LinkedIn frame (manifest all_frames): LinkedIn now
    // renders the messaging page and chat bubbles inside a same-origin
    // iframe (/preload/?_bprMode=vanilla) that a top-frame-only script
    // can't see. about:blank / srcdoc frames have no hostname of their
    // own, so check the top window's.
    const top = topWindow();
    const host = location.hostname || (top ? top.location.hostname : '');
    if (host === 'mail.google.com') {
      if (window === window.top) initGmail();
      return;
    }
    if (!host.includes('linkedin.com')) return;
    // Guard against a second init in the same frame.
    if (window.__outreachDmInit) return;
    window.__outreachDmInit = true;
    log('🚀 Initializing AI DM Response Generator v2');
    injectDMStyles();
    attachActiveScopeTracking();
    loadTone().then(t => deepQueryAll('select.' + TONE_SELECT_CLASS).forEach(s => { s.value = t; }));
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes[TONE_KEY]) return;
        const t = changes[TONE_KEY].newValue;
        if (!TONES[t]) return;
        currentTone = t;
        deepQueryAll('select.' + TONE_SELECT_CLASS).forEach(s => { s.value = t; });
      });
    } catch (e) { /* storage events unavailable */ }

    // First pass right away (chats may already be open, including inside
    // shadow roots), then a few retries while LinkedIn finishes loading.
    setTimeout(injectAIReplyButton, 300);

    // Also always try at intervals (LinkedIn is slow to load)
    setTimeout(injectAIReplyButton, 2000);
    setTimeout(injectAIReplyButton, 5000);
    setTimeout(injectAIReplyButton, 8000);

    startObserving();

    // Slow safety net: a shadow root can be attached to an element that is
    // already on the page, which no MutationObserver reports. Cheap when
    // every chat already has its button.
    setInterval(injectAIReplyButton, 3000);

    // Watch URL changes (LinkedIn is an SPA)
    // Inside the messaging iframe our own URL never changes; the thread URL
    // lives on the top window. Watch both.
    const currentUrl = () => {
      const t = topWindow();
      return location.href + '|' + (t ? t.location.href : '');
    };
    lastMsgUrl = currentUrl();
    setInterval(() => {
      if (currentUrl() !== lastMsgUrl) {
        lastMsgUrl = currentUrl();
        // Drop any stale composer reference from the previous page/conv.
        lastActiveComposer = null;
        // The panel was built for the previous conversation — close it.
        // Buttons stay: each is tied to its own composer and scrapes at
        // click time, so it is never stale.
        if (aiPanel) { aiPanel.remove(); aiPanel = null; }

        // Pick up any composer LinkedIn re-rendered during navigation.
        setTimeout(injectAIReplyButton, 800);
        setTimeout(injectAIReplyButton, 2500);
      }
    }, 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
