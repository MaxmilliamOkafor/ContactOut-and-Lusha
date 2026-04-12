/**
 * OutreachPro — Email Provider Background Handler
 *
 * Runs APPENDED to the main background.js service worker.
 * Gmail/Yahoo: compose-tab approach (no OAuth needed, just pre-fills compose)
 * Outlook: launchWebAuthFlow if client_id configured
 */
;(function() {
  'use strict';

  const OUTREACH_STORAGE_KEY = 'outreach_email_providers';

  // ─── Provider status persistence ───
  async function _outreachGetProviderStatus() {
    return new Promise(resolve => {
      chrome.storage.local.get(OUTREACH_STORAGE_KEY, r => {
        resolve(r[OUTREACH_STORAGE_KEY] || { gmail: null, outlook: null });
      });
    });
  }

  async function _outreachSaveProviderStatus(data) {
    return new Promise(resolve => {
      chrome.storage.local.set({ [OUTREACH_STORAGE_KEY]: data }, resolve);
    });
  }

  // ═══════════════════════════════════════════
  //  GMAIL — Compose-tab approach (no OAuth needed!)
  //  Marks as "connected" and sends via Gmail compose URL
  // ═══════════════════════════════════════════

  async function _outreachConnectGmail() {
    // Simply mark Gmail as connected — no OAuth needed
    // We use Gmail's compose URL which doesn't require API access
    const status = await _outreachGetProviderStatus();
    status.gmail = {
      email: 'Gmail (Compose)',
      connectedAt: Date.now(),
      method: 'compose',
    };
    await _outreachSaveProviderStatus(status);
    return { success: true, email: 'Gmail (Compose Mode)' };
  }

  async function _outreachDisconnectGmail() {
    const status = await _outreachGetProviderStatus();
    status.gmail = null;
    await _outreachSaveProviderStatus(status);
    return { success: true };
  }

  function _outreachSendViaGmail(to, subject, body) {
    // Use Gmail compose URL — pre-fills everything, user just clicks Send
    const url = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    chrome.tabs.create({ url, active: true });
    return { success: true, provider: 'gmail', composedInTab: true };
  }

  // ═══════════════════════════════════════════
  //  OUTLOOK — launchWebAuthFlow + Graph API
  // ═══════════════════════════════════════════

  async function _outreachGetOutlookClientId() {
    return new Promise(resolve => {
      chrome.storage.local.get('outreach_outlook_client_id', r => {
        resolve(r.outreach_outlook_client_id || '');
      });
    });
  }

  async function _outreachConnectOutlook() {
    const clientId = await _outreachGetOutlookClientId();
    if (!clientId) {
      // Fallback: compose-tab approach like Gmail
      const status = await _outreachGetProviderStatus();
      status.outlook = {
        email: 'Outlook (Compose)',
        connectedAt: Date.now(),
        method: 'compose',
      };
      await _outreachSaveProviderStatus(status);
      return { success: true, email: 'Outlook (Compose Mode)' };
    }

    const redirectUri = chrome.identity.getRedirectURL('outlook');
    const authUrl = new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('response_type', 'token');
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('scope', 'openid email Mail.Send');
    authUrl.searchParams.set('response_mode', 'fragment');
    authUrl.searchParams.set('prompt', 'consent');

    return new Promise((resolve) => {
      chrome.identity.launchWebAuthFlow(
        { url: authUrl.toString(), interactive: true },
        async (redirectUrl) => {
          if (chrome.runtime.lastError) {
            return resolve({ success: false, error: chrome.runtime.lastError.message });
          }
          if (!redirectUrl) return resolve({ success: false, error: 'Auth cancelled' });

          const hash = new URL(redirectUrl.replace('#', '?')).searchParams;
          const token = hash.get('access_token');
          if (!token) return resolve({ success: false, error: 'No access token in response' });

          try {
            const meResp = await fetch('https://graph.microsoft.com/v1.0/me', {
              headers: { Authorization: `Bearer ${token}` },
            });
            const me = await meResp.json();
            const status = await _outreachGetProviderStatus();
            status.outlook = {
              token,
              email: me.mail || me.userPrincipalName || 'Connected',
              connectedAt: Date.now(),
              method: 'api',
            };
            await _outreachSaveProviderStatus(status);
            resolve({ success: true, email: status.outlook.email });
          } catch (e) {
            const status = await _outreachGetProviderStatus();
            status.outlook = { token, email: 'Connected', connectedAt: Date.now(), method: 'api' };
            await _outreachSaveProviderStatus(status);
            resolve({ success: true, email: 'Connected' });
          }
        }
      );
    });
  }

  async function _outreachDisconnectOutlook() {
    const status = await _outreachGetProviderStatus();
    status.outlook = null;
    await _outreachSaveProviderStatus(status);
    return { success: true };
  }

  async function _outreachSendViaOutlook(to, subject, body) {
    const status = await _outreachGetProviderStatus();

    // If connected via API, use Graph API
    if (status.outlook?.method === 'api' && status.outlook?.token) {
      const mailBody = {
        message: {
          subject,
          body: { contentType: 'Text', content: body },
          toRecipients: [{ emailAddress: { address: to } }],
        },
        saveToSentItems: true,
      };

      const response = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${status.outlook.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(mailBody),
      });

      if (!response.ok) {
        if (response.status === 401) {
          status.outlook = null;
          await _outreachSaveProviderStatus(status);
          throw new Error('Outlook token expired. Please reconnect.');
        }
        const err = await response.json().catch(() => ({}));
        throw new Error(err?.error?.message || `Outlook API error (${response.status})`);
      }

      return { success: true, provider: 'outlook' };
    }

    // Fallback: compose URL
    const url = `https://outlook.live.com/mail/0/deeplink/compose?to=${encodeURIComponent(to)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    chrome.tabs.create({ url, active: true });
    return { success: true, provider: 'outlook', composedInTab: true };
  }

  function _outreachSendViaYahoo(to, subject, body) {
    const url = `https://compose.mail.yahoo.com/?to=${encodeURIComponent(to)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    chrome.tabs.create({ url, active: true });
    return { success: true, provider: 'yahoo', composedInTab: true };
  }

  // ─── Unified dispatcher ───
  async function _outreachSendEmail(provider, to, subject, body) {
    if (!to || !to.includes('@')) throw new Error('Invalid recipient email');
    if (!subject) throw new Error('Subject is required');
    if (!body) throw new Error('Email body is required');

    switch (provider) {
      case 'gmail': return _outreachSendViaGmail(to, subject, body);
      case 'outlook': return await _outreachSendViaOutlook(to, subject, body);
      case 'yahoo': return _outreachSendViaYahoo(to, subject, body);
      default: throw new Error('Unknown provider: ' + provider);
    }
  }

  // ═══════════════════════════════════════════
  //  Message listener
  // ═══════════════════════════════════════════
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !message.command) return false;

    switch (message.command) {
      case 'outreach_send_email': {
        const { provider, to, subject, body } = message.data || {};
        _outreachSendEmail(provider, to, subject, body)
          .then(result => sendResponse(result))
          .catch(err => sendResponse({ success: false, error: err.message || String(err) }));
        return true;
      }

      case 'outreach_connect_gmail':
        _outreachConnectGmail()
          .then(r => sendResponse(r))
          .catch(err => sendResponse({ success: false, error: err.message || String(err) }));
        return true;

      case 'outreach_disconnect_gmail':
        _outreachDisconnectGmail().then(r => sendResponse(r));
        return true;

      case 'outreach_connect_outlook':
        _outreachConnectOutlook()
          .then(r => sendResponse(r))
          .catch(err => sendResponse({ success: false, error: err.message || String(err) }));
        return true;

      case 'outreach_disconnect_outlook':
        _outreachDisconnectOutlook().then(r => sendResponse(r));
        return true;

      case 'outreach_get_provider_status':
        _outreachGetProviderStatus().then(s => sendResponse({ data: s }));
        return true;

      case 'outreach_set_outlook_client_id':
        chrome.storage.local.set({ outreach_outlook_client_id: message.data?.clientId || '' }, () => {
          sendResponse({ success: true });
        });
        return true;

      default:
        return false;
    }
  });

  console.log('[OutreachPro] Email Provider Handler loaded in service worker ✓');
})();
