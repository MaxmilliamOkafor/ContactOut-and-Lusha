/**
 * OutreachPro — Email Provider Background Handler (ES Module)
 *
 * Runs in the SERVICE WORKER context where chrome.identity is available.
 * Uses launchWebAuthFlow for BOTH Gmail and Outlook (works for unpacked exts).
 */

const STORAGE_KEY = 'outreach_email_providers';

// ─── Utility — RFC 2822 email builder ───
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

function base64url(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// ─── Provider status persistence ───
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

// ═══════════════════════════════════════════
//  GMAIL — launchWebAuthFlow (works for unpacked extensions)
// ═══════════════════════════════════════════

// Google OAuth2 for Chrome extensions via launchWebAuthFlow
const GOOGLE_CLIENT_ID_KEY = 'outreach_google_client_id';
const GOOGLE_REDIRECT_URI = typeof chrome !== 'undefined' && chrome.identity
  ? chrome.identity.getRedirectURL('google')
  : '';

async function getGoogleClientId() {
  return new Promise(resolve => {
    chrome.storage.local.get(GOOGLE_CLIENT_ID_KEY, r => {
      resolve(r[GOOGLE_CLIENT_ID_KEY] || '');
    });
  });
}

async function connectGmail() {
  // First try getAuthToken (works for published extensions)
  try {
    return await new Promise((resolve, reject) => {
      chrome.identity.getAuthToken(
        { interactive: true, scopes: ['https://www.googleapis.com/auth/gmail.send', 'email'] },
        async (token) => {
          if (chrome.runtime.lastError) {
            return reject(new Error(chrome.runtime.lastError.message));
          }
          if (!token) return reject(new Error('No token received'));

          try {
            const resp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
              headers: { Authorization: `Bearer ${token}` },
            });
            const info = await resp.json();
            const status = await getProviderStatus();
            status.gmail = { token, email: info.email || 'Connected', connectedAt: Date.now(), method: 'authToken' };
            await saveProviderStatus(status);
            resolve({ success: true, email: info.email });
          } catch (e) {
            const status = await getProviderStatus();
            status.gmail = { token, email: 'Connected', connectedAt: Date.now(), method: 'authToken' };
            await saveProviderStatus(status);
            resolve({ success: true, email: 'Connected' });
          }
        }
      );
    });
  } catch (authTokenErr) {
    console.log('[EmailProvider] getAuthToken failed, trying launchWebAuthFlow:', authTokenErr.message);
  }

  // Fallback: launchWebAuthFlow (works for unpacked extensions)
  const clientId = await getGoogleClientId();
  if (!clientId) {
    // Open a compose tab as ultimate fallback
    return {
      success: false,
      error: 'Gmail setup required. For unpacked extensions, you need a Google Cloud OAuth Client ID. ' +
        'Go to console.cloud.google.com → APIs & Services → Credentials → Create OAuth 2.0 Client ID (Chrome Extension type). ' +
        'Then enter it in the extension popup settings.',
      needsSetup: true
    };
  }

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('response_type', 'token');
  authUrl.searchParams.set('redirect_uri', GOOGLE_REDIRECT_URI);
  authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/gmail.send email profile');
  authUrl.searchParams.set('prompt', 'consent');

  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      { url: authUrl.toString(), interactive: true },
      async (redirectUrl) => {
        if (chrome.runtime.lastError) {
          return resolve({ success: false, error: chrome.runtime.lastError.message });
        }
        if (!redirectUrl) return resolve({ success: false, error: 'Auth cancelled' });

        const hash = new URL(redirectUrl.replace('#', '?')).searchParams;
        const token = hash.get('access_token');
        if (!token) return resolve({ success: false, error: 'No access token received' });

        try {
          const resp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${token}` },
          });
          const info = await resp.json();
          const status = await getProviderStatus();
          status.gmail = { token, email: info.email || 'Connected', connectedAt: Date.now(), method: 'webAuthFlow' };
          await saveProviderStatus(status);
          resolve({ success: true, email: info.email });
        } catch (e) {
          const status = await getProviderStatus();
          status.gmail = { token, email: 'Connected', connectedAt: Date.now(), method: 'webAuthFlow' };
          await saveProviderStatus(status);
          resolve({ success: true, email: 'Connected' });
        }
      }
    );
  });
}

async function disconnectGmail() {
  const status = await getProviderStatus();
  const token = status.gmail?.token;
  if (token) {
    if (status.gmail?.method === 'authToken') {
      try { chrome.identity.removeCachedAuthToken({ token }); } catch (e) {}
    }
    fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`).catch(() => {});
  }
  status.gmail = null;
  await saveProviderStatus(status);
  return { success: true };
}

