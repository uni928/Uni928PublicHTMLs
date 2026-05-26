chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) return;
  if (!tab.url || !tab.url.startsWith('https://mail.google.com/')) {
    await chrome.tabs.create({ url: 'https://mail.google.com/' });
    return;
  }
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'GSM_TOGGLE_PANEL' });
  } catch (error) {
    // Content script may not be ready yet; reloading Gmail normally fixes it.
    console.warn('Gmail Suspicion Meter: unable to toggle panel', error);
  }
});
