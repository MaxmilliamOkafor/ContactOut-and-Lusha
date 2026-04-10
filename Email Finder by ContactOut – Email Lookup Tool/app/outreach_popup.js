/**
 * OutreachPro - Popup UI Logic
 * 
 * Handles CV file upload, template management, and settings
 * for the extension popup page.
 */
(function () {
  'use strict';

  const CV_KEY = 'outreach_pro_user_cv';
  const SETTINGS_KEY = 'outreach_pro_settings';
  const TEMPLATES_KEY = 'outreach_pro_templates';

  // ===================================================================
  // Tab Switching
  // ===================================================================
  document.querySelectorAll('.popup-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.popup-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
    });
  });

  // ===================================================================
  // Profile Tab - Load & Save CV + File Upload + Signature
  // ===================================================================
  let pendingFileText = null;
  let pendingFileName = null;

  function loadProfile() {
    chrome.storage.local.get(CV_KEY, (result) => {
      const cv = result[CV_KEY] || {};
      document.getElementById('user-name').value = cv.name || '';
      document.getElementById('user-signature').value = cv.signature || '';
      document.getElementById('user-website').value = cv.website || '';

      // Show file status or drop zone
      if (cv.cvFileName) {
        showFileInfo(cv.cvFileName);
        pendingFileName = cv.cvFileName;
      } else {
        showDropZone();
      }

      // If we have extracted sections, show them
      if (cv.summary || cv.skills || cv.experience || cv.education) {
        showExtractedSections(cv);
      }
    });
  }

  function showDropZone() {
    const fileArea = document.getElementById('cv-file-area');
    if (!fileArea) return;
    fileArea.innerHTML = `
      <div class="cv-drop-zone" id="cv-drop-zone">
        <div style="font-size:28px;margin-bottom:6px;">📎</div>
        <div style="font-size:12px;color:#888;">Click to upload or drag and drop your CV</div>
        <div style="font-size:10px;color:#bbb;margin-top:4px;">PDF, DOCX, or TXT</div>
      </div>
    `;
    const dropZone = document.getElementById('cv-drop-zone');
    const fileInput = document.getElementById('cv-file-input');

    if (dropZone) {
      dropZone.onclick = () => fileInput.click();
      dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = '#F97316';
        dropZone.style.background = 'rgba(249,115,22,0.04)';
      });
      dropZone.addEventListener('dragleave', () => {
        dropZone.style.borderColor = '';
        dropZone.style.background = '';
      });
      dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = '';
        dropZone.style.background = '';
        const file = e.dataTransfer.files[0];
        if (file) handleFileUpload(file);
      });
    }
  }

  function showFileInfo(fileName) {
    const fileArea = document.getElementById('cv-file-area');
    if (!fileArea) return;
    fileArea.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;padding:12px;background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.2);border-radius:10px;">
        <span style="font-size:20px;">📄</span>
        <span style="font-size:12px;font-weight:600;color:#10B981;flex:1;">${escapeHtml(fileName)}</span>
        <button id="cv-file-remove" style="font-size:11px;color:#EF4444;cursor:pointer;font-weight:600;background:none;border:none;">Remove</button>
        <button id="cv-file-replace" style="font-size:11px;color:#F97316;cursor:pointer;font-weight:600;background:none;border:none;">Replace</button>
      </div>
    `;
    const removeBtn = document.getElementById('cv-file-remove');
    const replaceBtn = document.getElementById('cv-file-replace');
    const fileInput = document.getElementById('cv-file-input');

    if (removeBtn) {
      removeBtn.onclick = () => {
        pendingFileText = '';
        pendingFileName = '';
        showDropZone();
        // Hide extracted sections
        const sections = document.getElementById('cv-extracted-sections');
        if (sections) sections.style.display = 'none';
      };
    }
    if (replaceBtn) {
      replaceBtn.onclick = () => fileInput.click();
    }
  }

  function showExtractedSections(cv) {
    const sections = document.getElementById('cv-extracted-sections');
    if (!sections) return;
    sections.style.display = 'block';
    const summary = document.getElementById('user-summary');
    const skills = document.getElementById('user-skills');
    const experience = document.getElementById('user-experience');
    const education = document.getElementById('user-education');
    if (summary) summary.value = cv.summary || '';
    if (skills) skills.value = cv.skills || '';
    if (experience) experience.value = cv.experience || '';
    if (education) education.value = cv.education || '';
  }

  async function handleFileUpload(file) {
    const validExts = ['pdf', 'docx', 'txt', 'doc'];
    const ext = file.name.split('.').pop().toLowerCase();
    if (!validExts.includes(ext)) {
      const status = document.getElementById('save-status');
      if (status) {
        status.textContent = '❌ Please upload a PDF, DOCX, or TXT file.';
        status.style.color = '#EF4444';
        setTimeout(() => { status.textContent = ''; }, 3000);
      }
      return;
    }

    showFileInfo(file.name + ' (extracting...)');

    try {
      const text = await CVManager.extractTextFromFile(file);
      pendingFileText = text;
      pendingFileName = file.name;
      showFileInfo(file.name);

      // Auto-extract sections
      const parsed = CVManager.parseResumeText(text);
      showExtractedSections(parsed);

      // Auto-fill name if empty
      const nameInput = document.getElementById('user-name');
      if (nameInput && !nameInput.value && parsed.name) {
        nameInput.value = parsed.name;
      }

      const status = document.getElementById('save-status');
      if (status) {
        status.textContent = '📄 CV extracted! Review sections and save.';
        status.style.color = '#10B981';
        setTimeout(() => { status.textContent = ''; }, 4000);
      }
    } catch (err) {
      const status = document.getElementById('save-status');
      if (status) {
        status.textContent = '❌ Could not read file. Try a .txt version.';
        status.style.color = '#EF4444';
        setTimeout(() => { status.textContent = ''; }, 3000);
      }
      showDropZone();
    }
  }

  // File input handler
  const fileInput = document.getElementById('cv-file-input');
  if (fileInput) {
    fileInput.addEventListener('change', () => {
      const file = fileInput.files[0];
      if (file) handleFileUpload(file);
    });
  }

  // Save profile
  document.getElementById('save-profile-btn').addEventListener('click', () => {
    // Get existing data first to preserve file text if no new file uploaded
    chrome.storage.local.get(CV_KEY, (result) => {
      const existing = result[CV_KEY] || {};

      const rawText = pendingFileText !== null ? pendingFileText : (existing.rawText || '');
      const fileName = pendingFileName !== null ? pendingFileName : (existing.cvFileName || '');

      // Get fields
      const summaryEl = document.getElementById('user-summary');
      const skillsEl = document.getElementById('user-skills');
      const experienceEl = document.getElementById('user-experience');
      const educationEl = document.getElementById('user-education');

      const cvData = {
        name: document.getElementById('user-name').value.trim(),
        summary: summaryEl ? summaryEl.value.trim() : (existing.summary || ''),
        skills: skillsEl ? skillsEl.value.trim() : (existing.skills || ''),
        experience: experienceEl ? experienceEl.value.trim() : (existing.experience || ''),
        education: educationEl ? educationEl.value.trim() : (existing.education || ''),
        rawText: rawText,
        website: document.getElementById('user-website').value.trim(),
        signature: document.getElementById('user-signature').value.trim(),
        cvFileName: fileName,
        cvFileType: fileName ? fileName.split('.').pop().toLowerCase() : '',
        lastUpdated: new Date().toISOString(),
      };

      chrome.storage.local.set({ [CV_KEY]: cvData }, () => {
        const status = document.getElementById('save-status');
        status.textContent = '✅ Profile saved successfully!';
        status.style.color = '#10B981';
        setTimeout(() => { status.textContent = ''; }, 3000);
      });
    });
  });

  // ===================================================================
  // Templates Tab
  // ===================================================================
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
        body: 'Hi {firstName},\n\nYour experience as {headline} caught my attention. I am particularly interested in {company}\'s approach.\n\n{mySummary}\n\nWould love to exchange ideas sometime.\n\n{mySignature}',
      },
      {
        id: 'default-3',
        name: 'Professional Intro',
        type: 'email',
        body: 'Subject: Connecting over shared interests\n\nHi {firstName},\n\nI came across your profile and was impressed by your work at {company}. {mySummary}\n\nI believe there is a meaningful opportunity for us to connect and share insights.\n\nWould you have time for a brief chat this week?\n\n{mySignature}',
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
    const body = prompt('Template body (use placeholders like {firstName}, {company}, {mySignature}, etc.):');
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

  // ===================================================================
  // Settings Tab
  // ===================================================================
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

  // ===================================================================
  // Utility
  // ===================================================================
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ===================================================================
  // Init
  // ===================================================================
  loadProfile();
  loadTemplates();
  loadSettings();
})();
