// ReachOut Popup Script

const DAILY_FREE_LIMIT = 5;
const STORAGE_KEY = 'reachout_usage';

let currentProfile = null;
let selectedType = 'connection';
let selectedTone = 'casual';
let userPlan = 'free';

// DOM Elements
const elements = {};

// Initialize
document.addEventListener('DOMContentLoaded', init);

async function init() {
  cacheElements();
  await loadSubscriptionStatus();
  await loadSavedPitch();
  await updateUsageDisplay();
  await updateFollowUpCount();
  await checkCurrentTab();
  setupEventListeners();
}

// Load saved preferences from storage
async function loadSavedPitch() {
  const result = await chrome.storage.local.get(['savedPitch', 'savedType', 'savedTone']);

  if (result.savedPitch) {
    elements.yourPitch.value = result.savedPitch;
  }

  if (result.savedType) {
    selectedType = result.savedType;
    document.querySelectorAll('.type-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.type === selectedType);
    });
  }

  if (result.savedTone) {
    selectedTone = result.savedTone;
    document.querySelectorAll('.tone-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tone === selectedTone);
    });
  }
}

// Save pitch when it changes
function savePitch() {
  const pitch = elements.yourPitch.value.trim();
  if (pitch) {
    chrome.storage.local.set({ savedPitch: pitch });
  }
}

// Save preferences
function savePreferences() {
  chrome.storage.local.set({
    savedType: selectedType,
    savedTone: selectedTone
  });
}

function cacheElements() {
  elements.mainView = document.getElementById('mainView');
  elements.settingsView = document.getElementById('settingsView');
  elements.generateTab = document.getElementById('generateTab');
  elements.followupsTab = document.getElementById('followupsTab');
  elements.followupsList = document.getElementById('followupsList');
  elements.noFollowups = document.getElementById('noFollowups');
  elements.followupCount = document.getElementById('followupCount');
  elements.notLinkedIn = document.getElementById('notLinkedIn');
  elements.profileSection = document.getElementById('profileSection');
  elements.resultSection = document.getElementById('resultSection');
  elements.upgradeSection = document.getElementById('upgradeSection');
  elements.errorSection = document.getElementById('errorSection');
  elements.profileName = document.getElementById('profileName');
  elements.profileHeadline = document.getElementById('profileHeadline');
  elements.profileCompany = document.getElementById('profileCompany');
  elements.yourPitch = document.getElementById('yourPitch');
  elements.generateBtn = document.getElementById('generateBtn');
  elements.generatedMessage = document.getElementById('generatedMessage');
  elements.copyBtn = document.getElementById('copyBtn');
  elements.regenerateBtn = document.getElementById('regenerateBtn');
  elements.newMessageBtn = document.getElementById('newMessageBtn');
  elements.usageBar = document.getElementById('usageBar');
  elements.usageText = document.getElementById('usageText');
  elements.usageProgress = document.getElementById('usageProgress');
  elements.retryBtn = document.getElementById('retryBtn');
  elements.upgradeBtn = document.getElementById('upgradeBtn');
  elements.settingsBtn = document.getElementById('settingsBtn');
  elements.backBtn = document.getElementById('backBtn');
  elements.planBadge = document.getElementById('planBadge');
  elements.currentPlan = document.getElementById('currentPlan');
  elements.verifyEmail = document.getElementById('verifyEmail');
  elements.verifyBtn = document.getElementById('verifyBtn');
  elements.verifyStatus = document.getElementById('verifyStatus');
  elements.upgradeFromSettings = document.getElementById('upgradeFromSettings');
}

// Load subscription status
async function loadSubscriptionStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getSubscriptionStatus' });
    userPlan = response.plan || 'free';
    updatePlanUI();
  } catch (error) {
    console.error('Error loading subscription:', error);
    userPlan = 'free';
  }
}

