/**
 * OutreachPro - CV Manager
 * 
 * Handles CV/Resume file upload, text extraction, website URL parsing,
 * signature management, and profile summary storage via chrome.storage.local
 * 
 * All data stays locally - never sent to external servers.
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
    signature: '',
    cvFileName: '',
    cvFileType: '',
    lastUpdated: null,
  };

  const DEFAULT_SETTINGS = {
    defaultTone: 'professional',
    autoInsert: false,
    signature: '',
    showButton: true,
  };

  // --- Storage Helpers ---
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

  // --- File Text Extraction ---

  /**
   * Extract text from a File object (PDF, DOCX, TXT)
   * Returns a Promise<string>
   */
  function extractTextFromFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    switch (ext) {
      case 'txt':
        return readTxtFile(file);
      case 'pdf':
        return readPdfFile(file);
      case 'docx':
        return readDocxFile(file);
      default:
        return readTxtFile(file); // fallback to text
    }
  }

  function readTxtFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => reject(new Error('Failed to read text file'));
      reader.readAsText(file);
    });
  }

  /**
   * Basic PDF text extraction - works for text-based PDFs.
   * Extracts text from PDF stream objects.
   */
  function readPdfFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const text = extractPdfText(data);
          resolve(text || '[Could not extract text from this PDF. Try uploading a .txt or .docx version.]');
        } catch (err) {
          resolve('[Could not extract text from this PDF. Try uploading a .txt or .docx version.]');
        }
      };
      reader.onerror = () => reject(new Error('Failed to read PDF file'));
      reader.readAsArrayBuffer(file);
    });
  }

  function extractPdfText(data) {
    // Convert to string for regex matching
    let rawStr = '';
    for (let i = 0; i < data.length; i++) {
      rawStr += String.fromCharCode(data[i]);
    }

    const textParts = [];

    // Method 1: Extract text between BT and ET markers (text objects)
    const btEtRegex = /BT\s([\s\S]*?)ET/g;
    let match;
    while ((match = btEtRegex.exec(rawStr)) !== null) {
      const block = match[1];
      // Extract text from Tj and TJ operators
      const tjRegex = /\(([^)]*)\)\s*Tj/g;
      let tj;
      while ((tj = tjRegex.exec(block)) !== null) {
        textParts.push(decodePdfString(tj[1]));
      }
      // TJ array
      const tjArrayRegex = /\[([^\]]*)\]\s*TJ/g;
      let tja;
      while ((tja = tjArrayRegex.exec(block)) !== null) {
        const innerText = tja[1].replace(/\(([^)]*)\)/g, '$1').replace(/-?\d+\.?\d*/g, '');
        textParts.push(decodePdfString(innerText));
      }
    }

    // Method 2: Look for stream content
    if (textParts.length === 0) {
      const streamRegex = /stream\s*([\s\S]*?)\s*endstream/g;
      let sm;
      while ((sm = streamRegex.exec(rawStr)) !== null) {
        const content = sm[1];
        // Try to find readable text
        const readable = content.replace(/[^\x20-\x7E\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim();
        if (readable.length > 20) {
          textParts.push(readable);
        }
      }
    }

    return textParts.join('\n').replace(/\s+/g, ' ').trim();
  }

  function decodePdfString(str) {
    // Handle common PDF escape sequences
    return str
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\\\/g, '\\')
      .replace(/\\([()])/g, '$1');
  }

  /**
   * DOCX text extraction - reads the XML inside the ZIP
   */
  function readDocxFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const text = await extractDocxText(e.target.result);
          resolve(text || '[Could not extract text from this DOCX. Try a .txt version.]');
        } catch (err) {
          resolve('[Could not extract text from this DOCX. Try a .txt version.]');
        }
      };
      reader.onerror = () => reject(new Error('Failed to read DOCX file'));
      reader.readAsArrayBuffer(file);
    });
  }

  async function extractDocxText(arrayBuffer) {
    // DOCX is a ZIP file. We need to find word/document.xml
    const data = new Uint8Array(arrayBuffer);

    // Find the local file headers in the ZIP
    const files = parseZipEntries(data);
    const docEntry = files.find(f =>
      f.name === 'word/document.xml' || f.name === 'word\\document.xml'
    );

    if (!docEntry) return '';

    // Decompress if needed (most DOCX files use DEFLATE)
    let xmlContent;
    if (docEntry.compressionMethod === 0) {
      // Stored (no compression)
      xmlContent = new TextDecoder().decode(docEntry.data);
    } else {
      // Try raw decompression using DecompressionStream (available in modern browsers)
      try {
        const ds = new DecompressionStream('deflate-raw');
        const writer = ds.writable.getWriter();
        const reader = ds.readable.getReader();
        writer.write(docEntry.data);
        writer.close();

        const chunks = [];
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }
        const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
        const result = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
          result.set(chunk, offset);
          offset += chunk.length;
        }
        xmlContent = new TextDecoder().decode(result);
      } catch (e) {
        return '';
      }
    }

    // Strip XML tags and extract text
    return xmlContent
      .replace(/<w:p[^>]*>/g, '\n')      // paragraph breaks
      .replace(/<w:tab\/>/g, '\t')        // tabs
      .replace(/<[^>]+>/g, '')            // strip all XML tags
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function parseZipEntries(data) {
    const entries = [];
    let offset = 0;

    while (offset < data.length - 4) {
      // Look for local file header signature: PK\x03\x04
      if (data[offset] === 0x50 && data[offset + 1] === 0x4B &&
          data[offset + 2] === 0x03 && data[offset + 3] === 0x04) {

        const compressionMethod = data[offset + 8] | (data[offset + 9] << 8);
        const compressedSize = data[offset + 18] | (data[offset + 19] << 8) |
                               (data[offset + 20] << 16) | (data[offset + 21] << 24);
        const fileNameLength = data[offset + 26] | (data[offset + 27] << 8);
        const extraFieldLength = data[offset + 28] | (data[offset + 29] << 8);

        const fileName = new TextDecoder().decode(
          data.slice(offset + 30, offset + 30 + fileNameLength)
        );

        const dataStart = offset + 30 + fileNameLength + extraFieldLength;
        const fileData = data.slice(dataStart, dataStart + compressedSize);

        entries.push({
          name: fileName,
          compressionMethod,
          data: fileData,
        });

        offset = dataStart + compressedSize;
      } else {
        offset++;
      }
    }

    return entries;
  }

  // --- Text Extraction from raw resume text ---
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

  // --- Public API ---
  return {
    getCV,
    saveCV,
    getSettings,
    saveSettings,
    getTemplates,
    saveTemplates,
    parseResumeText,
    parseWebsiteContent,
    extractTextFromFile,
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
