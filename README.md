# tasket

A basket of tasks. A small to-do list that runs entirely in your browser.

- Each row is a project. The order of the items in a row is their priority. Drag items to reorder them, within a row or into another row.
- Finish an item with ✓. It leaves the row and appears under "Recently finished", where you can reopen it.
- An item can have a fixed due date. Dated items are shown at the top of the page, soonest first, in strong colours.
- An item can wait on another item, in any project. It is dimmed until the item it waits on is finished.
- To make one item block another, drag it onto the middle of the other item. The target says "blocks this". Drop near a card's edge instead to move the item next to it.
- Each item shows how many days it has been open.

Click an item to edit its text, set a due date, or add a blocker. Double-click a project name to rename it. Drag it to reorder the projects, or hover over it and click ⤒ or ⤓ to send it to the top or the bottom.

## Epics

An epic is a row that collects related tasks from any project. Add one with **Add epic** below the grid.

- **Rows.** An epic row shows its open tasks, then its finished tasks, dimmed, with a **Reopen** button. The row header counts progress, such as "7 of 12 done". A long epic wraps onto more lines. Rename, delete and reorder an epic in the same way as a project.
- **Aliases.** Drag a task from a project into an epic row to add a linked copy, called an alias. The task stays in its project with the same priority, and the alias shows the project name. Reordering the epic does not change the project. Hover over an alias and click × to remove it from the epic. A task that you type into the epic's + cell belongs to the epic and has no project. Drag it to a project row to give it one, and it stays in the epic as an alias. You cannot drag an alias into a project row.
- **Colors.** Each epic has a color. Click the swatch in its header to change it. A task in an epic has a border in that color, on every card that shows the task. A due date stays the innermost border, so a dated task keeps its due color.
- **Multiple epics.** A task can be in several epics. Drag it to another epic row, or use **Add to an epic** in the item editor. A card has room for 3 borders. A "+1" badge counts any epics that do not fit.

Deleting an epic also deletes the tasks that belong to it. Linked tasks stay in their projects.

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
