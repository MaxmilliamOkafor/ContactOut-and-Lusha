/**
 * ContactOut HubSpot CRM Integration
 * Enriches contact and company data within HubSpot CRM pages
 * Ported from Lusha's HubspotScript capabilities
 */
(function() {
  'use strict';

  const BADGE_ID = 'CO__hubspot_badge';
  const PANEL_ID = 'CO__hubspot_panel';
  let observer = null;
  let currentContactData = null;
  let panelVisible = false;

  // --- HubSpot Page Detection ---
  function getHubSpotPageType() {
    const url = window.location.href;
    if (url.includes('/contacts/')) return 'contact';
    if (url.includes('/companies/')) return 'company';
    if (url.includes('/deals/')) return 'deal';
    if (url.includes('/tickets/')) return 'ticket';
    return 'unknown';
  }

  // --- Contact Data Extraction ---
  function extractContactFromHubSpot() {
    const data = {
      name: '',
      email: '',
      phone: '',
      company: '',
      jobTitle: '',
      linkedinUrl: '',
      pageType: getHubSpotPageType()
    };

    // Try profile sidebar
    const sidebar = document.querySelector('[data-test-id="profile-sidebar"]') ||
                    document.querySelector('.private-card__wrapper') ||
                    document.querySelector('[class*="sidebar"]');

    if (sidebar) {
      // Name extraction
      const nameEl = sidebar.querySelector('[data-test-id="contact-name"]') ||
                     sidebar.querySelector('h1') ||
                     sidebar.querySelector('[class*="name"]');
      if (nameEl) data.name = nameEl.textContent.trim();

      // Email extraction
      const emailLinks = sidebar.querySelectorAll('a[href^="mailto:"]');
      emailLinks.forEach(el => {
        const email = el.getAttribute('href').replace('mailto:', '');
        if (email && email.includes('@')) data.email = email;
      });

      // Fallback email from property values
      if (!data.email) {
        const propertyValues = sidebar.querySelectorAll('[data-test-id="property-value"], [class*="property-value"]');
        propertyValues.forEach(el => {
          const text = el.textContent.trim();
          if (text.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) data.email = text;
        });
      }

      // Phone extraction
      const phoneLinks = sidebar.querySelectorAll('a[href^="tel:"]');
      phoneLinks.forEach(el => {
        const phone = el.getAttribute('href').replace('tel:', '');
        if (phone) data.phone = phone;
      });

      // Company extraction
      const companyEl = sidebar.querySelector('[data-test-id="company-name"]') ||
                        sidebar.querySelector('[class*="company"]');
      if (companyEl) data.company = companyEl.textContent.trim();

      // Job title extraction
      const titleEl = sidebar.querySelector('[data-test-id="job-title"]') ||
                      sidebar.querySelector('[class*="jobtitle"], [class*="job-title"]');
      if (titleEl) data.jobTitle = titleEl.textContent.trim();

      // LinkedIn URL extraction
      const linkedinLink = sidebar.querySelector('a[href*="linkedin.com"]');
      if (linkedinLink) data.linkedinUrl = linkedinLink.getAttribute('href');
    }

    // Fallback: extract from record highlights (top of page)
    if (!data.name) {
      const highlightName = document.querySelector('[class*="record-name"], [class*="highlight"] h1');
      if (highlightName) data.name = highlightName.textContent.trim();
    }

    return data;
  }

  // --- Company Data Extraction ---
  function extractCompanyFromHubSpot() {
    const data = {
      name: '',
      domain: '',
      industry: '',
      employees: '',
      phone: '',
      city: '',
      country: '',
      pageType: 'company'
    };

    const companyHeader = document.querySelector('[data-test-id="company-name"]') ||
                          document.querySelector('h1');
    if (companyHeader) data.name = companyHeader.textContent.trim();

    // Parse property rows
    const propertyRows = document.querySelectorAll('[data-test-id="property-row"], [class*="property-row"]');
    propertyRows.forEach(row => {
      const label = row.querySelector('[data-test-id="property-label"], [class*="label"]');
      const value = row.querySelector('[data-test-id="property-value"], [class*="value"]');
      if (!label || !value) return;

      const labelText = label.textContent.trim().toLowerCase();
      const valueText = value.textContent.trim();

      if (labelText.includes('domain') || labelText.includes('website')) data.domain = valueText;
      if (labelText.includes('industry')) data.industry = valueText;
      if (labelText.includes('employees') || labelText.includes('size')) data.employees = valueText;
      if (labelText.includes('phone')) data.phone = valueText;
      if (labelText.includes('city')) data.city = valueText;
      if (labelText.includes('country')) data.country = valueText;
    });

    return data;
  }

  // --- Floating Badge ---
  function createBadge() {
    if (document.getElementById(BADGE_ID)) return;

    const badge = document.createElement('div');
    badge.id = BADGE_ID;
    badge.innerHTML = `
      <div id="CO__hubspot_badge_main" style="
        position: fixed;
        right: 20px;
        bottom: 20px;
        z-index: 2147483640;
        background: #4B46E5;
        border-radius: 50%;
        width: 48px;
        height: 48px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(75, 70, 229, 0.4);
        transition: all 0.3s ease;
        color: white;
        font-weight: bold;
        font-size: 18px;
        font-family: Arial, sans-serif;
      ">C</div>
    `;
    document.body.appendChild(badge);

    const badgeMain = document.getElementById('CO__hubspot_badge_main');
    badgeMain.addEventListener('click', togglePanel);
    badgeMain.addEventListener('mouseenter', () => {
      badgeMain.style.transform = 'scale(1.1)';
      badgeMain.style.boxShadow = '0 6px 20px rgba(75, 70, 229, 0.6)';
    });
    badgeMain.addEventListener('mouseleave', () => {
      badgeMain.style.transform = 'scale(1)';
      badgeMain.style.boxShadow = '0 4px 12px rgba(75, 70, 229, 0.4)';
    });
  }

  // --- Enrichment Panel ---
  function togglePanel() {
    let panel = document.getElementById(PANEL_ID);
    if (panel) {
      panelVisible = !panelVisible;
      panel.style.display = panelVisible ? 'block' : 'none';
      if (panelVisible) refreshPanel();
      return;
    }

    panelVisible = true;
    panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.style.cssText = `
      position: fixed;
      right: 20px;
      bottom: 80px;
      width: 340px;
      max-height: 500px;
      background: white;
      border-radius: 12px;
      box-shadow: 0 8px 30px rgba(0,0,0,0.15);
      z-index: 2147483641;
      overflow-y: auto;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;
    document.body.appendChild(panel);
    refreshPanel();
  }

  function refreshPanel() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;

    const pageType = getHubSpotPageType();
    const data = pageType === 'company' ? extractCompanyFromHubSpot() : extractContactFromHubSpot();
    currentContactData = data;

    if (pageType === 'company') {
      panel.innerHTML = buildCompanyPanel(data);
    } else {
      panel.innerHTML = buildContactPanel(data);
    }
    attachPanelHandlers();
  }

  function buildContactPanel(data) {
    return `
      <div style="padding: 16px; border-bottom: 1px solid #f0f0f0;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="width: 40px; height: 40px; border-radius: 50%; background: #4B46E5; color: white; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 16px;">
            ${(data.name || 'C')[0].toUpperCase()}
          </div>
          <div>
            <div style="font-weight: 700; font-size: 15px; color: #1a1a2e;">${data.name || 'Unknown Contact'}</div>
            <div style="font-size: 12px; color: #888;">${data.jobTitle || ''} ${data.company ? '@ ' + data.company : ''}</div>
          </div>
        </div>
      </div>
      <div style="padding: 12px 16px;">
        ${data.email ? `<div style="display: flex; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid #f8f8f8;">
          <span style="font-size: 12px; color: #888; min-width: 50px;">Email</span>
          <span style="font-size: 13px; color: #4B46E5; font-weight: 500;">${data.email}</span>
        </div>` : ''}
        ${data.phone ? `<div style="display: flex; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid #f8f8f8;">
          <span style="font-size: 12px; color: #888; min-width: 50px;">Phone</span>
          <span style="font-size: 13px; color: #1a1a2e;">${data.phone}</span>
        </div>` : ''}
        ${data.linkedinUrl ? `<div style="display: flex; align-items: center; gap: 8px; padding: 8px 0;">
          <span style="font-size: 12px; color: #888; min-width: 50px;">LinkedIn</span>
          <a href="${data.linkedinUrl}" target="_blank" style="font-size: 13px; color: #0077B5; text-decoration: none;">View Profile</a>
        </div>` : ''}
      </div>
      <div style="padding: 12px 16px;">
        <button id="CO__hubspot_enrich" style="
          width: 100%; background: #4B46E5; color: white; border: none; border-radius: 8px;
          padding: 10px; font-size: 13px; font-weight: 600; cursor: pointer;
        ">Enrich with ContactOut</button>
      </div>
    `;
  }

  function buildCompanyPanel(data) {
    return `
      <div style="padding: 16px; border-bottom: 1px solid #f0f0f0;">
        <div style="font-weight: 700; font-size: 15px; color: #1a1a2e;">${data.name || 'Unknown Company'}</div>
        <div style="font-size: 12px; color: #888; margin-top: 2px;">${data.industry || ''}</div>
      </div>
      <div style="padding: 12px 16px;">
        ${data.domain ? `<div style="padding: 6px 0;"><span style="color: #888; font-size: 12px;">Domain:</span> <span style="color: #4B46E5; font-size: 13px;">${data.domain}</span></div>` : ''}
        ${data.employees ? `<div style="padding: 6px 0;"><span style="color: #888; font-size: 12px;">Size:</span> <span style="color: #1a1a2e; font-size: 13px;">${data.employees}</span></div>` : ''}
        ${data.phone ? `<div style="padding: 6px 0;"><span style="color: #888; font-size: 12px;">Phone:</span> <span style="color: #1a1a2e; font-size: 13px;">${data.phone}</span></div>` : ''}
        ${data.city || data.country ? `<div style="padding: 6px 0;"><span style="color: #888; font-size: 12px;">Location:</span> <span style="color: #1a1a2e; font-size: 13px;">${[data.city, data.country].filter(Boolean).join(', ')}</span></div>` : ''}
      </div>
      <div style="padding: 12px 16px;">
        <button id="CO__hubspot_find_contacts" style="
          width: 100%; background: #4B46E5; color: white; border: none; border-radius: 8px;
          padding: 10px; font-size: 13px; font-weight: 600; cursor: pointer;
        ">Find Contacts at ${data.name || 'Company'}</button>
      </div>
    `;
  }

  function attachPanelHandlers() {
    const enrichBtn = document.getElementById('CO__hubspot_enrich');
    if (enrichBtn) {
      enrichBtn.addEventListener('click', () => {
        if (currentContactData && currentContactData.email) {
          chrome.runtime.sendMessage({
            command: 'contact_out_check_email',
            data: { email: currentContactData.email }
          });
          enrichBtn.textContent = 'Enriching...';
          enrichBtn.style.background = '#10b981';
        }
      });
    }

    const findBtn = document.getElementById('CO__hubspot_find_contacts');
    if (findBtn) {
      findBtn.addEventListener('click', () => {
        if (currentContactData && currentContactData.domain) {
          chrome.runtime.sendMessage({
            command: 'contact_out_find_company_contacts',
            data: { domain: currentContactData.domain, company: currentContactData.name }
          });
          findBtn.textContent = 'Searching...';
          findBtn.style.background = '#10b981';
        }
      });
    }
  }

  // --- DOM Observation for SPA navigation ---
  function observePageChanges() {
    if (observer) observer.disconnect();

    let lastUrl = window.location.href;
    observer = new MutationObserver(() => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        setTimeout(refreshPanel, 1000);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // --- Init ---
  function init() {
    console.log('[ContactOut] HubSpot integration active');
    createBadge();
    observePageChanges();

    // Auto-refresh when navigating HubSpot
    let lastUrl = window.location.href;
    setInterval(() => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        if (panelVisible) setTimeout(refreshPanel, 1500);
      }
    }, 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
