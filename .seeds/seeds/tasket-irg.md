---
id: tasket-irg
title: 'Usage tracking: count visits without exposing task data'
status: captured
type: exploration
created_at: 2026-11-23T16:12:14.506627+00:00
updated_at: 2026-11-23T16:12:14.506627+00:00
---

# Usage tracking: count visits without exposing task data

## Why

Ryan, 2026-11-23: "we might have other users eventually. is it possible to use plausible or something like it as a free account? does github track stuff for me?"

Ryan, 2026-11-23: "file discussion on tracking as a seed with goatcounter favored"

## What GitHub provides

GitHub's repository traffic data covers visits to the repository page for 14 days. It did not show visits to the GitHub Pages site during Ryan's own use of the site. GitHub's documentation does not state this exclusion directly, so this is an inference from the repository's traffic data.

## Options checked on 2026-11-23

- **GoatCounter (favored).** The hosted service is "offered for free for reasonable public usage". It says a personal website or a small-to-medium business is fine. It uses no cookies. Its terms do not allow accounts registered through automated means, so Ryan must create the account.
- **Plausible.** It has no permanent free hosted plan, only a 30-day trial. The free Community Edition needs a server that we would run.
- **Cloudflare Web Analytics.** It is free and needs no proxy, but it needs Cloudflare's script on the page.

## The main constraint

A third-party script on the page can read the page's IndexedDB, which holds each user's tasks. So tasket should not load a third-party analytics script.

GoatCounter documents a plain image request:

```html
<img src="https://MYCODE.goatcounter.com/count?p=/test">
```

An image request cannot read the page's data. A few lines in `app.js` can build this request and add the `r` parameter from `document.referrer`, so the count shows where visitors came from. The request must send no task text.

## Known limits of the image request

- GoatCounter says the image request may increase bot counts, because bots are harder to filter without its script.
- A plain image does not record the referrer or screen size unless the URL includes them.
- It is not confirmed that the image request counts unique visitors. Test this before reporting unique visitors.
- No method can show how many people actively use tasket, because their data stays in their browsers.

## Before this is built

- Ryan creates a free GoatCounter account and supplies the site code.
- The README states what is counted.
- GoatCounter's terms make the site owner responsible for local data-collection laws such as GDPR.

Not ruled. GoatCounter through an image request is the favored direction.

Sources:

- https://www.goatcounter.com/help/pixel
- https://www.goatcounter.com/help/terms
- https://plausible.io/docs/self-hosting
- https://developers.cloudflare.com/web-analytics/about/
- https://docs.github.com/en/repositories/viewing-activity-and-data-for-your-repository/viewing-traffic-to-a-repository