function updatePlanUI() {
  if (userPlan === 'pro') {
    elements.planBadge.textContent = 'Pro';
    elements.planBadge.classList.remove('free');
    elements.planBadge.classList.add('pro');
    elements.usageBar.classList.add('hidden');
    elements.currentPlan.innerHTML = `
      <span class="plan-name">Pro</span>
      <span class="plan-limit">Unlimited messages</span>
    `;
    elements.upgradeFromSettings.classList.add('hidden');
  } else {
    elements.planBadge.textContent = 'Free';
    elements.planBadge.classList.remove('pro');
    elements.planBadge.classList.add('free');
    elements.usageBar.classList.remove('hidden');
    elements.upgradeFromSettings.classList.remove('hidden');
  }
}

// Check if we're on a LinkedIn profile
async function checkCurrentTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (tab.url && tab.url.includes('linkedin.com/in/')) {
      try {
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'getProfileData' });
        if (response && response.success && response.data) {
          currentProfile = response.data;
          showProfileSection();
          return;
        }
      } catch (e) {
        // Content script might not be loaded
      }

      // Fallback to storage
      const stored = await chrome.storage.local.get('currentProfile');
      if (stored.currentProfile && stored.currentProfile.name) {
        currentProfile = stored.currentProfile;
        showProfileSection();
        return;
      }
    }

    showNotLinkedIn();
  } catch (error) {
    console.error('Error checking tab:', error);
    showNotLinkedIn();
  }
}

function showProfileSection() {
  hideAllSections();
  elements.profileSection.classList.remove('hidden');
  elements.profileName.textContent = currentProfile.name || 'Unknown';
  elements.profileHeadline.textContent = currentProfile.headline || '';
  elements.profileCompany.textContent = currentProfile.company ? `at ${currentProfile.company}` : '';
}

function showNotLinkedIn() {
  hideAllSections();
  elements.notLinkedIn.classList.remove('hidden');
}

function showResult(message) {
  hideAllSections();
  elements.resultSection.classList.remove('hidden');
  elements.generatedMessage.textContent = message;
}

function showUpgrade() {
  hideAllSections();
  elements.upgradeSection.classList.remove('hidden');
}

function showError(message) {
  hideAllSections();
  elements.errorSection.classList.remove('hidden');
  document.getElementById('errorMessage').textContent = message;
}

function hideAllSections() {
  elements.notLinkedIn.classList.add('hidden');
  elements.profileSection.classList.add('hidden');
  elements.resultSection.classList.add('hidden');
  elements.upgradeSection.classList.add('hidden');
  elements.errorSection.classList.add('hidden');
}

// Event listeners
function setupEventListeners() {
  // Type buttons
  document.querySelectorAll('.type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedType = btn.dataset.type;
      savePreferences();
    });
  });

  // Tone buttons
  document.querySelectorAll('.tone-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tone-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedTone = btn.dataset.tone;
      savePreferences();
    });
  });

  // Generate button
  elements.generateBtn.addEventListener('click', generateMessage);

  // Copy button
  elements.copyBtn.addEventListener('click', copyMessage);

  // Regenerate button
  elements.regenerateBtn.addEventListener('click', () => {
    showProfileSection();
    generateMessage();
  });

  // New message button
  elements.newMessageBtn.addEventListener('click', () => {
    showProfileSection();
  });

  // Retry button
  elements.retryBtn.addEventListener('click', () => {
    showProfileSection();
  });

  // Upgrade buttons
  elements.upgradeBtn.addEventListener('click', () => handleUpgrade('pro'));

  // Plan selection buttons
  document.querySelectorAll('.plan-select-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const plan = btn.dataset.plan;
      handleUpgrade(plan);
    });
  });

  // Settings navigation
  elements.settingsBtn.addEventListener('click', showSettings);
  elements.backBtn.addEventListener('click', hideSettings);

  // Verify subscription
  elements.verifyBtn.addEventListener('click', verifySubscription);

  // Save pitch when typing stops (debounced)
  let pitchTimeout;
  elements.yourPitch.addEventListener('input', () => {
    clearTimeout(pitchTimeout);
    pitchTimeout = setTimeout(savePitch, 500);
  });

  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}

