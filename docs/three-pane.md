# Three-pane terminal layout

Branch: `feature/three-pane`.

The **3** button displays one terminal on the left at full height and two
terminals on the right. Existing session assignment, focus and switching
behavior is preserved. On mobile, the first pane remains visible, matching
the existing two- and four-pane behavior.

This branch is based directly on upstream and includes no clipboard changes.

## Validation

```sh
node --test tests/js/session-workspace.test.js tests/js/session-manager-close.test.js
npx playwright install chromium firefox
node tests/three-pane.cjs
```

The browser regression checks geometry, active session selection, retention
of sessions and output across 4→3→1→3 switches, and the mobile fallback.
Set `PLAYWRIGHT_MODULE` when Playwright is installed outside the repository.
