import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const SCREENSHOTS_DIR = path.resolve('docs/screenshots');
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new',
  '--remote-debugging-port=9555',
  '--no-sandbox',
  '--disable-gpu',
  '--window-size=1280,820',
  '--user-data-dir=' + path.resolve('.tmp/cdp_shots2'),
  'about:blank',
]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

setTimeout(async () => {
  try {
    const res = await fetch('http://127.0.0.1:9555/json/list');
    const tabs = await res.json();
    const pageTab = tabs.find((t) => t.type === 'page');
    console.log('Using target tab:', pageTab.id);

    const ws = new WebSocket(pageTab.webSocketDebuggerUrl);

    let id = 1;
    function send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const curId = id++;
        const handler = (e) => {
          const msg = JSON.parse(e.data);
          if (msg.id === curId) {
            ws.removeEventListener('message', handler);
            if (msg.error) reject(new Error(msg.error.message));
            else resolve(msg.result);
          }
        };
        ws.addEventListener('message', handler);
        ws.send(JSON.stringify({ id: curId, method, params }));
      });
    }

    async function evaluate(expression) {
      return await send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
    }

    async function capture(filename) {
      const { data } = await send('Page.captureScreenshot', { format: 'png' });
      const outPath = path.join(SCREENSHOTS_DIR, filename);
      fs.writeFileSync(outPath, Buffer.from(data, 'base64'));
      console.log(`Saved ${filename} (${Math.round(fs.statSync(outPath).size / 1024)} KB)`);
    }

    ws.onopen = async () => {
      console.log('DevTools connected.');
      await send('Page.enable');
      await send('Runtime.enable');
      await send('DOM.enable');

      // 1. Welcome Screen
      console.log('Capturing welcome screen...');
      await send('Page.navigate', { url: 'https://nikhil9182.github.io/Tabby/welcome' });
      await sleep(3500);
      await capture('welcome.png');

      // 2. Click Continue as Guest
      console.log('Entering guest mode...');
      await evaluate(`
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Continue as Guest'));
        if (btn) btn.click();
      `);
      await sleep(3500);
      await capture('dashboard.png');

      // 3. Receipt Scanner Modal
      console.log('Capturing receipt scanner modal...');
      await send('Page.navigate', { url: 'https://nikhil9182.github.io/Tabby/expenses/new?scan=true' });
      await sleep(3000);
      await capture('receipt-scanner.png');

      // 4. Expenses Page
      console.log('Capturing expenses...');
      await send('Page.navigate', { url: 'https://nikhil9182.github.io/Tabby/expenses' });
      await sleep(2500);
      await capture('expenses.png');

      // 5. Friends Page
      console.log('Capturing friends page...');
      await send('Page.navigate', { url: 'https://nikhil9182.github.io/Tabby/friends' });
      await sleep(2500);
      await capture('friends.png');

      // 6. Reports Page
      console.log('Capturing reports page...');
      await send('Page.navigate', { url: 'https://nikhil9182.github.io/Tabby/reports' });
      await sleep(2500);
      await capture('reports.png');

      // 7. Mobile View
      console.log('Emulating mobile viewport...');
      await send('Emulation.setDeviceMetricsOverride', {
        width: 390,
        height: 844,
        deviceScaleFactor: 2,
        mobile: true,
      });
      await send('Page.navigate', { url: 'https://nikhil9182.github.io/Tabby/dashboard' });
      await sleep(3000);
      await capture('mobile-dashboard.png');

      console.log('All screenshots captured successfully!');
      ws.close();
      chrome.kill();
      process.exit(0);
    };
  } catch (err) {
    console.error('Fatal capture error:', err);
    chrome.kill();
    process.exit(1);
  }
}, 1500);
