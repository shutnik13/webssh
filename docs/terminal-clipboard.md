# Terminal clipboard fixes

Branch: `fix/terminal-clipboard`.

Selecting terminal text with the mouse copies it. Right-click pastes through
`terminal.paste`, preserving bracketed paste. Shift+right-click keeps the
browser menu. Firefox can require native confirmation before clipboard reads.
Use Shift when selecting locally inside applications with mouse reporting.

Ctrl+C copies selected text and sends an interrupt when nothing is selected.
Ctrl+Shift+C never sends an interrupt. Ctrl+V/Ctrl+Shift+V use browser paste.
Physical key codes preserve these shortcuts in Russian keyboard layouts.
Mouse handlers remain installed through scrollbar setup and are removed when
the terminal is destroyed.

This branch is based directly on upstream and includes no three-pane layout.
When deploying its image, remove any older terminal-manager.js override so it
does not hide the changes included in the image.

## Validation

```sh
node --test tests/js/terminal-manager-layout.test.js tests/js/terminal-state-regressions.test.js tests/js/terminal-backpressure.test.js tests/js/terminal-tab-restore.test.js
npx playwright install chromium firefox
node tests/keyboard-clipboard.cjs
node tests/mouse-clipboard.cjs
```

The keyboard regression covers Chromium and Firefox. The mouse regression
uses Chromium's system clipboard and the complete `attachTerminal` lifecycle.
Set `PLAYWRIGHT_MODULE` when Playwright is installed outside the repository.

## Copying selections inside tmux

`fix/selection-clipboard` handles tmux's OSC 52 copy response after a real
mouse selection. Previously every tmux response displayed WebSSH's Copy
confirmation, while xterm's local selection copied immediately. This made
mouse copying behave differently depending on which application owned the mouse.

A trusted drag or double/triple click in a mouse-tracked terminal now permits
one copy response for that same focused terminal, within five seconds and
while browser user activation remains available. Local xterm selection keeps
its existing immediate copy behavior. With “Always confirm remote copying” disabled in Settings → Preferences, no
additional confirmation is needed for the matching tmux response.

The permission is consumed once and canceled when focus leaves the terminal,
the browser loses focus or handlers are disposed. Unsolicited, stale,
background and scripted requests retain the existing approval prompt. If the
browser rejects an automatic write, a clickable Copy prompt remains available.
A new deliberate selection supersedes an older pending prompt.

Additional validation:

```sh
node --test tests/js/terminal-clipboard-gesture.test.js
node tests/selection-clipboard.cjs
```

The browser test uses actual Chromium/Firefox clipboard writes and native
Ctrl+V to check clipboard contents. It covers repeated remote selections,
a delayed OSC 52 response, local Shift selection, double click, focus changes
and unsolicited/scripted requests. No clipboard permissions are bypassed.

## Account preference

Settings → Preferences → **Always confirm remote copying** is enabled by
default for both new and existing accounts. It requires the visible Copy action
for every live tmux OSC 52 response, including mouse selections. Local xterm
selection and keyboard shortcuts are unaffected.

Disabling it opens a risk confirmation: the remote server supplies the copied
text and could substitute content, including malicious commands, for what was
selected. Cancel leaves the setting enabled. The preference API requires
`accept_remote_clipboard_risk: true` alongside `confirm_remote_clipboard: false`;
the acknowledgement is not stored as a separate preference. Enabling requires
no acknowledgement. Choices are saved per account and apply when opening or
reloading the workspace. No browser clipboard permissions are changed.

Even when disabled, unrelated remote clipboard requests still require a Copy
click. The focused-terminal, trusted-gesture, expiry and one-response limits
above continue to apply.

```sh
node tests/clipboard-preference.cjs
```
