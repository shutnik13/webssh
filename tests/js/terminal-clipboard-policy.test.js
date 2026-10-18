const test = require('node:test');
const assert = require('node:assert/strict');

global.window = {addEventListener() {}};
const focus = {};
global.document = {activeElement: focus};
Object.defineProperty(global, 'navigator', {
    value: {userActivation: {isActive: true}}, configurable: true,
});
require('../../static/js/terminal-manager.js');
const manager = window.TerminalManager;
const payload = text => 'c;' + Buffer.from(text).toString('base64');
const flush = () => new Promise(resolve => setImmediate(resolve));

function fixture() {
    document.activeElement = focus;
    document.body = {dataset: {confirmRemoteClipboard: 'true'}};
    navigator.userActivation.isActive = true;
    const writes = [], prompts = [];
    let handler;
    const terminal = {
        element: {contains: node => node === focus},
        parser: {registerOscHandler(id, callback) {
            assert.equal(id, 52);
            handler = callback;
            return {dispose() {}};
        }},
    };
    manager.writeTextToClipboard = text => {writes.push(text); return Promise.resolve();};
    window.showNotification = presentation => {
        prompts.push(presentation);
        return () => presentation.onDismiss?.();
    };
    const disposable = manager.registerOsc52ClipboardHandler(terminal);
    return {terminal, writes, prompts, disposable, receive: text => handler(payload(text))};
}

for (const value of ['true', undefined, 'unexpected']) {
    test(`confirmation defaults to enabled (${value})`, async () => {
        const f = fixture();
        document.body.dataset.confirmRemoteClipboard = value;
        f.receive('requires approval');
        assert.deepEqual(f.writes, []);
        assert.equal(f.prompts.length, 1);
        f.prompts[0].action.onClick();
        await flush();
        assert.deepEqual(f.writes, ['requires approval']);
        f.disposable.dispose();
    });
}

test('disabled confirmation copies every live request without gesture bookkeeping', async () => {
    const f = fixture();
    manager.setRemoteClipboardConfirmation(false);
    document.activeElement = {};
    navigator.userActivation.isActive = false;
    f.receive('first remote request');
    f.receive('second remote request');
    await flush();
    assert.deepEqual(f.writes, ['first remote request', 'second remote request']);
    assert.equal(f.prompts.length, 0);
    f.disposable.dispose();
});

test('switching preference applies immediately in both directions', async () => {
    const f = fixture();
    f.receive('strict');
    assert.equal(f.prompts.length, 1);
    manager.setRemoteClipboardConfirmation(false);
    f.receive('automatic');
    await flush();
    assert.deepEqual(f.writes, ['automatic']);
    manager.setRemoteClipboardConfirmation(true);
    f.receive('strict again');
    assert.deepEqual(f.writes, ['automatic']);
    assert.equal(f.prompts.length, 2);
    f.disposable.dispose();
});

test('malformed updates do not disable confirmation', () => {
    const f = fixture();
    for (const value of [undefined, null, 'false', 0, {}, []]) {
        manager.setRemoteClipboardConfirmation(value);
        assert.equal(document.body.dataset.confirmRemoteClipboard, 'true');
    }
    f.disposable.dispose();
});

test('browser rejection still offers a manual Copy action', async () => {
    const f = fixture();
    manager.setRemoteClipboardConfirmation(false);
    manager.writeTextToClipboard = () => Promise.reject(new Error('denied'));
    f.receive('remote text');
    await flush();
    assert.equal(f.prompts.length, 1);
    manager.writeTextToClipboard = text => {f.writes.push(text); return Promise.resolve();};
    f.prompts[0].action.onClick();
    await flush();
    assert.deepEqual(f.writes, ['remote text']);
    f.disposable.dispose();
});

test('stale write failure cannot replace a newer clipboard request', async () => {
    const f = fixture();
    manager.setRemoteClipboardConfirmation(false);
    let reject;
    manager.writeTextToClipboard = () => new Promise((resolve, fail) => {reject = fail;});
    f.receive('older');
    manager.writeTextToClipboard = () => Promise.resolve();
    f.receive('newer');
    reject(new Error('denied'));
    await flush();
    assert.equal(f.prompts.length, 0);
    f.disposable.dispose();
});

test('disposing a terminal prevents a delayed error from reopening the prompt', async () => {
    const f = fixture();
    manager.setRemoteClipboardConfirmation(false);
    let reject;
    manager.writeTextToClipboard = () => new Promise((resolve, fail) => {reject = fail;});
    f.receive('remote');
    f.disposable.dispose();
    reject(new Error('denied'));
    await flush();
    assert.equal(f.prompts.length, 0);
});

test('invalid and oversized OSC52 requests never reach the clipboard', () => {
    const f = fixture();
    manager.setRemoteClipboardConfirmation(false);
    assert.equal(manager.decodeOsc52Clipboard('c;?'), null);
    assert.equal(manager.decodeOsc52Clipboard('p;' + Buffer.from('x').toString('base64')), null);
    f.receive('x'.repeat(128 * 1024 + 1));
    assert.deepEqual(f.writes, []);
    assert.deepEqual(f.prompts, []);
    f.disposable.dispose();
});
