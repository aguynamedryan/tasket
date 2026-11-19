# tasket

A basket of tasks. A small to-do list that runs entirely in your browser.

- Each row is a project. The order of the items in a row is their priority. Drag items to reorder them, within a row or into another row.
- Finish an item with ✓. It leaves the row and appears under "Recently finished", where you can reopen it.
- An item can have a fixed due date. Dated items are shown at the top of the page, soonest first, in strong colours.
- An item can wait on another item, in any project. It is dimmed until the item it waits on is finished.
- To make one item block another, drag it onto the middle of the other item. The target says "blocks this". Drop near a card's edge instead to move the item next to it.
- Each item shows how many days it has been open.

Click an item to edit its text, set a due date, or add a blocker. Double-click a project name to rename it. Drag it to reorder the projects, or hover over it and click ⤒ or ⤓ to send it to the top or the bottom.

## Your data

Your data never leaves your browser. tasket stores a log of events in the browser's IndexedDB, under the address the app is served from. A different browser, browser profile or address starts empty.

**Backup** downloads the whole event log as one JSON file. **Restore** replaces everything with a backup file. The corner of the page shows how long ago you made a backup.

## Install it as an app (do this first)

**Install tasket as an app.** It is the best way to use tasket, and it is the fix when your data is not safe.

In Chrome, click the install button at the right end of the address bar. You can also open the ⋮ menu and choose **Cast, save, and share → Install page as app…**. tasket then opens in its own window with its own icon, in the Dock and in your Applications folder. It keeps the same data as the browser tab.

## Keeping your data

The line at the bottom of the page says whether the browser treats tasket's storage as **persistent**. The browser never deletes persistent storage on its own. It can delete storage that is not persistent when the disk is nearly full.

Chrome never asks you about this. It decides for itself. **If the bottom line says NOT persistent, install tasket as an app** (see above). Then click **ask Chrome again** in the bottom line, or reopen tasket. Installing the app is what makes Chrome grant persistent storage.

If it still says NOT persistent after you install the app:

- Open `chrome://settings/content/siteData`. If Chrome deletes site data when you close all windows, add `https://aguynamedryan.github.io` to the sites that may always save data. That setting deletes tasket's data even when its storage is persistent.
- Do not use tasket in an Incognito or Guest window. Those windows delete everything when they close.

In every case, **Backup** is the second protection. The corner of the page turns red when your last backup is more than 7 days old.

## Development

No build step and no dependencies. You need Node.js 20 or later for the tests and the local server.

```sh
just test    # model tests (node --test)
just serve   # http://localhost:8737/
```

`model.js` turns the event log into state. It has no DOM, so the tests use it directly. `app.js` holds the IndexedDB storage and the UI.

## License

MIT
