/**
 * OutreachPro — Popup UI Logic
 * 
 * Handles CV upload, template management, and settings
 * for the extension popup page.
 */
(function () {
  'use strict';

  const CV_KEY = 'outreach_pro_user_cv';
  const SETTINGS_KEY = 'outreach_pro_settings';
  const TEMPLATES_KEY = 'outreach_pro_templates';

  // ═══════════════════════════════════════════════════════════════
  // Tab Switching
  // ═══════════════════════════════════════════════════════════════
  document.querySelectorAll('.popup-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.popup-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Profile Tab — Load & Save CV
  // ═══════════════════════════════════════════════════════════════
  function loadProfile() {
    chrome.storage.local.get(CV_KEY, (result) => {
      const cv = result[CV_KEY] || {};
      document.getElementById('user-name').value = cv.name || '';
      document.getElementById('user-summary').value = cv.summary || '';
      document.getElementById('user-skills').value = cv.skills || '';
      document.getElementById('user-experience').value = cv.experience || '';
      document.getElementById('user-education').value = cv.education || '';
      document.getElementById('user-raw-text').value = cv.rawText || '';
      document.getElementById('user-website').value = cv.website || '';
    });
  }

  document.getElementById('save-profile-btn').addEventListener('click', () => {
    const cvData = {
      name: document.getElementById('user-name').value.trim(),
      summary: document.getElementById('user-summary').value.trim(),
      skills: document.getElementById('user-skills').value.trim(),
      experience: document.getElementById('user-experience').value.trim(),
      education: document.getElementById('user-education').value.trim(),
      rawText: document.getElementById('user-raw-text').value.trim(),
      website: document.getElementById('user-website').value.trim(),
      lastUpdated: new Date().toISOString(),
    };

    chrome.storage.local.set({ [CV_KEY]: cvData }, () => {
      const status = document.getElementById('save-status');
      status.textContent = '✅ Profile saved successfully!';
      setTimeout(() => { status.textContent = ''; }, 3000);
    });
  });

  // Auto-extract from raw text
  document.getElementById('parse-resume-btn').addEventListener('click', () => {
    const rawText = document.getElementById('user-raw-text').value.trim();
    if (!rawText) return;

    // Use CVManager if available, otherwise simple parse
    const parsed = typeof CVManager !== 'undefined'
      ? CVManager.parseResumeText(rawText)
      : simpleParseResume(rawText);

    if (parsed.name && !document.getElementById('user-name').value) {
      document.getElementById('user-name').value = parsed.name;
    }
    if (parsed.summary) {
      document.getElementById('user-summary').value = parsed.summary;
    }
    if (parsed.skills) {
      document.getElementById('user-skills').value = parsed.skills;
    }
    if (parsed.experience) {
      document.getElementById('user-experience').value = parsed.experience;
    }
    if (parsed.education) {
      document.getElementById('user-education').value = parsed.education;
    }

    const status = document.getElementById('save-status');
    status.textContent = '🔍 Sections extracted! Review and save.';
    setTimeout(() => { status.textContent = ''; }, 3000);
  });

  function simpleParseResume(rawText) {
    const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
    return {
      name: lines[0] && lines[0].length < 60 ? lines[0] : '',
      email: (rawText.match(/[\w.+-]+@[\w.-]+\.\w{2,}/) || [''])[0],
      summary: lines.slice(1, 5).join(' ').substring(0, 400),
      skills: '',
      experience: lines.slice(5).join(' ').substring(0, 600),
      education: '',
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // Templates Tab
  // ═══════════════════════════════════════════════════════════════
  function loadTemplates() {
    chrome.storage.local.get(TEMPLATES_KEY, (result) => {
      const templates = result[TEMPLATES_KEY] || getDefaultTemplates();
      renderTemplates(templates);
    });
  }

  function getDefaultTemplates() {
    return [
      {
        id: 'default-1',
        name: 'Quick Connect',
        type: 'connection_request',
        body: 'Hi {firstName}, I noticed your work at {company} and would love to connect. My background in {mySkills} aligns well with your expertise. Looking forward to connecting!',
      },
      {
        id: 'default-2',
        name: 'Mutual Interest',
        type: 'direct_message',
        body: 'Hi {firstName},\n\nYour experience as {headline} caught my attention. I\'m particularly interested in {company}\'s approach.\n\n{mySummary}\n\nWould love to exchange ideas sometime.\n\nBest,\n{myName}',
      },
      {
        id: 'default-3',
        name: 'Professional Intro',
        type: 'email',
        body: 'Subject: Connecting over shared interests\n\nHi {firstName},\n\nI came across your profile and was impressed by your work at {company}. {mySummary}\n\nI believe there\'s a meaningful opportunity for us to connect and share insights.\n\nWould you have time for a brief chat this week?\n\nBest regards,\n{myName}',
      },
    ];
  }

  function renderTemplates(templates) {
    const container = document.getElementById('templates-list');
    container.innerHTML = '';

    if (templates.length === 0) {
      container.innerHTML = '<p style="font-size: 11px; color: rgba(255,255,255,0.3); text-align: center; padding: 20px;">No templates yet. Add one below!</p>';
      return;
    }

    templates.forEach((tpl, index) => {
      const item = document.createElement('div');
      item.className = 'template-item';
      item.innerHTML = `
        <div class="template-item-header">
          <span class="template-item-name">${escapeHtml(tpl.name)}</span>
          <span class="template-item-type">${tpl.type.replace('_', ' ')}</span>
        </div>
        <div class="template-item-body">${escapeHtml(tpl.body)}</div>
        <div class="template-item-actions">
          <button class="edit" data-index="${index}">✏️ Edit</button>
          <button class="delete" data-index="${index}">🗑️ Delete</button>
        </div>
      `;
      container.appendChild(item);
    });

    // Attach handlers
    container.querySelectorAll('.edit').forEach(btn => {
      btn.addEventListener('click', () => editTemplate(templates, parseInt(btn.dataset.index)));
    });
    container.querySelectorAll('.delete').forEach(btn => {
      btn.addEventListener('click', () => {
        templates.splice(parseInt(btn.dataset.index), 1);
        chrome.storage.local.set({ [TEMPLATES_KEY]: templates }, () => renderTemplates(templates));
      });
    });
  }

  function editTemplate(templates, index) {
    const tpl = templates[index];
    const name = prompt('Template name:', tpl.name);
    if (name === null) return;
    const body = prompt('Template body:', tpl.body);
    if (body === null) return;

    tpl.name = name;
    tpl.body = body;
    chrome.storage.local.set({ [TEMPLATES_KEY]: templates }, () => renderTemplates(templates));
  }

  document.getElementById('add-template-btn').addEventListener('click', () => {
    const name = prompt('Template name:');
    if (!name) return;
    const type = prompt('Type (connection_request, direct_message, email, follow_up):', 'connection_request');
    if (!type) return;
    const body = prompt('Template body (use placeholders like {firstName}, {company}, etc.):');
    if (!body) return;

    chrome.storage.local.get(TEMPLATES_KEY, (result) => {
      const templates = result[TEMPLATES_KEY] || getDefaultTemplates();
      templates.push({
        id: 'custom-' + Date.now(),
        name,
        type,
        body,
      });
      chrome.storage.local.set({ [TEMPLATES_KEY]: templates }, () => renderTemplates(templates));
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Settings Tab
  // ═══════════════════════════════════════════════════════════════
  function loadSettings() {
    chrome.storage.local.get(SETTINGS_KEY, (result) => {
      const settings = result[SETTINGS_KEY] || {};
      document.getElementById('setting-tone').value = settings.defaultTone || 'professional';
      document.getElementById('setting-signature').value = settings.signature || '';
      document.getElementById('setting-show-btn').checked = settings.showButton !== false;
      document.getElementById('setting-auto-insert').checked = settings.autoInsert === true;
    });
  }

  document.getElementById('save-settings-btn').addEventListener('click', () => {
    const settings = {
      defaultTone: document.getElementById('setting-tone').value,
      signature: document.getElementById('setting-signature').value.trim(),
      showButton: document.getElementById('setting-show-btn').checked,
      autoInsert: document.getElementById('setting-auto-insert').checked,
    };

    chrome.storage.local.set({ [SETTINGS_KEY]: settings }, () => {
      const status = document.getElementById('settings-save-status');
      status.textContent = '✅ Settings saved!';
      setTimeout(() => { status.textContent = ''; }, 3000);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Utility
  // ═══════════════════════════════════════════════════════════════
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ═══════════════════════════════════════════════════════════════
  // Init
  // ═══════════════════════════════════════════════════════════════
  loadProfile();
  loadTemplates();
  loadSettings();
})();
