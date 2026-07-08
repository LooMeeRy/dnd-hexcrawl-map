const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));
  await page.goto('http://localhost:5173/'); // wait for load
  await page.waitForTimeout(1000);
  
  // Click DM menu
  const dmButton = await page.$('text=Start as DM');
  if (dmButton) {
     await dmButton.click();
     await page.waitForTimeout(2000);
     
     const goOnlineBtn = await page.$('text=Go Online (Host)');
     if (goOnlineBtn) {
         await goOnlineBtn.click();
         await page.waitForTimeout(2000);
     }
  }
  
  await browser.close();
})();