// Switch between tabs
async function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });

  if (tab === 'generate') {
    elements.generateTab.classList.remove('hidden');
    elements.followupsTab.classList.add('hidden');
  } else {
    elements.generateTab.classList.add('hidden');
    elements.followupsTab.classList.remove('hidden');
    await renderFollowUpList();
  }
}

// Update follow-up count badge
async function updateFollowUpCount() {
  const result = await chrome.storage.local.get('followUpList');
  const list = result.followUpList || [];

  // Count pending follow-ups older than 3 days
  const threeDaysAgo = Date.now() - (3 * 24 * 60 * 60 * 1000);
  const needsFollowUp = list.filter(p => p.status === 'pending' && p.messagedAt < threeDaysAgo);

  if (needsFollowUp.length > 0) {
    elements.followupCount.textContent = needsFollowUp.length;
    elements.followupCount.classList.remove('hidden');
  } else {
    elements.followupCount.classList.add('hidden');
  }
}

// Render follow-up list
async function renderFollowUpList() {
  const result = await chrome.storage.local.get('followUpList');
  const list = result.followUpList || [];

  // Filter to pending only
  const pendingList = list.filter(p => p.status === 'pending');

  if (pendingList.length === 0) {
    elements.followupsList.classList.add('hidden');
    elements.noFollowups.classList.remove('hidden');
    return;
  }

  elements.followupsList.classList.remove('hidden');
  elements.noFollowups.classList.add('hidden');

  elements.followupsList.innerHTML = pendingList.map(person => {
    const daysAgo = Math.floor((Date.now() - person.messagedAt) / (24 * 60 * 60 * 1000));
    const isUrgent = daysAgo >= 5;
    const daysText = daysAgo === 0 ? 'Today' : daysAgo === 1 ? '1 day ago' : `${daysAgo} days ago`;

    return `
      <div class="followup-card" data-url="${person.profileUrl}">
        <div class="followup-header">
          <span class="followup-name">${person.name}</span>
          <span class="followup-days ${isUrgent ? 'urgent' : ''}">${daysText}</span>
        </div>
        <div class="followup-headline">${person.headline || person.company || ''}</div>
        <div class="followup-actions">
          <button class="followup-btn primary" data-action="followup" data-url="${person.profileUrl}">Follow Up</button>
          <button class="followup-btn secondary" data-action="replied" data-url="${person.profileUrl}">Replied</button>
          <button class="followup-btn secondary" data-action="skip" data-url="${person.profileUrl}">Skip</button>
        </div>
      </div>
    `;
  }).join('');

  // Add event listeners
  elements.followupsList.querySelectorAll('.followup-btn').forEach(btn => {
    btn.addEventListener('click', handleFollowUpAction);
  });
}

// Handle follow-up button actions
async function handleFollowUpAction(e) {
  const action = e.target.dataset.action;
  const url = e.target.dataset.url;

  if (action === 'followup') {
    if (userPlan === 'pro') {
      await generateFollowUpMessage(url);
    } else {
      // Free users - show upgrade prompt
      showFollowUpUpgrade();
    }
  } else if (action === 'replied' || action === 'skip') {
    await markAsReplied(url);
  }
}

// Show upgrade prompt for follow-up feature
function showFollowUpUpgrade() {
  const msg = 'AI follow-up messages are a Pro feature. Upgrade to automatically generate personalized follow-ups.\n\nFor now, we\'ll open the profile so you can message them manually.';
  if (confirm(msg + '\n\nUpgrade to Pro?')) {
    handleUpgrade();
  }
}

