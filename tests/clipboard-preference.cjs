const {chromium, firefox} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
(async () => {
    for (const [name, engine] of [['Chromium', chromium], ['Firefox', firefox]]) {
        const browser = await engine.launch({headless:true});
        try {
            const page = await browser.newPage();
            let enabled = true, fail = false;
            const requests = [];
            await page.route('https://webssh.test/**', async route => {
                if (route.request().method() === 'POST') {
                    const data = route.request().postDataJSON();
                    requests.push(data);
                    if (!fail) enabled = data.confirm_remote_clipboard;
                    return route.fulfill({status:fail ? 500 : 200, contentType:'application/json',
                        body:JSON.stringify(fail ? {error:'Save failed'} : {settings:{confirm_remote_clipboard:enabled}})});
                }
                return route.fulfill({contentType:'text/html', body:`<body data-confirm-remote-clipboard="${enabled}"><input type="checkbox" id="confirmRemoteClipboardInput"><div id="settingsPreferenceStatus"></div></body>`});
            });
            const load = async () => {
                await page.goto('https://webssh.test/settings');
                await page.addScriptTag({path:path.resolve(__dirname, '../static/js/settings-center.js')});
                await page.evaluate(() => document.dispatchEvent(new Event('DOMContentLoaded')));
            };
            await load();
            const input = page.locator('#confirmRemoteClipboardInput');
            assert.equal(await input.isChecked(), true);
            page.once('dialog', async dialog => {
                assert.equal(dialog.type(), 'confirm');
                assert.match(dialog.message(), /understand and accept this risk/);
                await dialog.dismiss();
            });
            await input.click();
            assert.equal(await input.isChecked(), true);
            assert.equal(requests.length, 0);
            page.once('dialog', dialog => dialog.accept());
            await input.click();
            await page.waitForFunction(() => document.body.dataset.confirmRemoteClipboard === 'false');
            assert.deepEqual(requests.pop(), {confirm_remote_clipboard:false, accept_remote_clipboard_risk:true});
            await load();
            assert.equal(await input.isChecked(), false);
            await input.check();
            await page.waitForFunction(() => document.body.dataset.confirmRemoteClipboard === 'true');
            assert.deepEqual(requests.pop(), {confirm_remote_clipboard:true});
            fail = true;
            page.once('dialog', dialog => dialog.accept());
            await input.click();
            await page.waitForFunction(() => document.getElementById('settingsPreferenceStatus').textContent === 'Save failed');
            assert.equal(await input.isChecked(), true);
            assert.equal(await input.isDisabled(), false);
            assert.equal(await page.evaluate(() => document.body.dataset.confirmRemoteClipboard), 'true');
            console.log(`${name}: default, cancel, accept, reload, enable, failed-save rollback passed`);
        } finally { await browser.close(); }
    }
})().catch(error => {console.error(error); process.exit(1);});
