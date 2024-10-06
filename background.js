function toggleExtension() {
  browser.storage.local.get('xdedupeActive').then((result) => {
    const updated = result.xdedupeActive === 'false';
    browser.storage.local.set({xdedupeActive: updated ? 'true' : 'false'}).then(() => {
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
  browser.action.setIcon({path: path});
}

browser.action.onClicked.addListener(toggleExtension);
