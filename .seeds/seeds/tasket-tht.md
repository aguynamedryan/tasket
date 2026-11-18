---
id: tasket-tht
title: How the Google Sheet gets into tasket
status: captured
type: question
created_at: 2026-11-18T22:03:17.742656+00:00
updated_at: 2026-11-18T22:03:26.655065+00:00
---

# Bringing the Google Sheet into tasket

The starting data is Ryan's Google Sheet: 27 project rows, about 30 items, 2 fixed dates. The sheet's public CSV export works without credentials (checked 2026-11-18, HTTP 200, text/csv).

The repo will probably be public (see \[[tasket-232]\]), so the data must not be committed. The proposal is an in-app import: Ryan pastes the CSV, or uploads the file, and the app turns each row into project and item events.

Not ruled. Directions:

- (a) Import the text only. Ryan sets the 2 fixed dates and the 1 blocker by hand after the import. This is the simplest option, and the numbers are small.
- (b) Also read due dates from the text, such as "(due 11-19)" or "(Thurs)". This takes more code for 2 items, and a weekday like "Thurs" is ambiguous.

Leaning (a).
