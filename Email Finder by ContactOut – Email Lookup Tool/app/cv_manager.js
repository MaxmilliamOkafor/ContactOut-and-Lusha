/**
 * OutreachPro — CV Manager
 * 
 * Handles CV/Resume upload, text extraction, website URL parsing,
 * and profile summary storage via chrome.storage.local
 * 
 * All data stays locally — never sent to external servers.
 */
const CVManager = (() => {
  'use strict';

  const STORAGE_KEY = 'outreach_pro_user_cv';
  const TEMPLATES_KEY = 'outreach_pro_templates';
  const SETTINGS_KEY = 'outreach_pro_settings';

  const DEFAULT_CV = {
    name: '',
    email: '',
    phone: '',
    summary: '',
    skills: '',
    experience: '',
    education: '',
    website: '',
    websiteContent: '',
    rawText: '',
    lastUpdated: null,
  };

  const DEFAULT_SETTINGS = {
    defaultTone: 'professional',
    autoInsert: false,
    signature: '',
    showButton: true,
  };

  // ─── Storage Helpers ─────────────────────────────────────────
  function getCV() {
    return new Promise(resolve => {
      chrome.storage.local.get(STORAGE_KEY, result => {
        resolve(result[STORAGE_KEY] || { ...DEFAULT_CV });
      });
    });
  }

  function saveCV(cvData) {
    return new Promise(resolve => {
      const data = { ...cvData, lastUpdated: new Date().toISOString() };
      chrome.storage.local.set({ [STORAGE_KEY]: data }, () => resolve(data));
    });
  }

  function getSettings() {
    return new Promise(resolve => {
      chrome.storage.local.get(SETTINGS_KEY, result => {
        resolve(result[SETTINGS_KEY] || { ...DEFAULT_SETTINGS });
      });
    });
  }

  function saveSettings(settings) {
    return new Promise(resolve => {
      chrome.storage.local.set({ [SETTINGS_KEY]: settings }, () => resolve(settings));
    });
  }

  function getTemplates() {
    return new Promise(resolve => {
      chrome.storage.local.get(TEMPLATES_KEY, result => {
        resolve(result[TEMPLATES_KEY] || []);
      });
    });
  }

  function saveTemplates(templates) {
    return new Promise(resolve => {
      chrome.storage.local.set({ [TEMPLATES_KEY]: templates }, () => resolve(templates));
    });
  }

  // ─── Text Extraction ────────────────────────────────────────
  /**
   * Extract structured data from raw resume text
   */
  function parseResumeText(rawText) {
    const sections = {
      name: '',
      email: '',
      phone: '',
      summary: '',
      skills: '',
      experience: '',
      education: '',
    };

    const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return sections;

    // First non-empty line is likely the name
    sections.name = lines[0].length < 60 ? lines[0] : '';

    // Email
    const emailMatch = rawText.match(/[\w.+-]+@[\w.-]+\.\w{2,}/);
    if (emailMatch) sections.email = emailMatch[0];

    // Phone
    const phoneMatch = rawText.match(/[\+]?[\d\s\-().]{7,15}/);
    if (phoneMatch) sections.phone = phoneMatch[0].trim();

    // Section detection
    const sectionHeaders = {
      summary: /^(summary|profile|about|objective|professional\s*summary)/i,
      skills: /^(skills|technical\s*skills|core\s*competencies|expertise|technologies)/i,
      experience: /^(experience|work\s*experience|employment|professional\s*experience|work\s*history)/i,
      education: /^(education|academic|qualifications|degrees)/i,
    };

    let currentSection = 'summary';
    const sectionContent = { summary: [], skills: [], experience: [], education: [] };

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      let matched = false;

      for (const [section, pattern] of Object.entries(sectionHeaders)) {
        if (pattern.test(line)) {
          currentSection = section;
          matched = true;
          break;
        }
      }

      if (!matched && currentSection) {
        sectionContent[currentSection].push(line);
      }
    }

    sections.summary = sectionContent.summary.join(' ').substring(0, 500);
    sections.skills = sectionContent.skills.join(', ').substring(0, 300);
    sections.experience = sectionContent.experience.join(' ').substring(0, 800);
    sections.education = sectionContent.education.join(' ').substring(0, 300);

    // Fallback: if no sections detected, use first paragraph as summary
    if (!sections.summary && lines.length > 1) {
      sections.summary = lines.slice(1, Math.min(6, lines.length)).join(' ').substring(0, 500);
    }

    return sections;
  }

  /**
   * Fetch and extract key content from a website URL
   */
  async function parseWebsiteContent(url) {
    try {
      // We can't fetch cross-origin from content scripts easily,
      // so we send a message to the background script
      return new Promise(resolve => {
        chrome.runtime.sendMessage(
          { command: 'outreach_fetch_website', data: { url } },
          response => {
            if (response && response.content) {
              resolve(response.content.substring(0, 1000));
            } else {
              resolve('');
            }
          }
        );
      });
    } catch (e) {
      console.warn('[OutreachPro] Website parse failed:', e);
      return '';
    }
  }

  // ─── Public API ──────────────────────────────────────────────
  return {
    getCV,
    saveCV,
    getSettings,
    saveSettings,
    getTemplates,
    saveTemplates,
    parseResumeText,
    parseWebsiteContent,
    DEFAULT_CV,
    DEFAULT_SETTINGS,
    STORAGE_KEY,
    SETTINGS_KEY,
    TEMPLATES_KEY,
  };
})();

if (typeof window !== 'undefined') {
  window.CVManager = CVManager;
}
