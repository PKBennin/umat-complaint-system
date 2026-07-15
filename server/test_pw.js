try {
  const playwright = require('playwright');
  console.log('Playwright is available!');
} catch (e) {
  console.log('Playwright not available:', e.message);
}
