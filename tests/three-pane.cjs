// Standalone regression: PLAYWRIGHT_MODULE=/app/node_modules/playwright node tests/three-pane.cjs
const {chromium, firefox} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
(async () => {
    for (const [name, engine] of [['Chromium', chromium], ['Firefox', firefox]]) {
        const browser = await engine.launch({headless: true});
        try {
            const page = await browser.newPage({viewport: {width: 1440, height: 900}});
            await page.setContent('<div id="terminalsContainer" style="width:1200px;height:700px"><div id="terminalGrid"></div></div>');
            for (const css of ['style.css', 'terminal-appearance.css']) {
                await page.addStyleTag({path: path.join(root, 'static/css', css)});
            }
            await page.addScriptTag({path: path.join(root, 'static/js/session-manager.js')});
            const result = await page.evaluate(() => {
                window.TerminalManager = {fitTerminal() {}, scheduleFitAndSyncVisibleTerminals() {}};
                const manager = SessionManager;
                manager.updateSessionMeta = () => {};
                manager.focusActivePane = () => {};
                const wrappers = [];
                for (let i = 0; i < 4; i++) {
                    const wrapper = document.createElement('div');
                    wrapper.id = `term-${i}`;
                    wrapper.className = 'terminal-wrapper';
                    wrapper.textContent = `Persistent output ${i}`;
                    wrappers.push(wrapper);
                    document.querySelector('#terminalsContainer').appendChild(wrapper);
                    manager.sessions[`s${i}`] = {terminalId: wrapper.id, connected: true};
                }
                manager.setSplitLayout(4);
                manager.paneAssignments = ['s0', 's1', 's2', 's3'];
                for (let i = 0; i < 4; i++) manager.renderPane(i);
                manager.setActivePane(3);
                manager.setSplitLayout(3);
                const panes = [...document.querySelectorAll('.terminal-pane')];
                const rects = panes.map(pane => {
                    const r = pane.getBoundingClientRect();
                    return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};
                });
                panes[2].click();
                const active = manager.activeSessionId;
                const assignments = manager.paneAssignments.slice();
                const parked = wrappers[3].parentElement.id;
                manager.setSplitLayout(1);
                manager.setSplitLayout(3);
                return {rects, active, assignments, parked,
                    intact: wrappers.every((wrapper, i) => document.getElementById(`term-${i}`) === wrapper
                        && wrapper.textContent === `Persistent output ${i}`),
                    sessions: Object.keys(manager.sessions).length,
                    count: document.querySelectorAll('.terminal-pane').length};
            });
            const [left, top, bottom] = result.rects;
            assert.equal(result.count, 3);
            assert.equal(result.active, 's2');
            assert.deepEqual(result.assignments, ['s0', 's1', 's2']);
            assert.equal(result.parked, 'terminalsContainer');
            assert.equal(result.intact, true);
            assert.equal(result.sessions, 4);
            assert(left.width > 300 && top.width > 300 && bottom.width > 300);
            assert(Math.abs(left.y - top.y) < 1 && Math.abs(left.bottom - bottom.bottom) < 1);
            assert(Math.abs(top.x - bottom.x) < 1 && top.x >= left.right - 1);
            assert(bottom.y >= top.bottom - 1);
            assert(left.height > top.height * 1.9);
            await page.setViewportSize({width: 390, height: 844});
            const mobile = await page.locator('.terminal-pane').evaluateAll(panes =>
                panes.map(pane => getComputedStyle(pane).display !== 'none'));
            assert.deepEqual(mobile, [true, false, false]);
            console.log(`PASS ${name}: three-pane geometry, active session, 4→3→1→3 retains sessions and output, mobile fallback`);
        } finally {
            await browser.close();
        }
    }
})().catch(error => {console.error(error); process.exit(1);});
