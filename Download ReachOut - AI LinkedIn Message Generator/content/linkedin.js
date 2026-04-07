// Content script for LinkedIn profile pages
// Extracts profile data and sends it to the popup

function extractProfileData() {
  const data = {
    name: '',
    headline: '',
    company: '',
    location: '',
    about: '',
    currentRole: '',
    profileUrl: window.location.href,
    recentActivity: []
  };

  try {
    // Extract name - usually in h1 tag
    const nameElement = document.querySelector('h1.text-heading-xlarge');
    if (nameElement) {
      data.name = nameElement.innerText.trim();
    }

    // Extract headline (title/role description)
    const headlineElement = document.querySelector('div.text-body-medium.break-words');
    if (headlineElement) {
      data.headline = headlineElement.innerText.trim();
    }

    // Extract current company from experience or headline
    const companyLink = document.querySelector('button[aria-label*="Current company"] span');
    if (companyLink) {
      data.company = companyLink.innerText.trim();
    } else {
      // Try to extract from headline
      const headlineParts = data.headline.split(' at ');
      if (headlineParts.length > 1) {
        data.company = headlineParts[headlineParts.length - 1].trim();
      }
    }

    // Extract location
    const locationElement = document.querySelector('span.text-body-small.inline.t-black--light.break-words');
    if (locationElement) {
      data.location = locationElement.innerText.trim();
    }

    // Extract about section
    const aboutSection = document.querySelector('#about ~ div.display-flex div.inline-show-more-text span[aria-hidden="true"]');
    if (aboutSection) {
      data.about = aboutSection.innerText.trim().substring(0, 500); // Limit to 500 chars
    }

    // Try to get current role from experience section
    const experienceSection = document.querySelector('#experience ~ div.pvs-list__outer-container');
    if (experienceSection) {
      const firstRole = experienceSection.querySelector('div.display-flex.align-items-center span[aria-hidden="true"]');
      if (firstRole) {
        data.currentRole = firstRole.innerText.trim();
      }
    }

    // Extract recent posts/activity if visible
    const activityItems = document.querySelectorAll('div.feed-shared-update-v2__description-wrapper');
    activityItems.forEach((item, index) => {
      if (index < 3) { // Get up to 3 recent activities
        const text = item.innerText.trim().substring(0, 200);
        if (text) {
          data.recentActivity.push(text);
        }
      }
    });

  } catch (error) {
    console.error('ReachOut: Error extracting profile data:', error);
  }

  return data;
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getProfileData') {
    const profileData = extractProfileData();
    sendResponse({ success: true, data: profileData });
  }
  return true; // Required for async response
});

// Also store data when page loads so it's ready
const initialData = extractProfileData();
chrome.storage.local.set({ currentProfile: initialData });

console.log('ReachOut: Content script loaded for LinkedIn profile');
