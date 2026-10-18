const {chromium, firefox} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');

(async () => {
    for (const [name, engine] of [['Chromium', chromium], ['Firefox', firefox]]) {
        const browser = await engine.launch({headless: true});
        try {
            const page = await browser.newPage();
            await page.route('https://webssh.test/**', route => route.fulfill({contentType:'text/html', body:
                '<body data-confirm-remote-clipboard="false"><style>body{margin:24px}#term{width:800px;height:300px}</style><div id="term"></div><input id="probe">'}));
            await page.goto('https://webssh.test/');
            await page.addStyleTag({path:path.join(root, 'static/vendor/xterm/xterm.css')});
            await page.addScriptTag({path:path.join(root, 'static/vendor/xterm/xterm.js')});
            await page.addScriptTag({path:path.join(root, 'static/js/terminal-manager.js')});
            await page.evaluate(async () => {
                window.manager = TerminalManager;
                window.prompts = []; window.writes = []; window.remoteText = 'REMOTE_SELECTION_ONE';
                window.responseDelay = 100; window.respond = true;
                window.showNotification = notice => {
                    if (!notice?.action) return () => {};
                    prompts.push(notice);
                    const button = document.createElement('button');
                    button.id = 'approve-copy'; button.textContent = 'Copy';
                    button.onclick = () => {notice.action?.onClick(); button.remove(); notice.onDismiss?.();};
                    document.body.append(button);
                    return () => {button.remove(); notice.onDismiss?.();};
                };
                const write = navigator.clipboard.writeText.bind(navigator.clipboard);
                Object.defineProperty(navigator.clipboard, 'writeText', {configurable:true, value: text => {
                    writes.push(text);
                    return write(text);
                }});
                window.term = new Terminal({cols:80, rows:12, fontSize:16});
                manager.terminals.copyTest = term;
                manager.sessionTerminals.copySession = ['copyTest'];
                manager.attachTerminal('copySession', 'term', 'copyTest');
                await new Promise(resolve => setTimeout(resolve, 120));
                window.osc = manager.registerOsc52ClipboardHandler(term);
                window.sendCopy = text => new Promise(resolve => term.write('\x1b]52;c;' + btoa(text) + '\x07', resolve));
                term.onData(data => {
                    // A stand-in for tmux's network response to SGR mouse-up.
                    if (respond && /^\x1b\[<0;\d+;\d+m$/.test(data)) {
                        const text = remoteText;
                        setTimeout(() => sendCopy(text), responseDelay);
                    }
                });
                await new Promise(resolve => term.write('COPY_ME text\x1b[?1002h\x1b[?1006h', resolve));
            });
            const geometry = await page.evaluate(() => {
                const r = term.element.querySelector('.xterm-screen').getBoundingClientRect();
                return {x:r.x, y:r.y, ...term._core._renderService.dimensions.css.cell};
            });
            const drag = async shift => {
                if (shift) await page.keyboard.down('Shift');
                await page.mouse.move(geometry.x + geometry.width * .2, geometry.y + geometry.height * .5);
                await page.mouse.down();
                await page.mouse.move(geometry.x + geometry.width * 7.2, geometry.y + geometry.height * .5, {steps:8});
                await page.mouse.up();
                if (shift) await page.keyboard.up('Shift');
            };
            const clipboard = async () => {
                await page.locator('#probe').fill('');
                await page.locator('#probe').focus();
                await page.keyboard.press('Control+v');
                return page.locator('#probe').inputValue();
            };
            await drag(false);
            await page.waitForFunction(() => writes.length === 1 || prompts.length > 0);
            assert.deepEqual(await page.evaluate(() => writes), ['REMOTE_SELECTION_ONE']);
            assert.equal(await page.evaluate(() => prompts.length), 0);
            assert.equal(await clipboard(), 'REMOTE_SELECTION_ONE');
            await page.evaluate(() => {remoteText = 'REMOTE_SELECTION_TWO';});
            await drag(false);
            await page.waitForFunction(() => writes.length === 2 || prompts.length > 0);
            assert.equal(await page.evaluate(() => prompts.length), 0);
            assert.equal(await clipboard(), 'REMOTE_SELECTION_TWO');
            // Shift+drag retains xterm's local copy path, even with tmux mouse mode.
            await drag(true);
            await page.waitForFunction(() => writes.length === 3);
            assert.equal(await clipboard(), 'COPY_ME');
            assert.equal(await page.evaluate(() => prompts.length), 0);
            // Off means automatic live tmux writes even without a selection.
            await page.evaluate(() => sendCopy('WITHOUT_SELECTION'));
            await page.waitForFunction(() => writes.length === 4);
            assert.equal(await clipboard(), 'WITHOUT_SELECTION');
            assert.equal(await page.evaluate(() => prompts.length), 0);
            // Turning confirmation on affects this same terminal immediately.
            await page.evaluate(() => {
                manager.setRemoteClipboardConfirmation(true);
                remoteText = 'STRICT_SELECTION';
            });
            await drag(false);
            await page.waitForFunction(() => prompts.length === 1);
            assert.equal(await page.evaluate(() => writes.length), 4);
            await page.locator('#approve-copy').click();
            await page.waitForFunction(() => writes.length === 5);
            assert.equal(await clipboard(), 'STRICT_SELECTION');
            // On also requires approval for a request unrelated to selection.
            await page.evaluate(() => sendCopy('STRICT_REMOTE'));
            await page.waitForFunction(() => prompts.length === 2);
            assert.equal(await page.evaluate(() => writes.length), 5);
            // Turning it off dismisses the pending prompt on the next write.
            await page.evaluate(() => {
                manager.setRemoteClipboardConfirmation(false);
                remoteText = 'AUTOMATIC_AGAIN';
            });
            await drag(false);
            await page.waitForFunction(() => writes.length === 6);
            assert.equal(await clipboard(), 'AUTOMATIC_AGAIN');
            assert.equal(await page.locator('#approve-copy').count(), 0);
            console.log(`PASS ${name}: automatic tmux writes with and without selection; local Shift selection; enabling requires Copy; disabling applies without reload`);
        } finally {
            await browser.close();
        }
    }
})().catch(error => {console.error(error); process.exit(1);});
