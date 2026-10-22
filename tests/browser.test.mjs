import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
const source = await readFile(new URL('../js/acquisition.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const P = 'https://plaza.convergenciaaura.cl';
const C = 'https://core.convergenciaaura.cl';
const id = 'a5c1a91d-9058-44cb-88eb-ab432c608f93';
const day = new Date().toISOString().slice(0, 10);
const marker = `pa_id=${id}&pa_day=${day}&pa_source=google_organic&pa_cta=hero`;
test('browser: visit → click → arrival → authenticated view, privacy and auth isolation', async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined });
  try {
    const context = await browser.newContext();
    const calls = [];
    await context.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url());
      if (url.pathname === '/api/acquisition') {
        calls.push({ body: req.postDataJSON(), headers: await req.allHeaders() });
        return route.fulfill({ status: 204 });
      }
      if (url.pathname === '/js/acquisition.js') return route.fulfill({ body: source, contentType: 'application/javascript' });
      if (url.origin === P && url.pathname === '/') return route.fulfill({ body: html, contentType: 'text/html' });
      if (url.origin === C && url.pathname === '/messenger.html') return route.fulfill({ body: '<div data-signed-in hidden></div><input type="checkbox" data-acquisition-optout><script src="/js/acquisition.js"></script>', contentType: 'text/html' });
      return route.fulfill({ body: '', contentType: 'text/plain' });
    });
    await context.addCookies([{ name: 'auth_should_not_be_sent', value: 'fake', domain: '.convergenciaaura.cl', path: '/' }]);
    const page = await context.newPage();
    await page.goto(P, { referer: 'https://www.google.cl/' });
    await page.waitForFunction(() => window.__auraAcquisition);
    await page.waitForTimeout(50);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].body.event, 'plaza_view');
    assert.equal(calls[0].body.source, 'google_organic');
    assert.equal(calls[0].headers.cookie, undefined);
    assert.equal(calls[0].headers.referer, undefined);
    const visitID = calls[0].body.id;
    await page.addScriptTag({ content: source }); // accidental double inclusion
    assert.equal(calls.length, 1);
    const href = await page.locator('[data-acquisition-cta="hero"]').getAttribute('href');
    assert.equal(new URL(href).searchParams.get('pa_id'), visitID);
    await page.locator('[data-acquisition-cta="hero"]').click();
    await page.waitForURL(C + '/messenger.html*');
    await page.waitForTimeout(80);
    assert.equal(calls.filter(c => c.body.event === 'plaza_chat_click').length, 1);
    assert.equal(calls.filter(c => c.body.event === 'core_arrival').length, 1);
    assert.ok(calls.every(c => c.body.id === visitID));
    assert.equal(new URL(page.url()).search, '');
    await page.evaluate(() => { document.querySelector('[data-signed-in]').hidden = false; });
    await page.waitForTimeout(50);
    await page.evaluate(() => { document.querySelector('[data-signed-in]').hidden = true; document.querySelector('[data-signed-in]').hidden = false; });
    await page.waitForTimeout(50);
    assert.equal(calls.filter(c => c.body.event === 'core_authenticated_view').length, 1);
    await page.reload();
    await page.waitForTimeout(50);
    assert.equal(calls.filter(c => c.body.event === 'core_arrival').length, 1);
    await page.goto(C + '/messenger.html?code=FAKE_CODE&' + marker + '#access_token=FAKE_TOKEN', { referer: P + '/' });
    await page.waitForTimeout(50);
    assert.equal(new URL(page.url()).search, '?code=FAKE_CODE');
    assert.equal(new URL(page.url()).hash, '#access_token=FAKE_TOKEN');
    const beforeDirect = calls.length;
    await page.goto(C + '/messenger.html');
    await page.waitForTimeout(30);
    assert.equal(calls.length, beforeDirect);
    // DNT and GPC do not decorate links and emit no events.
    for (const signal of ['doNotTrack', 'globalPrivacyControl']) {
      const privatePage = await context.newPage();
      await privatePage.addInitScript(({ signal }) => Object.defineProperty(navigator, signal, { value: signal === 'doNotTrack' ? '1' : true }), { signal });
      const before = calls.length;
      await privatePage.goto(P);
      await privatePage.waitForTimeout(30);
      assert.equal(calls.length, before);
      assert.equal(await privatePage.locator('[data-acquisition-cta="hero"]').getAttribute('href'), C + '/messenger.html');
      await privatePage.close();
    }
    await page.goto(P + '/?gclid=FAKE_AD_ID', { referer: 'https://www.google.cl/' });
    await page.waitForTimeout(30);
    assert.equal(calls.at(-1).body.source, 'paid');
    assert.ok(!JSON.stringify(calls.map(c => c.body)).includes('FAKE_'));
    await page.locator('[data-acquisition-optout]').check();
    assert.equal(await page.locator('[data-acquisition-cta="hero"]').getAttribute('href'), C + '/messenger.html');
    const before = calls.length;
    await page.reload();
    await page.waitForTimeout(30);
    assert.equal(calls.length, before);
    await page.goto('https://dev.plaza.convergenciaaura.cl/');
    await page.addScriptTag({ content: source });
    assert.equal(calls.length, before);
    await context.close();
  } finally { await browser.close(); }
});
