// browser for Firefox, chrome for Chrome
const backend = (typeof browser !== 'undefined') ? browser : chrome;

function toggleExtension() {
  backend.storage.local.get('xdedupeActive').then((result) => {
    const updated = result.xdedupeActive === 'false';
    backend.storage.local.set({xdedupeActive: updated ? 'true' : 'false'}).then(() => {
      updateIcon(updated);
    });
  });
}

function updateIcon(isActive) {
  const path = isActive ? {
    48: "icons/icon-48.png",
    96: "icons/icon-96.png"
  } : {
    48: "icons/gray-icon-48.png",
    96: "icons/gray-icon-96.png"
  };
  backend.action.setIcon({path: path});
}

// Handle messages from content script
backend.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getStorage') {
    backend.storage.local.get(request.key).then((result) => {
      sendResponse(result);
    });
    return true; // Keep message channel open for async response
  }
});

// Forward toggle off events to content scripts
backend.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') {
    // Send message to all tabs with x.com
    backend.tabs.query({url: "https://x.com/*"}).then((tabs) => {
      tabs.forEach((tab) => {
        backend.tabs.sendMessage(tab.id, {
          action: 'storageChanged',
          changes: changes,
          area: area
        }).catch(() => {
          // Ignore errors (tab might not have content script loaded)
        });
      });
    });
  }
});

backend.action.onClicked.addListener(toggleExtension);

// Initialize icon state on startup
backend.storage.local.get('xdedupeActive').then((result) => {
  const isActive = result.xdedupeActive !== 'false';
  updateIcon(isActive);
});
