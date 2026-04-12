/**
 * OutreachPro — Service Worker Wrapper
 * Imports the original ContactOut background + OutreachPro email/DM handlers.
 * MV3 "type": "module" allows ES module imports.
 */

// Original ContactOut background (self-executing IIFE — just importing runs it)
import './background_original.js';

// OutreachPro: email provider handler (Gmail, Outlook, Yahoo)
import './email_provider_bg.js';

// OutreachPro: outreach storage router (CV, templates, settings, website fetch)
import './outreach_bg.js';
