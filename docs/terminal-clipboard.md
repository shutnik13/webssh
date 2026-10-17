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
