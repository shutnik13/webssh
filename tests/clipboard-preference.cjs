const {chromium, firefox} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const root = path.resolve(__dirname, '..');
const template = fs.readFileSync(path.join(root, 'templates/security.html'), 'utf8');
const dialog = template.slice(template.indexOf('    <div class="modal modal-small" id="clipboardRiskModal"'), template.indexOf('    <div class="modal modal-small" id="securityConfirmationModal"'));
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
                return route.fulfill({contentType:'text/html', body:`<body data-theme="glass" data-confirm-remote-clipboard="${enabled}"><input type="checkbox" id="confirmRemoteClipboardInput"><div id="settingsPreferenceStatus"></div>${dialog}</body>`});
            });
            const load = async () => {
                await page.goto('https://webssh.test/settings');
                for (const file of ['style.css', 'admin.css', 'webssh-2.css']) {
                    await page.addStyleTag({path:path.join(root, 'static/css', file)});
                }
                await page.addScriptTag({path:path.resolve(__dirname, '../static/js/settings-center.js')});
                await page.evaluate(() => document.dispatchEvent(new Event('DOMContentLoaded')));
            };
            await load();
            const input = page.locator('#confirmRemoteClipboardInput');
            assert.equal(await input.isChecked(), true);
            page.on('dialog', () => {throw new Error('Native browser dialog must not be used');});
            const modal = page.locator('#clipboardRiskModal');
            for (const theme of ['glass', 'retro', 'solar', 'paper', 'noir', 'arctic-ice', 'rose-gold', 'cyberpunk-neon', 'emerald-matrix', 'obsidian']) {
                await page.evaluate(theme => {document.body.dataset.theme = theme;}, theme);
                await input.click();
                await modal.waitFor({state:'visible'});
                assert.equal(await modal.getAttribute('aria-hidden'), 'false');
                assert.equal(await page.locator('#clipboardRiskCancel').evaluate(el => el === document.activeElement), true);
                const colors = await modal.locator('.modal-content').evaluate(el => {
                    const probe = document.createElement('div');
                    probe.style.background = 'var(--ws2-surface)'; el.append(probe);
                    const expected = getComputedStyle(probe).backgroundColor;
                    probe.remove();
                    return {actual:getComputedStyle(el).backgroundColor, expected};
                });
                assert.equal(colors.actual, colors.expected, theme);
                await page.keyboard.press('Tab');
                assert.equal(await page.locator('#clipboardRiskAccept').evaluate(el => el === document.activeElement), true);
                await page.keyboard.press('Tab');
                assert.equal(await page.locator('#clipboardRiskClose').evaluate(el => el === document.activeElement), true);
                await page.keyboard.press('Escape');
                await modal.waitFor({state:'hidden'});
                assert.equal(await input.isChecked(), true);
                assert.equal(await input.evaluate(el => el === document.activeElement), true);
            }
            for (const selector of ['#clipboardRiskCancel', '#clipboardRiskClose', '#clipboardRiskModal']) {
                await input.click();
                if (selector === '#clipboardRiskModal') await modal.click({position:{x:2,y:2}});
                else await page.locator(selector).click();
                await modal.waitFor({state:'hidden'});
                assert.equal(await input.isChecked(), true);
            }
            assert.equal(requests.length, 0);
            await input.click();
            await page.locator('#clipboardRiskAccept').click();
            await page.waitForFunction(() => document.body.dataset.confirmRemoteClipboard === 'false');
            assert.deepEqual(requests.pop(), {confirm_remote_clipboard:false, accept_remote_clipboard_risk:true});
            await load();
            assert.equal(await input.isChecked(), false);
            await input.check();
            await page.waitForFunction(() => document.body.dataset.confirmRemoteClipboard === 'true');
            assert.deepEqual(requests.pop(), {confirm_remote_clipboard:true});
            fail = true;
            await input.click();
            await page.locator('#clipboardRiskAccept').click();
            await page.waitForFunction(() => document.getElementById('settingsPreferenceStatus').textContent === 'Save failed');
            assert.equal(await input.isChecked(), true);
            assert.equal(await input.isDisabled(), false);
            assert.equal(await page.evaluate(() => document.body.dataset.confirmRemoteClipboard), 'true');
            console.log(`${name}: 10 themes, keyboard focus, Escape/cancel/close/backdrop, accept, reload, enable, failed-save rollback passed`);
        } finally { await browser.close(); }
    }
})().catch(error => {console.error(error); process.exit(1);});
