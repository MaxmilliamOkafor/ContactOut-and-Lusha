/**
 * OutreachPro — Background Storage Router (ES Module)
 *
 * Handles CV, templates, settings storage + website fetch.
 * Runs in the service worker.
 */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.command) return false;

  switch (message.command) {
    case 'outreach_get_cv':
      chrome.storage.local.get('outreach_pro_user_cv', (result) => {
        sendResponse({ data: result.outreach_pro_user_cv || null });
      });
      return true;

    case 'outreach_save_cv':
      chrome.storage.local.set(
        { outreach_pro_user_cv: message.data },
        () => sendResponse({ success: true })
      );
      return true;

    case 'outreach_get_settings':
      chrome.storage.local.get('outreach_pro_settings', (result) => {
        sendResponse({ data: result.outreach_pro_settings || null });
      });
      return true;

    case 'outreach_save_settings':
      chrome.storage.local.set(
        { outreach_pro_settings: message.data },
        () => sendResponse({ success: true })
      );
      return true;

    case 'outreach_get_templates':
      chrome.storage.local.get('outreach_pro_templates', (result) => {
        sendResponse({ data: result.outreach_pro_templates || [] });
      });
      return true;

    case 'outreach_save_templates':
      chrome.storage.local.set(
        { outreach_pro_templates: message.data },
        () => sendResponse({ success: true })
      );
      return true;

    case 'outreach_fetch_website':
      if (message.data && message.data.url) {
        fetch(message.data.url)
          .then(res => res.text())
          .then(html => {
            const textContent = html
              .replace(/<script[\s\S]*?<\/script>/gi, '')
              .replace(/<style[\s\S]*?<\/style>/gi, '')
              .replace(/<[^>]+>/g, ' ')
              .replace(/\s+/g, ' ')
              .trim()
              .substring(0, 2000);
            sendResponse({ content: textContent });
          })
          .catch(err => {
            sendResponse({ content: '', error: err.message });
          });
        return true;
      }
      sendResponse({ content: '' });
      return true;

    default:
      return false;
  }
});

console.log('[OutreachPro] Outreach BG Router loaded in service worker');
