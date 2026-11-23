// tasket browser app: IndexedDB event storage and the UI.
import * as M from "./model.js";

// --- storage ---------------------------------------------------------------

const DB_NAME = "tasket";
const STORE = "events";
const LAST_BACKUP_KEY = "tasket.lastBackupAt";
const HIDE_EMPTY_KEY = "tasket.hideEmpty";
const TOOLTIPS_KEY = "tasket.tooltips"; // "0" = off; on by default

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { autoIncrement: true });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

// The highest IndexedDB key this tab has seen, or null for an empty store.
// Keys only grow, even after clear(), so a different highest key means that
// another tab wrote to the log or restored a backup.
let lastKey = null;

const keyOf = (cursor) => cursor?.primaryKey ?? null;

class StaleTabError extends Error {
  constructor() {
    super("tasket changed in another tab. Reload this tab. Your last change was not saved.");
    this.name = "StaleTabError";
  }
}

class UnloadableLogError extends Error {
  constructor(cause, log) {
    const index = cause.detail?.index;
    const where = index == null ? "One event" : `Event ${index + 1} of ${log.length} (${log[index]?.type})`;
    super(`tasket cannot show your data. ${where} failed: ${cause.message}. ` +
      "Your events are still stored. Backup and Restore still work.", { cause });
    this.name = "UnloadableLogError";
  }
}

async function loadEvents(db) {
  const tx = db.transaction(STORE, "readonly");
  const store = tx.objectStore(STORE);
  const all = store.getAll(); // key order = append order
  const head = store.openKeyCursor(null, "prev");
  await txDone(tx);
  return { events: all.result, lastKey: keyOf(head.result) };
}

// Check and add in one transaction, so no other tab can write between them.
// The adds run in the cursor's success handler to keep the transaction active.
async function appendEvents(db, newEvents) {
  const tx = db.transaction(STORE, "readwrite");
  const store = tx.objectStore(STORE);
  const done = txDone(tx);
  let stale = false;
  store.openKeyCursor(null, "prev").onsuccess = (e) => {
    if (keyOf(e.target.result) !== lastKey) {
      stale = true;
      tx.abort();
      return;
    }
    let last;
    for (const event of newEvents) last = store.add(event);
    // Set here, not after commit, so a second emit from this tab passes the check.
    last.onsuccess = () => { lastKey = last.result; };
  };
  try {
    await done;
  } catch (err) {
    throw stale ? new StaleTabError() : err;
  }
}

async function replaceEvents(db, newEvents) {
  const tx = db.transaction(STORE, "readwrite");
  const store = tx.objectStore(STORE);
  store.clear();
  for (const e of newEvents) store.add(e);
  const head = store.openKeyCursor(null, "prev");
  await txDone(tx);
  lastKey = keyOf(head.result);
}

// --- app state -------------------------------------------------------------

let db;
let events = [];
let state = M.emptyState();

// Apply first (so a bad event never reaches storage), then store.
async function emit(...newEvents) {
  await ready;
  const next = M.replay([...events, ...newEvents]);
  await appendEvents(db, newEvents);
  events.push(...newEvents);
  state = next;
  render();
}

const ev = (type, payload) => M.makeEvent(type, payload);

function showError(err) {
  const box = document.getElementById("error");
  box.textContent = `${err.message}`;
  box.hidden = false;
  console.error(err);
}

window.addEventListener("unhandledrejection", (e) => showError(e.reason));
window.addEventListener("error", (e) => showError(e.error ?? e));

// --- DOM helper ------------------------------------------------------------

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "title" && localStorage.getItem(TOOLTIPS_KEY) === "0") continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "dataset") Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c);
  return el;
}

const projectName = (id) => state.projects.get(id)?.name ?? "?";
const today = () => M.localDate();

function dueClass(due) {
  const n = M.daysUntil(due, today());
  if (n < 0) return "due-overdue";
  if (n === 0) return "due-today";
  if (n === 1) return "due-tomorrow";
  if (n <= 7) return "due-week";
  return "due-later";
}

// --- render ----------------------------------------------------------------

function render() {
  renderDated();
  renderGrid();
  renderFinished();
  renderStatus();
}

function renderDated() {
  const box = document.getElementById("dated");
  const dated = M.datedItems(state);
  box.replaceChildren(
    ...dated.map((it) =>
      h("button", { class: `dated-item ${dueClass(it.due)}`, onclick: () => openEditor(it.id) },
        h("span", { class: "dated-when" }, M.dueLabel(it.due, today()), " · ", it.due),
        h("span", { class: "dated-what" }, h("b", {}, projectName(it.projectId)), " ", it.text),
        M.isBlocked(state, it.id) ? h("span", { class: "dated-blocked" }, "blocked") : null,
      )),
  );
  box.hidden = dated.length === 0;
}

