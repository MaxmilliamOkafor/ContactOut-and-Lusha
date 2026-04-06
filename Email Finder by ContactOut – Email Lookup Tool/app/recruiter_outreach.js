/**
 * ContactOut Recruiter Quick-Contact & Tailored Outreach
 *
 * Features:
 * - Floating contact icon on recruiter profiles in LinkedIn Jobs section
 * - One-click access to: tailored email, phone, personal/work email
 * - AI-generated tailored outreach messages based on job posting context
 * - Zero limitations on outreach (unlimited messages, no tokens/coins)
 */
(function() {
  'use strict';

  const ICON_CLASS = 'co-recruiter-contact-icon';
  const PANEL_CLASS = 'co-outreach-panel';
  const STYLES_ID = 'co-recruiter-outreach-styles';
  let observer = null;

  // --- Inject global styles ---
  function injectStyles() {
    if (document.getElementById(STYLES_ID)) return;
    const style = document.createElement('style');
    style.id = STYLES_ID;
    style.textContent = `
      .${ICON_CLASS} {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        background: linear-gradient(135deg, #4B46E5 0%, #7C3AED 100%);
        border-radius: 50%;
        cursor: pointer;
        margin-left: 8px;
        vertical-align: middle;
        transition: all 0.2s ease;
        box-shadow: 0 2px 8px rgba(75, 70, 229, 0.3);
        position: relative;
        z-index: 100;
      }
      .${ICON_CLASS}:hover {
        transform: scale(1.15);
        box-shadow: 0 4px 16px rgba(75, 70, 229, 0.5);
      }
      .${ICON_CLASS} svg {
        width: 16px;
        height: 16px;
        fill: white;
      }
      .${PANEL_CLASS} {
        position: absolute;
        top: 100%;
        right: 0;
        margin-top: 8px;
        width: 380px;
        background: white;
        border-radius: 12px;
        box-shadow: 0 12px 40px rgba(0,0,0,0.18);
        z-index: 2147483641;
        overflow: hidden;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        animation: coSlideDown 0.25s ease;
      }
      @keyframes coSlideDown {
        from { opacity: 0; transform: translateY(-8px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .co-outreach-tab {
        display: inline-block;
        padding: 8px 16px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        color: #666;
        border-bottom: 2px solid transparent;
        transition: all 0.2s;
      }
      .co-outreach-tab.active {
        color: #4B46E5;
        border-bottom-color: #4B46E5;
      }
      .co-outreach-tab:hover {
        color: #4B46E5;
      }
      .co-outreach-btn {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px 16px;
        border: none;
        background: transparent;
        width: 100%;
        cursor: pointer;
        font-size: 13px;
        color: #1a1a2e;
        transition: background 0.15s;
        text-align: left;
        font-family: inherit;
      }
      .co-outreach-btn:hover {
        background: #f8f8ff;
      }
      .co-outreach-btn-icon {
        width: 36px;
        height: 36px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        font-size: 16px;
      }
      .co-outreach-textarea {
        width: 100%;
        min-height: 120px;
        border: 1px solid #e0e0e5;
        border-radius: 8px;
        padding: 12px;
        font-size: 13px;
        font-family: inherit;
        resize: vertical;
        outline: none;
        line-height: 1.5;
        transition: border-color 0.2s;
      }
      .co-outreach-textarea:focus {
        border-color: #4B46E5;
      }
      .co-outreach-send-btn {
        background: linear-gradient(135deg, #4B46E5 0%, #7C3AED 100%);
        color: white;
        border: none;
        border-radius: 8px;
        padding: 10px 20px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: opacity 0.2s;
        font-family: inherit;
      }
      .co-outreach-send-btn:hover {
        opacity: 0.9;
      }
      .co-outreach-generate-btn {
        background: transparent;
        color: #4B46E5;
        border: 1px solid #4B46E5;
        border-radius: 8px;
        padding: 10px 20px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        font-family: inherit;
      }
      .co-outreach-generate-btn:hover {
        background: #f0f0ff;
      }
    `;
    document.head.appendChild(style);
  }

  // --- Extract Job Posting Context ---
  function extractJobContext() {
    const ctx = {
      title: '',
      company: '',
      location: '',
      description: '',
      recruiterName: '',
      recruiterTitle: '',
      recruiterProfileUrl: ''
    };

    // Job title
    const titleEl = document.querySelector('.jobs-unified-top-card__job-title, .job-details-jobs-unified-top-card__job-title, h1.t-24, .jobs-details__main-content h1');
    if (titleEl) ctx.title = titleEl.textContent.trim();

    // Company
    const companyEl = document.querySelector('.jobs-unified-top-card__company-name, .job-details-jobs-unified-top-card__company-name, .jobs-unified-top-card__primary-description a');
    if (companyEl) ctx.company = companyEl.textContent.trim();

    // Location
    const locationEl = document.querySelector('.jobs-unified-top-card__bullet, .job-details-jobs-unified-top-card__bullet, .jobs-unified-top-card__workplace-type');
    if (locationEl) ctx.location = locationEl.textContent.trim();

    // Description
    const descEl = document.querySelector('.jobs-description__content, .jobs-box__html-content, #job-details');
    if (descEl) ctx.description = descEl.textContent.trim().substring(0, 500);

    // Recruiter/poster info
    const recruiterCard = document.querySelector('.jobs-poster__name, .hirer-card__hirer-information, [class*="hiring-team"] [class*="name"]');
    if (recruiterCard) {
      ctx.recruiterName = recruiterCard.textContent.trim();
      const profileLink = recruiterCard.closest('a') || recruiterCard.querySelector('a');
      if (profileLink) ctx.recruiterProfileUrl = profileLink.href;
    }

    const recruiterTitleEl = document.querySelector('.jobs-poster__headline, .hirer-card__hirer-job-title, [class*="hiring-team"] [class*="headline"]');
    if (recruiterTitleEl) ctx.recruiterTitle = recruiterTitleEl.textContent.trim();

    return ctx;
  }

  // --- Extract Profile Contact Info (on profile pages) ---
  function extractProfileContactInfo() {
    const info = {
      name: '',
      headline: '',
      email: '',
      workEmail: '',
      personalEmail: '',
      phone: '',
      profileUrl: window.location.href,
      company: '',
      location: ''
    };

    // Name
    const nameEl = document.querySelector('.text-heading-xlarge, .pv-top-card--list li:first-child, h1.inline');
    if (nameEl) info.name = nameEl.textContent.trim();

    // Headline
    const headlineEl = document.querySelector('.text-body-medium, .pv-top-card--list-bullet li, .ph5 .mt2 .text-body-medium');
    if (headlineEl) info.headline = headlineEl.textContent.trim();

    // Company
    const companyEl = document.querySelector('[class*="experience-item"] [class*="subtitle"], .pv-entity__secondary-title');
    if (companyEl) info.company = companyEl.textContent.trim();

    // Location
    const locationEl = document.querySelector('.text-body-small[class*="location"], .pv-top-card--list-bullet .text-body-small');
    if (locationEl) info.location = locationEl.textContent.trim();

    return info;
  }

  // --- AI Message Generation ---
  function generateTailoredEmail(jobContext, contactInfo, type) {
    const recruiterName = contactInfo.name || jobContext.recruiterName || 'Hiring Manager';
    const firstName = recruiterName.split(' ')[0];
    const jobTitle = jobContext.title || 'the position';
    const company = jobContext.company || contactInfo.company || 'your company';

    if (type === 'job_application') {
      return `Subject: Excited About the ${jobTitle} Role at ${company}

Hi ${firstName},

I came across the ${jobTitle} position at ${company} and I'm very excited about this opportunity. ${jobContext.location ? `The ${jobContext.location} location works perfectly for me.` : ''}

${jobContext.description ? `What particularly caught my attention was the focus on ${extractKeySkills(jobContext.description)}. I have strong experience in these areas and would love to discuss how my background aligns with what you're looking for.` : 'I believe my skills and experience would be a strong fit for this role, and I would welcome the opportunity to discuss further.'}

I'd love to schedule a brief call to learn more about the team and share how I can contribute. Would you have 15 minutes this week?

Looking forward to hearing from you.

Best regards`;
    }

    if (type === 'networking') {
      return `Subject: Quick Question About ${company}

Hi ${firstName},

I noticed your work at ${company} and was impressed by ${jobContext.recruiterTitle ? `your role as ${jobContext.recruiterTitle}` : 'the team you\'re building'}.

I'm exploring opportunities in this space and would value a brief conversation to learn from your perspective. No pressure at all - even 10 minutes would be incredibly helpful.

Would you be open to a quick chat?

Best regards`;
    }

    if (type === 'follow_up') {
      return `Subject: Following Up - ${jobTitle} at ${company}

Hi ${firstName},

I wanted to follow up regarding the ${jobTitle} position at ${company}. I remain very interested in this opportunity and would love to learn about the next steps in the process.

I'm happy to provide any additional information or references that would be helpful. Is there a good time for a brief conversation this week?

Thank you for your time and consideration.

Best regards`;
    }

    // Default cold outreach
    return `Subject: ${jobTitle} Opportunity at ${company}

Hi ${firstName},

I hope this message finds you well. I'm reaching out regarding the ${jobTitle} role at ${company} - it looks like a fantastic opportunity and I'd love to throw my hat in the ring.

${jobContext.description ? `My background in ${extractKeySkills(jobContext.description)} makes me a strong candidate for this position.` : 'I believe my experience and skills align well with what you\'re looking for.'}

Could we schedule a quick call to discuss this further?

Best regards`;
  }

  function generateLinkedInMessage(jobContext, contactInfo) {
    const recruiterName = contactInfo.name || jobContext.recruiterName || '';
    const firstName = recruiterName.split(' ')[0] || 'there';
    const jobTitle = jobContext.title || 'the open position';
    const company = jobContext.company || 'your company';

    return `Hi ${firstName}, I noticed the ${jobTitle} role at ${company} and I'm very interested. My background aligns well with the requirements, and I'd love to connect and learn more about the opportunity. Would you be open to a brief chat?`;
  }

  function extractKeySkills(description) {
    const skillPatterns = [
      /(?:experience|skills?|proficiency|expertise|knowledge)\s+(?:in|with|of)\s+([^.;,]{10,60})/gi,
      /(?:looking for|seeking|require)\s+([^.;]{10,60})/gi,
    ];
    const skills = [];
    skillPatterns.forEach(pattern => {
      const match = pattern.exec(description);
      if (match) skills.push(match[1].trim());
    });
    return skills.length > 0 ? skills[0] : 'the key areas mentioned';
  }

  // --- Contact Icon on Recruiter Cards ---
  function addContactIcons() {
    // LinkedIn Jobs - recruiter/poster cards
    const recruiterCards = document.querySelectorAll(
      '.jobs-poster, .hirer-card, [class*="hiring-team-card"], ' +
      '.jobs-details__main-content [class*="hirer"], ' +
      '.job-details-module [class*="poster"]'
    );

    recruiterCards.forEach(card => {
      if (card.querySelector('.' + ICON_CLASS)) return; // already added

      const nameEl = card.querySelector('.jobs-poster__name, [class*="name"], a[href*="/in/"]');
      if (!nameEl) return;

      const icon = createContactIcon(card, 'recruiter');
      if (nameEl.parentElement) {
        nameEl.parentElement.style.position = 'relative';
        nameEl.after(icon);
      }
    });

    // LinkedIn profile pages - add icon next to name
    const profileName = document.querySelector('.text-heading-xlarge, h1.inline');
    if (profileName && !profileName.parentElement.querySelector('.' + ICON_CLASS)) {
      const isProfilePage = window.location.pathname.startsWith('/in/');
      if (isProfilePage) {
        const icon = createContactIcon(profileName.closest('section') || profileName.parentElement, 'profile');
        profileName.after(icon);
      }
    }

    // Search results - add icon to each person card
    const searchCards = document.querySelectorAll(
      '.entity-result, .reusable-search__result-container, ' +
      '[class*="search-result__info"], .linked-area'
    );
    searchCards.forEach(card => {
      if (card.querySelector('.' + ICON_CLASS)) return;
      const nameLink = card.querySelector('a[href*="/in/"] span[aria-hidden="true"], .entity-result__title-text a');
      if (nameLink) {
        const icon = createContactIcon(card, 'search');
        nameLink.closest('a').after(icon);
      }
    });
  }

  function createContactIcon(contextElement, type) {
    const wrapper = document.createElement('span');
    wrapper.style.position = 'relative';
    wrapper.style.display = 'inline-flex';

    const icon = document.createElement('span');
    icon.className = ICON_CLASS;
    icon.title = 'ContactOut: Quick Contact';
    icon.innerHTML = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>`;

    icon.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleOutreachPanel(wrapper, contextElement, type);
    });

    wrapper.appendChild(icon);
    return wrapper;
  }

  // --- Outreach Panel ---
  function toggleOutreachPanel(wrapper, contextElement, type) {
    // Close any existing panels
    document.querySelectorAll('.' + PANEL_CLASS).forEach(p => p.remove());

    const panel = document.createElement('div');
    panel.className = PANEL_CLASS;

    const jobContext = extractJobContext();
    const contactInfo = extractProfileContactInfo();

    panel.innerHTML = buildOutreachPanel(jobContext, contactInfo, type);
    wrapper.appendChild(panel);

    // Close on outside click
    setTimeout(() => {
      document.addEventListener('click', function closePanel(e) {
        if (!panel.contains(e.target) && !wrapper.contains(e.target)) {
          panel.remove();
          document.removeEventListener('click', closePanel);
        }
      });
    }, 100);

    attachOutreachHandlers(panel, jobContext, contactInfo);
  }

  function buildOutreachPanel(jobContext, contactInfo, type) {
    const name = contactInfo.name || jobContext.recruiterName || 'Contact';
    const headline = contactInfo.headline || jobContext.recruiterTitle || '';

    return `
      <div style="padding: 16px; background: linear-gradient(135deg, #4B46E5 0%, #7C3AED 100%); color: white;">
        <div style="font-size: 14px; font-weight: 700;">${name}</div>
        ${headline ? `<div style="font-size: 12px; opacity: 0.85; margin-top: 2px;">${headline}</div>` : ''}
        ${jobContext.title ? `<div style="font-size: 11px; opacity: 0.7; margin-top: 4px;">Re: ${jobContext.title}${jobContext.company ? ' at ' + jobContext.company : ''}</div>` : ''}
      </div>

      <!-- Quick Actions -->
      <div style="border-bottom: 1px solid #f0f0f5;">
        <button class="co-outreach-btn" data-action="work-email">
          <div class="co-outreach-btn-icon" style="background: #EEF2FF; color: #4B46E5;">&#9993;</div>
          <div>
            <div style="font-weight: 600;">Work Email</div>
            <div style="font-size: 11px; color: #888;">Tailored professional email</div>
          </div>
        </button>
        <button class="co-outreach-btn" data-action="personal-email">
          <div class="co-outreach-btn-icon" style="background: #FEF3C7; color: #F59E0B;">&#9993;</div>
          <div>
            <div style="font-weight: 600;">Personal Email</div>
            <div style="font-size: 11px; color: #888;">Direct personal outreach</div>
          </div>
        </button>
        <button class="co-outreach-btn" data-action="phone">
          <div class="co-outreach-btn-icon" style="background: #D1FAE5; color: #10B981;">&#9742;</div>
          <div>
            <div style="font-weight: 600;">Phone Number</div>
            <div style="font-size: 11px; color: #888;">Direct dial contact</div>
          </div>
        </button>
        <button class="co-outreach-btn" data-action="linkedin-message">
          <div class="co-outreach-btn-icon" style="background: #DBEAFE; color: #0077B5;">in</div>
          <div>
            <div style="font-weight: 600;">LinkedIn Message</div>
            <div style="font-size: 11px; color: #888;">Tailored connection request</div>
          </div>
        </button>
      </div>

      <!-- Message Composer -->
      <div id="co-outreach-composer" style="display: none; padding: 16px;">
        <div style="display: flex; gap: 4px; margin-bottom: 12px; border-bottom: 1px solid #f0f0f5; padding-bottom: 4px;">
          <span class="co-outreach-tab active" data-template="job_application">Apply</span>
          <span class="co-outreach-tab" data-template="networking">Network</span>
          <span class="co-outreach-tab" data-template="follow_up">Follow Up</span>
        </div>
        <div id="co-outreach-recipient" style="font-size: 12px; color: #888; margin-bottom: 8px;"></div>
        <textarea class="co-outreach-textarea" id="co-outreach-message" placeholder="Your tailored message will appear here..."></textarea>
        <div style="display: flex; gap: 8px; margin-top: 12px; justify-content: space-between;">
          <button class="co-outreach-generate-btn" id="co-regenerate-btn">&#9883; Regenerate</button>
          <div style="display: flex; gap: 8px;">
            <button class="co-outreach-generate-btn" id="co-copy-btn">Copy</button>
            <button class="co-outreach-send-btn" id="co-send-btn">Open in Gmail</button>
          </div>
        </div>
        <div style="font-size: 10px; color: #999; margin-top: 8px; text-align: center;">Unlimited outreach - no tokens, no coins, no limits</div>
      </div>
    `;
  }

  function attachOutreachHandlers(panel, jobContext, contactInfo) {
    let currentAction = '';
    let currentTemplate = 'job_application';

    // Quick action buttons
    panel.querySelectorAll('.co-outreach-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        currentAction = btn.getAttribute('data-action');
        const composer = panel.querySelector('#co-outreach-composer');
        const textarea = panel.querySelector('#co-outreach-message');
        const recipientEl = panel.querySelector('#co-outreach-recipient');
        const sendBtn = panel.querySelector('#co-send-btn');

        composer.style.display = 'block';

        if (currentAction === 'phone') {
          // Request phone enrichment
          chrome.runtime.sendMessage({
            command: 'contact_out_check_email',
            data: { profileUrl: contactInfo.profileUrl, type: 'phone' }
          }, (response) => {
            if (response && response.data && response.data.phone) {
              recipientEl.textContent = 'Phone: ' + response.data.phone;
              textarea.value = `Call script for ${contactInfo.name || jobContext.recruiterName || 'recruiter'}:\n\nHi, my name is [Your Name]. I'm calling about the ${jobContext.title || 'position'} at ${jobContext.company || 'your company'}. I came across the listing and I'm very interested in learning more. Do you have a few minutes to chat?\n\n[If yes] Great! I wanted to share that my background in ${extractKeySkills(jobContext.description || '')} aligns well with the role requirements...`;
            } else {
              recipientEl.textContent = 'Phone: Enriching... (check ContactOut sidebar)';
              textarea.value = 'Fetching phone number via ContactOut enrichment...';
            }
          });
          return;
        }

        if (currentAction === 'linkedin-message') {
          recipientEl.textContent = 'LinkedIn Message to ' + (contactInfo.name || jobContext.recruiterName || 'recruiter');
          textarea.value = generateLinkedInMessage(jobContext, contactInfo);
          textarea.style.minHeight = '80px';
          sendBtn.textContent = 'Open LinkedIn';
          sendBtn.onclick = () => {
            const profileUrl = contactInfo.profileUrl || jobContext.recruiterProfileUrl;
            if (profileUrl) window.open(profileUrl, '_blank');
          };
          return;
        }

        // Email actions
        const emailType = currentAction === 'personal-email' ? 'personal' : 'work';
        recipientEl.textContent = `${emailType.charAt(0).toUpperCase() + emailType.slice(1)} email to ${contactInfo.name || jobContext.recruiterName || 'recruiter'}`;
        textarea.value = generateTailoredEmail(jobContext, contactInfo, currentTemplate);
        sendBtn.textContent = 'Open in Gmail';
        sendBtn.onclick = () => {
          const subject = textarea.value.match(/Subject: (.+)\n/);
          const body = textarea.value.replace(/Subject: .+\n\n?/, '');
          const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(subject ? subject[1] : '')}&body=${encodeURIComponent(body)}`;
          window.open(gmailUrl, '_blank');
        };

        // Enrich to find email
        chrome.runtime.sendMessage({
          command: 'contact_out_check_email',
          data: { profileUrl: contactInfo.profileUrl, type: emailType }
        });
      });
    });

    // Template tabs
    panel.querySelectorAll('.co-outreach-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        panel.querySelectorAll('.co-outreach-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentTemplate = tab.getAttribute('data-template');

        const textarea = panel.querySelector('#co-outreach-message');
        if (currentAction === 'linkedin-message') {
          textarea.value = generateLinkedInMessage(jobContext, contactInfo);
        } else if (currentAction !== 'phone') {
          textarea.value = generateTailoredEmail(jobContext, contactInfo, currentTemplate);
        }
      });
    });

    // Regenerate button
    const regenBtn = panel.querySelector('#co-regenerate-btn');
    if (regenBtn) {
      regenBtn.addEventListener('click', () => {
        const textarea = panel.querySelector('#co-outreach-message');
        // Use ContactOut AI to regenerate
        chrome.runtime.sendMessage({
          command: 'generate_personalized_email',
          data: {
            name: contactInfo.name || jobContext.recruiterName,
            company: jobContext.company || contactInfo.company,
            jobTitle: jobContext.title,
            jobDescription: jobContext.description,
            template: currentTemplate
          }
        }, (response) => {
          if (response && response.data && response.data.message) {
            textarea.value = response.data.message;
          } else {
            // Fallback to local generation with slight variation
            textarea.value = generateTailoredEmail(jobContext, contactInfo, currentTemplate);
          }
        });
        regenBtn.textContent = '&#9883; Generating...';
        setTimeout(() => { regenBtn.textContent = '&#9883; Regenerate'; }, 2000);
      });
    }

    // Copy button
    const copyBtn = panel.querySelector('#co-copy-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        const textarea = panel.querySelector('#co-outreach-message');
        navigator.clipboard.writeText(textarea.value).then(() => {
          copyBtn.textContent = 'Copied!';
          setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
        });
      });
    }
  }

  // --- DOM Observation for SPA navigation ---
  function startObserving() {
    if (observer) observer.disconnect();

    let debounceTimer = null;
    observer = new MutationObserver(() => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(addContactIcons, 500);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // --- Init ---
  function init() {
    const host = window.location.hostname;
    if (!host.includes('linkedin.com')) return;

    console.log('[ContactOut] Recruiter outreach module active');
    injectStyles();

    // Initial scan
    setTimeout(addContactIcons, 2000);

    // Watch for page changes (LinkedIn is SPA)
    startObserving();

    // Re-scan on URL changes
    let lastUrl = window.location.href;
    setInterval(() => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        setTimeout(addContactIcons, 1500);
      }
    }, 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
