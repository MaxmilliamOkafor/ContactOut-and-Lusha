/**
 * OutreachPro — LinkedIn Profile Outreach Injector
 *
 * Injects a prominent "Connect with AI message" button beside LinkedIn's
 * native action buttons (Message, Follow, More), plus a rich outreach panel
 * for one-click personalized message generation.
 *
 * Inspired by Icebreaker AI's inline button + LinkedRadar's template system.
 * Zero limitations — no tokens, coins, or API limits.
 */
(function () {
  'use strict';

  const BUTTON_CLASS = 'outreach-pro-btn';
  const WRAPPER_CLASS = 'outreach-pro-wrapper';
  const PANEL_CLASS = 'outreach-pro-panel';
  const STYLES_INJECTED_FLAG = 'outreach-pro-styles-injected';

  let currentPanel = null;
  let observer = null;

  // ═══════════════════════════════════════════════════════════════
  // SECTION 1: Inject CSS
  // ═══════════════════════════════════════════════════════════════
  function injectStyles() {
    if (document.getElementById(STYLES_INJECTED_FLAG)) return;
    const link = document.createElement('link');
    link.id = STYLES_INJECTED_FLAG;
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('assets/css/outreach_styles.css');
    document.head.appendChild(link);
  }

  // ═══════════════════════════════════════════════════════════════
  // SECTION 2: Profile Data Scraping
  // ═══════════════════════════════════════════════════════════════
  function scrapeProfileData() {
    const data = {
      name: '',
      headline: '',
      company: '',
      location: '',
      about: '',
      profileUrl: window.location.href,
      connectionDegree: '',
      mutualConnections: '',
      experience: [],
    };

    // Name
    const nameEl = document.querySelector(
      '.text-heading-xlarge, h1.inline, .pv-top-card--list li:first-child, ' +
      '.artdeco-entity-lockup__title .ember-view, ' +
      'h1[class*="text-heading"]'
    );
    if (nameEl) data.name = nameEl.textContent.trim();

    // Headline
    const headlineEl = document.querySelector(
      '.text-body-medium.break-words, ' +
      '.pv-top-card--list-bullet li, ' +
      '.ph5 .mt2 .text-body-medium, ' +
      '[data-anonymize="headline-text"]'
    );
    if (headlineEl) data.headline = headlineEl.textContent.trim();

    // Company — from headline split or experience section
    if (data.headline && data.headline.includes(' at ')) {
      data.company = data.headline.split(' at ').pop().trim();
    } else if (data.headline && data.headline.includes(' @ ')) {
      data.company = data.headline.split(' @ ').pop().trim();
    }
    if (!data.company) {
      const companyEl = document.querySelector(
        '.pv-text-details__right-panel-item-text, ' +
        '.inline-show-more-text--is-collapsed, ' +
        '[class*="experience"] [class*="subtitle"], ' +
        'button[aria-label*="Current company"]'
      );
      if (companyEl) data.company = companyEl.textContent.trim().split('\n')[0].trim();
    }

    // Location
    const locationEl = document.querySelector(
      '.text-body-small.inline.t-black--light.break-words, ' +
      '.pv-top-card--list-bullet .text-body-small, ' +
      'span.text-body-small[class*="location"]'
    );
    if (locationEl) data.location = locationEl.textContent.trim();

    // About
    const aboutSection = document.querySelector(
      '#about ~ .display-flex .inline-show-more-text, ' +
      '#about ~ .display-flex .pv-shared-text-with-see-more, ' +
      'section.pv-about-section .pv-about__summary-text, ' +
      '[class*="about"] .inline-show-more-text, ' +
      'div.display-flex.full-width [class*="inline-show-more-text"]'
    );
    if (aboutSection) {
      data.about = aboutSection.textContent.trim().substring(0, 600);
    }

    // Connection degree
    const degreeEl = document.querySelector(
      '.dist-value, span.distance-badge .dist-value, ' +
      '[class*="distance-badge"]'
    );
    if (degreeEl) data.connectionDegree = degreeEl.textContent.trim();

    // Mutual connections
    const mutualEl = document.querySelector(
      '.pv-top-card--list-bullet li:nth-child(2), ' +
      'a[href*="mutual-connections"], ' +
      '[class*="mutual"]'
    );
    if (mutualEl) data.mutualConnections = mutualEl.textContent.trim();

    return data;
  }

  // ═══════════════════════════════════════════════════════════════
  // SECTION 3: Button Injection
  // ═══════════════════════════════════════════════════════════════
  function injectOutreachButton() {
    // Don't double-inject
    if (document.querySelector('.' + WRAPPER_CLASS)) return;

    // Only on profile pages
    if (!window.location.pathname.startsWith('/in/')) return;

    // Find LinkedIn's action bar — the container with Message/Connect/Follow/More buttons
    const actionBar = findActionBar();
    if (!actionBar) return;

    // Create wrapper
    const wrapper = document.createElement('div');
    wrapper.className = WRAPPER_CLASS;
    wrapper.style.display = 'inline-flex';
    wrapper.style.position = 'relative';
    wrapper.style.alignItems = 'center';

    // Create AI badge
    const badge = document.createElement('span');
    badge.className = 'outreach-pro-badge';
    badge.textContent = '✨ AI Powered';

    // Create button
    const btn = document.createElement('button');
    btn.className = BUTTON_CLASS;
    btn.innerHTML = `
      <span class="ai-sparkle">✨</span>
      <span>Connect with AI message</span>
    `;
    btn.title = 'Generate personalized outreach with AI';

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      togglePanel(wrapper);
    });

    wrapper.appendChild(badge);
    wrapper.appendChild(btn);

    // Insert after the action bar buttons
    actionBar.appendChild(wrapper);

    console.log('[OutreachPro] Button injected successfully');
  }

  function findActionBar() {
    // LinkedIn profile action bar selectors (multiple variants for different layouts)
    const selectors = [
      // New LinkedIn layout
      '.pvs-profile-actions',
      '.pv-top-card-v2-ctas',
      // Classic layout action buttons container
      '.pv-top-card-v3__action-bar',
      '.pv-s-profile-actions',
      '.pv-top-card__action-bar',
      // Flexbox container with the buttons
      '.pvs-profile-actions__action',
      // Parent of the Message/Connect buttons
      '.artdeco-card .mt2 .display-flex',
    ];

    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }

    // Fallback: find the container that holds the "Message" or "Connect" button
    const messageBtn = document.querySelector(
      'button[aria-label*="Message"], ' +
      'a[aria-label*="Message"], ' +
      'button[aria-label*="Connect"], ' +
      'button[aria-label*="Follow"]'
    );
    if (messageBtn) {
      return messageBtn.parentElement;
    }

    return null;
  }

  // ═══════════════════════════════════════════════════════════════
  // SECTION 4: Outreach Panel
  // ═══════════════════════════════════════════════════════════════
  function togglePanel(wrapper) {
    if (currentPanel) {
      currentPanel.remove();
      currentPanel = null;
      return;
    }

    const profileData = scrapeProfileData();
    const panel = createPanel(profileData);
    wrapper.appendChild(panel);
    currentPanel = panel;

    // Close on outside click
    setTimeout(() => {
      const closeHandler = (e) => {
        if (!panel.contains(e.target) && !wrapper.querySelector('.' + BUTTON_CLASS).contains(e.target)) {
          panel.remove();
          currentPanel = null;
          document.removeEventListener('click', closeHandler, true);
        }
      };
      document.addEventListener('click', closeHandler, true);
    }, 100);

    // Load user CV data and set up handlers
    loadUserCVAndSetup(panel, profileData);
  }

  function createPanel(profileData) {
    const panel = document.createElement('div');
    panel.className = PANEL_CLASS;

    const name = profileData.name || 'LinkedIn User';
    const headline = profileData.headline || '';
    const truncatedHeadline = headline.length > 60 ? headline.substring(0, 57) + '...' : headline;

    panel.innerHTML = `
      <!-- Header -->
      <div class="outreach-pro-panel-header">
        <button class="close-btn" id="outreach-close-btn">×</button>
        <div class="prospect-name">${escapeHtml(name)}</div>
        ${truncatedHeadline ? `<div class="prospect-headline">${escapeHtml(truncatedHeadline)}</div>` : ''}
        <div class="unlimited-badge">
          <span>∞</span>
          <span>Unlimited — No limits, no tokens</span>
        </div>
      </div>

      <!-- Tabs -->
      <div class="outreach-pro-tabs">
        <button class="outreach-pro-tab active" data-type="connection_request">
          <span class="tab-icon">🤝</span>
          Connection
        </button>
        <button class="outreach-pro-tab" data-type="direct_message">
          <span class="tab-icon">💬</span>
          Direct Msg
        </button>
        <button class="outreach-pro-tab" data-type="email">
          <span class="tab-icon">✉️</span>
          Email
        </button>
        <button class="outreach-pro-tab" data-type="follow_up">
          <span class="tab-icon">🔄</span>
          Follow-up
        </button>
      </div>

      <!-- Tone Selector -->
      <div class="outreach-pro-tone-bar">
        <button class="outreach-pro-tone-btn active" data-tone="professional">Professional</button>
        <button class="outreach-pro-tone-btn" data-tone="casual">Casual</button>
        <button class="outreach-pro-tone-btn" data-tone="enthusiastic">Enthusiastic</button>
        <button class="outreach-pro-tone-btn" data-tone="witty">Witty</button>
      </div>

      <!-- Message Area -->
      <div class="outreach-pro-message-area">
        <div id="outreach-skeleton-loader">
          <div class="outreach-pro-skeleton line-long"></div>
          <div class="outreach-pro-skeleton line-medium"></div>
          <div class="outreach-pro-skeleton line-long"></div>
          <div class="outreach-pro-skeleton line-short"></div>
        </div>
        <textarea
          class="outreach-pro-textarea"
          id="outreach-message-textarea"
          placeholder="Click 'Generate' to create your personalized message..."
          style="display: none;"
        ></textarea>
        <div class="outreach-pro-char-count" id="outreach-char-count" style="display: none;"></div>
      </div>

      <!-- Actions -->
      <div class="outreach-pro-actions">
        <button class="outreach-pro-generate-btn" id="outreach-generate-btn">
          <span>✨</span>
          <span>Generate Message</span>
        </button>
        <div style="display: flex; gap: 6px;">
          <button class="outreach-pro-secondary-btn" id="outreach-copy-btn" style="display: none;">
            📋 Copy
          </button>
          <button class="outreach-pro-insert-btn" id="outreach-insert-btn" style="display: none;">
            ➤ Insert
          </button>
        </div>
      </div>

      <!-- CV Prompt -->
      <div class="outreach-pro-cv-prompt" id="outreach-cv-prompt">
        <span>📄</span>
        <span>
          <a id="outreach-upload-cv-link">Upload your CV/Resume</a> for better personalization
        </span>
      </div>

      <!-- Footer -->
      <div class="outreach-pro-footer">
        Powered by <span class="unlimited-text">OutreachPro</span> — <span class="unlimited-text">∞ Unlimited</span> messages, zero limits
      </div>
    `;

    return panel;
  }

  async function loadUserCVAndSetup(panel, profileData) {
    let userCV = { name: '', summary: '', skills: '', experience: '' };
    let currentType = 'connection_request';
    let currentTone = 'professional';

    // Load user CV from storage
    try {
      const result = await new Promise(resolve => {
        chrome.storage.local.get('outreach_pro_user_cv', r => resolve(r));
      });
      if (result.outreach_pro_user_cv) {
        userCV = result.outreach_pro_user_cv;
        // Hide CV prompt if user has data
        if (userCV.summary || userCV.skills || userCV.experience) {
          const cvPrompt = panel.querySelector('#outreach-cv-prompt');
          if (cvPrompt) cvPrompt.style.display = 'none';
        }
      }
    } catch (e) {
      console.warn('[OutreachPro] Could not load CV:', e);
    }

    // Load settings for default tone
    try {
      const settingsResult = await new Promise(resolve => {
        chrome.storage.local.get('outreach_pro_settings', r => resolve(r));
      });
      if (settingsResult.outreach_pro_settings && settingsResult.outreach_pro_settings.defaultTone) {
        currentTone = settingsResult.outreach_pro_settings.defaultTone;
        // Update UI
        panel.querySelectorAll('.outreach-pro-tone-btn').forEach(btn => {
          btn.classList.toggle('active', btn.dataset.tone === currentTone);
        });
      }
    } catch (e) {}

    const textarea = panel.querySelector('#outreach-message-textarea');
    const charCount = panel.querySelector('#outreach-char-count');
    const skeleton = panel.querySelector('#outreach-skeleton-loader');
    const generateBtn = panel.querySelector('#outreach-generate-btn');
    const copyBtn = panel.querySelector('#outreach-copy-btn');
    const insertBtn = panel.querySelector('#outreach-insert-btn');
    const closeBtn = panel.querySelector('#outreach-close-btn');

    // Close button
    closeBtn.addEventListener('click', () => {
      panel.remove();
      currentPanel = null;
    });

    // Tab switching
    panel.querySelectorAll('.outreach-pro-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        panel.querySelectorAll('.outreach-pro-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentType = tab.dataset.type;

        // Show/hide insert button based on type
        if (currentType === 'connection_request' || currentType === 'direct_message') {
          insertBtn.style.display = 'inline-flex';
        } else {
          insertBtn.style.display = 'none';
        }

        // Auto-regenerate if textarea is visible
        if (textarea.style.display !== 'none') {
          doGenerate();
        }
      });
    });

    // Tone switching
    panel.querySelectorAll('.outreach-pro-tone-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        panel.querySelectorAll('.outreach-pro-tone-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentTone = btn.dataset.tone;

        // Auto-regenerate if textarea visible
        if (textarea.style.display !== 'none') {
          doGenerate();
        }
      });
    });

    // Generate button
    function doGenerate() {
      generateBtn.classList.add('generating');
      generateBtn.innerHTML = '<span>⏳</span><span>Writing drafts...</span>';
      skeleton.style.display = 'block';
      textarea.style.display = 'none';
      charCount.style.display = 'none';
      copyBtn.style.display = 'none';
      insertBtn.style.display = 'none';

      // Small delay for the animation feel (like the FlyMSG screenshot)
      setTimeout(() => {
        const result = window.OutreachMessageGenerator.generate(
          currentType,
          profileData,
          userCV,
          currentTone
        );

        textarea.value = result.message;
        textarea.style.display = 'block';
        skeleton.style.display = 'none';
        copyBtn.style.display = 'inline-flex';

        // Show insert for connection/DM
        if (currentType === 'connection_request' || currentType === 'direct_message') {
          insertBtn.style.display = 'inline-flex';
        }

        // Char count for connection request
        if (result.charCount !== undefined) {
          charCount.style.display = 'block';
          charCount.textContent = `${result.charCount} / ${result.limit || 300} characters`;
          charCount.classList.toggle('warning', result.charCount > (result.limit || 300));
        } else {
          charCount.style.display = 'block';
          charCount.textContent = `${result.message.length} characters`;
          charCount.classList.remove('warning');
        }

        generateBtn.classList.remove('generating');
        generateBtn.innerHTML = '<span>✨</span><span>Regenerate</span>';
      }, 800);
    }

    generateBtn.addEventListener('click', doGenerate);

    // Auto-generate on first open
    doGenerate();

    // Textarea char count update
    textarea.addEventListener('input', () => {
      const len = textarea.value.length;
      if (currentType === 'connection_request') {
        charCount.textContent = `${len} / 300 characters`;
        charCount.classList.toggle('warning', len > 300);
      } else {
        charCount.textContent = `${len} characters`;
        charCount.classList.remove('warning');
      }
    });

    // Copy button
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(textarea.value).then(() => {
        copyBtn.innerHTML = '✅ Copied!';
        copyBtn.classList.add('copied');
        setTimeout(() => {
          copyBtn.innerHTML = '📋 Copy';
          copyBtn.classList.remove('copied');
        }, 2000);
      });
    });

    // Insert button — insert into LinkedIn's message box or connection note
    insertBtn.addEventListener('click', () => {
      insertMessageIntoLinkedIn(textarea.value, currentType);
    });

    // CV upload link
    const cvLink = panel.querySelector('#outreach-upload-cv-link');
    if (cvLink) {
      cvLink.addEventListener('click', (e) => {
        e.preventDefault();
        openCVUploadModal(panel);
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // SECTION 5: LinkedIn Message Insert
  // ═══════════════════════════════════════════════════════════════
  function insertMessageIntoLinkedIn(message, type) {
    if (type === 'connection_request') {
      // Click the Connect button first
      const connectBtn = document.querySelector(
        'button[aria-label*="Connect"], ' +
        'button[aria-label*="connect"], ' +
        'button.pvs-profile-actions__action[aria-label*="Invite"]'
      );
      if (connectBtn) {
        connectBtn.click();
        // Wait for the modal to open
        setTimeout(() => {
          // Click "Add a note" button
          const addNoteBtn = document.querySelector(
            'button[aria-label="Add a note"], ' +
            'button.artdeco-modal__actionbar .artdeco-button--secondary'
          );
          if (addNoteBtn) {
            addNoteBtn.click();
            setTimeout(() => {
              // Find the textarea and insert the message
              const noteTextarea = document.querySelector(
                'textarea[name="message"], ' +
                'textarea#custom-message, ' +
                '.artdeco-modal textarea, ' +
                '.send-invite__custom-message'
              );
              if (noteTextarea) {
                noteTextarea.value = message;
                noteTextarea.dispatchEvent(new Event('input', { bubbles: true }));
                noteTextarea.dispatchEvent(new Event('change', { bubbles: true }));
              }
            }, 500);
          }
        }, 800);
      }
    } else if (type === 'direct_message') {
      // Click the Message button
      const messageBtn = document.querySelector(
        'button[aria-label*="Message"], ' +
        'a[aria-label*="Message"]'
      );
      if (messageBtn) {
        messageBtn.click();
        setTimeout(() => {
          // Find the messaging input
          const msgInput = document.querySelector(
            '.msg-form__contenteditable, ' +
            'div[role="textbox"][contenteditable="true"], ' +
            '.msg-form__msg-content-container div[contenteditable]'
          );
          if (msgInput) {
            msgInput.focus();
            // For contenteditable divs
            msgInput.innerHTML = `<p>${escapeHtml(message)}</p>`;
            msgInput.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }, 1000);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // SECTION 6: Inline CV Upload Modal
  // ═══════════════════════════════════════════════════════════════
  function openCVUploadModal(parentPanel) {
    // Create a modal overlay inside the panel
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: absolute; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(255,255,255,0.98); backdrop-filter: blur(10px);
      z-index: 10; padding: 20px; overflow-y: auto;
      font-family: 'Inter', -apple-system, sans-serif;
      display: flex; flex-direction: column; border-radius: 16px;
    `;

    modal.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h3 style="font-size: 16px; font-weight: 700; color: #1a1a2e; margin: 0;">📄 Upload Your Background</h3>
        <button id="cv-modal-close" style="background: #f0f0f5; border: none; width: 30px; height: 30px; border-radius: 50%; cursor: pointer; font-size: 16px; display: flex; align-items: center; justify-content: center;">×</button>
      </div>
      
      <p style="font-size: 12px; color: #888; margin-bottom: 16px;">Upload your CV or paste your resume text so generated messages match your background better.</p>
      
      <div style="margin-bottom: 16px;">
        <label style="font-size: 12px; font-weight: 600; color: #555; display: block; margin-bottom: 6px;">Your Name</label>
        <input type="text" id="cv-name-input" placeholder="John Smith" style="
          width: 100%; padding: 10px 14px; border: 1.5px solid #e0e0e5; border-radius: 10px;
          font-size: 13px; font-family: inherit; outline: none; box-sizing: border-box;
          transition: border-color 0.2s;
        " />
      </div>

      <div style="margin-bottom: 16px;">
        <label style="font-size: 12px; font-weight: 600; color: #555; display: block; margin-bottom: 6px;">Resume / CV Text</label>
        <textarea id="cv-text-input" placeholder="Paste your resume text here... Include your summary, skills, and experience." style="
          width: 100%; min-height: 120px; padding: 12px 14px; border: 1.5px solid #e0e0e5;
          border-radius: 10px; font-size: 12px; font-family: inherit; resize: vertical;
          outline: none; line-height: 1.6; box-sizing: border-box; transition: border-color 0.2s;
        "></textarea>
      </div>

      <div style="margin-bottom: 16px;">
        <label style="font-size: 12px; font-weight: 600; color: #555; display: block; margin-bottom: 6px;">Or upload a .txt file</label>
        <input type="file" id="cv-file-input" accept=".txt,.text" style="font-size: 12px; font-family: inherit;" />
      </div>

      <div style="margin-bottom: 16px;">
        <label style="font-size: 12px; font-weight: 600; color: #555; display: block; margin-bottom: 6px;">Website / Portfolio URL <span style="color: #bbb;">(optional)</span></label>
        <input type="url" id="cv-website-input" placeholder="https://yourwebsite.com" style="
          width: 100%; padding: 10px 14px; border: 1.5px solid #e0e0e5; border-radius: 10px;
          font-size: 13px; font-family: inherit; outline: none; box-sizing: border-box;
          transition: border-color 0.2s;
        " />
      </div>

      <button id="cv-save-btn" style="
        width: 100%; padding: 12px; font-size: 14px; font-weight: 600;
        background: linear-gradient(135deg, #F59E0B, #F97316, #EF4444);
        color: white; border: none; border-radius: 10px; cursor: pointer;
        font-family: inherit; transition: opacity 0.2s;
        box-shadow: 0 3px 12px rgba(249, 115, 22, 0.3);
      ">💾 Save & Personalize</button>

      <p style="font-size: 10px; color: #bbb; text-align: center; margin-top: 10px;">
        All data stored locally in your browser — never sent to external servers.
      </p>
    `;

    parentPanel.appendChild(modal);

    // Load existing data
    chrome.storage.local.get('outreach_pro_user_cv', (result) => {
      const cv = result.outreach_pro_user_cv || {};
      const nameInput = modal.querySelector('#cv-name-input');
      const textInput = modal.querySelector('#cv-text-input');
      const websiteInput = modal.querySelector('#cv-website-input');

      if (cv.name) nameInput.value = cv.name;
      if (cv.rawText) textInput.value = cv.rawText;
      if (cv.website) websiteInput.value = cv.website;
    });

    // File upload handler
    modal.querySelector('#cv-file-input').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        modal.querySelector('#cv-text-input').value = ev.target.result;
      };
      reader.readAsText(file);
    });

    // Close
    modal.querySelector('#cv-modal-close').addEventListener('click', () => {
      modal.remove();
    });

    // Save
    modal.querySelector('#cv-save-btn').addEventListener('click', () => {
      const name = modal.querySelector('#cv-name-input').value.trim();
      const rawText = modal.querySelector('#cv-text-input').value.trim();
      const website = modal.querySelector('#cv-website-input').value.trim();

      // Parse the resume text
      const parsed = window.CVManager
        ? window.CVManager.parseResumeText(rawText)
        : parseResumeTextSimple(rawText);

      const cvData = {
        name: name || parsed.name,
        email: parsed.email || '',
        phone: parsed.phone || '',
        summary: parsed.summary || '',
        skills: parsed.skills || '',
        experience: parsed.experience || '',
        education: parsed.education || '',
        website: website,
        rawText: rawText,
        lastUpdated: new Date().toISOString(),
      };

      chrome.storage.local.set({ outreach_pro_user_cv: cvData }, () => {
        // Update save button
        const saveBtn = modal.querySelector('#cv-save-btn');
        saveBtn.textContent = '✅ Saved!';
        saveBtn.style.background = '#10B981';

        // Hide CV prompt in parent panel
        const cvPrompt = parentPanel.querySelector('#outreach-cv-prompt');
        if (cvPrompt) cvPrompt.style.display = 'none';

        setTimeout(() => {
          modal.remove();
        }, 1000);
      });
    });
  }

  // Simple fallback parser if CVManager isn't loaded
  function parseResumeTextSimple(rawText) {
    const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
    return {
      name: lines[0] && lines[0].length < 60 ? lines[0] : '',
      email: (rawText.match(/[\w.+-]+@[\w.-]+\.\w{2,}/) || [''])[0],
      phone: '',
      summary: lines.slice(1, 5).join(' ').substring(0, 400),
      skills: '',
      experience: lines.slice(5).join(' ').substring(0, 600),
      education: '',
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // SECTION 7: Utility
  // ═══════════════════════════════════════════════════════════════
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ═══════════════════════════════════════════════════════════════
  // SECTION 8: SPA Navigation Observer
  // ═══════════════════════════════════════════════════════════════
  function startObserving() {
    if (observer) observer.disconnect();

    let debounceTimer = null;
    observer = new MutationObserver(() => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (window.location.pathname.startsWith('/in/') && !document.querySelector('.' + WRAPPER_CLASS)) {
          injectOutreachButton();
        }
      }, 800);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // SECTION 9: Search Results Button Injection
  // ═══════════════════════════════════════════════════════════════
  function injectSearchResultButtons() {
    if (!window.location.pathname.includes('/search/')) return;

    const resultCards = document.querySelectorAll(
      '.entity-result, .reusable-search__result-container'
    );

    resultCards.forEach(card => {
      if (card.querySelector('.' + BUTTON_CLASS)) return;

      const nameLink = card.querySelector(
        'a[href*="/in/"] span[aria-hidden="true"], ' +
        '.entity-result__title-text a span[aria-hidden="true"]'
      );
      if (!nameLink) return;

      const actionsContainer = card.querySelector(
        '.entity-result__actions, ' +
        '.search-result__actions, ' +
        '.entity-result__simple-insight'
      );
      if (!actionsContainer) return;

      const miniWrapper = document.createElement('div');
      miniWrapper.className = WRAPPER_CLASS;
      miniWrapper.style.display = 'inline-flex';
      miniWrapper.style.position = 'relative';
      miniWrapper.style.marginTop = '4px';

      const miniBtn = document.createElement('button');
      miniBtn.className = BUTTON_CLASS;
      miniBtn.style.height = '28px';
      miniBtn.style.fontSize = '11px';
      miniBtn.style.padding = '0 14px';
      miniBtn.innerHTML = `<span class="ai-sparkle">✨</span><span>AI Outreach</span>`;

      miniBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        // Scrape mini profile data from the search card
        const profileData = {
          name: nameLink.textContent.trim(),
          headline: '',
          company: '',
          location: '',
          about: '',
          profileUrl: (nameLink.closest('a') || {}).href || '',
        };

        const headlineEl = card.querySelector(
          '.entity-result__primary-subtitle, ' +
          '.entity-result__summary'
        );
        if (headlineEl) profileData.headline = headlineEl.textContent.trim();

        const locationEl = card.querySelector('.entity-result__secondary-subtitle');
        if (locationEl) profileData.location = locationEl.textContent.trim();

        toggleMiniPanel(miniWrapper, profileData);
      });

      miniWrapper.appendChild(miniBtn);
      actionsContainer.appendChild(miniWrapper);
    });
  }

  function toggleMiniPanel(wrapper, profileData) {
    if (currentPanel) {
      currentPanel.remove();
      currentPanel = null;
      return;
    }

    const panel = createPanel(profileData);
    panel.style.width = '380px';
    panel.style.right = '0';
    wrapper.appendChild(panel);
    currentPanel = panel;

    setTimeout(() => {
      const closeHandler = (e) => {
        if (!panel.contains(e.target) && !wrapper.contains(e.target)) {
          panel.remove();
          currentPanel = null;
          document.removeEventListener('click', closeHandler, true);
        }
      };
      document.addEventListener('click', closeHandler, true);
    }, 100);

    loadUserCVAndSetup(panel, profileData);
  }

  // ═══════════════════════════════════════════════════════════════
  // SECTION 10: Init
  // ═══════════════════════════════════════════════════════════════
  function init() {
    if (!window.location.hostname.includes('linkedin.com')) return;

    console.log('[OutreachPro] Initializing...');
    injectStyles();

    // Initial injection
    setTimeout(injectOutreachButton, 2500);
    setTimeout(injectSearchResultButtons, 3000);

    // Watch for SPA navigation
    startObserving();

    // Re-scan URL changes
    let lastUrl = window.location.href;
    setInterval(() => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        // Remove old button when navigating away
        document.querySelectorAll('.' + WRAPPER_CLASS).forEach(w => w.remove());
        if (currentPanel) {
          currentPanel.remove();
          currentPanel = null;
        }

        setTimeout(injectOutreachButton, 2000);
        setTimeout(injectSearchResultButtons, 2500);
      }
    }, 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
