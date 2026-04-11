/**
 * OutreachPro - LinkedIn Profile Outreach Injector
 *
 * Injects a prominent "Connect with AI message" button beside LinkedIn's
 * native action buttons (Message, Follow, More).
 *
 * Zero limitations - no tokens, coins, or API limits.
 */
(function () {
  'use strict';

  const WRAPPER_CLASS = 'outreach-pro-wrapper';
  const BUTTON_CLASS = 'outreach-pro-btn';
  const PANEL_CLASS = 'outreach-pro-panel';
  let currentPanel = null;
  let observer = null;
  let lastUrl = '';

  // ===================================================================
  // 1. Inject Styles (inline - no external CSS dependency)
  // ===================================================================
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
      .theme--dark .op-cv-modal, html[data-color-theme="dark"] .op-cv-modal {
        background: #1e1e2e !important; color: #e0e0e8 !important;
      }
      .theme--dark .op-cv-modal input, .theme--dark .op-cv-modal textarea,
      html[data-color-theme="dark"] .op-cv-modal input, html[data-color-theme="dark"] .op-cv-modal textarea {
        background: #2a2a3e !important; color: #e0e0e8 !important; border-color: rgba(255,255,255,0.12) !important;
      }
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

      /* File upload drop zone */
      .op-drop-zone {
        border: 2px dashed #e0e0e5;
        border-radius: 12px;
        padding: 24px 16px;
        text-align: center;
        cursor: pointer;
        transition: all 0.2s;
        margin-bottom: 12px;
      }
      .op-drop-zone:hover, .op-drop-zone.dragover {
        border-color: #F97316;
        background: rgba(249,115,22,0.04);
      }
      .op-drop-zone .drop-icon { font-size: 28px; margin-bottom: 6px; }
      .op-drop-zone .drop-text { font-size: 12px; color: #888; }
      .op-drop-zone .drop-formats { font-size: 10px; color: #bbb; margin-top: 4px; }

      .op-file-info {
        display: flex; align-items: center; gap: 10px;
        padding: 12px; background: rgba(16,185,129,0.06);
        border: 1px solid rgba(16,185,129,0.2);
        border-radius: 10px; margin-bottom: 12px;
      }
      .op-file-info .file-icon { font-size: 20px; }
      .op-file-info .file-name { font-size: 12px; font-weight: 600; color: #10B981; flex: 1; }
      .op-file-info .file-remove {
        font-size: 11px; color: #EF4444; cursor: pointer; font-weight: 600;
        background: none; border: none; font-family: inherit;
      }
      .op-file-info .file-remove:hover { text-decoration: underline; }

      /* Toast notification */
      .op-toast {
        position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
        background: #1a1a2e; color: #fff; padding: 12px 24px; border-radius: 10px;
        font-size: 13px; font-family: 'Inter', sans-serif; z-index: 2147483642;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3); animation: op-toast-in 0.3s ease;
      }
      .op-toast.success { background: #10B981; }
      .op-toast.error { background: #EF4444; }
      @keyframes op-toast-in {
        from { opacity: 0; transform: translateX(-50%) translateY(12px); }
        to { opacity: 1; transform: translateX(-50%) translateY(0); }
      }

      /* ── One-Click Email Send Modal ── */
      .op-email-provider-card {
        display: flex; align-items: center; gap: 12px;
        padding: 12px 16px; border: 1.5px solid #e0e0e5; border-radius: 12px;
        background: #fff; cursor: pointer; font-family: inherit;
        font-size: 13px; font-weight: 600; transition: all 0.25s;
        position: relative;
      }
      .op-email-provider-card:hover { border-color: #F97316; background: rgba(249,115,22,0.03); }
      .op-email-provider-card.selected {
        border-color: #F97316; background: rgba(249,115,22,0.06);
        box-shadow: 0 0 0 3px rgba(249,115,22,0.12);
      }
      .op-email-provider-card .provider-icon { font-size: 22px; flex-shrink: 0; }
      .op-email-provider-card .provider-info { flex: 1; }
      .op-email-provider-card .provider-name { font-size: 13px; font-weight: 600; color: #333; }
      .op-email-provider-card .provider-email { font-size: 10px; color: #10B981; font-weight: 500; margin-top: 1px; }
      .op-email-provider-card .provider-status {
        font-size: 9px; font-weight: 700; padding: 3px 8px; border-radius: 8px;
        text-transform: uppercase; letter-spacing: 0.03em;
      }
      .op-email-provider-card .provider-status.connected {
        background: rgba(16,185,129,0.1); color: #10B981;
      }
      .op-email-provider-card .provider-status.disconnected {
        background: rgba(239,68,68,0.08); color: #EF4444;
      }
      .op-email-provider-card .provider-radio {
        width: 18px; height: 18px; border-radius: 50%;
        border: 2px solid #ddd; flex-shrink: 0; position: relative;
        transition: all 0.2s;
      }
      .op-email-provider-card.selected .provider-radio {
        border-color: #F97316;
      }
      .op-email-provider-card.selected .provider-radio::after {
        content: ''; position: absolute; top: 3px; left: 3px;
        width: 8px; height: 8px; border-radius: 50%;
        background: #F97316;
      }
      .op-send-now-btn {
        width: 100%; padding: 13px; font-size: 14px; font-weight: 700;
        background: linear-gradient(135deg, #F59E0B 0%, #F97316 50%, #EF4444 100%);
        color: #fff; border: none; border-radius: 12px; cursor: pointer;
        font-family: inherit; box-shadow: 0 4px 16px rgba(249,115,22,0.35);
        transition: all 0.3s; display: flex; align-items: center;
        justify-content: center; gap: 8px;
      }
      .op-send-now-btn:hover:not(:disabled) {
        transform: translateY(-1px); box-shadow: 0 6px 24px rgba(249,115,22,0.5);
      }
      .op-send-now-btn:disabled {
        opacity: 0.5; cursor: not-allowed; transform: none;
      }
      .op-send-now-btn .op-spinner {
        width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.3);
        border-top-color: #fff; border-radius: 50%;
        animation: op-spin 0.7s linear infinite;
      }
      @keyframes op-spin { to { transform: rotate(360deg); } }
      .op-connect-btn {
        padding: 5px 12px; font-size: 10px; font-weight: 600;
        background: linear-gradient(135deg, #F59E0B, #F97316);
        color: #fff; border: none; border-radius: 8px; cursor: pointer;
        font-family: inherit; transition: all 0.2s;
      }
      .op-connect-btn:hover { transform: scale(1.04); }
      .op-disconnect-btn {
        padding: 4px 8px; font-size: 9px; font-weight: 600;
        background: none; color: #EF4444; border: 1px solid #EF4444;
        border-radius: 6px; cursor: pointer; font-family: inherit;
        transition: all 0.2s;
      }
      .op-disconnect-btn:hover { background: rgba(239,68,68,0.06); }
      .op-email-body-preview {
        padding: 10px 12px; background: #f9f9fc; border-radius: 10px;
        border: 1px solid #eee; font-size: 11px; color: #555;
        line-height: 1.6; max-height: 100px; overflow-y: auto;
        white-space: pre-wrap; word-wrap: break-word;
      }
    `;
    document.head.appendChild(style);
  }

  // ===================================================================
  // 2. Profile Data Scraping (IMPROVED with multiple fallbacks)
  // ===================================================================
  function scrapeProfile() {
    const d = { name: '', headline: '', company: '', location: '', about: '', profileUrl: location.href, email: '' };

    // Scope to main content to avoid picking up sidebar names
    const mainContent = document.querySelector('.scaffold-layout__main, main') || document.body;

    // Name - try multiple selectors within main content
    const nameSelectors = [
      'h1.text-heading-xlarge',
      '.text-heading-xlarge',
      '.pv-text-details__left-panel h1',
      '.ph5 h1',
      'h1[tabindex="-1"]',
    ];
    for (const sel of nameSelectors) {
      const el = mainContent.querySelector(sel);
      if (el && el.textContent.trim() && el.textContent.trim().length < 80) {
        d.name = el.textContent.trim();
        break;
      }
    }

    // Fallback: try ANY h1 in main content
    if (!d.name) {
      const h1 = mainContent.querySelector('h1');
      if (h1 && h1.textContent.trim().length < 80 && h1.textContent.trim().length > 1) {
        d.name = h1.textContent.trim();
      }
    }

    // Fallback: extract from page title (e.g. "Bill Gates - Chair, Gates Foundation | LinkedIn")
    if (!d.name) {
      const title = document.title || '';
      const titleMatch = title.match(/^(.+?)\s*[-|]/);
      if (titleMatch && titleMatch[1].trim().length > 1 && titleMatch[1].trim().length < 60) {
        d.name = titleMatch[1].trim();
      }
    }

    // Fallback: extract from URL slug (e.g. /in/bill-gates/)
    if (!d.name && location.pathname.startsWith('/in/')) {
      const slug = location.pathname.replace('/in/', '').replace(/\/$/, '');
      if (slug && slug.length > 1) {
        d.name = slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      }
    }

    // Headline
    const hlSelectors = [
      '.text-body-medium.break-words',
      '[data-anonymize="headline-text"]',
      '.pv-text-details__left-panel .text-body-medium',
      '.ph5 .text-body-medium',
    ];
    for (const sel of hlSelectors) {
      const el = mainContent.querySelector(sel);
      if (el && el.textContent.trim()) {
        d.headline = el.textContent.trim();
        break;
      }
    }

    // Company from headline
    if (d.headline.includes(' at ')) d.company = d.headline.split(' at ').pop().trim();
    else if (d.headline.includes(' @ ')) d.company = d.headline.split(' @ ').pop().trim();

    // Also try to get company from experience section
    if (!d.company) {
      const expCompany = mainContent.querySelector('.pv-text-details__right-panel .inline-show-more-text');
      if (expCompany) d.company = expCompany.textContent.trim();
    }

    // Location
    const locSelectors = [
      '.text-body-small.inline.t-black--light.break-words',
      '.pv-text-details__left-panel .text-body-small',
      'span.text-body-small.inline',
    ];
    for (const sel of locSelectors) {
      const el = mainContent.querySelector(sel);
      if (el && el.textContent.trim()) {
        d.location = el.textContent.trim();
        break;
      }
    }

    // About
    const aboutEl = document.querySelector('#about');
    if (aboutEl) {
      const container = aboutEl.closest('section');
      if (container) {
        const textEl = container.querySelector('.inline-show-more-text, .pv-shared-text-with-see-more, span[aria-hidden="true"]');
        if (textEl) d.about = textEl.textContent.trim().substring(0, 500);
      }
    }

    // Try to grab email from ContactOut sidebar if visible
    const emailEl = document.querySelector('[data-email], .contactout-email, a[href^="mailto:"]');
    if (emailEl) {
      d.email = emailEl.getAttribute('data-email') || emailEl.getAttribute('href')?.replace('mailto:', '') || emailEl.textContent.trim();
    }

    console.log('[OutreachPro] Scraped profile:', d.name, '|', d.headline, '|', d.email);
    return d;
  }

  // ===================================================================
  // 3. Find the Action Bar (scoped to main profile card ONLY)
  // ===================================================================

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

  // ===================================================================
  // 4. Button Injection
  // ===================================================================
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
    badge.textContent = 'AI Powered';

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

    console.log('[OutreachPro] Button injected!');
  }

  // ===================================================================
  // 5. Panel Toggle & Build
  // ===================================================================
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
        <button class="op-close" id="op-close">&times;</button>
        <div class="op-name">${esc(name)}</div>
        ${hl ? '<div class="op-headline">' + esc(hl) + '</div>' : ''}
        <div class="op-unlimited"><span>&infin;</span> Unlimited - No limits, no tokens</div>
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
        <button class="op-gen-btn" id="op-gen">✨ Regenerate</button>
        <div style="display:flex;gap:6px;">
          <button class="op-sec-btn" id="op-copy" style="display:none;">📋 Copy</button>
          <button class="op-insert-btn" id="op-insert" style="display:none;">➤ Insert</button>
          <button class="op-insert-btn" id="op-send-email" style="display:none;background:#EA4335;">📧 Send Email</button>
        </div>
      </div>
      <div class="op-cv-prompt" id="op-cv-prompt">
        <span style="display:flex;gap:16px;align-items:center;width:100%;">
          <span style="display:flex;align-items:center;gap:6px;">📄 <a id="op-cv-link">Upload CV</a></span>
          <span style="display:flex;align-items:center;gap:6px;">⚙️ <a id="op-settings-link">Settings & Signature</a></span>
        </span>
      </div>
      <div class="op-footer">Powered by <span class="op-hl">OutreachPro</span> - <span class="op-hl">&infin; Unlimited</span> messages</div>
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

  // ===================================================================
  // 6. Panel Handlers
  // ===================================================================
  async function setupPanelHandlers(panel, profile) {
    let type = 'connection_request';
    let tone = 'professional';

    // Load CV from storage
    let cv = { name: '', summary: '', skills: '', experience: '', signature: '' };
    try {
      const r = await chrome.storage.local.get('outreach_pro_user_cv');
      if (r.outreach_pro_user_cv) {
        cv = r.outreach_pro_user_cv;
        if (cv.summary || cv.skills || cv.experience || cv.cvFileName) {
          const prompt = panel.querySelector('#op-cv-prompt');
          if (prompt) {
            if (cv.cvFileName) {
              prompt.innerHTML = `<span>📄</span><span>CV loaded: <strong>${esc(cv.cvFileName)}</strong> <a id="op-cv-link" style="margin-left:6px;">Change</a></span>`;
            } else {
              prompt.style.display = 'none';
            }
          }
        }
      }
    } catch (e) {}

    // Also load signature from settings
    try {
      const s = await chrome.storage.local.get('outreach_pro_settings');
      if (s.outreach_pro_settings && s.outreach_pro_settings.signature && !cv.signature) {
        cv.signature = s.outreach_pro_settings.signature;
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
        doGenerate();
      };
    });

    // Tones
    panel.querySelectorAll('.op-tone').forEach(btn => {
      btn.onclick = () => {
        panel.querySelectorAll('.op-tone').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        tone = btn.dataset.tone;
        doGenerate();
      };
    });

    const sendEmailBtn = panel.querySelector('#op-send-email');

    // Generate
    function doGenerate() {
      genBtn.innerHTML = '⏳ Writing...';
      skel.style.display = 'block';
      textarea.style.display = 'none';
      charcount.style.display = 'none';
      copyBtn.style.display = 'none';
      insertBtn.style.display = 'none';
      sendEmailBtn.style.display = 'none';

      setTimeout(() => {
        const result = window.OutreachMessageGenerator.generate(type, profile, cv, tone);
        textarea.value = result.message;
        textarea.style.display = 'block';
        skel.style.display = 'none';
        copyBtn.style.display = 'inline-flex';

        // Show Insert for connection/DM, Send Email for email tab
        if (type === 'connection_request' || type === 'direct_message') {
          insertBtn.style.display = 'inline-flex';
          sendEmailBtn.style.display = 'none';
        } else if (type === 'email') {
          insertBtn.style.display = 'none';
          sendEmailBtn.style.display = 'inline-flex';
        } else {
          insertBtn.style.display = 'none';
          sendEmailBtn.style.display = 'none';
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

    // Insert into LinkedIn (connection/DM)
    insertBtn.onclick = () => {
      if (type === 'connection_request') {
        insertConnectionRequest(textarea.value);
      } else {
        insertDirectMessage(textarea.value);
      }
    };

    // Send Email - opens default email client or Gmail with pre-filled content
    sendEmailBtn.onclick = () => {
      const msgText = textarea.value;
      // Extract subject line if present
      let subject = '';
      let body = msgText;
      const subjectMatch = msgText.match(/^Subject:\s*(.+?)\n/);
      if (subjectMatch) {
        subject = subjectMatch[1].trim();
        body = msgText.replace(/^Subject:\s*.+?\n\n?/, '').trim();
      }

      // Try to get recipient email from ContactOut or scraped data
      const recipientEmail = profile.email || '';

      // Ask user how they want to send
      openEmailSendModal(panel, recipientEmail, subject, body);
    };

    // CV upload link
    const cvLink = panel.querySelector('#op-cv-link');
    if (cvLink) {
      cvLink.onclick = (e) => {
        e.preventDefault();
        openCVModal(panel, (updatedCV) => {
          cv = updatedCV;
          doGenerate();
        });
      };
    }

    // Settings link
    const settingsLink = panel.querySelector('#op-settings-link');
    if (settingsLink) {
      settingsLink.onclick = (e) => {
        e.preventDefault();
        openSettingsModal(panel, cv, (updatedCV) => {
          cv = updatedCV;
          doGenerate();
        });
      };
    }
  }

  // ===================================================================
  // 7. Insert into LinkedIn (FIXED)
  // ===================================================================

  function showToast(msg, type = '') {
    const existing = document.querySelector('.op-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = 'op-toast' + (type ? ' ' + type : '');
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  /**
   * Get the top profile card - the card that contains the profile name (h1).
   * This is critical to scope button searches so we don't accidentally
   * click Connect/Message on "People you may know" suggestions.
   */
  function getTopProfileCard() {
    const mainContent = document.querySelector('.scaffold-layout__main, main') || document.body;

    // Strategy 1: Find the artdeco-card that contains the h1 (profile name)
    const h1 = mainContent.querySelector('h1');
    if (h1) {
      let card = h1.closest('.artdeco-card, .pv-top-card, section');
      if (card && isInMainContent(card)) return card;
      // Also try going up a few levels
      let parent = h1.parentElement;
      for (let i = 0; i < 8; i++) {
        if (!parent) break;
        if (parent.classList && (
          parent.classList.contains('artdeco-card') ||
          parent.classList.contains('pv-top-card') ||
          parent.classList.contains('pvs-header-actions__container')
        )) return parent;
        parent = parent.parentElement;
      }
    }

    // Strategy 2: Find the first artdeco-card in main (usually the profile card)
    const firstCard = mainContent.querySelector('.artdeco-card');
    if (firstCard && isInMainContent(firstCard)) return firstCard;

    // Strategy 3: Fall back to main content itself, but NOT the whole document
    return mainContent;
  }

  /**
   * Find a profile action button ONLY within the top profile card.
   * This prevents accidentally clicking buttons in "People you may know" etc.
   */
  function findProfileButton(textMatches, selectors) {
    const profileCard = getTopProfileCard();
    console.log('[OutreachPro] Searching for button in profile card:', profileCard?.className);

    // Strategy 1: Try selectors within the profile card
    for (const sel of selectors) {
      const btns = profileCard.querySelectorAll(sel);
      for (const btn of btns) {
        // Double-check: make sure this button is NOT inside a "People also viewed" or "People you may know" section
        if (isInsideRecommendationSection(btn)) continue;
        console.log('[OutreachPro] Found profile button via selector:', sel, btn.textContent.trim());
        return btn;
      }
    }

    // Strategy 2: Try by text content, but ONLY first matching button in profile card
    const allButtons = profileCard.querySelectorAll('button, a[role="button"]');
    for (const btn of allButtons) {
      if (isInsideRecommendationSection(btn)) continue;
      const text = btn.textContent.trim().toLowerCase();
      for (const match of textMatches) {
        if (text === match.toLowerCase() || text.includes(match.toLowerCase())) {
          console.log('[OutreachPro] Found profile button via text:', text);
          return btn;
        }
      }
    }

    console.log('[OutreachPro] Profile button not found in card, trying action bar...');

    // Strategy 3: Try within the OutreachPro wrapper's parent (the action bar where we injected)
    const wrapper = document.querySelector('.' + WRAPPER_CLASS);
    if (wrapper && wrapper.parentElement) {
      const actionBar = wrapper.parentElement;
      const btns = actionBar.querySelectorAll('button, a[role="button"]');
      for (const btn of btns) {
        if (btn.classList.contains(BUTTON_CLASS)) continue; // skip our own button
        const text = btn.textContent.trim().toLowerCase();
        for (const match of textMatches) {
          if (text === match.toLowerCase() || text.includes(match.toLowerCase())) {
            console.log('[OutreachPro] Found button in action bar:', text);
            return btn;
          }
        }
      }
    }

    return null;
  }

  /**
   * Check if a button is inside a recommendation section like
   * "People you may know", "People also viewed", etc.
   */
  function isInsideRecommendationSection(el) {
    let node = el;
    while (node) {
      // Check for common recommendation section markers
      if (node.getAttribute && node.getAttribute('data-view-name') === 'profile-browsemap') return true;
      if (node.classList) {
        const cls = node.className.toLowerCase();
        if (cls.includes('browsemap') ||
            cls.includes('pymk') ||
            cls.includes('people-also') ||
            cls.includes('similar-profiles') ||
            cls.includes('aside')) return true;
      }
      // Check section headings for "People" text
      if (node.tagName === 'SECTION') {
        const heading = node.querySelector('h2, h3, .t-20');
        if (heading) {
          const headingText = heading.textContent.toLowerCase();
          if (headingText.includes('people') ||
              headingText.includes('also viewed') ||
              headingText.includes('similar') ||
              headingText.includes('may know')) {
            return true;
          }
        }
      }
      if (node.tagName === 'ASIDE') return true;
      node = node.parentElement;
    }
    return false;
  }

  /**
   * Find a button in the MODAL/DIALOG (document-wide) - used for "Add a note", etc.
   * These appear as overlays outside the main content.
   */
  function findModalButton(textMatches, selectors) {
    // Look in artdeco-modal or dialog elements first
    const modals = document.querySelectorAll('.artdeco-modal, [role="dialog"], .send-invite');
    for (const modal of modals) {
      for (const sel of selectors) {
        const btn = modal.querySelector(sel);
        if (btn) return btn;
      }
      const btns = modal.querySelectorAll('button');
      for (const btn of btns) {
        const text = btn.textContent.trim().toLowerCase();
        for (const match of textMatches) {
          if (text === match.toLowerCase() || text.includes(match.toLowerCase())) {
            return btn;
          }
        }
      }
    }

    // Fall back to document-wide for selectors
    for (const sel of selectors) {
      const btn = document.querySelector(sel);
      if (btn) return btn;
    }

    return null;
  }

  function insertConnectionRequest(text) {
    // Find the Connect button ONLY in the top profile card
    const connectBtn = findProfileButton(['Connect'], [
      'button[aria-label*="connect" i]',
      'button[aria-label*="Connect"]',
      'button[aria-label*="Invite"]',
    ]);

    if (!connectBtn) {
      showToast('Connect button not found. Try clicking Connect manually.', 'error');
      navigator.clipboard.writeText(text);
      return;
    }

    showToast('Sending connection request...', '');
    console.log('[OutreachPro] Clicking Connect:', connectBtn.textContent.trim());
    connectBtn.click();

    // Wait for ANY modal/dialog to appear after clicking Connect
    retryUntil(() => {
      // Look for the connect modal by multiple strategies
      const modal = document.querySelector('.artdeco-modal, [role="dialog"], .send-invite, .artdeco-modal__content');
      return modal;
    }, 5000, 200).then(modal => {
      if (!modal) {
        navigator.clipboard.writeText(text);
        showToast('Connection modal did not appear. Message copied to clipboard.', 'error');
        return;
      }

      console.log('[OutreachPro] Modal found:', modal.className);

      // Find the "Add a note" button inside the modal - try many selectors
      retryUntil(() => {
        // Search by aria-label
        let btn = modal.querySelector('button[aria-label*="Add a note"], button[aria-label*="add a note"]');
        if (btn) return btn;

        // Search by button text content
        const allBtns = modal.querySelectorAll('button');
        for (const b of allBtns) {
          const txt = b.textContent.trim().toLowerCase();
          if (txt.includes('add a note') || txt.includes('add note')) return b;
        }

        // If there's a secondary button (LinkedIn's "Add a note" is usually the secondary)
        btn = modal.querySelector('button.artdeco-button--secondary');
        if (btn && btn.textContent.toLowerCase().includes('note')) return btn;

        // Try any secondary button in the modal
        const secondaryBtns = modal.querySelectorAll('button.artdeco-button--secondary, button.artdeco-button--muted');
        for (const b of secondaryBtns) {
          if (!b.textContent.toLowerCase().includes('send')) return b;
        }

        return null;
      }, 3000, 200).then(addNoteBtn => {
        if (addNoteBtn) {
          console.log('[OutreachPro] Clicking Add a note:', addNoteBtn.textContent.trim());
          addNoteBtn.click();

          // Wait for textarea to appear in the modal
          retryUntil(() => {
            return document.querySelector(
              '.artdeco-modal textarea, ' +
              '[role="dialog"] textarea, ' +
              '.send-invite textarea, ' +
              'textarea[name="message"], ' +
              'textarea#custom-message, ' +
              '.send-invite__custom-message, ' +
              'textarea.connect-button-send-invite__custom-message, ' +
              '.artdeco-modal__content textarea'
            );
          }, 3000, 200).then(ta => {
            if (ta) {
              setNativeValue(ta, text);
              console.log('[OutreachPro] Message filled in textarea');

              // NOW auto-click the Send button to complete the flow
              setTimeout(() => {
                const sendBtn = findSendButtonInModal();
                if (sendBtn) {
                  console.log('[OutreachPro] Auto-clicking Send:', sendBtn.textContent.trim());
                  sendBtn.click();
                  showToast('Connection request sent with your message!', 'success');
                } else {
                  showToast('Message filled! Click Send to complete.', 'success');
                }
              }, 500);
            } else {
              navigator.clipboard.writeText(text);
              showToast('Message copied. Paste it in the note field and click Send.', 'success');
            }
          });
        } else {
          // No "Add a note" - maybe it's a direct send modal
          // Try to find a textarea directly
          const ta = modal.querySelector('textarea');
          if (ta) {
            setNativeValue(ta, text);
            setTimeout(() => {
              const sendBtn = findSendButtonInModal();
              if (sendBtn) { sendBtn.click(); showToast('Connection request sent!', 'success'); }
              else { showToast('Message filled! Click Send.', 'success'); }
            }, 500);
          } else {
            navigator.clipboard.writeText(text);
            showToast('Message copied to clipboard. Add a note and paste.', 'success');
          }
        }
      });
    });
  }

  /**
   * Find the Send/Submit button inside the currently open modal
   */
  function findSendButtonInModal() {
    const modals = document.querySelectorAll('.artdeco-modal, [role="dialog"], .send-invite');
    for (const modal of modals) {
      // Try aria-label
      let btn = modal.querySelector('button[aria-label*="Send"], button[aria-label*="send"]');
      if (btn) return btn;

      // Try primary button with "Send" text
      const allBtns = modal.querySelectorAll('button');
      for (const b of allBtns) {
        const txt = b.textContent.trim().toLowerCase();
        if (txt === 'send' || txt === 'send invitation' || txt === 'send now' || txt.includes('send')) {
          // Make sure it's not "Send without a note" unless that's all we have
          if (txt === 'send' || txt === 'send invitation' || txt === 'send now') return b;
        }
      }

      // Fallback: primary button
      btn = modal.querySelector('button.artdeco-button--primary');
      if (btn) return btn;
    }
    return null;
  }

  function insertDirectMessage(text) {
    // Find the Message button ONLY in the top profile card
    const msgBtn = findProfileButton(['Message'], [
      'button[aria-label*="Message"]',
      'button[aria-label*="message"]',
      'a[aria-label*="Message"]',
      'a[aria-label*="message"]',
    ]);

    if (!msgBtn) {
      navigator.clipboard.writeText(text);
      showToast('Message copied to clipboard. Open messaging and paste it.', 'success');
      return;
    }

    showToast('Opening message window...', '');
    console.log('[OutreachPro] Clicking Message:', msgBtn.textContent.trim());
    msgBtn.click();

    // Wait for the message box to appear
    retryUntil(() => {
      return document.querySelector(
        '.msg-form__contenteditable, ' +
        'div[role="textbox"][contenteditable="true"], ' +
        '.msg-form__msg-content-container div[contenteditable="true"], ' +
        'div.msg-form__contenteditable[contenteditable="true"]'
      );
    }, 5000, 300).then(box => {
      if (box) {
        box.focus();
        box.innerHTML = '';
        // Insert text as paragraphs
        const paragraphs = text.split('\n').filter(l => l.trim());
        paragraphs.forEach(p => {
          const pEl = document.createElement('p');
          pEl.textContent = p;
          box.appendChild(pEl);
        });
        // Trigger events for LinkedIn's React
        box.dispatchEvent(new Event('input', { bubbles: true }));
        box.dispatchEvent(new Event('change', { bubbles: true }));
        box.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: ' ' }));
        box.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: ' ' }));

        // Auto-click the Send button in the message form
        setTimeout(() => {
          const sendBtn = document.querySelector(
            '.msg-form__send-button, ' +
            'button.msg-form__send-btn, ' +
            'button[type="submit"].msg-form__send-button, ' +
            '.msg-form__footer button.artdeco-button--primary'
          );
          if (sendBtn && !sendBtn.disabled) {
            sendBtn.click();
            showToast('Message sent!', 'success');
          } else {
            showToast('Message filled! Click the Send button to deliver.', 'success');
          }
        }, 800);
      } else {
        navigator.clipboard.writeText(text);
        showToast('Message copied to clipboard. Paste it in the message box.', 'success');
      }
    });
  }

  // Helper: Retry until an element is found or timeout
  function retryUntil(finder, timeoutMs, intervalMs) {
    return new Promise(resolve => {
      const start = Date.now();
      const check = () => {
        const result = finder();
        if (result) {
          resolve(result);
          return;
        }
        if (Date.now() - start > timeoutMs) {
          resolve(null);
          return;
        }
        setTimeout(check, intervalMs);
      };
      check();
    });
  }

  // Helper: Set value on input/textarea using native setter (works with React)
  function setNativeValue(el, value) {
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype, 'value'
    )?.set || Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    )?.set;

    if (nativeSetter) {
      nativeSetter.call(el, value);
    } else {
      el.value = value;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // ===================================================================
  // 8. CV Upload Modal (FILE UPLOAD + SIGNATURE)
  // ===================================================================
  function openCVModal(parentPanel, onSaveCallback) {
    const modal = document.createElement('div');
    modal.className = 'op-cv-modal';
    modal.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(255,255,255,0.98);z-index:10;padding:20px;overflow-y:auto;font-family:Inter,sans-serif;border-radius:16px;display:flex;flex-direction:column;';
    modal.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h3 style="font-size:16px;font-weight:700;margin:0">📄 Upload Your Background</h3>
        <button id="cv-close" style="background:#f0f0f5;border:none;width:30px;height:30px;border-radius:50%;cursor:pointer;font-size:16px">&times;</button>
      </div>
      <p style="font-size:12px;color:#888;margin-bottom:16px">Upload your CV file and set your signature for AI-generated messages.</p>
      <div style="margin-bottom:14px"><label style="font-size:11px;font-weight:600;color:#555;display:block;margin-bottom:4px">Your Name</label>
        <input type="text" id="cv-name" placeholder="John Smith" style="width:100%;padding:10px;border:1.5px solid #e0e0e5;border-radius:10px;font-size:13px;font-family:inherit;outline:none;box-sizing:border-box" /></div>

      <div style="margin-bottom:14px"><label style="font-size:11px;font-weight:600;color:#555;display:block;margin-bottom:4px">Resume / CV File</label>
        <div id="cv-file-area"></div>
        <input type="file" id="cv-file-input" accept=".pdf,.docx,.txt,.doc" style="display:none" />
      </div>

      <div style="margin-bottom:14px"><label style="font-size:11px;font-weight:600;color:#555;display:block;margin-bottom:4px">Email Signature (appears in all messages)</label>
        <textarea id="cv-signature" placeholder="Best regards,&#10;Maxmilliam" rows="2" style="width:100%;padding:10px;border:1.5px solid #e0e0e5;border-radius:10px;font-size:12px;font-family:inherit;resize:vertical;outline:none;box-sizing:border-box"></textarea>
        <p style="font-size:10px;color:#bbb;margin-top:2px">Example: Best regards, Your Name</p></div>

      <div style="margin-bottom:14px"><label style="font-size:11px;font-weight:600;color:#555;display:block;margin-bottom:4px">Website URL (optional)</label>
        <input type="url" id="cv-web" placeholder="https://yoursite.com" style="width:100%;padding:10px;border:1.5px solid #e0e0e5;border-radius:10px;font-size:13px;font-family:inherit;outline:none;box-sizing:border-box" /></div>
      <button id="cv-save" style="width:100%;padding:12px;font-size:14px;font-weight:600;background:linear-gradient(135deg,#F59E0B,#F97316,#EF4444);color:#fff;border:none;border-radius:10px;cursor:pointer;font-family:inherit;box-shadow:0 3px 12px rgba(249,115,22,0.3)">💾 Save & Personalize</button>
      <p style="font-size:10px;color:#bbb;text-align:center;margin-top:10px">All data stored locally. Never sent externally.</p>
    `;
    parentPanel.appendChild(modal);

    const fileArea = modal.querySelector('#cv-file-area');
    const fileInput = modal.querySelector('#cv-file-input');
    let pendingFileText = null;
    let pendingFileName = null;

    // Load existing CV data
    chrome.storage.local.get('outreach_pro_user_cv', (r) => {
      const c = r.outreach_pro_user_cv || {};
      if (c.name) modal.querySelector('#cv-name').value = c.name;
      if (c.signature) modal.querySelector('#cv-signature').value = c.signature;
      if (c.website) modal.querySelector('#cv-web').value = c.website;

      // Show file status or drop zone
      if (c.cvFileName) {
        showFileInfo(c.cvFileName);
      } else {
        showDropZone();
      }
    });

    function showDropZone() {
      fileArea.innerHTML = `
        <div class="op-drop-zone" id="cv-drop-zone">
          <div class="drop-icon">📎</div>
          <div class="drop-text">Click to upload or drag and drop</div>
          <div class="drop-formats">PDF, DOCX, or TXT</div>
        </div>
      `;
      const dropZone = fileArea.querySelector('#cv-drop-zone');

      dropZone.onclick = () => fileInput.click();

      dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
      });
      dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
      });
      dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
      });
    }

    function showFileInfo(fileName) {
      fileArea.innerHTML = `
        <div class="op-file-info">
          <span class="file-icon">📄</span>
          <span class="file-name">${esc(fileName)}</span>
          <button class="file-remove" id="cv-file-remove">Remove</button>
        </div>
      `;
      fileArea.querySelector('#cv-file-remove').onclick = () => {
        pendingFileText = null;
        pendingFileName = null;
        showDropZone();
      };
    }

    fileInput.onchange = () => {
      const file = fileInput.files[0];
      if (file) handleFile(file);
    };

    async function handleFile(file) {
      const validExts = ['pdf', 'docx', 'txt', 'doc'];
      const ext = file.name.split('.').pop().toLowerCase();
      if (!validExts.includes(ext)) {
        showToast('Please upload a PDF, DOCX, or TXT file.', 'error');
        return;
      }

      showFileInfo(file.name + ' (extracting...)');
      try {
        const text = await window.CVManager.extractTextFromFile(file);
        pendingFileText = text;
        pendingFileName = file.name;
        showFileInfo(file.name);
      } catch (err) {
        showToast('Could not read file. Try a .txt version.', 'error');
        showDropZone();
      }
    }

    modal.querySelector('#cv-close').onclick = () => modal.remove();

    modal.querySelector('#cv-save').onclick = () => {
      const name = modal.querySelector('#cv-name').value.trim();
      const signature = modal.querySelector('#cv-signature').value.trim();
      const web = modal.querySelector('#cv-web').value.trim();

      // Get existing data first
      chrome.storage.local.get('outreach_pro_user_cv', (r) => {
        const existing = r.outreach_pro_user_cv || {};

        // Use pending file text if available, otherwise keep existing
        const rawText = pendingFileText || existing.rawText || '';
        const fileName = pendingFileName || existing.cvFileName || '';

        // Parse the raw text into structured sections
        const parsed = window.CVManager ? window.CVManager.parseResumeText(rawText) : {};

        const cvData = {
          name: name || parsed.name || existing.name || '',
          summary: parsed.summary || existing.summary || '',
          skills: parsed.skills || existing.skills || '',
          experience: parsed.experience || existing.experience || '',
          education: parsed.education || existing.education || '',
          rawText: rawText,
          website: web,
          signature: signature,
          cvFileName: fileName,
          cvFileType: pendingFileName ? pendingFileName.split('.').pop().toLowerCase() : (existing.cvFileType || ''),
          lastUpdated: new Date().toISOString(),
        };

        chrome.storage.local.set({ outreach_pro_user_cv: cvData }, () => {
          const btn = modal.querySelector('#cv-save');
          btn.textContent = '✅ Saved!';
          btn.style.background = '#10B981';
          if (onSaveCallback) onSaveCallback(cvData);
          setTimeout(() => modal.remove(), 800);
        });
      });
    };
  }

  // ===================================================================
  // 9. Settings Modal (Name + Signature editing from the panel)
  // ===================================================================
  function openSettingsModal(parentPanel, currentCV, onSaveCallback) {
    const modal = document.createElement('div');
    modal.className = 'op-cv-modal';
    modal.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(255,255,255,0.98);z-index:10;padding:20px;overflow-y:auto;font-family:Inter,sans-serif;border-radius:16px;display:flex;flex-direction:column;';
    modal.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h3 style="font-size:16px;font-weight:700;margin:0">\u2699\ufe0f Settings & Signature</h3>
        <button id="settings-close" style="background:#f0f0f5;border:none;width:30px;height:30px;border-radius:50%;cursor:pointer;font-size:16px">&times;</button>
      </div>
      <p style="font-size:12px;color:#888;margin-bottom:16px">Set your name and signature. Your signature will appear at the end of every generated message.</p>

      <div style="margin-bottom:14px"><label style="font-size:11px;font-weight:600;color:#555;display:block;margin-bottom:4px">Your Name</label>
        <input type="text" id="settings-name" placeholder="Maxmilliam" style="width:100%;padding:10px;border:1.5px solid #e0e0e5;border-radius:10px;font-size:13px;font-family:inherit;outline:none;box-sizing:border-box" /></div>

      <div style="margin-bottom:14px"><label style="font-size:11px;font-weight:600;color:#555;display:block;margin-bottom:4px">Email Signature</label>
        <textarea id="settings-signature" placeholder="Best regards,&#10;Maxmilliam" rows="3" style="width:100%;padding:10px;border:1.5px solid #e0e0e5;border-radius:10px;font-size:12px;font-family:inherit;resize:vertical;outline:none;box-sizing:border-box"></textarea>
        <p style="font-size:10px;color:#bbb;margin-top:4px">This appears at the bottom of every message. Example:<br><em>Best regards,<br>Maxmilliam</em></p></div>

      <button id="settings-save" style="width:100%;padding:12px;font-size:14px;font-weight:600;background:linear-gradient(135deg,#F59E0B,#F97316,#EF4444);color:#fff;border:none;border-radius:10px;cursor:pointer;font-family:inherit;box-shadow:0 3px 12px rgba(249,115,22,0.3)">\ud83d\udcbe Save Settings</button>
      <p style="font-size:10px;color:#bbb;text-align:center;margin-top:10px">Changes apply immediately to all new messages.</p>
    `;
    parentPanel.appendChild(modal);

    // Load existing values
    const nameInput = modal.querySelector('#settings-name');
    const sigInput = modal.querySelector('#settings-signature');
    if (currentCV.name) nameInput.value = currentCV.name;
    if (currentCV.signature) sigInput.value = currentCV.signature;

    modal.querySelector('#settings-close').onclick = () => modal.remove();
    modal.querySelector('#settings-save').onclick = () => {
      const newName = nameInput.value.trim();
      const newSig = sigInput.value.trim();

      chrome.storage.local.get('outreach_pro_user_cv', (r) => {
        const existing = r.outreach_pro_user_cv || {};
        const updated = {
          ...existing,
          name: newName || existing.name || '',
          signature: newSig,
          lastUpdated: new Date().toISOString(),
        };
        chrome.storage.local.set({ outreach_pro_user_cv: updated }, () => {
          const btn = modal.querySelector('#settings-save');
          btn.textContent = '\u2705 Saved!';
          btn.style.background = '#10B981';
          if (onSaveCallback) onSaveCallback(updated);
          setTimeout(() => modal.remove(), 800);
        });
      });
    };
  }

  // ===================================================================
  // 10. One-Click Email Send Modal (Gmail, Outlook, Yahoo — backend API)
  // ===================================================================
  function openEmailSendModal(parentPanel, recipientEmail, subject, body) {
    const modal = document.createElement('div');
    modal.className = 'op-cv-modal';
    modal.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(255,255,255,0.98);z-index:10;padding:20px;overflow-y:auto;font-family:Inter,sans-serif;border-radius:16px;display:flex;flex-direction:column;';

    let selectedProvider = '';

    modal.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <h3 style="font-size:16px;font-weight:700;margin:0">⚡ One-Click Email Send</h3>
        <button id="email-close" style="background:#f0f0f5;border:none;width:30px;height:30px;border-radius:50%;cursor:pointer;font-size:16px">&times;</button>
      </div>

      <div style="margin-bottom:12px"><label style="font-size:10px;font-weight:700;color:#F97316;text-transform:uppercase;display:block;margin-bottom:4px">Send From</label>
        <div id="email-providers" style="display:flex;flex-direction:column;gap:8px"></div>
      </div>

      <div style="margin-bottom:10px"><label style="font-size:11px;font-weight:600;color:#555;display:block;margin-bottom:4px">Recipient</label>
        <input type="email" id="email-to" value="${esc(recipientEmail)}" placeholder="recipient@email.com" style="width:100%;padding:10px;border:1.5px solid #e0e0e5;border-radius:10px;font-size:13px;font-family:inherit;outline:none;box-sizing:border-box" /></div>

      <div style="margin-bottom:10px"><label style="font-size:11px;font-weight:600;color:#555;display:block;margin-bottom:4px">Subject</label>
        <input type="text" id="email-subject" value="${esc(subject)}" style="width:100%;padding:10px;border:1.5px solid #e0e0e5;border-radius:10px;font-size:13px;font-family:inherit;outline:none;box-sizing:border-box" /></div>

      <div style="margin-bottom:12px"><label style="font-size:11px;font-weight:600;color:#555;display:block;margin-bottom:4px">Message Preview</label>
        <div class="op-email-body-preview" id="email-body-preview"></div>
      </div>

      <button class="op-send-now-btn" id="email-send-now" disabled>
        <span id="email-send-icon">⚡</span>
        <span id="email-send-text">Select a provider above</span>
      </button>

      <p style="font-size:10px;color:#bbb;text-align:center;margin-top:10px">Sends directly from your connected account. No tabs, no compose windows.</p>
    `;
    parentPanel.appendChild(modal);

    // Fill body preview
    const bodyPreview = modal.querySelector('#email-body-preview');
    bodyPreview.textContent = body.length > 300 ? body.substring(0, 297) + '...' : body;

    modal.querySelector('#email-close').onclick = () => modal.remove();

    const providersContainer = modal.querySelector('#email-providers');
    const sendBtn = modal.querySelector('#email-send-now');
    const sendText = modal.querySelector('#email-send-text');
    const sendIcon = modal.querySelector('#email-send-icon');

    // Load provider connection status and render cards
    chrome.runtime.sendMessage({ command: 'outreach_get_provider_status' }, (response) => {
      const status = response?.data || { gmail: null, outlook: null };

      const providers = [
        {
          id: 'gmail',
          name: 'Gmail',
          icon: '📧',
          connected: !!status.gmail,
          email: status.gmail?.email || '',
          canDirectSend: true,
        },
        {
          id: 'outlook',
          name: 'Outlook / Hotmail',
          icon: '📬',
          connected: !!status.outlook,
          email: status.outlook?.email || '',
          canDirectSend: true,
        },
        {
          id: 'yahoo',
          name: 'Yahoo Mail',
          icon: '📩',
          connected: false,
          email: '',
          canDirectSend: false,
        },
      ];

      providers.forEach(p => {
        const card = document.createElement('div');
        card.className = 'op-email-provider-card';
        card.dataset.provider = p.id;

        card.innerHTML = `
          <div class="provider-radio"></div>
          <span class="provider-icon">${p.icon}</span>
          <div class="provider-info">
            <div class="provider-name">${p.name}</div>
            ${p.connected ? `<div class="provider-email">✓ ${esc(p.email)}</div>` : ''}
          </div>
          ${p.connected
            ? `<span class="provider-status connected">Connected</span>
               <button class="op-disconnect-btn" data-provider="${p.id}">×</button>`
            : (p.canDirectSend
              ? `<button class="op-connect-btn" data-provider="${p.id}">Connect</button>`
              : `<span class="provider-status disconnected">Compose tab</span>`)
          }
        `;

        // Click card to select provider
        card.addEventListener('click', (e) => {
          if (e.target.classList.contains('op-connect-btn') || e.target.classList.contains('op-disconnect-btn')) return;
          providersContainer.querySelectorAll('.op-email-provider-card').forEach(c => c.classList.remove('selected'));
          card.classList.add('selected');
          selectedProvider = p.id;
          sendBtn.disabled = false;
          if (p.connected || !p.canDirectSend) {
            sendText.textContent = p.canDirectSend ? `Send via ${p.name}` : `Open ${p.name} Compose`;
          } else {
            sendText.textContent = `Connect ${p.name} first`;
            sendBtn.disabled = true;
          }
        });

        providersContainer.appendChild(card);
      });

      // Auto-select first connected provider
      const firstConnected = providers.find(p => p.connected);
      if (firstConnected) {
        const card = providersContainer.querySelector(`[data-provider="${firstConnected.id}"]`);
        if (card) card.click();
      }

      // Connect button handlers
      providersContainer.querySelectorAll('.op-connect-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const provider = btn.dataset.provider;
          btn.textContent = '...';
          btn.disabled = true;

          const command = provider === 'gmail' ? 'outreach_connect_gmail' : 'outreach_connect_outlook';
          chrome.runtime.sendMessage({ command }, (result) => {
            if (result?.success) {
              showToast(`✅ ${provider === 'gmail' ? 'Gmail' : 'Outlook'} connected: ${result.email || 'Success'}`, 'success');
              // Refresh the modal
              modal.remove();
              openEmailSendModal(parentPanel, recipientEmail, subject, body);
            } else {
              showToast(`❌ Connection failed: ${result?.error || 'Unknown error'}`, 'error');
              btn.textContent = 'Connect';
              btn.disabled = false;
            }
          });
        });
      });

      // Disconnect button handlers
      providersContainer.querySelectorAll('.op-disconnect-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const provider = btn.dataset.provider;
          const command = provider === 'gmail' ? 'outreach_disconnect_gmail' : 'outreach_disconnect_outlook';
          chrome.runtime.sendMessage({ command }, () => {
            showToast(`${provider === 'gmail' ? 'Gmail' : 'Outlook'} disconnected`, 'success');
            modal.remove();
            openEmailSendModal(parentPanel, recipientEmail, subject, body);
          });
        });
      });
    });

    // ── SEND NOW handler ──
    sendBtn.addEventListener('click', () => {
      if (!selectedProvider || sendBtn.disabled) return;

      const to = modal.querySelector('#email-to').value.trim();
      const subj = modal.querySelector('#email-subject').value.trim();

      if (!to || !to.includes('@')) {
        showToast('Please enter a valid recipient email.', 'error');
        return;
      }
      if (!subj) {
        showToast('Please enter a subject line.', 'error');
        return;
      }

      // Yahoo: no API, fall back to compose tab
      if (selectedProvider === 'yahoo') {
        const url = `https://compose.mail.yahoo.com/?to=${encodeURIComponent(to)}&subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(body)}`;
        window.open(url, '_blank');
        showToast('Yahoo Mail compose opened with your message!', 'success');
        modal.remove();
        return;
      }

      // Gmail / Outlook: send via backend API
      sendBtn.disabled = true;
      sendIcon.innerHTML = '<div class="op-spinner"></div>';
      sendText.textContent = 'Sending...';

      chrome.runtime.sendMessage({
        command: 'outreach_send_email',
        data: { provider: selectedProvider, to, subject: subj, body }
      }, (result) => {
        if (result?.success) {
          sendIcon.textContent = '✅';
          sendText.textContent = 'Email Sent!';
          sendBtn.style.background = '#10B981';
          showToast(`✅ Email sent via ${selectedProvider === 'gmail' ? 'Gmail' : 'Outlook'}!`, 'success');
          setTimeout(() => modal.remove(), 1500);
        } else {
          sendIcon.textContent = '⚡';
          sendText.textContent = 'Send Failed — Try Again';
          sendBtn.disabled = false;
          sendBtn.style.background = '';
          showToast(`❌ ${result?.error || 'Failed to send. Check your connection.'}`, 'error');
        }
      });
    });
  }

  // ===================================================================
  // 11. Utilities
  // ===================================================================
  function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  // ===================================================================
  // 10. SPA Observer & Init
  // ===================================================================
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
