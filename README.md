# tasket

A basket of tasks. A small to-do list that runs entirely in your browser.

- Each row is a project. The order of the items in a row is their priority. Drag items to reorder them, within a row or into another row.
- Finish an item with ✓. It leaves the row and appears under "Recently finished", where you can reopen it.
- An item can have a fixed due date. Dated items are shown at the top of the page, soonest first, in strong colours.
- An item can wait on another item, in any project. It is dimmed until the item it waits on is finished.
- Each item shows how many days it has been open.

Click an item to edit its text, set a due date, or add a blocker. Double-click a project name to rename it, or drag it to reorder the projects.

## Your data

Your data never leaves your browser. tasket stores a log of events in the browser's IndexedDB, under the address the app is served from. A different browser, browser profile or address starts empty.

**Backup** downloads the whole event log as one JSON file. **Restore** replaces everything with a backup file. The corner of the page shows how long ago you made a backup.

## Development

No build step and no dependencies. You need Node.js 20 or later for the tests and the local server.

```sh
just test    # model tests (node --test)
just serve   # http://localhost:8737/
```

`model.js` turns the event log into state. It has no DOM, so the tests use it directly. `app.js` holds the IndexedDB storage and the UI.

## License

MIT
