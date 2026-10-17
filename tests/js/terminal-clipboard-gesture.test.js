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

test('a recent selection gesture authorizes exactly one OSC 52 response', async () => {
    const f = fixture();
    manager.remoteClipboardGestures.set(f.terminal, Date.now() + 5000);
    f.receive('selected text');
    await flush();
    assert.deepEqual(f.writes, ['selected text']);
    assert.equal(f.prompts.length, 0);
    f.receive('unrequested second write');
    assert.deepEqual(f.writes, ['selected text']);
    assert.equal(f.prompts.length, 1);
    f.disposable.dispose();
});

for (const condition of ['missing', 'expired', 'different terminal', 'focus moved', 'activation expired']) {
    test(`OSC 52 still requires approval when gesture is ${condition}`, () => {
        const f = fixture();
        if (condition !== 'missing') {
            manager.remoteClipboardGestures.set(condition === 'different terminal' ? {} : f.terminal,
                Date.now() + (condition === 'expired' ? -1 : 5000));
        }
        if (condition === 'focus moved') document.activeElement = {};
        if (condition === 'activation expired') navigator.userActivation.isActive = false;
        f.receive('needs approval');
        assert.deepEqual(f.writes, []);
        assert.equal(f.prompts.length, 1);
        f.disposable.dispose();
    });
}

test('browser write rejection falls back to a clickable copy prompt', async () => {
    const f = fixture();
    manager.writeTextToClipboard = () => Promise.reject(new Error('denied'));
    manager.remoteClipboardGestures.set(f.terminal, Date.now() + 5000);
    f.receive('selected text');
    await flush();
    assert.equal(f.prompts.length, 1);
    assert.equal(typeof f.prompts[0].action.onClick, 'function');
    f.disposable.dispose();
});

test('a rejected write cannot create a new prompt after terminal disposal', async () => {
    const f = fixture();
    let reject;
    manager.writeTextToClipboard = () => new Promise((resolve, rejectWrite) => {reject = rejectWrite;});
    manager.remoteClipboardGestures.set(f.terminal, Date.now() + 5000);
    f.receive('selected text');
    f.disposable.dispose();
    reject(new Error('denied'));
    await flush();
    assert.equal(f.prompts.length, 0);
});