// Generate AI follow-up message
async function generateFollowUpMessage(profileUrl) {
  const result = await chrome.storage.local.get('followUpList');
  const list = result.followUpList || [];
  const person = list.find(p => p.profileUrl === profileUrl);

  if (!person) {
    chrome.tabs.create({ url: profileUrl });
    return;
  }

  // Switch to generate tab and show loading
  await switchTab('generate');

  // Set up profile context for follow-up
  currentProfile = {
    name: person.name,
    headline: person.headline,
    company: person.company,
    profileUrl: person.profileUrl
  };

  showProfileSection();

  // Generate follow-up message
  const btnText = elements.generateBtn.querySelector('.btn-text');
  const btnLoading = elements.generateBtn.querySelector('.btn-loading');
  btnText.classList.add('hidden');
  btnLoading.classList.remove('hidden');
  elements.generateBtn.disabled = true;

  try {
    const pitch = elements.yourPitch.value.trim() || 'Following up on my previous message';

    const response = await chrome.runtime.sendMessage({
      action: 'generateMessage',
      data: {
        profile: currentProfile,
        pitch: `FOLLOW-UP MESSAGE (attempt #${(person.followUpCount || 0) + 1}). My original outreach was about: ${pitch}. Keep it very short - just checking in, referencing we connected before.`,
        messageType: selectedType,
        tone: selectedTone
      }
    });

    if (response.success) {
      showResult(response.message);
    } else {
      showError(response.error || 'Failed to generate follow-up.');
    }
  } catch (error) {
    console.error('Follow-up error:', error);
    showError('Failed to generate follow-up message.');
  } finally {
    btnText.classList.remove('hidden');
    btnLoading.classList.add('hidden');
    elements.generateBtn.disabled = false;
  }
}

// Mark as replied (removes from list)
async function markAsReplied(profileUrl) {
  const result = await chrome.storage.local.get('followUpList');
  const list = result.followUpList || [];

  const index = list.findIndex(p => p.profileUrl === profileUrl);
  if (index >= 0) {
    list[index].status = 'replied';
  }

  await chrome.storage.local.set({ followUpList: list });
  await renderFollowUpList();
  await updateFollowUpCount();
}

// Generate message
async function generateMessage() {
  // Check usage limit for free users
  if (userPlan === 'free') {
    const usage = await getUsage();
    if (usage.count >= DAILY_FREE_LIMIT) {
      showUpgrade();
      return;
    }
  }

  const pitch = elements.yourPitch.value.trim();
  if (!pitch) {
    alert('Please describe what you want to offer or discuss.');
    return;
  }

  // Show loading state
  const btnText = elements.generateBtn.querySelector('.btn-text');
  const btnLoading = elements.generateBtn.querySelector('.btn-loading');
  btnText.classList.add('hidden');
  btnLoading.classList.remove('hidden');
  elements.generateBtn.disabled = true;

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'generateMessage',
      data: {
        profile: currentProfile,
        pitch: pitch,
        messageType: selectedType,
        tone: selectedTone
      }
    });

    if (response.success) {
      if (userPlan === 'free') {
        await incrementUsage();
        await updateUsageDisplay();
      }
      showResult(response.message);
    } else {
      showError(response.error || 'Failed to generate message. Please try again.');
    }
  } catch (error) {
    console.error('Generate error:', error);
    showError('Something went wrong. Please try again.');
  } finally {
    btnText.classList.remove('hidden');
    btnLoading.classList.add('hidden');
    elements.generateBtn.disabled = false;
  }
}

// Copy message to clipboard and track for follow-up
async function copyMessage() {
  const message = elements.generatedMessage.textContent;
  await navigator.clipboard.writeText(message);

  // Save profile to follow-up list
  if (currentProfile && currentProfile.name) {
    await saveToFollowUpList(currentProfile, message);
  }

  const copyText = elements.copyBtn.querySelector('.copy-text');
  const copiedText = elements.copyBtn.querySelector('.copied-text');

  copyText.classList.add('hidden');
  copiedText.classList.remove('hidden');

  setTimeout(() => {
    copyText.classList.remove('hidden');
    copiedText.classList.add('hidden');
  }, 2000);
}

