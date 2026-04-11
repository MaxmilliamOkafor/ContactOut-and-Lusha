/**
 * OutreachPro — Email Provider Handler
 *
 * Supports one-click email sending via:
 *   - Gmail   → chrome.identity.getAuthToken + Gmail REST API
 *   - Outlook → chrome.identity.launchWebAuthFlow + Microsoft Graph API
 *   - Yahoo   → compose-tab fallback (Yahoo has no public send API)
 *
 * Runs entirely in the background service worker.
 * Content scripts communicate via chrome.runtime.sendMessage.
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'outreach_email_providers';

  // ─────────────────────────────────────────
  //  Utility — RFC 2822 email builder
  // ─────────────────────────────────────────
  function buildRawEmail(to, subject, body, fromEmail) {
    const boundary = 'outreach_boundary_' + Date.now();
    const lines = [
      'MIME-Version: 1.0',
      `To: ${to}`,
      fromEmail ? `From: ${fromEmail}` : '',
      `Subject: ${subject}`,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: quoted-printable',
      '',
      body,
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      'Content-Transfer-Encoding: quoted-printable',
      '',
      body.split('\n').map(l => `<p>${l || '&nbsp;'}</p>`).join('\n'),
      '',
      `--${boundary}--`,
    ].filter(l => l !== false && l !== undefined);

    return lines.join('\r\n');
  }

  /**
   * Base64url-encode a string (RFC 4648 §5).
   */
  function base64url(str) {
    // TextEncoder gives us a Uint8Array which btoa can handle
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  // ─────────────────────────────────────────
  //  Provider status persistence
  // ─────────────────────────────────────────
  async function getProviderStatus() {
    return new Promise(resolve => {
      chrome.storage.local.get(STORAGE_KEY, r => {
        resolve(r[STORAGE_KEY] || { gmail: null, outlook: null });
      });
    });
  }

  async function saveProviderStatus(data) {
    return new Promise(resolve => {
      chrome.storage.local.set({ [STORAGE_KEY]: data }, resolve);
    });
  }

  // ═════════════════════════════════════════
  //  GMAIL — chrome.identity.getAuthToken
  // ═════════════════════════════════════════

  async function connectGmail() {
    return new Promise((resolve, reject) => {
      chrome.identity.getAuthToken(
        { interactive: true, scopes: ['https://www.googleapis.com/auth/gmail.send', 'email'] },
        async (token) => {
          if (chrome.runtime.lastError) {
            console.error('[EmailProvider] Gmail auth error:', chrome.runtime.lastError.message);
            return reject(chrome.runtime.lastError.message);
          }
          if (!token) return reject('No token received');

          // Fetch user's email address
          try {
            const resp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
              headers: { Authorization: `Bearer ${token}` },
            });
            const info = await resp.json();
            const status = await getProviderStatus();
            status.gmail = { token, email: info.email || 'Connected', connectedAt: Date.now() };
            await saveProviderStatus(status);
            resolve({ success: true, email: info.email });
          } catch (e) {
            resolve({ success: true, email: 'Connected' });
          }
        }
      );
    });
  }

  async function disconnectGmail() {
    return new Promise(resolve => {
      chrome.identity.getAuthToken({ interactive: false }, (token) => {
        if (token) {
          chrome.identity.removeCachedAuthToken({ token }, () => {
            // Also revoke on Google's side
            fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`).catch(() => {});
          });
        }
        getProviderStatus().then(status => {
          status.gmail = null;
          saveProviderStatus(status).then(() => resolve({ success: true }));
        });
      });
    });
  }

  async function sendViaGmail(to, subject, body) {
    // Get a fresh token
    return new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: false, scopes: ['https://www.googleapis.com/auth/gmail.send', 'email'] }, async (token) => {
        if (chrome.runtime.lastError || !token) {
          return reject('Gmail not connected. Please connect your Gmail account first.');
        }

        try {
          // Get sender email
          const status = await getProviderStatus();
          const fromEmail = status.gmail?.email || '';

          const raw = buildRawEmail(to, subject, body, fromEmail);
          const encoded = base64url(raw);

          const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ raw: encoded }),
          });

          if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            // Token might be expired — try to refresh
            if (response.status === 401) {
              chrome.identity.removeCachedAuthToken({ token }, () => {});
              return reject('Gmail token expired. Please reconnect your Gmail account.');
            }
            return reject(err?.error?.message || `Gmail API error (${response.status})`);
          }

          const result = await response.json();
          resolve({ success: true, messageId: result.id, provider: 'gmail' });
        } catch (err) {
          reject(err.message || 'Failed to send via Gmail');
        }
      });
    });
  }

  // ═════════════════════════════════════════
  //  OUTLOOK — launchWebAuthFlow + Graph API
  // ═════════════════════════════════════════

  // Microsoft uses a multi-tenant common endpoint.
  // We use the implicit grant flow for simplicity in extensions.
  const MS_CLIENT_ID = ''; // Will be set by user or use a default
  const MS_REDIRECT_URI = chrome.identity.getRedirectURL('outlook');
  const MS_SCOPES = 'openid email Mail.Send';

  async function connectOutlook() {
    const clientId = await getOutlookClientId();
    if (!clientId) {
      return { success: false, error: 'Outlook Client ID not configured. Go to Settings to add it.' };
    }

    const authUrl = new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('response_type', 'token');
    authUrl.searchParams.set('redirect_uri', MS_REDIRECT_URI);
    authUrl.searchParams.set('scope', MS_SCOPES);
    authUrl.searchParams.set('response_mode', 'fragment');
    authUrl.searchParams.set('prompt', 'consent');

    return new Promise((resolve, reject) => {
      chrome.identity.launchWebAuthFlow(
        { url: authUrl.toString(), interactive: true },
        async (redirectUrl) => {
          if (chrome.runtime.lastError) {
            return reject(chrome.runtime.lastError.message);
          }
          if (!redirectUrl) return reject('No redirect URL received');

          // Extract token from fragment
          const hash = new URL(redirectUrl).hash.substring(1);
          const params = new URLSearchParams(hash);
          const token = params.get('access_token');

          if (!token) return reject('No access token in response');

          // Get user email
          try {
            const resp = await fetch('https://graph.microsoft.com/v1.0/me', {
              headers: { Authorization: `Bearer ${token}` },
            });
            const info = await resp.json();
            const status = await getProviderStatus();
            status.outlook = {
              token,
              email: info.mail || info.userPrincipalName || 'Connected',
              connectedAt: Date.now(),
              expiresIn: parseInt(params.get('expires_in') || '3600'),
            };
            await saveProviderStatus(status);
            resolve({ success: true, email: status.outlook.email });
          } catch (e) {
            const status = await getProviderStatus();
            status.outlook = { token, email: 'Connected', connectedAt: Date.now() };
            await saveProviderStatus(status);
            resolve({ success: true, email: 'Connected' });
          }
        }
      );
    });
  }

  async function disconnectOutlook() {
    const status = await getProviderStatus();
    status.outlook = null;
    await saveProviderStatus(status);
    return { success: true };
  }

  async function sendViaOutlook(to, subject, body) {
    const status = await getProviderStatus();
    if (!status.outlook?.token) {
      throw new Error('Outlook not connected. Please connect your Outlook account first.');
    }

    // Check if token might be expired (rough check)
    const elapsed = (Date.now() - (status.outlook.connectedAt || 0)) / 1000;
    if (elapsed > (status.outlook.expiresIn || 3600) - 60) {
      status.outlook = null;
      await saveProviderStatus(status);
      throw new Error('Outlook token expired. Please reconnect your account.');
    }

    const response = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${status.outlook.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          subject: subject,
          body: { contentType: 'Text', content: body },
          toRecipients: [{ emailAddress: { address: to } }],
        },
      }),
    });

    if (!response.ok) {
      if (response.status === 401) {
        status.outlook = null;
        await saveProviderStatus(status);
        throw new Error('Outlook token expired. Please reconnect your account.');
      }
      const err = await response.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Outlook API error (${response.status})`);
    }

    return { success: true, provider: 'outlook' };
  }

  // ═════════════════════════════════════════
  //  YAHOO — compose tab fallback
  // ═════════════════════════════════════════

  function sendViaYahoo(to, subject, body) {
    const url = `https://compose.mail.yahoo.com/?to=${encodeURIComponent(to)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    chrome.tabs.create({ url });
    return { success: true, provider: 'yahoo', method: 'compose_tab' };
  }

  // ─────────────────────────────────────────
  //  Outlook Client ID management
  // ─────────────────────────────────────────
  async function getOutlookClientId() {
    return new Promise(resolve => {
      chrome.storage.local.get('outreach_outlook_client_id', r => {
        resolve(r.outreach_outlook_client_id || '');
      });
    });
  }

  async function setOutlookClientId(clientId) {
    return new Promise(resolve => {
      chrome.storage.local.set({ outreach_outlook_client_id: clientId }, () => resolve({ success: true }));
    });
  }

  // ═════════════════════════════════════════
  //  Unified send dispatcher
  // ═════════════════════════════════════════
  async function sendEmail(provider, to, subject, body) {
    if (!to || !to.includes('@')) throw new Error('Invalid recipient email address');
    if (!subject) throw new Error('Subject is required');
    if (!body) throw new Error('Email body is required');

    switch (provider) {
      case 'gmail':
        return await sendViaGmail(to, subject, body);
      case 'outlook':
        return await sendViaOutlook(to, subject, body);
      case 'yahoo':
        return sendViaYahoo(to, subject, body);
      default:
        throw new Error('Unknown email provider: ' + provider);
    }
  }

  // ═════════════════════════════════════════
  //  Message listener (background script)
  // ═════════════════════════════════════════
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !message.command) return false;

    switch (message.command) {
      case 'outreach_send_email': {
        const { provider, to, subject, body } = message.data || {};
        sendEmail(provider, to, subject, body)
          .then(result => sendResponse(result))
          .catch(err => sendResponse({ success: false, error: err.message || err }));
        return true; // async
      }

      case 'outreach_connect_gmail':
        connectGmail()
          .then(r => sendResponse(r))
          .catch(err => sendResponse({ success: false, error: err.message || err }));
        return true;

      case 'outreach_disconnect_gmail':
        disconnectGmail().then(r => sendResponse(r));
        return true;

      case 'outreach_connect_outlook':
        connectOutlook()
          .then(r => sendResponse(r))
          .catch(err => sendResponse({ success: false, error: err.message || err }));
        return true;

      case 'outreach_disconnect_outlook':
        disconnectOutlook().then(r => sendResponse(r));
        return true;

      case 'outreach_get_provider_status':
        getProviderStatus().then(s => sendResponse({ data: s }));
        return true;

      case 'outreach_set_outlook_client_id':
        setOutlookClientId(message.data?.clientId || '').then(r => sendResponse(r));
        return true;

      default:
        return false;
    }
  });

  console.log('[OutreachPro] Email Provider Handler loaded');
})();