async function sendViaGmail(to, subject, body) {
  const status = await getProviderStatus();
  if (!status.gmail?.token) {
    throw new Error('Gmail not connected. Please connect your Gmail account first.');
  }

  let token = status.gmail.token;

  // If using authToken method, try to get a fresh token
  if (status.gmail.method === 'authToken') {
    try {
      token = await new Promise((resolve, reject) => {
        chrome.identity.getAuthToken({ interactive: false, scopes: ['https://www.googleapis.com/auth/gmail.send'] }, (t) => {
          if (chrome.runtime.lastError || !t) return reject(new Error('Token refresh failed'));
          resolve(t);
        });
      });
    } catch (e) {
      // Use stored token
    }
  }

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
    if (response.status === 401) {
      // Token expired
      status.gmail = null;
      await saveProviderStatus(status);
      throw new Error('Gmail token expired. Please reconnect your Gmail account.');
    }
    throw new Error(err?.error?.message || `Gmail API error (${response.status})`);
  }

  const result = await response.json();
  return { success: true, messageId: result.id, provider: 'gmail' };
}


// ═══════════════════════════════════════════
//  OUTLOOK — launchWebAuthFlow + Graph API
// ═══════════════════════════════════════════

const MS_REDIRECT_URI = typeof chrome !== 'undefined' && chrome.identity
  ? chrome.identity.getRedirectURL('outlook')
  : '';
const MS_SCOPES = 'openid email Mail.Send';

async function getOutlookClientId() {
  return new Promise(resolve => {
    chrome.storage.local.get('outreach_outlook_client_id', r => {
      resolve(r.outreach_outlook_client_id || '');
    });
  });
}

async function connectOutlook() {
  const clientId = await getOutlookClientId();
  if (!clientId) {
    return { success: false, error: 'Outlook Client ID not configured. Go to Settings to add it.', needsSetup: true };
  }

  const authUrl = new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('response_type', 'token');
  authUrl.searchParams.set('redirect_uri', MS_REDIRECT_URI);
  authUrl.searchParams.set('scope', MS_SCOPES);
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
          const status = await getProviderStatus();
          status.outlook = {
            token,
            email: me.mail || me.userPrincipalName || 'Connected',
            connectedAt: Date.now(),
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
  if (!status.outlook?.token) throw new Error('Outlook not connected');

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
      await saveProviderStatus(status);
      throw new Error('Outlook token expired. Please reconnect.');
    }
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Outlook API error (${response.status})`);
  }

  return { success: true, provider: 'outlook' };
}

function sendViaYahoo(to, subject, body) {
  const url = `https://compose.mail.yahoo.com/?to=${encodeURIComponent(to)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  chrome.tabs.create({ url });
  return { success: true, provider: 'yahoo', composedInTab: true };
}

// ─── Unified dispatcher ───
async function sendEmail(provider, to, subject, body) {
  if (!to || !to.includes('@')) throw new Error('Invalid recipient email');
  if (!subject) throw new Error('Subject is required');
  if (!body) throw new Error('Email body is required');

  switch (provider) {
    case 'gmail': return await sendViaGmail(to, subject, body);
    case 'outlook': return await sendViaOutlook(to, subject, body);
    case 'yahoo': return sendViaYahoo(to, subject, body);
    default: throw new Error('Unknown provider: ' + provider);
  }
}


// ═══════════════════════════════════════════
//  Message listener (runs in SERVICE WORKER)
// ═══════════════════════════════════════════
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.command) return false;

  switch (message.command) {
    case 'outreach_send_email': {
      const { provider, to, subject, body } = message.data || {};
      sendEmail(provider, to, subject, body)
        .then(result => sendResponse(result))
        .catch(err => sendResponse({ success: false, error: err.message || String(err) }));
      return true;
    }

    case 'outreach_connect_gmail':
      connectGmail()
        .then(r => sendResponse(r))
        .catch(err => sendResponse({ success: false, error: err.message || String(err) }));
      return true;

    case 'outreach_disconnect_gmail':
      disconnectGmail().then(r => sendResponse(r));
      return true;

    case 'outreach_connect_outlook':
      connectOutlook()
        .then(r => sendResponse(r))
        .catch(err => sendResponse({ success: false, error: err.message || String(err) }));
      return true;

    case 'outreach_disconnect_outlook':
      disconnectOutlook().then(r => sendResponse(r));
      return true;

    case 'outreach_get_provider_status':
      getProviderStatus().then(s => sendResponse({ data: s }));
      return true;

    case 'outreach_set_google_client_id':
      chrome.storage.local.set({ [GOOGLE_CLIENT_ID_KEY]: message.data?.clientId || '' }, () => {
        sendResponse({ success: true });
      });
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

console.log('[OutreachPro] Email Provider BG Handler loaded in service worker');
