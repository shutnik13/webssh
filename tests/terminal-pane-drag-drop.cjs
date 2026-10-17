const {chromium, firefox} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');

(async () => {
    for (const [name, engine] of [['Chromium', chromium], ['Firefox', firefox]]) {
        const browser = await engine.launch({headless: true});
        try {
            const page = await browser.newPage({viewport: {width: 1440, height: 1000}});
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            await page.setContent(`
                <div class="session-tabs-row"><div id="sessionTabs" class="session-tabs"></div></div>
                <div id="terminalsContainer" style="width:1200px;height:700px"><div id="terminalGrid"></div></div>
                <div id="outside" style="height:60px">Outside</div>
                <div id="dropUploadModal"><input id="dropUploadFileName"><input id="dropUploadPath"><p id="dropUploadTarget"></p></div>
            `);
            for (const css of ['style.css', 'terminal-appearance.css']) {
                await page.addStyleTag({path: path.join(root, 'static/css', css)});
            }
            await page.addStyleTag({path: path.join(root, 'static/vendor/xterm/xterm.css')});
            for (const js of ['xterm.js', 'xterm-addon-fit.js']) {
                await page.addScriptTag({path: path.join(root, 'static/vendor/xterm', js)});
            }
            for (const js of ['session-manager.js', 'drag-drop-manager.js']) {
                await page.addScriptTag({path: path.join(root, 'static/js', js)});
            }
            await page.evaluate(async () => {
                window.manager = SessionManager;
                window.terms = {}; window.wrappers = {}; window.fits = {}; window.input = []; window.emitted = [];
                window.socket = {connected: true, emit: (...args) => emitted.push(args)};
                window.TerminalManager = {
                    terminals: terms,
                    fitTerminal: id => fits[id].fit(),
                    scheduleFitAndSyncVisibleTerminals: options => { window.lastSync = options; },
                };
                manager.updateSessionMeta = () => {};
                manager.renderTabLabelContent = (label, id) => { label.textContent = id; };
                for (let i = 0; i < 4; i++) {
                    const id = `s${i}`;
                    const wrapper = document.createElement('div');
                    wrapper.id = `term-${i}`; wrapper.className = 'terminal-wrapper unassigned';
                    wrappers[id] = wrapper;
                    document.querySelector('#terminalsContainer').appendChild(wrapper);
                    manager.sessions[id] = {id, terminalId: wrapper.id, connected: true, username: 'test', host: id};
                    terms[id] = new Terminal({cols:80, rows:12});
                    fits[id] = new FitAddon.FitAddon(); terms[id].loadAddon(fits[id]); terms[id].open(wrapper);
                    terms[id].onData(data => input.push(data));
                    await new Promise(resolve => terms[id].write(`OUTPUT_${id}`, resolve));
                    manager.createSessionTab(id);
                }
                manager.initTabScrollAffordances();
                manager.applyPaneAssignments(3, ['s0', 's1', 's2']);
                window.fileDialogs = 0;
                window.ModalManager = {open: () => fileDialogs++, close() {}};
                window.files = new DragDropManager({sessionManager: manager}); files.init();
            });
            const pane = index => page.locator(`.terminal-pane[data-pane-index="${index}"]`);
            const drag = async (id, index) => {
                await page.locator(`#tab-${id} .tab-label`).dragTo(pane(index));
                assert.equal(await page.evaluate(() => manager.draggedSessionId), null);
                assert.equal(await page.locator('.session-pane-drop-target').count(), 0);
            };
            // Native mouse dragging must win over tab-strip scrolling.
            await drag('s0', 2);
            assert.deepEqual(await page.evaluate(() => manager.paneAssignments), ['s2', 's1', 's0']);
            assert.equal(await page.evaluate(() => manager.getActiveSession()), 's0');
            assert.equal(await page.evaluate(() => fileDialogs), 0);
            // Same pane is a no-op, and an unassigned session parks its target.
            await drag('s0', 2);
            await drag('s3', 1);
            assert.deepEqual(await page.evaluate(() => manager.paneAssignments), ['s2', 's3', 's0']);
            assert.equal(await page.evaluate(() => wrappers.s1.parentElement.id), 'terminalsContainer');
            // Exercise handlers installed by setSplitLayout as well as the modal path.
            await page.evaluate(() => manager.setSplitLayout(4));
            await drag('s0', 3);
            assert.deepEqual(await page.evaluate(() => manager.paneAssignments), ['s2', 's3', null, 's0']);
            const invalid = await page.evaluate(() => ({
                missing: manager.moveSessionToPane('missing', 0),
                negative: manager.moveSessionToPane('s0', -1),
                fractional: manager.moveSessionToPane('s0', 1.5),
                outside: manager.moveSessionToPane('s0', 4),
            }));
            assert.deepEqual(invalid, {missing:false, negative:false, fractional:false, outside:false});
            // Reject external/stale IDs and mismatched transfer payloads.
            const rejected = await page.evaluate(() => {
                const target = document.querySelector('.terminal-pane');
                const before = manager.paneAssignments.slice();
                for (const active of [null, 's0']) {
                    const data = new DataTransfer(); data.setData(manager.sessionDragMime, 's1');
                    manager.draggedSessionId = active;
                    target.dispatchEvent(new DragEvent('drop', {dataTransfer:data, bubbles:true, cancelable:true}));
                }
                manager.clearSessionDrag();
                return JSON.stringify(before) === JSON.stringify(manager.paneAssignments);
            });
            assert.equal(rejected, true);
            // Abandoned drag clears highlighting without moving a session.
            await page.locator('#tab-s0 .tab-label').dragTo(page.locator('#outside'));
            assert.equal(await page.evaluate(() => manager.draggedSessionId), null);
            assert.equal(await page.locator('.session-pane-drop-target').count(), 0);
            // Uploading a file still reaches the existing uploader, not the pane mover.
            const fileResult = await page.evaluate(() => {
                const target = document.querySelector('.terminal-pane[data-pane-index="0"]');
                const data = new DataTransfer(); data.items.add(new File(['test'], 'test.txt', {type:'text/plain'}));
                target.dispatchEvent(new DragEvent('drop', {dataTransfer:data, bubbles:true, cancelable:true}));
                return {dialogs:fileDialogs, name:document.querySelector('#dropUploadFileName').value};
            });
            assert.deepEqual(fileResult, {dialogs:1, name:'test.txt'});
            const preserved = await page.evaluate(() => ({
                buffers: Object.keys(terms).map(id => terms[id].buffer.active.getLine(0).translateToString(true)),
                wrappers: Object.keys(wrappers).every(id => document.getElementById(manager.sessions[id].terminalId) === wrappers[id]),
                input, emitted, count:Object.keys(manager.sessions).length,
                connected:Object.values(manager.sessions).every(session => session.connected),
                synchronized: lastSync.force && Object.keys(terms).every(id => lastSync.isConnected(id)),
            }));
            assert.deepEqual(preserved.buffers, ['OUTPUT_s0', 'OUTPUT_s1', 'OUTPUT_s2', 'OUTPUT_s3']);
            assert.equal(preserved.wrappers, true);
            assert.equal(preserved.connected, true);
            assert.equal(preserved.synchronized, true);
            assert.equal(preserved.count, 4);
            assert.deepEqual(preserved.input, []);
            assert.deepEqual(preserved.emitted, []);
            assert.deepEqual(errors, []);
            console.log(`PASS ${name}: native tab drag; swap, move, hidden session, cancel, invalid payload, file upload; xterm buffers and SSH sessions retained`);
        } finally {
            await browser.close();
        }
    }
})().catch(error => { console.error(error); process.exit(1); });
