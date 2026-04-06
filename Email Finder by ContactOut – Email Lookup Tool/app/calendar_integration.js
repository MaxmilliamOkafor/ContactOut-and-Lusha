/**
 * ContactOut Calendar Integration
 * Enriches meeting attendees from Google Calendar and Outlook Calendar
 * Ported from Lusha's CalendarScript capabilities
 */
(function() {
  'use strict';

  const PLATFORM = detectCalendarPlatform();
  const BADGE_ID = 'CO__calendar_badge';
  const FRAME_ID = 'CO__calendar_frame';
  let observer = null;
  let currentEventData = null;

  function detectCalendarPlatform() {
    const url = window.location.href;
    if (url.includes('calendar.google.com')) return 'google_calendar';
    if (url.includes('outlook.live.com/calendar') || url.includes('outlook.office.com/calendar')) return 'outlook_calendar';
    return null;
  }

  // --- Google Calendar Extraction ---
  function extractGoogleCalendarEvent() {
    const eventModal = document.querySelector('[data-eventid]') ||
                       document.querySelector('[data-eventchip]') ||
                       document.querySelector('[role="dialog"]');
    if (!eventModal) return null;

    const attendees = [];
    const attendeeElements = eventModal.querySelectorAll('[data-email]');
    attendeeElements.forEach(el => {
      const email = el.getAttribute('data-email');
      const name = el.textContent.trim();
      if (email) attendees.push({ email, name });
    });

    // Fallback: parse guest list from text
    if (attendees.length === 0) {
      const guestList = eventModal.querySelector('[data-guest-list]') ||
                        eventModal.querySelector('.IEJFJd');
      if (guestList) {
        const guestItems = guestList.querySelectorAll('[data-hovercard-id]');
        guestItems.forEach(item => {
          const email = item.getAttribute('data-hovercard-id');
          const name = item.textContent.trim();
          if (email && email.includes('@')) attendees.push({ email, name });
        });
      }
    }

    const titleEl = eventModal.querySelector('[data-eventid]') ||
                    eventModal.querySelector('[aria-label]');
    const title = titleEl ? (titleEl.getAttribute('aria-label') || titleEl.textContent.trim()) : '';

    return { title, attendees, platform: 'google_calendar' };
  }

  // --- Outlook Calendar Extraction ---
  function extractOutlookCalendarEvent() {
    const eventModal = document.querySelector('[role="dialog"]') ||
                       document.querySelector('.ms-Panel');
    if (!eventModal) return null;

    const attendees = [];
    const attendeeElements = eventModal.querySelectorAll('[class*="attendee"], [class*="persona"]');
    attendeeElements.forEach(el => {
      const emailEl = el.querySelector('[class*="email"], [title*="@"]');
      const nameEl = el.querySelector('[class*="name"], [class*="persona"]');
      const email = emailEl ? (emailEl.getAttribute('title') || emailEl.textContent.trim()) : '';
      const name = nameEl ? nameEl.textContent.trim() : '';
      if (email && email.includes('@')) attendees.push({ email, name });
    });

    const titleEl = eventModal.querySelector('[class*="subject"], h1, h2');
    const title = titleEl ? titleEl.textContent.trim() : '';

    return { title, attendees, platform: 'outlook_calendar' };
  }

  // --- Badge UI ---
  function createBadge() {
    if (document.getElementById(BADGE_ID)) return;

    const badge = document.createElement('div');
    badge.id = BADGE_ID;
    badge.innerHTML = `
      <div style="
        position: fixed;
        right: 20px;
        top: 50%;
        transform: translateY(-50%);
        z-index: 2147483640;
        background: #4B46E5;
        border-radius: 8px;
        padding: 8px;
        cursor: pointer;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        transition: all 0.3s ease;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
      " id="CO__calendar_badge_main">
        <div style="width: 24px; height: 24px; background: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: bold; color: #4B46E5;">C</div>
        <div id="CO__calendar_badge_count" style="color: white; font-size: 11px; font-weight: 600; font-family: Arial, sans-serif;">0</div>
      </div>
    `;
    document.body.appendChild(badge);

    const badgeMain = document.getElementById('CO__calendar_badge_main');
    badgeMain.addEventListener('click', () => toggleFrame());
    badgeMain.addEventListener('mouseenter', () => { badgeMain.style.transform = 'scale(1.1)'; });
    badgeMain.addEventListener('mouseleave', () => { badgeMain.style.transform = 'scale(1)'; });
  }

  function updateBadgeCount(count) {
    const countEl = document.getElementById('CO__calendar_badge_count');
    if (countEl) countEl.textContent = count;
  }

  // --- Contact enrichment frame ---
  function toggleFrame() {
    let frame = document.getElementById(FRAME_ID);
    if (frame) {
      frame.style.display = frame.style.display === 'none' ? 'block' : 'none';
      return;
    }

    frame = document.createElement('div');
    frame.id = FRAME_ID;
    frame.style.cssText = `
      position: fixed;
      right: 60px;
      top: 15%;
      width: 380px;
      max-height: 70vh;
      background: white;
      border-radius: 12px;
      box-shadow: 0 8px 30px rgba(0,0,0,0.15);
      z-index: 2147483641;
      overflow-y: auto;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;
    frame.innerHTML = buildFrameContent();
    document.body.appendChild(frame);
  }

  function buildFrameContent() {
    if (!currentEventData || !currentEventData.attendees.length) {
      return `
        <div style="padding: 24px; text-align: center;">
          <div style="font-size: 16px; font-weight: 600; color: #1a1a2e; margin-bottom: 8px;">ContactOut Calendar</div>
          <div style="color: #666; font-size: 13px;">Open a calendar event to see attendee contacts</div>
        </div>
      `;
    }

    const attendeeCards = currentEventData.attendees.map(a => `
      <div style="padding: 12px 16px; border-bottom: 1px solid #f0f0f0; display: flex; align-items: center; gap: 12px;">
        <div style="width: 36px; height: 36px; border-radius: 50%; background: #4B46E5; color: white; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 14px; flex-shrink: 0;">
          ${(a.name || a.email)[0].toUpperCase()}
        </div>
        <div style="flex: 1; min-width: 0;">
          <div style="font-weight: 600; font-size: 13px; color: #1a1a2e; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${a.name || 'Unknown'}</div>
          <div style="font-size: 12px; color: #4B46E5; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${a.email}</div>
        </div>
        <button class="co-enrich-btn" data-email="${a.email}" style="
          background: #4B46E5; color: white; border: none; border-radius: 6px;
          padding: 6px 12px; font-size: 11px; cursor: pointer; white-space: nowrap;
          font-weight: 600; transition: background 0.2s;
        ">Enrich</button>
      </div>
    `).join('');

    return `
      <div style="padding: 16px; border-bottom: 1px solid #f0f0f0;">
        <div style="font-size: 15px; font-weight: 700; color: #1a1a2e;">ContactOut Calendar</div>
        <div style="font-size: 12px; color: #888; margin-top: 4px;">${currentEventData.title}</div>
        <div style="font-size: 12px; color: #4B46E5; margin-top: 2px;">${currentEventData.attendees.length} attendees found</div>
      </div>
      ${attendeeCards}
      <div style="padding: 12px 16px;">
        <button id="CO__enrich_all" style="
          width: 100%; background: #4B46E5; color: white; border: none; border-radius: 8px;
          padding: 10px; font-size: 13px; font-weight: 600; cursor: pointer;
          transition: background 0.2s;
        ">Enrich All Attendees</button>
      </div>
    `;
  }

  // --- Enrichment via ContactOut API ---
  function enrichContact(email) {
    chrome.runtime.sendMessage({
      command: 'contact_out_check_email',
      data: { email: email }
    }, (response) => {
      if (response && response.data) {
        console.log('[ContactOut Calendar] Enriched:', email, response.data);
      }
    });
  }

  function enrichAllAttendees() {
    if (!currentEventData) return;
    currentEventData.attendees.forEach(a => enrichContact(a.email));
  }

  // --- DOM Observation ---
  function observeCalendarEvents() {
    if (observer) observer.disconnect();

    observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          const eventData = PLATFORM === 'google_calendar'
            ? extractGoogleCalendarEvent()
            : extractOutlookCalendarEvent();

          if (eventData && eventData.attendees.length > 0) {
            currentEventData = eventData;
            updateBadgeCount(eventData.attendees.length);

            // Refresh frame if open
            const frame = document.getElementById(FRAME_ID);
            if (frame && frame.style.display !== 'none') {
              frame.innerHTML = buildFrameContent();
              attachEnrichHandlers();
            }
          }
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: false,
      characterData: false
    });
  }

  function attachEnrichHandlers() {
    document.querySelectorAll('.co-enrich-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const email = e.target.getAttribute('data-email');
        enrichContact(email);
        e.target.textContent = 'Sent';
        e.target.style.background = '#10b981';
      });
    });

    const enrichAllBtn = document.getElementById('CO__enrich_all');
    if (enrichAllBtn) {
      enrichAllBtn.addEventListener('click', () => {
        enrichAllAttendees();
        enrichAllBtn.textContent = 'Enriching...';
        enrichAllBtn.style.background = '#10b981';
      });
    }
  }

  // --- Init ---
  function init() {
    if (!PLATFORM) return;
    console.log('[ContactOut] Calendar integration active on', PLATFORM);
    createBadge();
    observeCalendarEvents();

    // Listen for event modal closures
    document.addEventListener('click', (e) => {
      setTimeout(() => {
        const eventData = PLATFORM === 'google_calendar'
          ? extractGoogleCalendarEvent()
          : extractOutlookCalendarEvent();
        if (eventData && eventData.attendees.length > 0) {
          currentEventData = eventData;
          updateBadgeCount(eventData.attendees.length);
        }
      }, 500);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
