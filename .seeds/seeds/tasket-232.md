---
id: tasket-232
title: 'Hosting: GitHub Pages, opened in Chrome'
status: captured
type: decision
created_at: 2026-11-18T22:03:16.921218+00:00
updated_at: 2026-11-18T22:05:41.223873+00:00
relationships:
  - target_id: tasket-xc4
    rel_type: questioned-by
    created_at: 2026-11-18T22:03:27.129240+00:00
---

# Hosting: GitHub Pages, opened in Chrome

## Ruled 2026-11-18

Three options were offered: a localhost server on the Mac started by launchd, an HTML file opened directly from disk, and GitHub Pages. Ryan chose GitHub Pages. He uses Chrome or a Chromium browser on the Mac.

## Consequences

- The app must be static files with no build step and no server.
- The GitHub Pages address is the origin, so the data lives under it. Each device and browser has its own separate data. Moving the app to another address leaves the data behind, so a move needs an export and an import.
- On 2026-11-18, `gh api user` reported the `free` plan. On the free plan, GitHub Pages serves only PUBLIC repos. So the tasket repo would be public. Its seeds, its beads and its git history would be public too.
- No to-do data may go into the repo. The Google Sheet's contents come into the app through an in-app import, not through a committed file.
- Run `gitleaks` before the repo is made public.
- Nothing has been pushed. Ryan decides when to create the GitHub repo and push.

RULED 2026-11-18: the repo is public, under the GitHub account aguynamedryan, with the MIT license. Ryan: "public is fine, license is MIT, repo under aguynamedryan".

UPDATE 2026-11-18: the sheet does not come in through a CSV import in the app. It comes in through Restore, as a backup file made from the sheet. See \[[tasket-tht]\].
