/**
 * ContactOut Scout Mode - Universal Website Contact Finder
 * Works on ANY website to detect and enrich contact information
 * Ported from Lusha's Scout feature with enhanced capabilities
 */
(function() {
  'use strict';

  const BADGE_WRAPPER_ID = 'CO__scout_badge_wrapper';
  const BADGE_MAIN_ID = 'CO__scout_badge_main';
  const FRAME_ID = 'CO__scout_frame';
  const STORAGE_KEY = 'CO__scout_badge_position';

  let observer = null;
  let detectedContacts = [];
  let badgeSide = 'right';
  let badgePosition = { top: '50%' };
  let isDragging = false;
  let dragStartY = 0;
  let dragStartTop = 0;

  // --- Email Detection Patterns ---
  const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  const PHONE_REGEX = /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/g;
  const LINKEDIN_REGEX = /https?:\/\/(?:www\.)?linkedin\.com\/in\/[A-Za-z0-9_-]+/g;

  // --- Scan page for contact information ---
  function scanPageForContacts() {
    const contacts = new Map();

    // Scan visible text content
    const bodyText = document.body.innerText;

    // Find emails
    const emails = bodyText.match(EMAIL_REGEX) || [];
    emails.forEach(email => {
      const domain = email.split('@')[1].toLowerCase();
      // Skip common non-personal email domains in page boilerplate
      const skipDomains = ['example.com', 'placeholder.com', 'email.com', 'test.com'];
      if (skipDomains.includes(domain)) return;

      if (!contacts.has(email)) {
        contacts.set(email, { email, name: '', phone: '', linkedin: '', source: 'page_scan' });
      }
    });

    // Find contact links
    document.querySelectorAll('a[href^="mailto:"]').forEach(el => {
      const email = el.getAttribute('href').replace('mailto:', '').split('?')[0];
      if (email && email.includes('@')) {
        const name = el.textContent.trim() || findNearbyName(el);
        if (!contacts.has(email)) {
          contacts.set(email, { email, name, phone: '', linkedin: '', source: 'mailto_link' });
        } else {
          const c = contacts.get(email);
          if (!c.name && name) c.name = name;
        }
      }
    });

    // Find phone links
    document.querySelectorAll('a[href^="tel:"]').forEach(el => {
      const phone = el.getAttribute('href').replace('tel:', '');
      const name = findNearbyName(el);
      // Try to associate with existing contact
      let matched = false;
      contacts.forEach((c) => {
        if (c.name && name && c.name.toLowerCase() === name.toLowerCase()) {
          c.phone = phone;
          matched = true;
        }
      });
      if (!matched && phone) {
        contacts.set('phone_' + phone, { email: '', name, phone, linkedin: '', source: 'tel_link' });
      }
    });

    // Find LinkedIn profile links
    document.querySelectorAll('a[href*="linkedin.com/in/"]').forEach(el => {
      const linkedin = el.getAttribute('href').match(LINKEDIN_REGEX);
      if (linkedin) {
        const name = el.textContent.trim() || findNearbyName(el);
        let matched = false;
        contacts.forEach((c) => {
          if (c.name && name && c.name.toLowerCase() === name.toLowerCase()) {
            c.linkedin = linkedin[0];
            matched = true;
          }
        });
        if (!matched) {
          contacts.set('li_' + linkedin[0], { email: '', name, phone: '', linkedin: linkedin[0], source: 'linkedin_link' });
        }
      }
    });

    // Scan structured data (Schema.org, vCard, hCard)
    scanStructuredData(contacts);

    // Scan meta tags
    scanMetaTags(contacts);

    detectedContacts = Array.from(contacts.values()).filter(c => c.email || c.phone || c.linkedin);
    return detectedContacts;
  }

  function findNearbyName(element) {
    // Walk up to find a name near this email/phone element
    let parent = element.parentElement;
    for (let i = 0; i < 3 && parent; i++) {
      const nameEl = parent.querySelector('h1, h2, h3, h4, [class*="name"], [itemprop="name"]');
      if (nameEl && nameEl.textContent.trim().length < 80) {
        return nameEl.textContent.trim();
      }
      parent = parent.parentElement;
    }
    return '';
  }

  function scanStructuredData(contacts) {
    // JSON-LD
    document.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
      try {
        const data = JSON.parse(script.textContent);
        extractFromJsonLd(data, contacts);
      } catch (e) { /* ignore malformed JSON-LD */ }
    });

    // Microdata
    document.querySelectorAll('[itemtype*="schema.org/Person"]').forEach(el => {
      const name = el.querySelector('[itemprop="name"]');
      const email = el.querySelector('[itemprop="email"]');
      const phone = el.querySelector('[itemprop="telephone"]');
      if (email) {
        const emailText = email.getAttribute('content') || email.textContent.trim();
        contacts.set(emailText, {
          email: emailText,
          name: name ? name.textContent.trim() : '',
          phone: phone ? phone.textContent.trim() : '',
          linkedin: '',
          source: 'structured_data'
        });
      }
    });
  }

  function extractFromJsonLd(data, contacts) {
    if (Array.isArray(data)) {
      data.forEach(item => extractFromJsonLd(item, contacts));
      return;
    }
    if (!data || typeof data !== 'object') return;

    if (data['@type'] === 'Person' || data['@type'] === 'Organization') {
      const email = data.email || '';
      const name = data.name || '';
      const phone = data.telephone || '';
      if (email) {
        contacts.set(email, { email, name, phone, linkedin: '', source: 'json_ld' });
      }
    }
  }

  function scanMetaTags(contacts) {
    // og:email, author, etc.
    const authorMeta = document.querySelector('meta[name="author"]');
    if (authorMeta) {
      const authorName = authorMeta.getAttribute('content');
      contacts.forEach(c => {
        if (!c.name && c.source === 'page_scan') c.name = authorName;
      });
    }
  }

  // --- Draggable Badge UI ---
  function createBadge() {
    if (document.getElementById(BADGE_WRAPPER_ID)) return;

    // Load saved position
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const pos = JSON.parse(saved);
        badgeSide = pos.side || 'right';
        badgePosition = pos.position || { top: '50%' };
      }
    } catch (e) {}

    const wrapper = document.createElement('div');
    wrapper.id = BADGE_WRAPPER_ID;
    wrapper.innerHTML = `
      <div id="${BADGE_MAIN_ID}" style="
        position: fixed;
        ${badgeSide}: 0;
        top: ${badgePosition.top};
        transform: translateY(-50%);
        z-index: 2147483640;
        background: linear-gradient(135deg, #4B46E5 0%, #7C3AED 100%);
        border-radius: ${badgeSide === 'right' ? '8px 0 0 8px' : '0 8px 8px 0'};
        padding: 10px 6px;
        cursor: pointer;
        box-shadow: 0 2px 12px rgba(75, 70, 229, 0.4);
        transition: transform 0.2s ease, box-shadow 0.2s ease;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        user-select: none;
      ">
        <div style="width: 22px; height: 22px; background: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold; color: #4B46E5;">C</div>
        <div id="CO__scout_badge_count" style="color: white; font-size: 11px; font-weight: 700; font-family: Arial, sans-serif; line-height: 1;">0</div>
        <div style="color: rgba(255,255,255,0.7); font-size: 8px; font-family: Arial, sans-serif; writing-mode: vertical-lr; text-orientation: mixed; letter-spacing: 1px;">SCOUT</div>
      </div>
    `;
    document.body.appendChild(wrapper);

    const badgeMain = document.getElementById(BADGE_MAIN_ID);

    // Click handler
    badgeMain.addEventListener('click', (e) => {
      if (!isDragging) toggleFrame();
    });

    // Hover effect
    badgeMain.addEventListener('mouseenter', () => {
      if (!isDragging) {
        badgeMain.style.transform = 'translateY(-50%) scale(1.05)';
        badgeMain.style.boxShadow = '0 4px 20px rgba(75, 70, 229, 0.6)';
      }
    });
    badgeMain.addEventListener('mouseleave', () => {
      badgeMain.style.transform = 'translateY(-50%)';
      badgeMain.style.boxShadow = '0 2px 12px rgba(75, 70, 229, 0.4)';
    });

    // Drag support
    badgeMain.addEventListener('mousedown', startDrag);
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', endDrag);

    // Double-click to switch sides
    badgeMain.addEventListener('dblclick', switchSide);
  }

  function startDrag(e) {
    isDragging = false;
    dragStartY = e.clientY;
    dragStartTop = parseInt(document.getElementById(BADGE_MAIN_ID).style.top) || window.innerHeight / 2;
    e.preventDefault();
  }

  function onDrag(e) {
    if (dragStartY === 0) return;
    const diff = Math.abs(e.clientY - dragStartY);
    if (diff > 5) isDragging = true;
    if (isDragging) {
      const badge = document.getElementById(BADGE_MAIN_ID);
      const newTop = Math.max(50, Math.min(window.innerHeight - 50, dragStartTop + (e.clientY - dragStartY)));
      badge.style.top = newTop + 'px';
    }
  }

  function endDrag(e) {
    if (isDragging) {
      const badge = document.getElementById(BADGE_MAIN_ID);
      badgePosition.top = badge.style.top;
      savePosition();
      setTimeout(() => { isDragging = false; }, 100);
    }
    dragStartY = 0;
  }

  function switchSide() {
    const badge = document.getElementById(BADGE_MAIN_ID);
    badgeSide = badgeSide === 'right' ? 'left' : 'right';
    badge.style.right = badgeSide === 'right' ? '0' : 'auto';
    badge.style.left = badgeSide === 'left' ? '0' : 'auto';
    badge.style.borderRadius = badgeSide === 'right' ? '8px 0 0 8px' : '0 8px 8px 0';
    savePosition();
  }

  function savePosition() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ side: badgeSide, position: badgePosition }));
    } catch (e) {}
  }

  function updateBadgeCount(count) {
    const el = document.getElementById('CO__scout_badge_count');
    if (el) el.textContent = count;
  }

  // --- Results Frame ---
  function toggleFrame() {
    let frame = document.getElementById(FRAME_ID);
    if (frame) {
      frame.style.display = frame.style.display === 'none' ? 'block' : 'none';
      return;
    }

    // Scan page when opening frame
    scanPageForContacts();
    updateBadgeCount(detectedContacts.length);

    frame = document.createElement('div');
    frame.id = FRAME_ID;
    frame.style.cssText = `
      position: fixed;
      ${badgeSide === 'right' ? 'right: 45px' : 'left: 45px'};
      top: 10%;
      width: 400px;
      max-height: 80vh;
      background: white;
      border-radius: 12px;
      box-shadow: 0 12px 40px rgba(0,0,0,0.15);
      z-index: 2147483641;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      animation: CO_slideIn 0.3s ease;
    `;
    frame.innerHTML = buildFrameContent();
    document.body.appendChild(frame);

    // Add animation style
    if (!document.getElementById('CO__scout_styles')) {
      const style = document.createElement('style');
      style.id = 'CO__scout_styles';
      style.textContent = `
        @keyframes CO_slideIn {
          from { opacity: 0; transform: translateX(${badgeSide === 'right' ? '20px' : '-20px'}); }
          to { opacity: 1; transform: translateX(0); }
        }
      `;
      document.head.appendChild(style);
    }

    attachFrameHandlers();
  }

  function buildFrameContent() {
    const header = `
      <div style="padding: 16px 20px; background: linear-gradient(135deg, #4B46E5 0%, #7C3AED 100%); color: white;">
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <div>
            <div style="font-size: 16px; font-weight: 700;">ContactOut Scout</div>
            <div style="font-size: 12px; opacity: 0.8; margin-top: 2px;">${window.location.hostname}</div>
          </div>
          <div style="display: flex; gap: 8px;">
            <button id="CO__scout_rescan" style="background: rgba(255,255,255,0.2); border: none; color: white; border-radius: 6px; padding: 6px 12px; font-size: 11px; cursor: pointer; font-weight: 600;">Rescan</button>
            <button id="CO__scout_close" style="background: rgba(255,255,255,0.2); border: none; color: white; border-radius: 50%; width: 28px; height: 28px; cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center;">x</button>
          </div>
        </div>
        <div style="margin-top: 8px; font-size: 13px; font-weight: 600;">${detectedContacts.length} contacts found</div>
      </div>
    `;

    if (detectedContacts.length === 0) {
      return header + `
        <div style="padding: 40px 20px; text-align: center;">
          <div style="font-size: 40px; margin-bottom: 12px;">&#128269;</div>
          <div style="color: #666; font-size: 14px;">No contacts detected on this page</div>
          <div style="color: #999; font-size: 12px; margin-top: 6px;">Try navigating to a team or contact page</div>
        </div>
      `;
    }

    const contactCards = detectedContacts.map((c, i) => `
      <div style="padding: 12px 20px; border-bottom: 1px solid #f0f0f5; display: flex; align-items: center; gap: 12px; transition: background 0.2s;" onmouseover="this.style.background='#f8f8ff'" onmouseout="this.style.background='transparent'">
        <div style="width: 38px; height: 38px; border-radius: 50%; background: ${getAvatarColor(i)}; color: white; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; flex-shrink: 0;">
          ${(c.name || c.email || '?')[0].toUpperCase()}
        </div>
        <div style="flex: 1; min-width: 0;">
          <div style="font-weight: 600; font-size: 13px; color: #1a1a2e; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            ${c.name || 'Unknown'}
          </div>
          ${c.email ? `<div style="font-size: 12px; color: #4B46E5; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${c.email}</div>` : ''}
          ${c.phone ? `<div style="font-size: 11px; color: #666;">${c.phone}</div>` : ''}
          ${c.linkedin ? `<div style="font-size: 11px;"><a href="${c.linkedin}" target="_blank" style="color: #0077B5; text-decoration: none;">LinkedIn</a></div>` : ''}
        </div>
        <button class="co-scout-enrich" data-index="${i}" style="
          background: #4B46E5; color: white; border: none; border-radius: 6px;
          padding: 6px 10px; font-size: 10px; cursor: pointer; white-space: nowrap;
          font-weight: 600;
        ">Enrich</button>
      </div>
    `).join('');

    return header + `
      <div style="overflow-y: auto; max-height: calc(80vh - 120px);">
        ${contactCards}
      </div>
      <div style="padding: 12px 20px; border-top: 1px solid #f0f0f5;">
        <button id="CO__scout_enrich_all" style="
          width: 100%; background: linear-gradient(135deg, #4B46E5 0%, #7C3AED 100%); color: white;
          border: none; border-radius: 8px; padding: 10px; font-size: 13px; font-weight: 600; cursor: pointer;
        ">Enrich All (${detectedContacts.length})</button>
      </div>
    `;
  }

  function getAvatarColor(index) {
    const colors = ['#4B46E5', '#7C3AED', '#EC4899', '#F59E0B', '#10B981', '#3B82F6', '#EF4444', '#8B5CF6'];
    return colors[index % colors.length];
  }

  function attachFrameHandlers() {
    const closeBtn = document.getElementById('CO__scout_close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        const frame = document.getElementById(FRAME_ID);
        if (frame) frame.style.display = 'none';
      });
    }

    const rescanBtn = document.getElementById('CO__scout_rescan');
    if (rescanBtn) {
      rescanBtn.addEventListener('click', () => {
        scanPageForContacts();
        updateBadgeCount(detectedContacts.length);
        const frame = document.getElementById(FRAME_ID);
        if (frame) {
          frame.innerHTML = buildFrameContent();
          attachFrameHandlers();
        }
      });
    }

    document.querySelectorAll('.co-scout-enrich').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.getAttribute('data-index'));
        const contact = detectedContacts[idx];
        if (contact) {
          chrome.runtime.sendMessage({
            command: 'contact_out_check_email',
            data: { email: contact.email, name: contact.name }
          });
          e.target.textContent = 'Done';
          e.target.style.background = '#10b981';
        }
      });
    });

    const enrichAllBtn = document.getElementById('CO__scout_enrich_all');
    if (enrichAllBtn) {
      enrichAllBtn.addEventListener('click', () => {
        detectedContacts.forEach(c => {
          if (c.email) {
            chrome.runtime.sendMessage({
              command: 'contact_out_check_email',
              data: { email: c.email, name: c.name }
            });
          }
        });
        enrichAllBtn.textContent = 'Enriching...';
        enrichAllBtn.style.background = '#10b981';
      });
    }
  }

  // --- Auto-scan on page changes ---
  function observePageChanges() {
    if (observer) observer.disconnect();

    let debounceTimer = null;
    observer = new MutationObserver(() => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const newContacts = scanPageForContacts();
        updateBadgeCount(newContacts.length);
      }, 2000);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // --- Bulk Auto-Reveal ---
  function bulkRevealHiddenContacts() {
    // Click "show email", "reveal", "view contact" type buttons
    const revealSelectors = [
      'button[class*="reveal"]', 'button[class*="show"]',
      'a[class*="reveal"]', 'a[class*="show-email"]',
      '[data-action="reveal"]', '[data-action="show-contact"]',
      'button:not([disabled])'
    ];

    revealSelectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(el => {
        const text = el.textContent.toLowerCase();
        if (text.includes('reveal') || text.includes('show email') ||
            text.includes('show contact') || text.includes('view email') ||
            text.includes('unlock')) {
          el.click();
        }
      });
    });
  }

  // --- Init ---
  function init() {
    // Don't run on LinkedIn or ContactOut (those have dedicated scripts)
    const host = window.location.hostname;
    if (host.includes('linkedin.com') || host.includes('contactout.com') ||
        host.includes('github.com') || host.includes('hubspot.com') ||
        host.includes('calendar.google.com') || host.includes('outlook.live.com') ||
        host.includes('outlook.office.com')) {
      return;
    }

    console.log('[ContactOut] Scout mode active on', host);
    createBadge();

    // Initial scan after page load
    setTimeout(() => {
      const contacts = scanPageForContacts();
      updateBadgeCount(contacts.length);

      // Auto-reveal hidden contacts
      bulkRevealHiddenContacts();
    }, 2000);

    observePageChanges();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
