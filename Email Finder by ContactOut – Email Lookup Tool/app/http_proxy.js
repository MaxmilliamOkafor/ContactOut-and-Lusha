/**
 * ContactOut HTTP Request Proxy
 * Handles CORS-bypassing HTTP requests from content scripts
 * and iframe content injection for enhanced data extraction
 * Ported from Lusha's HTTP proxy and iframe injection capabilities
 */
(function() {
  'use strict';

  // --- HTTP Request Proxy ---
  // Listen for proxy requests from content scripts
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'CO_HTTP_PROXY') {
      handleHttpProxy(message.payload)
        .then(sendResponse)
        .catch(err => sendResponse({ error: err.message, status: 0 }));
      return true; // async response
    }

    if (message.type === 'CO_EXTRACT_IFRAME') {
      handleIframeExtraction(message.payload, sender.tab)
        .then(sendResponse)
        .catch(err => sendResponse({ error: err.message }));
      return true;
    }
  });

  async function handleHttpProxy(payload) {
    const { method, url, headers, body, withCookies } = payload;

    const fetchOptions = {
      method: method || 'GET',
      headers: headers || {},
      credentials: withCookies ? 'include' : 'omit',
    };

    if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      fetchOptions.body = typeof body === 'object' ? JSON.stringify(body) : body;
      if (!fetchOptions.headers['Content-Type']) {
        fetchOptions.headers['Content-Type'] = 'application/json';
      }
    }

    const response = await fetch(url, fetchOptions);
    const responseHeaders = {};
    response.headers.forEach((value, key) => { responseHeaders[key] = value; });

    let responseBody;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      responseBody = await response.json();
    } else {
      responseBody = await response.text();
    }

    return {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      body: responseBody,
      requestId: payload.requestId
    };
  }

  // --- iframe Content Injection ---
  async function handleIframeExtraction(payload, tab) {
    const { iframeSelector, targetSelector } = payload;

    if (!tab || !tab.id) return { error: 'No tab context' };

    // Inject script into the tab to extract iframe content
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractIframeContent,
      args: [iframeSelector, targetSelector]
    });

    return results[0] ? results[0].result : { error: 'No result' };
  }

  // This function runs in the page context
  function extractIframeContent(iframeSelector, targetSelector) {
    try {
      const iframes = document.querySelectorAll(iframeSelector || 'iframe');
      const extractedData = [];

      iframes.forEach(iframe => {
        try {
          const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
          if (iframeDoc) {
            const elements = targetSelector
              ? iframeDoc.querySelectorAll(targetSelector)
              : [iframeDoc.body];

            elements.forEach(el => {
              extractedData.push({
                html: el.innerHTML,
                text: el.innerText,
                source: iframe.src || 'inline'
              });
            });
          }
        } catch (e) {
          // Cross-origin iframe, skip
        }
      });

      return { success: true, data: extractedData };
    } catch (e) {
      return { error: e.message };
    }
  }

  // --- Bulk Auto-Reveal Handler ---
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'CO_BULK_REVEAL') {
      if (sender.tab && sender.tab.id) {
        chrome.scripting.executeScript({
          target: { tabId: sender.tab.id },
          func: performBulkReveal,
          args: [message.payload]
        }).then(results => {
          sendResponse(results[0] ? results[0].result : { revealed: 0 });
        });
        return true;
      }
    }
  });

  function performBulkReveal(config) {
    const selectors = config && config.selectors ? config.selectors : [
      '[data-action="reveal"]', 'button[class*="reveal"]',
      'button[class*="show-email"]', '[class*="unlock-btn"]'
    ];
    let revealed = 0;

    selectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        if (!el.disabled && el.offsetParent !== null) {
          el.click();
          revealed++;
        }
      });
    });

    return { revealed };
  }
})();
