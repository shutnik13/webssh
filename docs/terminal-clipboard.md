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

## Remote tmux clipboard policy

Settings → Preferences → **Always confirm remote copying** is enabled by
default for both new and existing accounts. There are exactly two modes:

- Enabled: each live tmux OSC 52 request requires the visible Copy action.
- Disabled: every valid live tmux OSC 52 request is passed directly to the
  browser clipboard, even without a selection or focus in that terminal.

The disabled mode follows the direct write path used before upstream PR #199.
It has no gesture tracker, expiry timer or one-response authorization. Browser
clipboard permissions still apply; a rejected automatic write offers a manual
Copy action. Local xterm selection, Ctrl+C/V and right-click paste are unchanged.

Disabling requires the themed risk dialog: a remote session can overwrite the
clipboard at any time, including with malicious commands or text different from
what was selected. The explicit **Accept risk and disable** action accepts this
risk. Cancel, Escape, the close button and clicking outside leave the setting
enabled. A native HTML dialog manages modal focus and Escape; focus returns to
the preference switch when it closes. Existing theme colors, centered heading,
justified warning and equal action buttons are preserved.

The API requires `accept_remote_clipboard_risk: true` alongside
`confirm_remote_clipboard: false`; the acknowledgement is not stored separately.
Enabling requires no acknowledgement. The saved account preference is pushed
to connected workspaces and refreshed before output restoration on reconnect.

Both modes retain upstream OSC 52 decoding and the 128 KiB UTF-8 limit. Only live
persistent-tmux terminals can register the handler. Replay and ordinary SSH
output cannot write the clipboard. Invalid requests are ignored; disposal and
request revisions prevent stale asynchronous failures reopening old prompts.

```sh
node --test tests/js/terminal-clipboard-policy.test.js
node tests/selection-clipboard.cjs
node tests/clipboard-preference.cjs
```

Chromium/Firefox regressions check actual clipboard contents via native Ctrl+V,
repeated remote selections, requests without selection, local Shift selection,
and live preference changes. The settings regression covers all 10 themes,
keyboard navigation, every cancellation path, acceptance, reload and save errors.
