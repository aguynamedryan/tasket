---
id: tasket-tht
title: How the Google Sheet gets into tasket
status: resolved
type: question
created_at: 2026-11-18T22:03:17.742656+00:00
updated_at: 2026-11-18T22:05:42.017714+00:00
resolved_at: 2026-11-18T22:05:42.017706+00:00
resolution: Sheet comes in as a backup file made by tools/sheet-to-backup.mjs and loaded with Restore; no import code in the app.
---

# Bringing the Google Sheet into tasket

The starting data is Ryan's Google Sheet: 27 project rows, about 30 items, 2 fixed dates. The sheet's public CSV export works without credentials (checked 2026-11-18, HTTP 200, text/csv).

The repo will probably be public (see \[[tasket-232]\]), so the data must not be committed. The proposal is an in-app import: Ryan pastes the CSV, or uploads the file, and the app turns each row into project and item events.

Not ruled. Directions:

- (a) Import the text only. Ryan sets the 2 fixed dates and the 1 blocker by hand after the import. This is the simplest option, and the numbers are small.
- (b) Also read due dates from the text, such as "(due 11-19)" or "(Thurs)". This takes more code for 2 items, and a weekday like "Thurs" is ambiguous.

Leaning (a).

RULED 2026-11-18: neither (a) nor (b). The app has NO sheet import. A converter outside the app turns the sheet into a backup file in the normal backup format. Ryan loads it with Restore, as if he were restoring from a backup. Ryan: "once app is built, use my sheet I have as a basis for the file I upload to the app to populate it as if I'm restoring from backup, yes?"

Consequences:

- The app needs only one way in: Restore. No CSV parser goes into the app.
- The converter is a small script in the repo, `tools/sheet-to-backup.mjs`. It reads a CSV and writes events with the same code that the app uses, so its output always matches the app's format. The script is public, and the sheet's data is not committed.
- The generated file can also carry the 2 fixed dates and the 1 blocker, so Ryan does not have to set them by hand.