// Save profile to follow-up tracking list
async function saveToFollowUpList(profile, message) {
  const result = await chrome.storage.local.get('followUpList');
  const followUpList = result.followUpList || [];

  // Check if already in list (by profile URL)
  const existingIndex = followUpList.findIndex(p => p.profileUrl === profile.profileUrl);

  const entry = {
    name: profile.name,
    headline: profile.headline,
    company: profile.company,
    profileUrl: profile.profileUrl,
    messagedAt: Date.now(),
    lastMessage: message.substring(0, 100),
    followUpCount: existingIndex >= 0 ? (followUpList[existingIndex].followUpCount || 0) + 1 : 0,
    status: 'pending' // pending, replied, not_interested
  };

  if (existingIndex >= 0) {
    followUpList[existingIndex] = entry;
  } else {
    followUpList.unshift(entry); // Add to beginning
  }

  // Keep only last 100 entries
  if (followUpList.length > 100) {
    followUpList.pop();
  }

  await chrome.storage.local.set({ followUpList });
}

// Handle upgrade
async function handleUpgrade(plan = 'pro') {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'createCheckout',
      data: {
        email: elements.verifyEmail?.value || '',
        plan: plan
      }
    });

    if (!response.success) {
      alert('Failed to start checkout. Please try again.');
    }
  } catch (error) {
    console.error('Upgrade error:', error);
    alert('Failed to start checkout. Please try again.');
  }
}

// Verify subscription
async function verifySubscription() {
  const email = elements.verifyEmail.value.trim();
  if (!email) {
    showVerifyStatus('Please enter your email', 'error');
    return;
  }

  elements.verifyBtn.disabled = true;
  elements.verifyBtn.textContent = 'Verifying...';

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'verifySubscription',
      data: { email }
    });

    if (response.success) {
      userPlan = response.plan || 'pro';
      updatePlanUI();

      // Show device info if available
      if (response.devicesUsed && response.maxDevices) {
        showVerifyStatus(`Pro activated! Device ${response.devicesUsed}/${response.maxDevices}`, 'success');
      } else {
        showVerifyStatus('Pro subscription activated!', 'success');
      }
    } else if (response.deviceLimitReached) {
      showVerifyStatus(response.error || 'Device limit reached. Remove a device or upgrade.', 'error');
    } else {
      showVerifyStatus(response.error || 'No active subscription found for this email', 'error');
    }
  } catch (error) {
    console.error('Verify error:', error);
    showVerifyStatus('Verification failed. Please try again.', 'error');
  } finally {
    elements.verifyBtn.disabled = false;
    elements.verifyBtn.textContent = 'Verify';
  }
}

function showVerifyStatus(message, type) {
  elements.verifyStatus.textContent = message;
  elements.verifyStatus.className = `verify-status ${type}`;
  elements.verifyStatus.classList.remove('hidden');
}

// Settings view
function showSettings() {
  elements.mainView.classList.add('hidden');
  elements.settingsView.classList.remove('hidden');
}

function hideSettings() {
  elements.settingsView.classList.add('hidden');
  elements.mainView.classList.remove('hidden');
}

// Usage tracking
async function getUsage() {
  const today = new Date().toDateString();
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const usage = result[STORAGE_KEY] || { date: today, count: 0 };

  if (usage.date !== today) {
    return { date: today, count: 0 };
  }

  return usage;
}

async function incrementUsage() {
  const usage = await getUsage();
  usage.count += 1;
  usage.date = new Date().toDateString();
  await chrome.storage.local.set({ [STORAGE_KEY]: usage });
}

async function updateUsageDisplay() {
  if (userPlan === 'pro') {
    elements.usageBar.classList.add('hidden');
    return;
  }

  const usage = await getUsage();
  const remaining = DAILY_FREE_LIMIT - usage.count;
  const percentage = (remaining / DAILY_FREE_LIMIT) * 100;

  elements.usageText.textContent = `${remaining} message${remaining !== 1 ? 's' : ''} left today`;
  elements.usageProgress.style.width = `${percentage}%`;

  // Color based on remaining
  elements.usageProgress.classList.remove('low', 'empty');
  if (remaining <= 2 && remaining > 0) {
    elements.usageProgress.classList.add('low');
  } else if (remaining <= 0) {
    elements.usageProgress.classList.add('empty');
  }
}
