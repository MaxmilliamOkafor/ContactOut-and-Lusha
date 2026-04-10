/**
 * OutreachPro — LinkedIn Profile Outreach Injector
 *
 * Injects a prominent "Connect with AI message" button beside LinkedIn's
 * native action buttons (Message, Follow, More).
 *
 * Zero limitations — no tokens, coins, or API limits.
 */
(function () {
  'use strict';

  const WRAPPER_CLASS = 'outreach-pro-wrapper';
  const BUTTON_CLASS = 'outreach-pro-btn';
  const PANEL_CLASS = 'outreach-pro-panel';
  let currentPanel = null;
  let observer = null;
  let lastUrl = '';

  // ═══════════════════════════════════════════════════════════════
  // 1. Inject Styles (inline — no external CSS dependency)
  // ═══════════════════════════════════════════════════════════════
  function injectStyles() {
    if (document.getElementById('outreach-pro-injected-css')) return;
    const style = document.createElement('style');
    style.id = 'outreach-pro-injected-css';
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

      .${WRAPPER_CLASS} {
        display: inline-flex;
        position: relative;
        vertical-align: middle;
        z-index: 100;
        align-items: center;
        margin-left: 8px;
      }

      .${BUTTON_CLASS} {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 0 20px;
        height: 32px;
        background: linear-gradient(135deg, #F59E0B 0%, #F97316 50%, #EF4444 100%);
        border: none;
        border-radius: 16px;
        color: #fff;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        box-shadow: 0 2px 12px rgba(249, 115, 22, 0.35);
        white-space: nowrap;
        letter-spacing: 0.01em;
        animation: outreach-glow 3s ease-in-out infinite;
      }
      .${BUTTON_CLASS}:hover {
        transform: translateY(-1px) scale(1.03);
        box-shadow: 0 6px 24px rgba(249, 115, 22, 0.5);
      }
      .${BUTTON_CLASS} .ai-spark { animation: outreach-spark 2s ease-in-out infinite; display: inline-flex; }

      @keyframes outreach-glow {
        0%, 100% { box-shadow: 0 2px 12px rgba(249,115,22,0.35); }
        50% { box-shadow: 0 4px 20px rgba(249,115,22,0.55); }
      }
      @keyframes outreach-spark {
        0%, 100% { transform: scale(1) rotate(0deg); }
        25% { transform: scale(1.2) rotate(5deg); }
        75% { transform: scale(0.95) rotate(-3deg); }
      }

      .outreach-pro-badge {
        position: absolute;
        top: -18px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(249,115,22,0.12);
        color: #F97316;
        font-size: 9px;
        font-weight: 700;
        padding: 2px 8px;
        border-radius: 8px;
        letter-spacing: 0.05em;
        white-space: nowrap;
        font-family: 'Inter', sans-serif;
        pointer-events: none;
        text-transform: uppercase;
      }

      .${PANEL_CLASS} {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 420px;
        max-height: 580px;
        overflow-y: auto;
        background: #fff;
        border: 1px solid rgba(0,0,0,0.08);
        border-radius: 16px;
        box-shadow: 0 24px 80px rgba(0,0,0,0.15), 0 8px 32px rgba(0,0,0,0.08);
        z-index: 2147483641;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        animation: outreach-panel-in 0.3s cubic-bezier(0.34,1.56,0.64,1);
        color: #1a1a2e;
      }
      /* Dark mode panel */
      .theme--dark .${PANEL_CLASS},
      html[data-color-theme="dark"] .${PANEL_CLASS} {
        background: #1e1e2e;
        border-color: rgba(255,255,255,0.08);
        color: #e0e0e8;
      }
      .theme--dark .op-textarea, html[data-color-theme="dark"] .op-textarea {
        background: #2a2a3e; border-color: rgba(255,255,255,0.12); color: #e0e0e8;
      }
      .theme--dark .op-tabs, html[data-color-theme="dark"] .op-tabs { background: #16161e; }
      .theme--dark .op-tab, html[data-color-theme="dark"] .op-tab { color: #888; }
      .theme--dark .op-tones, html[data-color-theme="dark"] .op-tones { border-color: rgba(255,255,255,0.06); }
      .theme--dark .op-tone, html[data-color-theme="dark"] .op-tone { background: #2a2a3e; border-color: rgba(255,255,255,0.1); color: #aaa; }
      .theme--dark .op-sec-btn, html[data-color-theme="dark"] .op-sec-btn { background: #2a2a3e; border-color: rgba(255,255,255,0.1); color: #ccc; }
      .theme--dark .op-footer, html[data-color-theme="dark"] .op-footer { background: #16161e; border-color: rgba(255,255,255,0.06); }
      .theme--dark .op-cv-prompt, html[data-color-theme="dark"] .op-cv-prompt { background: rgba(249,115,22,0.06); border-color: rgba(255,255,255,0.06); }
      .op-overlay {
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.4); z-index: 2147483640;
        animation: op-fade-in 0.2s ease;
      }
      @keyframes op-fade-in { from { opacity: 0; } to { opacity: 1; } }
      @keyframes outreach-panel-in {
        from { opacity: 0; transform: translate(-50%, -50%) translateY(-12px) scale(0.96); }
        to { opacity: 1; transform: translate(-50%, -50%) translateY(0) scale(1); }
      }

      .op-header {
        padding: 16px 20px;
        background: linear-gradient(135deg, #F59E0B 0%, #F97316 50%, #EF4444 100%);
        color: #fff;
        border-radius: 16px 16px 0 0;
        position: relative;
      }
      .op-header .op-name { font-size: 15px; font-weight: 700; }
      .op-header .op-headline { font-size: 12px; opacity: 0.9; margin-top: 2px; }
      .op-header .op-close {
        position: absolute; top: 12px; right: 16px;
        background: rgba(255,255,255,0.2); border: none; color: #fff;
        width: 28px; height: 28px; border-radius: 50%; cursor: pointer;
        font-size: 16px; display: flex; align-items: center; justify-content: center;
      }
      .op-header .op-close:hover { background: rgba(255,255,255,0.35); }
      .op-header .op-unlimited {
        display: inline-flex; align-items: center; gap: 4px;
        font-size: 10px; font-weight: 700; background: rgba(255,255,255,0.2);
        padding: 3px 10px; border-radius: 10px; margin-top: 8px; text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .op-tabs {
        display: flex; border-bottom: 1px solid #f0f0f5; background: #fafafa;
      }
      .op-tab {
        flex: 1; padding: 10px 4px; font-size: 11px; font-weight: 600; text-align: center;
        cursor: pointer; color: #888; border: none; border-bottom: 2px solid transparent;
        background: none; font-family: inherit; transition: all 0.2s;
      }
      .op-tab:hover { color: #F97316; background: rgba(249,115,22,0.04); }
      .op-tab.active { color: #F97316; border-bottom-color: #F97316; }

      .op-tones {
        display: flex; gap: 6px; padding: 10px 16px; border-bottom: 1px solid #f0f0f5;
      }
      .op-tone {
        padding: 5px 12px; font-size: 11px; font-weight: 500;
        border: 1px solid #e0e0e5; border-radius: 20px; background: #fff;
        cursor: pointer; font-family: inherit; color: #666; transition: all 0.2s;
      }
      .op-tone:hover { border-color: #F97316; color: #F97316; }
      .op-tone.active {
        background: linear-gradient(135deg, #F59E0B, #F97316); color: #fff;
        border-color: transparent; box-shadow: 0 2px 8px rgba(249,115,22,0.3);
      }

      .op-msg-area { padding: 16px; }
      .op-textarea {
        width: 100%; min-height: 130px; border: 1.5px solid #e8e8ed; border-radius: 12px;
        padding: 14px; font-size: 13px; font-family: 'Inter', sans-serif; line-height: 1.6;
        resize: vertical; outline: none; color: #1a1a2e; box-sizing: border-box;
      }
      .op-textarea:focus { border-color: #F97316; box-shadow: 0 0 0 3px rgba(249,115,22,0.12); }
      .op-charcount { font-size: 11px; color: #999; text-align: right; margin-top: 6px; }
      .op-charcount.warn { color: #EF4444; font-weight: 600; }

      .op-actions {
        display: flex; gap: 8px; padding: 0 16px 16px; justify-content: space-between; align-items: center;
      }
      .op-gen-btn {
        display: inline-flex; align-items: center; gap: 6px; padding: 10px 18px;
        font-size: 13px; font-weight: 600;
        background: linear-gradient(135deg, #F59E0B, #F97316, #EF4444);
        color: #fff; border: none; border-radius: 10px; cursor: pointer;
        font-family: inherit; box-shadow: 0 2px 10px rgba(249,115,22,0.3);
        transition: all 0.25s;
      }
      .op-gen-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 18px rgba(249,115,22,0.45); }
      .op-sec-btn {
        padding: 10px 16px; font-size: 12px; font-weight: 500;
        background: #fff; color: #666; border: 1.5px solid #e0e0e5; border-radius: 10px;
        cursor: pointer; font-family: inherit; transition: all 0.2s;
      }
      .op-sec-btn:hover { border-color: #F97316; color: #F97316; }

      .op-insert-btn {
        padding: 10px 16px; font-size: 12px; font-weight: 600;
        background: #0077B5; color: #fff; border: none; border-radius: 10px;
        cursor: pointer; font-family: inherit;
      }
      .op-insert-btn:hover { background: #005e8f; }

      .op-cv-prompt {
        padding: 12px 16px; background: rgba(249,115,22,0.04); border-top: 1px solid #f0f0f5;
        font-size: 12px; color: #888; display: flex; align-items: center; gap: 10px;
      }
      .op-cv-prompt a { color: #F97316; font-weight: 600; text-decoration: none; cursor: pointer; }
      .op-cv-prompt a:hover { text-decoration: underline; }

      .op-footer {
        padding: 10px 16px; background: #fafafa; border-top: 1px solid #f0f0f5;
        text-align: center; font-size: 10px; color: #bbb; border-radius: 0 0 16px 16px;
      }
      .op-footer .op-hl { color: #F97316; font-weight: 700; }

      .op-skel {
        background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
        background-size: 200% 100%; animation: op-shimmer 1.5s infinite;
        border-radius: 6px; height: 14px; margin-bottom: 8px;
      }
      .op-skel.s { width: 60%; } .op-skel.m { width: 80%; } .op-skel.l { width: 95%; }
      @keyframes op-shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
    `;
    document.head.appendChild(style);
  }

  // ═══════════════════════════════════════════════════════════════
  // 2. Profile Data Scraping
  // ═══════════════════════════════════════════════════════════════
  function scrapeProfile() {
    const d = { name: '', headline: '', company: '', location: '', about: '', profileUrl: location.href };

    // Name — try multiple selectors
    const nameEl = document.querySelector('h1') || document.querySelector('.text-heading-xlarge');
    if (nameEl) d.name = nameEl.textContent.trim();

    // Headline
    const hlEl = document.querySelector('.text-body-medium.break-words') ||
                 document.querySelector('[data-anonymize="headline-text"]');
    if (hlEl) d.headline = hlEl.textContent.trim();

    // Company from headline
    if (d.headline.includes(' at ')) d.company = d.headline.split(' at ').pop().trim();
    else if (d.headline.includes(' @ ')) d.company = d.headline.split(' @ ').pop().trim();

    // Location
    const locEl = document.querySelector('.text-body-small.inline.t-black--light.break-words');
    if (locEl) d.location = locEl.textContent.trim();

    // About
    const aboutEl = document.querySelector('#about');
    if (aboutEl) {
      const container = aboutEl.closest('section');
      if (container) {
        const textEl = container.querySelector('.inline-show-more-text, .pv-shared-text-with-see-more, span[aria-hidden="true"]');
        if (textEl) d.about = textEl.textContent.trim().substring(0, 500);
      }
    }

    return d;
  }

  // ═══════════════════════════════════════════════════════════════
  // 3. Find the Action Bar (scoped to main profile card ONLY)
  // ═══════════════════════════════════════════════════════════════

  // Helper: check element is in the main content, NOT in sidebar/aside
  function isInMainContent(el) {
    let node = el;
    while (node) {
      const tag = node.tagName ? node.tagName.toLowerCase() : '';
      // Reject if inside aside, sidebar, or "people you may know" sections
      if (tag === 'aside') return false;
      if (node.classList && (
        node.classList.contains('scaffold-layout__aside') ||
        node.classList.contains('scaffold-layout__sidebar') ||
        node.classList.contains('artdeco-card') && node.closest('aside')
      )) return false;
      // Accept if we've reached the main content area
      if (node.classList && (
        node.classList.contains('scaffold-layout__main') ||
        node.classList.contains('scaffold-layout__content')
      )) return true;
      if (tag === 'main') return true;
      node = node.parentElement;
    }
    return true; // default allow if no sidebar found
  }

  function findActionBar() {
    // Get the main content area to scope searches
    const mainContent = document.querySelector('.scaffold-layout__main, main, .scaffold-layout__content') || document.body;

    // Strategy 1: Direct selectors for known LinkedIn action bar containers
    const directSelectors = [
      '.pvs-profile-actions',
      '.pv-top-card-v2-ctas',
      '.pv-top-card-v3__action-bar',
      '.pv-s-profile-actions',
    ];
    for (const sel of directSelectors) {
      const el = mainContent.querySelector(sel);
      if (el && isInMainContent(el)) {
        console.log('[OutreachPro] Found action bar via:', sel);
        return el;
      }
    }

    // Strategy 2: Find Message/Connect buttons ONLY in main content
    // Use querySelectorAll and check each to ensure it's in the main profile card
    const btnSelectors = [
      'button[aria-label*="Message"]',
      'button[aria-label*="message"]',
      'button[aria-label*="Connect"]',
      'button[aria-label*="connect"]',
      'button[aria-label*="Pending"]',
      'button[aria-label*="More actions"]',
      'button[aria-label*="Follow"]',
    ];

    for (const sel of btnSelectors) {
      const buttons = mainContent.querySelectorAll(sel);
      for (const btn of buttons) {
        // CRITICAL: Skip buttons that are in the sidebar/aside
        if (!isInMainContent(btn)) continue;

        // Walk up to find the flex container parent (the action bar row)
        let parent = btn.parentElement;
        for (let i = 0; i < 5; i++) {
          if (!parent) break;
          if (!isInMainContent(parent)) break;
          const style = getComputedStyle(parent);
          // The action bar is a flex row containing multiple buttons
          if ((style.display === 'flex' || style.display === 'inline-flex') && parent.querySelectorAll('button, a').length >= 2) {
            console.log('[OutreachPro] Found action bar via button parent:', sel);
            return parent;
          }
          parent = parent.parentElement;
        }
      }
    }

    // Strategy 3: Text-based search scoped to the first artdeco-card in main content
    const topCard = mainContent.querySelector('.artdeco-card, .pv-top-card');
    if (topCard && isInMainContent(topCard)) {
      const buttons = topCard.querySelectorAll('button');
      for (const btn of buttons) {
        const text = btn.textContent.trim().toLowerCase();
        if (text === 'message' || text === 'connect' || text === 'follow' || text === 'more' || text.includes('pending')) {
          let parent = btn.parentElement;
          for (let i = 0; i < 4; i++) {
            if (!parent) break;
            const childBtns = parent.querySelectorAll('button');
            // The action bar row should have 2-6 buttons (Connect, Message, More, etc.)
            if (childBtns.length >= 2 && childBtns.length <= 8) {
              console.log('[OutreachPro] Found action bar via text search in top card');
              return parent;
            }
            parent = parent.parentElement;
          }
        }
      }
    }

    console.log('[OutreachPro] Action bar not found');
    return null;
  }

  // ═══════════════════════════════════════════════════════════════
  // 4. Button Injection
  // ═══════════════════════════════════════════════════════════════
  function injectButton() {
    // Guard: not a profile page
    if (!location.pathname.startsWith('/in/')) return;
    // Guard: already injected
    if (document.querySelector('.' + WRAPPER_CLASS)) return;

    const actionBar = findActionBar();
    if (!actionBar) return;

    const wrapper = document.createElement('div');
    wrapper.className = WRAPPER_CLASS;

    const badge = document.createElement('span');
    badge.className = 'outreach-pro-badge';
    badge.textContent = '✨ AI Powered';

    const btn = document.createElement('button');
    btn.className = BUTTON_CLASS;
    btn.innerHTML = '<span class="ai-spark">✨</span><span>Connect with AI message</span>';
    btn.title = 'Generate personalized outreach with AI';

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      togglePanel(wrapper);
    });

    wrapper.appendChild(badge);
    wrapper.appendChild(btn);
    actionBar.appendChild(wrapper);

    console.log('[OutreachPro] ✅ Button injected!');
  }

  // ═══════════════════════════════════════════════════════════════
  // 5. Panel Toggle & Build
  // ═══════════════════════════════════════════════════════════════
  function togglePanel(wrapper) {
    if (currentPanel) {
      // Close existing
      const overlay = document.querySelector('.op-overlay');
      if (overlay) overlay.remove();
      currentPanel.remove();
      currentPanel = null;
      return;
    }

    const profile = scrapeProfile();

    // Create backdrop overlay
    const overlay = document.createElement('div');
    overlay.className = 'op-overlay';
    document.body.appendChild(overlay);

    // Create panel (fixed centered)
    const panel = document.createElement('div');
    panel.className = PANEL_CLASS;
    const name = profile.name || 'LinkedIn User';
    const hl = profile.headline ? (profile.headline.length > 55 ? profile.headline.substring(0, 52) + '...' : profile.headline) : '';

    panel.innerHTML = `
      <div class="op-header">
        <button class="op-close" id="op-close">×</button>
        <div class="op-name">${esc(name)}</div>
        ${hl ? '<div class="op-headline">' + esc(hl) + '</div>' : ''}
        <div class="op-unlimited"><span>∞</span> Unlimited — No limits, no tokens</div>
      </div>
      <div class="op-tabs">
        <button class="op-tab active" data-t="connection_request">🤝 Connection</button>
        <button class="op-tab" data-t="direct_message">💬 DM</button>
        <button class="op-tab" data-t="email">✉️ Email</button>
        <button class="op-tab" data-t="follow_up">🔄 Follow-up</button>
      </div>
      <div class="op-tones">
        <button class="op-tone active" data-tone="professional">Professional</button>
        <button class="op-tone" data-tone="casual">Casual</button>
        <button class="op-tone" data-tone="enthusiastic">Enthusiastic</button>
        <button class="op-tone" data-tone="witty">Witty</button>
      </div>
      <div class="op-msg-area">
        <div id="op-skel"><div class="op-skel l"></div><div class="op-skel m"></div><div class="op-skel l"></div><div class="op-skel s"></div></div>
        <textarea class="op-textarea" id="op-textarea" placeholder="Click Generate to create your message..." style="display:none;"></textarea>
        <div class="op-charcount" id="op-charcount" style="display:none;"></div>
      </div>
      <div class="op-actions">
        <button class="op-gen-btn" id="op-gen">✨ Generate Message</button>
        <div style="display:flex;gap:6px;">
          <button class="op-sec-btn" id="op-copy" style="display:none;">📋 Copy</button>
          <button class="op-insert-btn" id="op-insert" style="display:none;">➤ Insert</button>
        </div>
      </div>
      <div class="op-cv-prompt" id="op-cv-prompt">
        <span>📄</span><span><a id="op-cv-link">Upload your CV</a> for better personalization</span>
      </div>
      <div class="op-footer">Powered by <span class="op-hl">OutreachPro</span> — <span class="op-hl">∞ Unlimited</span> messages</div>
    `;

    document.body.appendChild(panel);
    currentPanel = panel;

    // Close on overlay click
    overlay.onclick = () => {
      overlay.remove();
      panel.remove();
      currentPanel = null;
    };
    // Close button
    panel.querySelector('#op-close').onclick = () => {
      overlay.remove();
      panel.remove();
      currentPanel = null;
    };

    setupPanelHandlers(panel, profile);
  }

  // ═══════════════════════════════════════════════════════════════
  // 6. Panel Handlers
  // ═══════════════════════════════════════════════════════════════
  async function setupPanelHandlers(panel, profile) {
    let type = 'connection_request';
    let tone = 'professional';

    // Load CV from storage
    let cv = { name: '', summary: '', skills: '', experience: '' };
    try {
      const r = await chrome.storage.local.get('outreach_pro_user_cv');
      if (r.outreach_pro_user_cv) {
        cv = r.outreach_pro_user_cv;
        if (cv.summary || cv.skills || cv.experience) {
          const prompt = panel.querySelector('#op-cv-prompt');
          if (prompt) prompt.style.display = 'none';
        }
      }
    } catch (e) {}

    const textarea = panel.querySelector('#op-textarea');
    const charcount = panel.querySelector('#op-charcount');
    const skel = panel.querySelector('#op-skel');
    const genBtn = panel.querySelector('#op-gen');
    const copyBtn = panel.querySelector('#op-copy');
    const insertBtn = panel.querySelector('#op-insert');

    // Tabs
    panel.querySelectorAll('.op-tab').forEach(tab => {
      tab.onclick = () => {
        panel.querySelectorAll('.op-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        type = tab.dataset.t;
        if (textarea.style.display !== 'none') doGenerate();
      };
    });

    // Tones
    panel.querySelectorAll('.op-tone').forEach(btn => {
      btn.onclick = () => {
        panel.querySelectorAll('.op-tone').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        tone = btn.dataset.tone;
        if (textarea.style.display !== 'none') doGenerate();
      };
    });

    // Generate
    function doGenerate() {
      genBtn.innerHTML = '⏳ Writing drafts...';
      skel.style.display = 'block';
      textarea.style.display = 'none';
      charcount.style.display = 'none';
      copyBtn.style.display = 'none';
      insertBtn.style.display = 'none';

      setTimeout(() => {
        const result = window.OutreachMessageGenerator.generate(type, profile, cv, tone);
        textarea.value = result.message;
        textarea.style.display = 'block';
        skel.style.display = 'none';
        copyBtn.style.display = 'inline-flex';
        if (type === 'connection_request' || type === 'direct_message') {
          insertBtn.style.display = 'inline-flex';
        }
        if (result.charCount !== undefined) {
          charcount.style.display = 'block';
          charcount.textContent = result.charCount + ' / ' + (result.limit || 300) + ' characters';
          charcount.className = 'op-charcount' + (result.charCount > (result.limit || 300) ? ' warn' : '');
        } else {
          charcount.style.display = 'block';
          charcount.textContent = result.message.length + ' characters';
          charcount.className = 'op-charcount';
        }
        genBtn.innerHTML = '✨ Regenerate';
      }, 700);
    }

    genBtn.onclick = doGenerate;
    doGenerate(); // auto-generate on open

    // Textarea live char count
    textarea.oninput = () => {
      const len = textarea.value.length;
      if (type === 'connection_request') {
        charcount.textContent = len + ' / 300 characters';
        charcount.className = 'op-charcount' + (len > 300 ? ' warn' : '');
      } else {
        charcount.textContent = len + ' characters';
        charcount.className = 'op-charcount';
      }
    };

    // Copy
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(textarea.value).then(() => {
        copyBtn.textContent = '✅ Copied!';
        setTimeout(() => { copyBtn.textContent = '📋 Copy'; }, 2000);
      });
    };

    // Insert into LinkedIn
    insertBtn.onclick = () => {
      if (type === 'connection_request') {
        const connectBtn = document.querySelector('button[aria-label*="Connect"], button[aria-label*="Invite"]');
        if (connectBtn) {
          connectBtn.click();
          setTimeout(() => {
            const addNote = document.querySelector('button[aria-label="Add a note"], button.artdeco-button--secondary');
            if (addNote) { addNote.click(); setTimeout(() => {
              const ta = document.querySelector('textarea[name="message"], textarea#custom-message, .send-invite__custom-message');
              if (ta) { ta.value = textarea.value; ta.dispatchEvent(new Event('input', {bubbles:true})); }
            }, 500); }
          }, 800);
        }
      } else {
        const msgBtn = document.querySelector('button[aria-label*="Message"], a[aria-label*="Message"]');
        if (msgBtn) {
          msgBtn.click();
          setTimeout(() => {
            const box = document.querySelector('.msg-form__contenteditable, div[role="textbox"][contenteditable="true"]');
            if (box) { box.focus(); box.innerHTML = '<p>' + esc(textarea.value) + '</p>'; box.dispatchEvent(new Event('input', {bubbles:true})); }
          }, 1000);
        }
      }
    };

    // CV upload link
    const cvLink = panel.querySelector('#op-cv-link');
    if (cvLink) {
      cvLink.onclick = (e) => {
        e.preventDefault();
        openCVModal(panel);
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 7. CV Upload Modal
  // ═══════════════════════════════════════════════════════════════
  function openCVModal(parentPanel) {
    const modal = document.createElement('div');
    modal.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(255,255,255,0.98);z-index:10;padding:20px;overflow-y:auto;font-family:Inter,sans-serif;border-radius:16px;display:flex;flex-direction:column;';
    modal.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h3 style="font-size:16px;font-weight:700;margin:0">📄 Upload Your Background</h3>
        <button id="cv-close" style="background:#f0f0f5;border:none;width:30px;height:30px;border-radius:50%;cursor:pointer;font-size:16px">×</button>
      </div>
      <p style="font-size:12px;color:#888;margin-bottom:16px">Paste your resume text so AI-generated messages match your background.</p>
      <div style="margin-bottom:14px"><label style="font-size:11px;font-weight:600;color:#555;display:block;margin-bottom:4px">Your Name</label>
        <input type="text" id="cv-name" placeholder="John Smith" style="width:100%;padding:10px;border:1.5px solid #e0e0e5;border-radius:10px;font-size:13px;font-family:inherit;outline:none;box-sizing:border-box" /></div>
      <div style="margin-bottom:14px"><label style="font-size:11px;font-weight:600;color:#555;display:block;margin-bottom:4px">Resume / CV Text</label>
        <textarea id="cv-text" placeholder="Paste resume text here..." style="width:100%;min-height:120px;padding:12px;border:1.5px solid #e0e0e5;border-radius:10px;font-size:12px;font-family:inherit;resize:vertical;outline:none;box-sizing:border-box"></textarea></div>
      <div style="margin-bottom:14px"><label style="font-size:11px;font-weight:600;color:#555;display:block;margin-bottom:4px">Website URL (optional)</label>
        <input type="url" id="cv-web" placeholder="https://yoursite.com" style="width:100%;padding:10px;border:1.5px solid #e0e0e5;border-radius:10px;font-size:13px;font-family:inherit;outline:none;box-sizing:border-box" /></div>
      <button id="cv-save" style="width:100%;padding:12px;font-size:14px;font-weight:600;background:linear-gradient(135deg,#F59E0B,#F97316,#EF4444);color:#fff;border:none;border-radius:10px;cursor:pointer;font-family:inherit;box-shadow:0 3px 12px rgba(249,115,22,0.3)">💾 Save & Personalize</button>
      <p style="font-size:10px;color:#bbb;text-align:center;margin-top:10px">All data stored locally. Never sent externally.</p>
    `;
    parentPanel.appendChild(modal);

    // Load existing
    chrome.storage.local.get('outreach_pro_user_cv', (r) => {
      const c = r.outreach_pro_user_cv || {};
      if (c.name) modal.querySelector('#cv-name').value = c.name;
      if (c.rawText) modal.querySelector('#cv-text').value = c.rawText;
      if (c.website) modal.querySelector('#cv-web').value = c.website;
    });

    modal.querySelector('#cv-close').onclick = () => modal.remove();
    modal.querySelector('#cv-save').onclick = () => {
      const name = modal.querySelector('#cv-name').value.trim();
      const raw = modal.querySelector('#cv-text').value.trim();
      const web = modal.querySelector('#cv-web').value.trim();
      const lines = raw.split('\n').filter(l => l.trim());
      const cvData = {
        name: name || (lines[0] && lines[0].length < 60 ? lines[0] : ''),
        summary: lines.slice(1, 5).join(' ').substring(0, 400),
        skills: '', experience: lines.slice(5).join(' ').substring(0, 600),
        education: '', rawText: raw, website: web,
        lastUpdated: new Date().toISOString(),
      };
      chrome.storage.local.set({ outreach_pro_user_cv: cvData }, () => {
        const btn = modal.querySelector('#cv-save');
        btn.textContent = '✅ Saved!';
        btn.style.background = '#10B981';
        const prompt = parentPanel.querySelector('#op-cv-prompt');
        if (prompt) prompt.style.display = 'none';
        setTimeout(() => modal.remove(), 1000);
      });
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // 8. Utilities
  // ═══════════════════════════════════════════════════════════════
  function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  // ═══════════════════════════════════════════════════════════════
  // 9. SPA Observer & Init
  // ═══════════════════════════════════════════════════════════════
  function startObserving() {
    if (observer) observer.disconnect();
    let timer = null;
    observer = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (location.pathname.startsWith('/in/') && !document.querySelector('.' + WRAPPER_CLASS)) {
          injectButton();
        }
      }, 1000);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function init() {
    if (!location.hostname.includes('linkedin.com')) return;
    console.log('[OutreachPro] Initializing on:', location.href);
    injectStyles();

    // Try injecting at multiple intervals (LinkedIn loads content lazily)
    setTimeout(injectButton, 1500);
    setTimeout(injectButton, 3000);
    setTimeout(injectButton, 5000);
    setTimeout(injectButton, 8000);

    startObserving();

    // Watch URL changes
    lastUrl = location.href;
    setInterval(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        document.querySelectorAll('.' + WRAPPER_CLASS).forEach(w => w.remove());
        if (currentPanel) { currentPanel.remove(); currentPanel = null; }
        const overlay = document.querySelector('.op-overlay');
        if (overlay) overlay.remove();
        setTimeout(injectButton, 2000);
        setTimeout(injectButton, 4000);
      }
    }, 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
