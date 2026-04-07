// ReachOut Background Service Worker

// Configuration
const CONFIG = {
  // API endpoint - deployed to Vercel
  API_BASE: 'https://coldcraft-iota.vercel.app',
  ENDPOINTS: {
    generate: '/api/extension/generate',
    checkout: '/api/stripe/checkout',
    verify: '/api/stripe/verify'
  }
};

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  handleMessage(request)
    .then(sendResponse)
    .catch(error => sendResponse({ success: false, error: error.message }));
  return true; // Required for async response
});

async function handleMessage(request) {
  switch (request.action) {
    case 'generateMessage':
      return handleGenerateMessage(request.data);
    case 'createCheckout':
      return handleCreateCheckout(request.data);
    case 'verifySubscription':
      return handleVerifySubscription(request.data);
    case 'getSubscriptionStatus':
      return getSubscriptionStatus();
    default:
      throw new Error('Unknown action');
  }
}

// Generate message via API
async function handleGenerateMessage(data) {
  const { profile, pitch, messageType, tone } = data;

  try {
    const response = await fetch(`${CONFIG.API_BASE}${CONFIG.ENDPOINTS.generate}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        profile,
        pitch,
        messageType,
        tone
      })
    });

    const result = await response.json();

    if (result.success) {
      return { success: true, message: result.message };
    } else {
      // Fall back to local generation if API fails
      console.log('API failed, using local generation');
      return {
        success: true,
        message: generateLocalMessage(profile, pitch, messageType, tone)
      };
    }
  } catch (error) {
    console.error('API error:', error);
    // Fall back to local generation
    return {
      success: true,
      message: generateLocalMessage(profile, pitch, messageType, tone)
    };
  }
}

// Create Stripe checkout session
async function handleCreateCheckout(data) {
  const { email, plan = 'pro' } = data;

  // Get extension ID for tracking
  const extensionId = chrome.runtime.id;

  try {
    const response = await fetch(`${CONFIG.API_BASE}${CONFIG.ENDPOINTS.checkout}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        extensionId,
        email,
        plan
      })
    });

    const result = await response.json();

    if (result.url) {
      // Open checkout in new tab
      chrome.tabs.create({ url: result.url });
      return { success: true };
    } else {
      throw new Error(result.error || 'Failed to create checkout');
    }
  } catch (error) {
    console.error('Checkout error:', error);
    return { success: false, error: error.message };
  }
}

// Verify subscription status
async function handleVerifySubscription(data) {
  const { email, licenseKey } = data;

  // Get device ID for this installation
  const deviceId = await ensureDeviceId();

  try {
    const response = await fetch(`${CONFIG.API_BASE}${CONFIG.ENDPOINTS.verify}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, licenseKey, deviceId })
    });

    const result = await response.json();

    if (result.valid) {
      // Store subscription status
      await chrome.storage.local.set({
        subscription: {
          plan: result.plan,
          email: email,
          expiresAt: result.expiresAt,
          verifiedAt: Date.now(),
          devicesUsed: result.devicesUsed,
          maxDevices: result.maxDevices
        }
      });
      return {
        success: true,
        plan: result.plan,
        devicesUsed: result.devicesUsed,
        maxDevices: result.maxDevices
      };
    } else if (result.deviceLimitReached) {
      return {
        success: false,
        deviceLimitReached: true,
        error: result.error,
        currentDevices: result.currentDevices,
        maxDevices: result.maxDevices
      };
    } else {
      return { success: false, error: result.error || 'Subscription not found' };
    }
  } catch (error) {
    console.error('Verify error:', error);
    return { success: false, error: error.message };
  }
}

// Get cached subscription status
async function getSubscriptionStatus() {
  const result = await chrome.storage.local.get('subscription');
  const sub = result.subscription;

  if (!sub) {
    return { plan: 'free' };
  }

  // Check if subscription is still valid (expires check)
  if (sub.expiresAt && sub.expiresAt * 1000 < Date.now()) {
    return { plan: 'free', expired: true };
  }

  // Re-verify if last check was more than 24 hours ago
  if (sub.verifiedAt && Date.now() - sub.verifiedAt > 24 * 60 * 60 * 1000) {
    // Trigger background re-verification
    handleVerifySubscription({ email: sub.email }).catch(console.error);
  }

  return { plan: sub.plan, email: sub.email };
}

// Local message generation (fallback)
function generateLocalMessage(profile, pitch, messageType, tone) {
  const firstName = profile.name ? profile.name.split(' ')[0] : 'there';
  const company = profile.company || 'your company';

  const toneStyles = {
    professional: {
      greeting: `Hi ${firstName},`,
      closing: 'Best regards,'
    },
    casual: {
      greeting: `Hey ${firstName}!`,
      closing: 'Cheers,'
    },
    friendly: {
      greeting: `Hi ${firstName}!`,
      closing: 'Looking forward to connecting!'
    }
  };

  const style = toneStyles[tone] || toneStyles.casual;

  if (messageType === 'connection') {
    // Keep under 300 characters
    const base = `${style.greeting} Impressed by your work at ${company}. `;
    const pitchShort = pitch.length > 150 ? pitch.substring(0, 147) + '...' : pitch;
    const message = base + pitchShort + ' Would love to connect!';
    return message.substring(0, 295);
  }

  if (messageType === 'inmail') {
    return `${style.greeting}

I came across your profile and was impressed by what you're doing at ${company}.

${pitch}

Would you be open to a quick 15-minute chat to explore this further? Happy to work around your schedule.

${style.closing}`;
  }

  // Cold email
  return `Subject: Quick question for ${firstName} at ${company}

${style.greeting}

I noticed your role at ${company} and thought you might find this relevant.

${pitch}

Would you have 15 minutes this week for a quick call?

${style.closing}
[Your name]

P.S. If email isn't the best way to reach you, feel free to connect with me on LinkedIn.`;
}

// Track installs and generate device ID
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    console.log('ReachOut extension installed');
    // Generate unique device ID
    const deviceId = 'dev_' + crypto.randomUUID();
    // Initialize storage
    await chrome.storage.local.set({
      reachout_usage: { date: new Date().toDateString(), count: 0 },
      deviceId: deviceId
    });
  }
});

// Ensure device ID exists (for existing installs)
async function ensureDeviceId() {
  const result = await chrome.storage.local.get('deviceId');
  if (!result.deviceId) {
    const deviceId = 'dev_' + crypto.randomUUID();
    await chrome.storage.local.set({ deviceId });
    return deviceId;
  }
  return result.deviceId;
}
