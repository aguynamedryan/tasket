---
id: tasket-lu1
title: 'Storage: browser-only IndexedDB event log with JSON backup'
status: captured
type: decision
created_at: 2026-11-18T22:03:16.536499+00:00
updated_at: 2026-11-18T22:03:16.536499+00:00
---

# Storage: browser-only, an event log in IndexedDB, with file backup

## Ruled 2026-11-18

Ryan asked: "I'm actually wondering if you implement this completely as a browser-based app that uses something like a browser's native SQLite to store events and just allow me to do a backup to it or backup of it if and when I need to."

The ruling is yes, with these corrections and details:

- Browsers no longer have a built-in SQLite. WebSQL was removed. The built-in browser database is IndexedDB. SQLite can run in a browser as a WebAssembly library on OPFS, but a list of a few hundred items does not need it. Use IndexedDB with no library.
- Store events, not state. Examples: project added, item added, item moved, item edited, item finished, item reopened, due date set, blocker added, blocker removed. The app calculates the current grid from the events. This also gives a full history and makes undo simple.
- A backup is a download of all events as one JSON file. A restore loads that file.

## Hazards, told to Ryan

- The data belongs to one browser profile on one machine at one exact origin (scheme, host and port). A different browser, profile or origin shows an empty app.
- A browser can delete site data. Safari can delete it after 7 days with no visit. Ryan uses Chrome (or a Chromium browser), which keeps it unless the disk is nearly full.
- Mitigations: call `navigator.storage.persist()` at start. Show "last backup: N days ago" in a corner of the page. This text is not a notification. Ryan does not want notifications.
