chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'getPageContent') {
    try {
      const selectors = ['article', 'main', '[role="main"]', '.content', '#content', '#main'];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && el.innerText.trim().length > 200) {
          return sendResponse({ content: el.innerText.slice(0, 80000) });
        }
      }
      const ps = document.querySelectorAll('p');
      if (ps.length > 3) {
        return sendResponse({ content: Array.from(ps).map(p => p.innerText).join('\n').slice(0, 80000) });
      }
      const text = document.body?.innerText || '';
      sendResponse({ content: text.slice(0, 80000) });
    } catch (e) {
      sendResponse({ content: '', error: e.message });
    }
  }
  return true;
});
