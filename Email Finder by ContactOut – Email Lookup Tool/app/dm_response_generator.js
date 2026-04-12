/**
 * OutreachPro — AI DM Response Generator
 *
 * Injects into LinkedIn messaging pages. Provides:
 *   1. "✨ AI Reply" button next to the message input
 *   2. Training Studio — teach the AI your desired DM outcomes
 *   3. Context-aware response generation from trained data
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
      }
      .${AI_BTN_CLASS}:hover {
        transform: translateY(-1px) scale(1.04);
        box-shadow: 0 4px 18px rgba(99, 102, 241, 0.5);
      }
      @keyframes dm-ai-glow {
        0%, 100% { box-shadow: 0 2px 10px rgba(99,102,241,0.35); }
        50% { box-shadow: 0 4px 16px rgba(99,102,241,0.55); }
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
      }
      .dm-ai-header-close:hover { background: rgba(255,255,255,0.35); }

      .dm-ai-tabs {
        display: flex; border-bottom: 1px solid #f0f0f5; background: #fafafa;
      }
      .dm-ai-tab {
        flex: 1; padding: 10px 4px; font-size: 11px; font-weight: 600; text-align: center;
        cursor: pointer; color: #888; border: none; border-bottom: 2px solid transparent;
        background: none; font-family: inherit; transition: all 0.2s;
      }
      .dm-ai-tab:hover { color: #6366F1; background: rgba(99,102,241,0.04); }
      .dm-ai-tab.active { color: #6366F1; border-bottom-color: #6366F1; }

      .dm-ai-body {
        padding: 14px; flex: 1; overflow-y: auto; max-height: 340px;
      }
      .dm-ai-body textarea {
        width: 100%; min-height: 100px; border: 1.5px solid #e8e8ed; border-radius: 10px;
        padding: 12px; font-size: 12px; font-family: 'Inter', sans-serif; line-height: 1.6;
        resize: vertical; outline: none; color: #1a1a2e; box-sizing: border-box;
      }
      .dm-ai-body textarea:focus { border-color: #6366F1; box-shadow: 0 0 0 3px rgba(99,102,241,0.12); }

      .dm-ai-actions {
        display: flex; gap: 8px; padding: 12px 14px; border-top: 1px solid #f0f0f5;
        align-items: center;
      }
      .dm-ai-gen-btn {
        display: inline-flex; align-items: center; gap: 5px; padding: 9px 16px;
        font-size: 12px; font-weight: 600;
        background: linear-gradient(135deg, #8B5CF6, #6366F1, #4F46E5);
        color: #fff; border: none; border-radius: 10px; cursor: pointer;
        font-family: inherit; box-shadow: 0 2px 8px rgba(99,102,241,0.3);
        transition: all 0.25s;
      }
      .dm-ai-gen-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 14px rgba(99,102,241,0.45); }

      .dm-ai-insert-btn {
        padding: 9px 14px; font-size: 12px; font-weight: 600;
        background: #0077B5; color: #fff; border: none; border-radius: 10px;
        cursor: pointer; font-family: inherit; transition: all 0.2s;
      }
      .dm-ai-insert-btn:hover { background: #005f91; }

      .dm-ai-sec-btn {
        padding: 9px 14px; font-size: 11px; font-weight: 500;
        background: #fff; color: #666; border: 1.5px solid #e0e0e5; border-radius: 10px;
        cursor: pointer; font-family: inherit; transition: all 0.2s;
      }
      .dm-ai-sec-btn:hover { border-color: #6366F1; color: #6366F1; }

      .dm-ai-footer {
        padding: 8px 14px; background: #fafafa; border-top: 1px solid #f0f0f5;
        text-align: center; font-size: 10px; color: #bbb; border-radius: 0 0 16px 16px;
      }
      .dm-ai-footer .hl { color: #6366F1; font-weight: 700; }

      /* Profile cards (training) */
      .dm-ai-profile-card {
        padding: 12px; border: 1.5px solid #e8e8ed; border-radius: 10px;
        margin-bottom: 10px; cursor: pointer; transition: all 0.2s;
        background: #fff;
      }
      .dm-ai-profile-card:hover { border-color: #6366F1; background: rgba(99,102,241,0.02); }
      .dm-ai-profile-card.selected { border-color: #6366F1; background: rgba(99,102,241,0.06); }
      .dm-ai-profile-card .pname { font-size: 13px; font-weight: 600; margin-bottom: 2px; }
      .dm-ai-profile-card .pdesc { font-size: 11px; color: #888; }
      .dm-ai-profile-card .pcount { font-size: 10px; color: #6366F1; margin-top: 4px; font-weight: 600; }

      .dm-ai-training-input {
        width: 100%; padding: 10px; border: 1.5px solid #e8e8ed; border-radius: 8px;
        font-size: 12px; font-family: 'Inter', sans-serif; outline: none;
        box-sizing: border-box; margin-bottom: 8px;
      }
      .dm-ai-training-input:focus { border-color: #6366F1; box-shadow: 0 0 0 3px rgba(99,102,241,0.12); }

      .dm-ai-example-pair {
        padding: 10px; background: #f9f9fc; border-radius: 8px; margin-bottom: 8px;
        border-left: 3px solid #6366F1;
      }
      .dm-ai-example-pair .ex-label { font-size: 10px; font-weight: 700; color: #6366F1; text-transform: uppercase; margin-bottom: 4px; }
      .dm-ai-example-pair .ex-text { font-size: 11px; color: #555; line-height: 1.5; }
      .dm-ai-example-pair .ex-del {
        float: right; background: none; border: none; color: #EF4444; cursor: pointer;
        font-size: 10px; font-weight: 600; font-family: inherit;
      }
      .dm-ai-example-pair .ex-del:hover { text-decoration: underline; }

      .dm-ai-context-box {
        background: #f4f3ff; border: 1px solid #e0deff; border-radius: 10px;
        padding: 10px; margin-bottom: 12px; font-size: 11px; color: #555; line-height: 1.5;
        max-height: 80px; overflow-y: auto;
      }

      .dm-ai-skel {
        background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
        background-size: 200% 100%; animation: dm-shimmer 1.5s infinite;
        border-radius: 6px; height: 13px; margin-bottom: 7px;
      }
      .dm-ai-skel.s { width: 60%; } .dm-ai-skel.m { width: 80%; } .dm-ai-skel.l { width: 95%; }
      @keyframes dm-shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }

      .dm-ai-toast {
        position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
        background: #1a1a2e; color: #fff; padding: 10px 22px; border-radius: 10px;
        font-size: 12px; font-family: 'Inter', sans-serif; z-index: 2147483642;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3); animation: dm-toast-in 0.3s ease;
      }
      .dm-ai-toast.success { background: #10B981; }
      .dm-ai-toast.error { background: #EF4444; }
      @keyframes dm-toast-in {
        from { opacity: 0; transform: translateX(-50%) translateY(10px); }
        to { opacity: 1; transform: translateX(-50%) translateY(0); }
      }

      /* Outcome select dropdown */
      .dm-ai-outcome-select {
        width: 100%; padding: 8px 10px; border: 1.5px solid #e8e8ed; border-radius: 8px;
        font-size: 12px; font-family: 'Inter', sans-serif; outline: none;
        margin-bottom: 10px; box-sizing: border-box; cursor: pointer;
        background: #fff; color: #333;
      }
      .dm-ai-outcome-select:focus { border-color: #6366F1; }
    `;
    document.head.appendChild(style);
  }

  // ═══════════════════════════════════════════
  //  2. TRAINING DATA CRUD
  // ═══════════════════════════════════════════
  function getProfiles() {
    return new Promise(resolve => {
      chrome.storage.local.get(TRAINING_KEY, r => {
        resolve(r[TRAINING_KEY] || getDefaultProfiles());
      });
    });
  }

  function saveProfiles(profiles) {
    return new Promise(resolve => {
      chrome.storage.local.set({ [TRAINING_KEY]: profiles }, resolve);
    });
  }

  function getDefaultProfiles() {
    return [
      {
        id: 'book_meeting',
        name: '📅 Book a Meeting',
        description: 'Guide the conversation toward scheduling a call or meeting',
        tone: 'professional',
        examples: [
          {
            inbound: "Hey, thanks for connecting! What do you do?",
            response: "Great connecting with you! I help companies streamline their outreach processes. I'd love to learn more about what you're working on — would you have 15 minutes this week for a quick chat?"
          },
          {
            inbound: "Sounds interesting, tell me more",
            response: "Happy to! In a nutshell, I help teams save 10+ hours per week on prospecting. I find a short call is the best way to see if there's a fit. How does Thursday or Friday look for you?"
          }
        ],
      },
      {
        id: 'pitch_service',
        name: '🎯 Pitch Service',
        description: 'Present your service/product in a compelling, non-pushy way',
        tone: 'casual',
        examples: [
          {
            inbound: "What exactly does your company offer?",
            response: "Great question! We built a tool that automates LinkedIn outreach while keeping it personal. Most of our clients see 3x more responses. Want me to send you a quick demo link?"
          }
        ],
      },
      {
        id: 'warm_followup',
        name: '🔄 Warm Follow-up',
        description: 'Re-engage a conversation that went cold',
        tone: 'enthusiastic',
        examples: [
          {
            inbound: "",
            response: "Hey! Hope you've been doing well since we last chatted. I've been thinking about our conversation and figured I'd check back in. Have things changed on your end regarding [topic]? No pressure at all!"
          }
        ],
      },
      {
        id: 'network_build',
        name: '🤝 Build Network',
        description: 'Nurture genuine professional relationships',
        tone: 'casual',
        examples: [
          {
            inbound: "Thanks for the connection!",
            response: "Of course! I love connecting with people in our space. What's been keeping you busy lately? Always looking to share insights and learn from others in the field."
          }
        ],
      },
    ];
  }

  // ═══════════════════════════════════════════
  //  3. CONVERSATION SCRAPER
  // ═══════════════════════════════════════════
  function scrapeConversation() {
    const messages = [];

    // LinkedIn message thread selectors
    const msgSelectors = [
      '.msg-s-event-listitem',
      '.msg-s-message-list__event',
      '.msg-s-message-group__meta',
      '.msg-s-event-listitem__body',
    ];

    // Try to find message elements
    let msgElements = [];
    for (const sel of msgSelectors) {
      msgElements = document.querySelectorAll(sel);
      if (msgElements.length > 0) break;
    }

    // Extract text from each message
    msgElements.forEach(el => {
      const bodyEl = el.querySelector('.msg-s-event-listitem__body, .msg-s-event__content, p');
      const senderEl = el.querySelector('.msg-s-message-group__name, .msg-s-event-listitem__name, .msg-s-message-group__profile-link');
      if (bodyEl) {
        messages.push({
          text: bodyEl.textContent.trim(),
          sender: senderEl ? senderEl.textContent.trim() : 'Unknown',
          isMe: !!el.querySelector('.msg-s-event-listitem--other') === false,
        });
      }
    });

    // Fallback: try broader selectors
    if (messages.length === 0) {
      const allMsgBodies = document.querySelectorAll(
        '.msg-s-event-listitem__body p, ' +
        '.msg-s-message-list-content .msg-s-event-listitem p, ' +
        '[class*="msg-s-event"] p'
      );
      allMsgBodies.forEach(p => {
        const text = p.textContent.trim();
        if (text.length > 0) {
          messages.push({ text, sender: 'Contact', isMe: false });
        }
      });
    }

    // Get conversation partner name
    let partnerName = '';
    const nameSelectors = [
      '.msg-overlay-bubble-header__title',
      '.msg-thread__link-to-profile',
      '.msg-entity-lockup__entity-title',
      '.msg-s-message-list__name-link',
      'h2.msg-overlay-bubble-header__title',
    ];
    for (const sel of nameSelectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim()) {
        partnerName = el.textContent.trim();
        break;
      }
    }

    return {
      messages: messages.slice(-10), // last 10 messages for context
      partnerName,
      lastMessage: messages.length > 0 ? messages[messages.length - 1] : null,
    };
  }

  // ═══════════════════════════════════════════
  //  4. RESPONSE GENERATION ENGINE (Enhanced)
  // ═══════════════════════════════════════════
  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  // ── Stop words for content analysis ──
  const STOP_WORDS = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'do', 'does', 'did',
    'have', 'has', 'had', 'i', 'you', 'we', 'they', 'he', 'she', 'it', 'my', 'your', 'our',
    'their', 'this', 'that', 'what', 'how', 'when', 'where', 'who', 'why', 'and', 'or', 'but',
    'in', 'on', 'at', 'to', 'for', 'of', 'with', 'about', 'be', 'been', 'being', 'not', 'so',
    'if', 'can', 'will', 'would', 'could', 'just', 'more', 'also', 'very', 'much', 'some',
    'any', 'me', 'up', 'out', 'get', 'got', 'let', 'know', 'think', 'like', 'really',
    'thanks', 'thank', 'hi', 'hey', 'hello', 'yes', 'no', 'ok', 'okay', 'sure', 'well',
    'then', 'now', 'here', 'there', 'been', 'had', 'its', 'than', 'too', 'only', 'into',
    'over', 'after', 'before', 'between', 'each', 'few', 'those', 'such', 'own', 'same',
    'other', 'most', 'through']);

  /**
   * Tokenize text into meaningful content words (lowercase, no stop words, min length 3)
   */
  function tokenize(text) {
    if (!text) return [];
    return text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOP_WORDS.has(w));
  }

  /**
   * TF-IDF-like weighted similarity between two texts.
   * Weights rare/longer words higher than common short ones.
   */
  function weightedSimilarity(textA, textB) {
    if (!textA || !textB) return 0;
    const tokensA = tokenize(textA);
    const tokensB = tokenize(textB);
    if (tokensA.length === 0 || tokensB.length === 0) return 0;

    const setB = new Set(tokensB);
    let weightedMatches = 0;
    let totalWeight = 0;

    for (const w of tokensA) {
      // Longer words are weighted higher (proxy for specificity)
      const weight = Math.min(w.length / 4, 2.5);
      totalWeight += weight;
      if (setB.has(w)) {
        weightedMatches += weight;
      }
    }

    // Also check bigrams (consecutive word pairs) for phrase matching
    for (let i = 0; i < tokensA.length - 1; i++) {
      const bigram = tokensA[i] + ' ' + tokensA[i + 1];
      const textBLower = textB.toLowerCase();
      if (textBLower.includes(bigram)) {
        weightedMatches += 2; // bigram match is a strong signal
        totalWeight += 2;
      }
    }

    return totalWeight > 0 ? weightedMatches / totalWeight : 0;
  }

  /**
   * Detect the intent category of a message to improve matching.
   */
  function detectIntent(text) {
    if (!text) return 'cold';
    const lower = text.toLowerCase();

    if (/\?/.test(lower)) return 'question';
    if (/thank|appreciate|great|awesome|cool|nice|perfect/.test(lower)) return 'positive';
    if (/not interested|no thanks|pass|busy|unsubscribe|stop/.test(lower)) return 'objection';
    if (/tell me more|interested|sounds|curious|how does|what does/.test(lower)) return 'interest';
    if (/hi|hey|hello|connecting|thanks for connect/.test(lower)) return 'greeting';
    if (/schedule|call|meet|chat|zoom|calendar|time/.test(lower)) return 'scheduling';
    return 'general';
  }

  /**
   * Build a context summary from the full conversation history.
   */
  function buildConversationContext(conversation) {
    const ctx = {
      messageCount: conversation.messages.length,
      partnerName: conversation.partnerName || '',
      firstName: (conversation.partnerName || '').split(' ')[0] || '',
      lastMessage: conversation.lastMessage?.text || '',
      lastIntent: detectIntent(conversation.lastMessage?.text || ''),
      topics: [],
      conversationFlow: [],
      isFirstMessage: conversation.messages.length <= 1,
    };

    // Extract topics from all messages
    const allText = conversation.messages.map(m => m.text).join(' ');
    ctx.topics = extractTopics(allText);

    // Build conversation flow (who said what, summarized)
    ctx.conversationFlow = conversation.messages.slice(-5).map(m => ({
      sender: m.isMe ? 'me' : 'them',
      intent: detectIntent(m.text),
      preview: m.text.substring(0, 80),
    }));

    return ctx;
  }

  /**
   * Extract key topics/phrases from text using frequency analysis.
   */
  function extractTopics(text) {
    if (!text) return [];
    const tokens = tokenize(text);
    const freq = {};
    tokens.forEach(w => { freq[w] = (freq[w] || 0) + 1; });

    // Sort by frequency × word length (longer frequent words = key topics)
    return Object.entries(freq)
      .map(([word, count]) => ({ word, score: count * Math.min(word.length / 4, 2) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(t => t.word);
  }

  function extractTopic(text) {
    const topics = extractTopics(text);
    return topics.slice(0, 3).join(' ') || '';
  }

  /**
   * Score each training example against the conversation context.
   * Uses multiple signals: text similarity, intent match, topic overlap.
   */
  function scoreExamples(profile, context) {
    const scores = [];

    for (const ex of profile.examples) {
      let score = 0;

      // Signal 1: Text similarity between last message and example inbound (0-1)
      const textSim = weightedSimilarity(context.lastMessage, ex.inbound);
      score += textSim * 5; // weight: 5x

      // Signal 2: Intent match (0 or 2)
      const exIntent = detectIntent(ex.inbound);
      if (exIntent === context.lastIntent) score += 2;

      // Signal 3: Cold outreach match
      if (!ex.inbound && context.isFirstMessage) score += 3;
      if (!ex.inbound && !context.lastMessage) score += 4;

      // Signal 4: Topic overlap with conversation history
      const exTopics = extractTopics(ex.inbound + ' ' + ex.response);
      const overlap = exTopics.filter(t => context.topics.includes(t)).length;
      score += overlap * 0.5;

      scores.push({ example: ex, score, textSim, intentMatch: exIntent === context.lastIntent });
    }

    return scores.sort((a, b) => b.score - a.score);
  }

  /**
   * Blend elements from multiple close-scoring examples to create a richer response.
   */
  function blendResponses(scoredExamples, context, profile) {
    if (scoredExamples.length === 0) {
      return "Thanks for reaching out! I'd love to learn more about what you're working on.";
    }

    const best = scoredExamples[0];

    // If only one example or big gap, use the best one directly
    if (scoredExamples.length === 1 || (scoredExamples.length > 1 && best.score - scoredExamples[1].score > 3)) {
      return best.example.response;
    }

    // Find close contenders (within 30% of best score)
    const threshold = best.score * 0.7;
    const contenders = scoredExamples.filter(s => s.score >= threshold).slice(0, 3);

    if (contenders.length <= 1) {
      return best.example.response;
    }

    // Blend: use primary response structure, but weave in elements from runner-up
    let primary = best.example.response;
    const secondary = contenders[1].example.response;

    // Extract sentences
    const primarySentences = primary.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 10);
    const secondarySentences = secondary.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 10);

    // If secondary has a unique closing/CTA, consider swapping the ending
    if (secondarySentences.length > 1 && primarySentences.length > 1 && Math.random() > 0.5) {
      const lastSecondary = secondarySentences[secondarySentences.length - 1];
      // Only blend if the secondary ending is a question or CTA
      if (/\?|would you|how does|shall we|can we|let's|want me/.test(lastSecondary.toLowerCase())) {
        primarySentences[primarySentences.length - 1] = lastSecondary;
        primary = primarySentences.join(' ');
      }
    }

    return primary;
  }

  /**
   * Main generation function — uses context scoring, blending, and variation.
   */
  function generateResponse(profile, conversation) {
    const context = buildConversationContext(conversation);

    // Score all training examples
    const scored = scoreExamples(profile, context);

    // Blend top responses
    let response = blendResponses(scored, context, profile);

    // Variable substitution
    response = response
      .replace(/\{name\}/gi, context.firstName || 'there')
      .replace(/\{firstName\}/gi, context.firstName || 'there')
      .replace(/\{partner\}/gi, context.partnerName || 'there')
      .replace(/\[topic\]/gi, context.topics.slice(0, 2).join(' ') || 'our earlier discussion')
      .replace(/\[their topic\]/gi, context.topics.slice(0, 2).join(' ') || 'your work');

    // Add variation to avoid identical responses
    response = addVariation(response, profile.tone);

    // Context-aware adjustments based on conversation flow
    response = applyContextAdjustments(response, context, profile.tone);

    // Add greeting if missing and we know their name
    if (context.firstName && !/^(hey|hi|hello)/i.test(response)) {
      const greetings = {
        professional: [`Hi ${context.firstName},`, `Hello ${context.firstName},`],
        casual: [`Hey ${context.firstName}!`, `Hi ${context.firstName}!`],
        enthusiastic: [`Hey ${context.firstName}! 🙌`, `Hi ${context.firstName}! 😊`],
        witty: [`Hey ${context.firstName}!`, `Hi there ${context.firstName}!`],
      };
      const greeting = pick(greetings[profile.tone] || greetings.professional);
      response = `${greeting} ${response}`;
    }

    return response;
  }

  /**
   * Apply context-aware adjustments based on conversation flow.
   */
  function applyContextAdjustments(response, context, tone) {
    // If they asked a question, make sure we're answering (not just pitching)
    if (context.lastIntent === 'question' && !/^(great question|good question|absolutely)/i.test(response)) {
      const questionAcks = {
        professional: pick(["Great question! ", "Good question — ", "That's a great point. "]),
        casual: pick(["Oh good question! ", "Glad you asked! ", ""]),
        enthusiastic: pick(["Love that question! ", "Great question! 🎯 ", "Oh I'm glad you asked! "]),
        witty: pick(["Ah, the million-dollar question! ", "Good one! ", ""]),
      };
      const ack = questionAcks[tone] || '';
      if (ack && Math.random() > 0.4) {
        response = ack + response.charAt(0).toLowerCase() + response.slice(1);
      }
    }

    // If they expressed positive sentiment, acknowledge it
    if (context.lastIntent === 'positive' && !/^(thanks|glad|appreciate)/i.test(response)) {
      const positiveAcks = {
        professional: pick(["Appreciate that! ", "Thank you! ", ""]),
        casual: pick(["Awesome! ", "Thanks! ", "Glad to hear! "]),
        enthusiastic: pick(["That's great to hear! 🙏 ", "Appreciate the kind words! ", "Thanks so much! 😊 "]),
        witty: pick(["You're making my day! ", "Appreciate it! ", ""]),
      };
      const ack = positiveAcks[tone] || '';
      if (ack && Math.random() > 0.4) {
        response = ack + response;
      }
    }

    // If this is a follow-up (multiple messages exchanged), skip intro-style openers
    if (context.messageCount > 3) {
      response = response
        .replace(/^(I noticed your|I came across your|I saw your)\s/i, '')
        .replace(/^(Thanks for connecting!?\s*)/i, '');
    }

    return response;
  }

  function addVariation(text, tone) {
    // Rich sentence rephrasing for variety
    const variations = {
      professional: [
        [/I'd love to/gi, () => pick(["I'd welcome the chance to", "I'd be happy to", "I'd enjoy the opportunity to", "It would be great to"])],
        [/Let me know/gi, () => pick(["Please let me know", "Feel free to share", "I'd appreciate hearing", "I'm curious to hear"])],
        [/I believe/gi, () => pick(["I'm confident", "I think", "I sense", "It seems like"])],
        [/Would you be interested/gi, () => pick(["Would you be open to", "How would you feel about", "Would it make sense to"])],
        [/I'd like to/gi, () => pick(["I'd be keen to", "I'm hoping to", "I'd welcome the chance to"])],
      ],
      casual: [
        [/I'd love to/gi, () => pick(["Would love to", "I'm keen to", "I'd be down to", "Totally want to"])],
        [/Let me know/gi, () => pick(["Hit me up", "Drop me a line", "Shoot me a message", "Give me a shout"])],
        [/I believe/gi, () => pick(["I reckon", "I think", "Pretty sure", "I feel like"])],
        [/Would you be interested/gi, () => pick(["Wanna", "Down to", "Fancy", "Up for"])],
        [/I'd like to/gi, () => pick(["Wanna", "I'm looking to", "Hoping to"])],
      ],
      enthusiastic: [
        [/I'd love to/gi, () => pick(["I'd absolutely love to", "I'm so excited to", "Can't wait to", "I'd be thrilled to"])],
        [/Let me know/gi, () => pick(["Please let me know!", "I'm all ears!", "Would love to hear from you!", "Can't wait to hear back!"])],
        [/I believe/gi, () => pick(["I truly believe", "I'm convinced", "I'm so confident"])],
        [/Would you be interested/gi, () => pick(["How amazing would it be to", "Would you love to", "How cool would it be to"])],
      ],
      witty: [
        [/I'd love to/gi, () => pick(["I'd genuinely love to", "Count me in to", "I'm all in for", "Sign me up to"])],
        [/Let me know/gi, () => pick(["Ball's in your court", "Your move", "I'm all ears", "The floor is yours"])],
        [/I believe/gi, () => pick(["Call me crazy but I think", "Plot twist:", "Here's the thing —"])],
      ],
    };

    const rules = variations[tone] || variations.professional;
    for (const [pattern, replacer] of rules) {
      if (Math.random() > 0.45) { // ~55% chance to apply each variation
        text = text.replace(pattern, replacer);
      }
    }

    return text;
  }

  // ═══════════════════════════════════════════
  //  5. UI — AI REPLY BUTTON INJECTION
  // ═══════════════════════════════════════════
  function injectAIReplyButton() {
    // Don't inject on non-messaging pages
    if (!isOnMessagingPage()) return;
    // Already injected
    if (document.querySelector('.' + AI_BTN_CLASS)) return;

    // Find the message input toolbar area
    const toolbarSelectors = [
      '.msg-form__footer',
      '.msg-form__left-actions',
      '.msg-form__content-container',
      '.msg-overlay-conversation-bubble__action-bar',
      // LinkedIn 2025/2026 full messaging page selectors
      '.msg-form__msg-content-container',
      '.msg-conversations-container__convo-card-container .msg-form__footer',
      '.msg-s-message-list-container + div',
      'footer.msg-form__footer',
      'form.msg-form div[class*="footer"]',
    ];

    let toolbar = null;
    for (const sel of toolbarSelectors) {
      toolbar = document.querySelector(sel);
      if (toolbar) break;
    }

    if (!toolbar) return;

    const btn = document.createElement('button');
    btn.className = AI_BTN_CLASS;
    btn.innerHTML = '<span style="animation:dm-ai-glow 2s ease-in-out infinite;display:inline-flex">✨</span><span>AI Reply</span>';
    btn.title = 'Generate AI-powered reply based on your training data';

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleAIPanel();
    });

    // Insert the button
    if (toolbar.classList.contains('msg-form__footer') || toolbar.classList.contains('msg-form__left-actions')) {
      toolbar.prepend(btn);
    } else {
      toolbar.appendChild(btn);
    }

    console.log('[OutreachPro DM] AI Reply button injected');
  }

  function isOnMessagingPage() {
    return location.pathname.includes('/messaging') ||
           document.querySelector('.msg-overlay-conversation-bubble, .msg-form__contenteditable, .msg-thread');
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
      : 'No messages found';

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

        // Update actions
        const actions = panel.querySelector('#dm-ai-actions');
        actions.style.display = tabName === 'generate' ? 'flex' : 'none';

        if (tabName === 'training') {
          renderTrainingStudio(panel);
        }
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

      // Show loading
      responseArea.style.display = 'none';
      skelArea.style.display = 'block';
      copyBtn.style.display = 'none';
      insertBtn.style.display = 'none';

      // Re-scrape conversation for fresh context
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

    // Insert into LinkedIn message box (review first — not auto-send)
    insertBtn.onclick = () => {
      insertIntoMessageBox(responseArea.value);
    };
  }

  // ═══════════════════════════════════════════
  //  7. INSERT INTO LINKEDIN MESSAGE BOX
  // ═══════════════════════════════════════════
  function insertIntoMessageBox(text) {
    const box = document.querySelector(
      '.msg-form__contenteditable, ' +
      'div[role="textbox"][contenteditable="true"], ' +
      '.msg-form__msg-content-container div[contenteditable="true"]'
    );

    if (!box) {
      navigator.clipboard.writeText(text);
      showDMToast('Message copied to clipboard. Paste it in the message box.', 'success');
      return;
    }

    box.focus();
    box.innerHTML = '';
    const paragraphs = text.split('\n').filter(l => l.trim());
    paragraphs.forEach(p => {
      const pEl = document.createElement('p');
      pEl.textContent = p;
      box.appendChild(pEl);
    });

    // Trigger React events
    box.dispatchEvent(new Event('input', { bubbles: true }));
    box.dispatchEvent(new Event('change', { bubbles: true }));
    box.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: ' ' }));
    box.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: ' ' }));

    showDMToast('Reply inserted! Review and click Send when ready.', 'success');

    // Close panel
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

    // Add Profile
    container.querySelector('#dm-ai-add-profile').onclick = () => {
      const newProfile = {
        id: 'custom_' + Date.now(),
        name: '🎯 New Outcome',
        description: 'Describe the desired outcome of this conversation',
        tone: 'professional',
        examples: [],
      };
      profiles.push(newProfile);
      saveProfiles(profiles).then(() => {
        renderProfileEditor(panel, newProfile, profiles);
      });
    };

    // Edit buttons
    container.querySelectorAll('.dm-ai-edit-profile').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const pid = btn.dataset.pid;
        const profile = profiles.find(p => p.id === pid);
        if (profile) renderProfileEditor(panel, profile, profiles);
      };
    });

    // Delete buttons
    container.querySelectorAll('.dm-ai-del-profile').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const pid = btn.dataset.pid;
        const idx = profiles.findIndex(p => p.id === pid);
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

    // Back
    container.querySelector('#dm-ai-back-profiles').onclick = () => renderTrainingStudio(panel);

    // Add example
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

    // Delete example
    container.querySelectorAll('.ex-del').forEach(btn => {
      btn.onclick = () => {
        const idx = parseInt(btn.dataset.idx);
        profile.examples.splice(idx, 1);
        saveProfiles(allProfiles).then(() => renderProfileEditor(panel, profile, allProfiles));
      };
    });

    // Save profile
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
  // ═══════════════════════════════════════════
  function startObserving() {
    if (observer) observer.disconnect();
    let timer = null;
    observer = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (isOnMessagingPage() && !document.querySelector('.' + AI_BTN_CLASS)) {
          injectAIReplyButton();
        }
      }, 1500);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function init() {
    if (!location.hostname.includes('linkedin.com')) return;
    console.log('[OutreachPro DM] Initializing DM Response Generator');
    injectDMStyles();

    // Try injecting at multiple intervals
    setTimeout(injectAIReplyButton, 2000);
    setTimeout(injectAIReplyButton, 4000);
    setTimeout(injectAIReplyButton, 7000);

    startObserving();

    // Watch URL changes for SPA navigation
    lastMsgUrl = location.href;
    setInterval(() => {
      if (location.href !== lastMsgUrl) {
        lastMsgUrl = location.href;
        // Clean up old buttons
        document.querySelectorAll('.' + AI_BTN_CLASS).forEach(b => b.remove());
        if (aiPanel) { aiPanel.remove(); aiPanel = null; }
        setTimeout(injectAIReplyButton, 2000);
        setTimeout(injectAIReplyButton, 4000);
      }
    }, 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