function renderGrid() {
  const hideEmpty = localStorage.getItem(HIDE_EMPTY_KEY) === "1";
  const projects = state.projectOrder
    .map((id) => state.projects.get(id))
    .filter((p) => !hideEmpty || p.itemIds.length > 0);
  const grid = document.getElementById("grid");
  grid.replaceChildren(...projects.map(renderRow));
  // Columns: the fullest row's items, plus its "+" cell.
  grid.dataset.columns = Math.max(1, ...projects.map((p) => p.itemIds.length + 1));
  sizeColumns();
}

// Split the grid's free width evenly across the columns, but never make a
// column narrower than MIN_CELL_REM; below that the grid scrolls sideways.
const MIN_CELL_REM = 12;
const PROJECT_COLUMN_REM = 13;

function sizeColumns() {
  const grid = document.getElementById("grid");
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
  const free = grid.clientWidth - PROJECT_COLUMN_REM * rem;
  const cell = Math.max(MIN_CELL_REM * rem, Math.floor(free / Number(grid.dataset.columns || 1)));
  grid.style.setProperty("--cell", `${cell}px`);
}

window.addEventListener("resize", sizeColumns);

function renderRow(p) {
  const cards = p.itemIds.map((id, i) => renderCard(state.items.get(id), i));
  const adder = h("form", { class: "add-item", onsubmit: (e) => {
    e.preventDefault();
    const input = e.target.elements.text;
    const text = input.value.trim();
    if (!text) return;
    focusAfterRender = `add-${p.id}`;
    emit(ev("item.added", { itemId: M.newId(), projectId: p.id, text }));
  } }, h("input", { name: "text", placeholder: "+", autocomplete: "off", id: `add-${p.id}` }));

  const items = h("div", { class: "items", dataset: { projectId: p.id } }, cards, adder);
  items.addEventListener("dragover", (e) => onItemDragOver(e, p.id));
  items.addEventListener("dragleave", clearDropMarks);
  items.addEventListener("drop", (e) => onItemDrop(e, p.id));

  const name = h("div", { class: "project", draggable: "true", title: "Drag to reorder. Double-click to rename." },
    h("span", { class: "grip" }, "⋮⋮"), h("span", { class: "project-name" }, p.name),
    h("button", { class: "to-top", title: "Send this project to the top", onclick: (e) => {
      e.stopPropagation();
      if (state.projectOrder[0] !== p.id) emit(ev("project.moved", { projectId: p.id, index: 0 }));
    } }, "⤒"),
    h("button", { class: "to-bottom", title: "Send this project to the bottom", onclick: (e) => {
      e.stopPropagation();
      if (state.projectOrder.at(-1) !== p.id)
        emit(ev("project.moved", { projectId: p.id, index: state.projectOrder.length }));
    } }, "⤓"));
  name.addEventListener("dblclick", () => renameProject(p));
  name.addEventListener("dragstart", (e) => { drag = { kind: "project", id: p.id }; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", p.name); });
  name.addEventListener("dragend", endDrag);

  const row = h("div", { class: "row", dataset: { projectId: p.id } }, name, items);
  row.addEventListener("dragover", (e) => onProjectDragOver(e, row));
  row.addEventListener("drop", (e) => onProjectDrop(e, p.id, row));
  return row;
}

function renderCard(it, index) {
  const blockers = M.blockersOf(state, it.id);
  const blocking = M.blockedBy(state, it.id).filter((b) => b.finishedAt == null);
  const cls = ["card"];
  if (index === 0) cls.push("first");
  if (blockers.length) cls.push("blocked");
  if (it.due) cls.push("dated", dueClass(it.due));

  const card = h("div", { class: cls.join(" "), draggable: "true", dataset: { itemId: it.id }, onclick: () => openEditor(it.id) },
    h("div", { class: "card-text" }, it.text),
    it.due ? h("div", { class: "badge due" }, M.dueLabel(it.due, today())) : null,
    blockers.length ? h("div", { class: "badge waits" }, "waiting on: ",
      blockers.map((b) => `${projectName(b.projectId)} · ${b.text}`).join("; ")) : null,
    blocking.length ? h("div", { class: "badge blocks" }, `blocks ${blocking.length}`) : null,
    h("div", { class: "age", title: `open for ${M.ageDays(it, today())} days` }, `${M.ageDays(it, today())}d`),
    h("button", { class: "finish", title: "Finish", onclick: (e) => { e.stopPropagation(); emit(ev("item.finished", { itemId: it.id })); } }, "✓"),
  );
  card.addEventListener("dragstart", (e) => {
    drag = { kind: "item", id: it.id };
    e.dataTransfer.effectAllowed = "linkMove"; // move = reorder, link = make a blocker
    e.dataTransfer.setData("text/plain", it.text);
    card.classList.add("dragging");
  });
  card.addEventListener("dragend", endDrag);
  return card;
}

function renderFinished() {
  const list = document.querySelector("#finished ul");
  list.replaceChildren(...M.recentlyFinished(state).map((it) =>
    h("li", {},
      h("span", {}, h("b", {}, projectName(it.projectId)), " ", it.text),
      h("button", { onclick: () => emit(ev("item.reopened", { itemId: it.id })) }, "Reopen"))));
}

function renderStatus() {
  const last = localStorage.getItem(LAST_BACKUP_KEY);
  const age = document.getElementById("backup-age");
  if (!last) {
    age.textContent = "last backup: never";
    age.className = "backup-age stale";
  } else {
    const days = M.daysUntil(today(), M.localDate(new Date(last)));
    age.textContent = `last backup: ${days === 0 ? "today" : days === 1 ? "1 day ago" : `${days} days ago`}`;
    age.className = `backup-age${days > 7 ? " stale" : ""}`;
  }
  const counts = `${state.projects.size} projects · ${[...state.items.values()].filter((i) => i.finishedAt == null).length} open items · ${events.length} events · `;
  document.getElementById("status").replaceChildren(counts, persisted
    ? "storage: persistent"
    : h("span", { class: "not-persistent" }, "storage: NOT persistent. Fix: ",
        h("a", { href: PERSIST_HELP, target: "_blank", rel: "noopener" }, "install tasket as an app"),
        ", then ", h("button", { class: "link", onclick: requestPersist }, "ask Chrome again")));
  if (focusAfterRender) {
    document.getElementById(focusAfterRender)?.focus();
    focusAfterRender = null;
  }
}

let focusAfterRender = null;
let persisted = false;
const PERSIST_HELP = "https://github.com/aguynamedryan/tasket#install-it-as-an-app-do-this-first";

// Chrome never prompts; it grants or refuses on its own, so asking again
// after installing or bookmarking the app can change the answer.
async function requestPersist() {
  persisted = (await navigator.storage?.persist?.()) ?? false;
  render();
}

// --- drag and drop ---------------------------------------------------------

let drag = null;

const DROP_MARKS = ["drop-before", "drop-after", "drop-end", "drop-block", "drop-refused"];

function clearDropMarks() {
  for (const el of document.querySelectorAll(DROP_MARKS.map((c) => `.${c}`).join(", "))) {
    el.classList.remove(...DROP_MARKS);
    delete el.dataset.dropLabel;
  }
}

function endDrag() {
  drag = null;
  clearDropMarks();
  for (const el of document.querySelectorAll(".dragging")) el.classList.remove("dragging");
}

// The middle half of a card is the "blocks this" zone. Its outer quarters,
// and the gaps between cards, place the dragged item in the row.
const BLOCK_ZONE = [0.25, 0.75];

// Where would the dragged item land?
// Returns { block: card } to make the dragged item block that card's item,
// or { index, card, after } to move it to that position in the row.
function itemDropTarget(e, projectId) {
  const cards = [...document.querySelectorAll(`.items[data-project-id="${projectId}"] .card`)]
    .filter((c) => c.dataset.itemId !== drag.id);
  for (let i = 0; i < cards.length; i++) {
    const r = cards[i].getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (inside) {
      const frac = (e.clientX - r.left) / r.width;
      if (frac > BLOCK_ZONE[0] && frac < BLOCK_ZONE[1]) return { block: cards[i] };
      return frac <= BLOCK_ZONE[0]
        ? { index: i, card: cards[i], after: false }
        : { index: i + 1, card: cards[i], after: true };
    }
    const sameLine = e.clientY >= r.top && e.clientY <= r.bottom;
    if ((sameLine && e.clientX < r.left) || e.clientY < r.top)
      return { index: i, card: cards[i], after: false };
  }
  return { index: cards.length, card: cards.at(-1), after: true };
}

// Why the dragged item cannot block this one, or null if it can.
function blockRefusal(blockerId, blockedId) {
  if (state.blocks.has(`${blockerId}>${blockedId}`)) return "already blocks this";
  if (M.wouldCycle(state, blockerId, blockedId)) return "would make a loop";
  return null;
}

function onItemDragOver(e, projectId) {
  if (drag?.kind !== "item") return;
  e.preventDefault();
  e.stopPropagation();
  clearDropMarks();
  const t = itemDropTarget(e, projectId);
  if (t.block) {
    const refusal = blockRefusal(drag.id, t.block.dataset.itemId);
    t.block.classList.add(refusal ? "drop-refused" : "drop-block");
    t.block.dataset.dropLabel = refusal ?? "blocks this";
    e.dataTransfer.dropEffect = refusal ? "none" : "link";
  } else {
    e.dataTransfer.dropEffect = "move";
    if (t.card) t.card.classList.add(t.after ? "drop-after" : "drop-before");
    else e.currentTarget.classList.add("drop-end");
  }
}

function onItemDrop(e, projectId) {
  if (drag?.kind !== "item") return;
  e.preventDefault();
  e.stopPropagation();
  const t = itemDropTarget(e, projectId);
  const id = drag.id;
  endDrag();
  if (t.block) {
    const blockedId = t.block.dataset.itemId;
    if (!blockRefusal(id, blockedId)) emit(ev("block.added", { blockerId: id, blockedId }));
    return;
  }
  const it = state.items.get(id);
  const current = state.projects.get(it.projectId).itemIds.indexOf(it.id);
  if (it.projectId === projectId && current === t.index) return;
  emit(ev("item.moved", { itemId: id, projectId, index: t.index }));
}

function projectDropIndex(e, row) {
  const r = row.getBoundingClientRect();
  const after = e.clientY > r.top + r.height / 2;
  const order = state.projectOrder.filter((id) => id !== drag.id);
  const i = order.indexOf(row.dataset.projectId);
  return { index: after ? i + 1 : i, after };
}

function onProjectDragOver(e, row) {
  if (drag?.kind !== "project") return;
  e.preventDefault();
  clearDropMarks();
  if (row.dataset.projectId === drag.id) return;
  row.classList.add(projectDropIndex(e, row).after ? "drop-after" : "drop-before");
}

function onProjectDrop(e, targetId, row) {
  if (drag?.kind !== "project") return;
  e.preventDefault();
  const id = drag.id;
  if (targetId === id) return endDrag();
  const { index } = projectDropIndex(e, row);
  endDrag();
  emit(ev("project.moved", { projectId: id, index }));
}

// --- editing ---------------------------------------------------------------

function renameProject(p) {
  const name = prompt("Project name (leave empty to delete the project)", p.name);
  if (name == null) return;
  if (name.trim() === "") {
    if (confirm(`Delete project "${p.name}" and its ${p.itemIds.length} open items?`))
      emit(ev("project.removed", { projectId: p.id }));
    return;
  }
  if (name.trim() !== p.name) emit(ev("project.renamed", { projectId: p.id, name }));
}

const dialog = document.getElementById("editor");
const form = dialog.querySelector("form");
let editingId = null;

function openEditor(itemId) {
  editingId = itemId;
  const it = state.items.get(itemId);
  form.elements.text.value = it.text;
  form.elements.due.value = it.due ?? "";
  fillBlockLists();
  dialog.returnValue = "";
  dialog.showModal();
}

function fillBlockLists() {
  const it = state.items.get(editingId);
  const entry = (other, remove) => h("li", {},
    `${projectName(other.projectId)} · ${other.text}${other.finishedAt ? " (finished)" : ""} `,
    h("button", { type: "button", class: "link", onclick: () => remove().then(fillBlockLists) }, "remove"));

  const blockerIds = [...state.blocks.values()].filter((b) => b.blockedId === it.id).map((b) => b.blockerId);
  form.querySelector('[data-list="blockers"]').replaceChildren(
    ...blockerIds.map((id) => entry(state.items.get(id),
      () => emit(ev("block.removed", { blockerId: id, blockedId: it.id })))));
  form.querySelector('[data-list="blocking"]').replaceChildren(
    ...M.blockedBy(state, it.id).map((other) => entry(other,
      () => emit(ev("block.removed", { blockerId: it.id, blockedId: other.id })))));

  const select = form.elements["add-blocker"];
  const options = [h("option", { value: "" }, "— choose an item —")];
  for (const pid of state.projectOrder) {
    const p = state.projects.get(pid);
    const choices = p.itemIds.filter((id) => id !== it.id && !blockerIds.includes(id) && !M.wouldCycle(state, id, it.id));
    if (choices.length) options.push(h("optgroup", { label: p.name },
      choices.map((id) => h("option", { value: id }, state.items.get(id).text))));
  }
  select.replaceChildren(...options);
}

form.elements["add-blocker"].addEventListener("change", (e) => {
  const blockerId = e.target.value;
  if (!blockerId) return;
  emit(ev("block.added", { blockerId, blockedId: editingId })).then(fillBlockLists);
});

form.querySelector('[data-act="clear-due"]').addEventListener("click", () => { form.elements.due.value = ""; });
form.querySelector('[data-act="finish"]').addEventListener("click", () => {
  dialog.close("finish");
  emit(ev("item.finished", { itemId: editingId }));
});
form.querySelector('[data-act="remove"]').addEventListener("click", () => {
  if (!confirm("Delete this item? (Finish is the normal way to clear an item.)")) return;
  dialog.close("remove");
  emit(ev("item.removed", { itemId: editingId }));
});

dialog.addEventListener("close", () => {
  if (dialog.returnValue !== "save") return;
  const it = state.items.get(editingId);
  if (!it) return;
  const out = [];
  const text = form.elements.text.value.trim();
  if (text && text !== it.text) out.push(ev("item.edited", { itemId: it.id, text }));
  const due = form.elements.due.value || null;
  if (due !== it.due) out.push(ev("item.dueSet", { itemId: it.id, due }));
  if (out.length) emit(...out);
});
form.elements.text.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); dialog.close("save"); }
});

