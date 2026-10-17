# Drag terminal tabs to panes

Drag a session tab by its **name** onto a terminal pane. The target pane is
highlighted while dragging. Dropping on an empty pane moves the session;
dropping on an occupied pane swaps the two displayed sessions.

Dragging an unassigned tab onto an occupied pane displays that session there
and leaves the previous session running in its tab. Dropping onto the same
pane or outside the workspace leaves the layout unchanged.

Existing terminal instances and output are preserved. Both affected terminals
are fitted and their remote dimensions are synchronized after the move. No
connection is created, reconnected or closed. Other panels keep their current
state. Renaming and the reconnect/close buttons retain their existing actions.

Mouse dragging a live tab is reserved for moving sessions. Wheel scrolling,
dragging the empty tab strip, and touch scrolling remain available. File
upload drops are handled separately. Terminal selection is unchanged.

Validation:

```sh
node tests/terminal-pane-drag-drop.cjs
node --test tests/js/session-manager-close.test.js tests/js/session-workspace.test.js tests/js/terminal-manager-layout.test.js tests/js/terminal-tab-restore.test.js
```

The browser test uses native mouse drag-and-drop in Chromium and Firefox,
real xterm instances, both layout creation paths, occupied/empty targets,
hidden sessions, canceled and invalid transfers, and the existing file upload
handler. It checks that output, terminal elements and session state survive,
without terminal input or reconnect/disconnect requests. Set `PLAYWRIGHT_MODULE` when
Playwright is installed outside the repository.
