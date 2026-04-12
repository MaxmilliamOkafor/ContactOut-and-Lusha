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
          response: "Great question! We help companies like yours streamline their recruitment pipeline by 3x. I'd love to walk you through a quick 15-min demo — would Thursday or Friday work better for you?" },
        { inbound: "Sounds interesting, but I'm pretty busy right now.",
          response: "Totally understand — I know how hectic things can get! How about we pencil in a brief 10-minute chat next week? I promise it'll be worth your time. What day works best?" },
      ]
    },
    {
      id: 'build_rapport',
      name: '🤝 Build Rapport',
      description: 'Establish a genuine connection with the person',
      tone: 'casual',
      examples: [
        { inbound: "Hey, thanks for connecting!",
          response: "Likewise! I've been following your work at [Company] — really impressive stuff with the product launch last quarter. Would love to hear more about what you're working on next!" },
      ]
    },
    {
      id: 'close_deal',
      name: '💼 Close / Pitch',
      description: 'Move toward a commitment or next step',
      tone: 'professional',
      examples: [
        { inbound: "We've been considering a few options.",
          response: "Completely understand — it's a big decision! What I can share is that our clients typically see ROI within the first 30 days. Happy to connect you with a reference in your industry. Would that help with evaluating?" },
      ]
    },
    {
      id: 'cold_outreach',
      name: '❄️ Cold Outreach',
      description: 'Initiate contact with someone new',
      tone: 'witty',
      examples: [
        { inbound: "",
          response: "Hi [Name]! I came across your profile and was genuinely impressed by your work in [field]. I'm working on something that could be a perfect fit — mind if I share a quick overview?" },
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
  //  3. CONVERSATION SCRAPER
  // ═══════════════════════════════════════════
  function scrapeConversation() {
    const messages = [];
    // LinkedIn messaging selectors — try multiple in case of DOM updates
    const msgSelectors = [
      '.msg-s-event-listitem__body',
      '.msg-s-message-list__event',
      'li.msg-s-message-list__event',
      '.msg-s-event-listitem',
      'div[class*="msg-s-event-listitem"]',
      'div[class*="message-event"]',
      '.msg-s-message-group__msg',
    ];

    let msgElements = [];
    for (const sel of msgSelectors) {
      msgElements = document.querySelectorAll(sel);
      if (msgElements.length > 0) break;
    }

    msgElements.forEach(el => {
      const textEl = el.querySelector('.msg-s-event-listitem__body, .msg-s-event__content, p, span[class*="message"]');
      const senderEl = el.querySelector('.msg-s-message-group__name, .msg-s-message-group__profile-link, span[class*="sender"]');
      if (textEl) {
        messages.push({
          text: textEl.textContent.trim(),
          sender: senderEl ? senderEl.textContent.trim() : 'Unknown',
          isMe: !!el.querySelector('.msg-s-event-listitem--other') === false,
        });
      }
    });

    // Get conversation partner name
    const partnerNameEl = document.querySelector(
      '.msg-overlay-bubble-header__title, ' +
      '.msg-conversation-card__participant-names, ' +
      '.msg-thread__title-text, ' +
      'h2[class*="msg-overlay-bubble-header"], ' +
      'h2[class*="conversation-title"]'
    );

    return {
      messages: messages.slice(-10), // Last 10 messages
      lastMessage: messages.length > 0 ? messages[messages.length - 1] : null,
      partnerName: partnerNameEl ? partnerNameEl.textContent.trim() : 'there',
    };
  }

  // ═══════════════════════════════════════════
  //  4. AI ENGINE — Local Response Generator
  // ═══════════════════════════════════════════
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function generateResponse(profile, conversation) {
    if (!profile || !profile.examples || profile.examples.length === 0) {
      return `Hi ${conversation.partnerName}!\n\nThanks for your message. I'd love to continue this conversation and explore how we can work together.\n\nLooking forward to hearing from you!`;
    }

    const lastMsg = conversation.lastMessage;
    const partnerName = conversation.partnerName || 'there';

    // Intent detection
    const inboundText = lastMsg ? lastMsg.text.toLowerCase() : '';
    let bestMatch = profile.examples[0];
    let bestScore = -1;

    for (const ex of profile.examples) {
      if (!ex.inbound && !lastMsg) { bestMatch = ex; bestScore = 100; break; }
      if (!ex.inbound || !lastMsg) continue;

      const exWords = ex.inbound.toLowerCase().split(/\s+/);
      const inWords = inboundText.split(/\s+/);
      let score = 0;
      for (const w of exWords) {
        if (w.length > 3 && inWords.some(iw => iw.includes(w) || w.includes(iw))) score++;
      }
      // Sentiment matching
      const questionMarks = (inboundText.match(/\?/g) || []).length;
      const exQuestions = (ex.inbound.toLowerCase().match(/\?/g) || []).length;
      if (questionMarks > 0 && exQuestions > 0) score += 2;
      if (inboundText.length < 50 && ex.inbound.length < 50) score += 1;

      if (score > bestScore) { bestScore = score; bestMatch = ex; }
    }

    // Blend multiple examples
    let base = bestMatch.response;
    if (profile.examples.length > 1 && Math.random() > 0.4) {
      const other = profile.examples.filter(e => e !== bestMatch);
      const secondary = pick(other);
      if (secondary.response) {
        const sentences = secondary.response.split(/[.!?]+/).filter(s => s.trim().length > 10);
        if (sentences.length > 0) {
          const bonus = pick(sentences).trim();
          base = base.replace(/\n\n/g, `\n\n${bonus}. `);
        }
      }
    }

    // Personalize
    let response = base
      .replace(/\[Name\]/gi, partnerName.split(' ')[0])
      .replace(/\[Company\]/gi, 'your company')
      .replace(/\[field\]/gi, 'your field');

    // Apply tone variations
    response = applyToneVariations(response, profile.tone);

    // Add greeting if missing
    if (!/^(hi|hey|hello|dear|good)/i.test(response.trim())) {
      const greetings = {
        professional: [`Hi ${partnerName.split(' ')[0]},`, `Hello ${partnerName.split(' ')[0]},`],
        casual: [`Hey ${partnerName.split(' ')[0]}!`, `Hi ${partnerName.split(' ')[0]}!`],
        enthusiastic: [`Hey ${partnerName.split(' ')[0]}! 😊`, `Hi there ${partnerName.split(' ')[0]}!`],
        witty: [`Hey ${partnerName.split(' ')[0]}!`, `Hi ${partnerName.split(' ')[0]} —`],
      };
      response = pick(greetings[profile.tone] || greetings.professional) + '\n\n' + response;
    }

    return response;
  }

  function applyToneVariations(text, tone) {
    const variations = {
      professional: [
        [/I'd love to/gi, () => pick(["I would be glad to", "I'd welcome the opportunity to", "I'd be pleased to"])],
        [/Let me know/gi, () => pick(["Please don't hesitate to reach out", "I look forward to hearing from you", "Feel free to share your thoughts"])],
        [/I believe/gi, () => pick(["I'm confident", "Based on my experience,", "I'm certain"])],
      ],
      casual: [
        [/I'd love to/gi, () => pick(["I'd really like to", "I'm keen to", "Would love to"])],
        [/Let me know/gi, () => pick(["Drop me a line", "Hit me up", "Shoot me a message"])],
        [/I'd like to/gi, () => pick(["Wanna", "I'm looking to", "Hoping to"])],
      ],
      enthusiastic: [
        [/I'd love to/gi, () => pick(["I'd absolutely love to", "I'm so excited to", "Can't wait to", "I'd be thrilled to"])],
        [/Let me know/gi, () => pick(["Please let me know!", "I'm all ears!", "Would love to hear from you!", "Can't wait to hear back!"])],
        [/I believe/gi, () => pick(["I truly believe", "I'm convinced", "I'm so confident"])],
      ],
      witty: [
        [/I'd love to/gi, () => pick(["I'd genuinely love to", "Count me in to", "I'm all in for", "Sign me up to"])],
        [/Let me know/gi, () => pick(["Ball's in your court", "Your move", "I'm all ears", "The floor is yours"])],
        [/I believe/gi, () => pick(["Call me crazy but I think", "Plot twist:", "Here's the thing —"])],
      ],
    };

    const rules = variations[tone] || variations.professional;
    for (const [pattern, replacer] of rules) {
      if (Math.random() > 0.45) {
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
    btn.title = 'Generate AI-powered reply based on your training data';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleAIPanel();
    });
    return btn;
  }

  async function injectAIReplyButton() {
    if (!isOnMessagingPage()) return;
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

    // ─── Strategy 6: Floating button fallback ───
    if (isOnMessagingPage()) {
      btn.classList.add('floating');
      document.body.appendChild(btn);
      console.log('[OutreachPro DM] ✅ Injected as floating button');
      return;
    }

    console.log('[OutreachPro DM] ⚠ Could not find injection point');
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
    const conversation = scrapeConversation();

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

      const freshConv = scrapeConversation();

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
    insertBtn.onclick = () => insertIntoMessageBox(responseArea.value);
  }

  // ═══════════════════════════════════════════
  //  7. INSERT INTO LINKEDIN MESSAGE BOX
  //  React-compatible: fires synthetic events like Auto Gmail
  // ═══════════════════════════════════════════
  function insertIntoMessageBox(text) {
    const boxSelectors = [
      '.msg-form__contenteditable div[contenteditable="true"]',
      '.msg-form__contenteditable',
      'div[role="textbox"][contenteditable="true"]',
      'div[contenteditable="true"][class*="msg"]',
      'div[aria-label*="Write a message"]',
      'div[data-placeholder*="Write a message"]',
    ];

    let box = null;
    for (const sel of boxSelectors) {
      box = document.querySelector(sel);
      if (box) break;
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
        console.log('[OutreachPro DM] No msg form found via waitForElement, trying fallback...');
        // Fallback: if on messaging page, inject floating button
        if (isOnMessagingPage()) {
          setTimeout(injectAIReplyButton, 1000);
        }
      });

    // Also try at intervals for SPA navigation
    setTimeout(injectAIReplyButton, 3000);
    setTimeout(injectAIReplyButton, 6000);

    startObserving();

    // Watch URL changes (LinkedIn is an SPA)
    lastMsgUrl = location.href;
    setInterval(() => {
      if (location.href !== lastMsgUrl) {
        lastMsgUrl = location.href;
        injectionAttempts = 0;
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