document.getElementById("add-project").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = e.target.elements.name.value.trim();
  if (!name) return;
  e.target.reset();
  emit(ev("project.added", { projectId: M.newId(), name }));
});

const tooltips = document.getElementById("tooltips");
tooltips.addEventListener("change", () => {
  localStorage.setItem(TOOLTIPS_KEY, tooltips.checked ? "1" : "0");
  render();
});

const hideEmpty = document.getElementById("hide-empty");
hideEmpty.addEventListener("change", () => {
  localStorage.setItem(HIDE_EMPTY_KEY, hideEmpty.checked ? "1" : "0");
  render();
});

// --- backup and restore ----------------------------------------------------

document.getElementById("backup").addEventListener("click", () => {
  const backup = M.makeBackup(events);
  const blob = new Blob([JSON.stringify(backup, null, 1)], { type: "application/json" });
  const a = h("a", { href: URL.createObjectURL(blob), download: `tasket-backup-${backup.exportedAt.slice(0, 19).replace(/:/g, "")}.json` });
  a.click();
  URL.revokeObjectURL(a.href);
  localStorage.setItem(LAST_BACKUP_KEY, backup.exportedAt);
  render();
});

const restoreFile = document.getElementById("restore-file");
document.getElementById("restore").addEventListener("click", () => restoreFile.click());
restoreFile.addEventListener("change", async () => {
  const file = restoreFile.files[0];
  restoreFile.value = "";
  if (!file) return;
  await dbReady; // not `ready`: Restore must work when the stored log cannot replay
  let backup;
  try {
    backup = M.parseBackup(await file.text());
  } catch (err) {
    alert(`Cannot restore ${file.name}:\n${err.message}${err.detail?.index != null ? ` (event ${err.detail.index})` : ""}`);
    return;
  }
  const s = M.replay(backup.events);
  const msg = `Replace everything in tasket with ${file.name}?\n\n` +
    `The file has ${s.projects.size} projects and ${[...s.items.values()].filter((i) => !i.finishedAt).length} open items, from ${backup.exportedAt}.\n` +
    `tasket now has ${events.length} events. They will be lost unless you have a backup.`;
  if (!confirm(msg)) return;
  await replaceEvents(db, backup.events);
  events = backup.events;
  state = s;
  ready = Promise.resolve(); // edits work again, even if the old log could not replay
  document.getElementById("error").hidden = true;
  localStorage.setItem(LAST_BACKUP_KEY, backup.exportedAt);
  render();
});

// --- start -----------------------------------------------------------------

async function openAndLoad() {
  persisted = (await navigator.storage?.persist?.()) ?? false;
  db = await openDb();
  ({ events, lastKey } = await loadEvents(db));
}

async function replayLog() {
  await dbReady;
  hideEmpty.checked = localStorage.getItem(HIDE_EMPTY_KEY) === "1";
  tooltips.checked = localStorage.getItem(TOOLTIPS_KEY) !== "0";
  try {
    state = M.replay(events);
  } catch (err) {
    render(); // the header and the status line still work on the empty state
    throw new UnloadableLogError(err, events);
  }
  render();
}

// Restore waits for dbReady: the database is open and the events are loaded.
// Edits wait for ready: the events also replayed without an error.
const dbReady = openAndLoad();
let ready = replayLog();
ready.catch(showError);
