// tasket's model. The stored truth is a list of events. This module turns the
// events into the current state. It has no DOM and no storage, so the browser
// app and the node tests share it.
//
// An event is { type, at, ...payload }. `at` is an ISO timestamp.
// State:
//   projects:     Map projectId -> { id, name, itemIds }   itemIds = open items, in priority order
//                 An epic is a project record with three more fields:
//                 { ..., kind: "epic", color, memberIds }  color = a key of EPIC_COLORS
//                 memberIds = the epic's own tasks and linked tasks, open or finished, in epic order
//   projectOrder: [projectId]
//   items:        Map itemId -> { id, projectId, text, addedAt, due, finishedAt, finishedIndex }
//   blocks:       Map "blockerId>blockedId" -> { blockerId, blockedId }

export const BACKUP_FORMAT = "tasket-backup";
export const BACKUP_VERSION = 1;

// Events store the color name, so a hex value can change later. There is no
// red or turquoise, because those two colors signal due dates.
export const EPIC_COLORS = {
  indigo: "#4f46e5", violet: "#8b3fd9", magenta: "#c026a3", orange: "#e8710a",
  amber: "#c99700", green: "#3f9b2f", blue: "#1f77d0", slate: "#5b6472",
};

// A card has room for 3 nested borders, and a due date uses one of them.
const MAX_CARD_BORDERS = 3;

export class TasketError extends Error {
  constructor(message, detail = {}) {
    super(message);
    this.name = "TasketError";
    this.detail = detail;
  }
}

function assert(condition, message, detail) {
  if (!condition) throw new TasketError(message, detail);
}

export function newId() {
  return crypto.randomUUID();
}

export function makeEvent(type, payload = {}, at = new Date().toISOString()) {
  return { type, at, ...payload };
}

export function emptyState() {
  return { projects: new Map(), projectOrder: [], items: new Map(), blocks: new Map() };
}

const blockKey = (blockerId, blockedId) => `${blockerId}>${blockedId}`;

function insertAt(list, value, index) {
  const i = index == null ? list.length : Math.max(0, Math.min(index, list.length));
  list.splice(i, 0, value);
}

function removeFrom(list, value) {
  const i = list.indexOf(value);
  if (i >= 0) list.splice(i, 1);
  return i;
}

function project(state, id, event) {
  const p = state.projects.get(id);
  assert(p, `unknown project ${id}`, { event });
  return p;
}

function item(state, id, event) {
  const it = state.items.get(id);
  assert(it, `unknown item ${id}`, { event });
  return it;
}

export const isEpic = (project) => project?.kind === "epic";

function epic(state, id, event) {
  const p = project(state, id, event);
  assert(isEpic(p), `${p.name} is not an epic`, { event });
  return p;
}

function assertEpicColor(color, event) {
  assert(typeof color === "string" && Object.hasOwn(EPIC_COLORS, color), `unknown epic color ${color}`, { event });
}

function dropItem(state, it) {
  if (it.finishedAt == null) removeFrom(state.projects.get(it.projectId).itemIds, it.id);
  state.items.delete(it.id);
  for (const [key, b] of state.blocks) {
    if (b.blockerId === it.id || b.blockedId === it.id) state.blocks.delete(key);
  }
  for (const p of state.projects.values()) if (isEpic(p)) removeFrom(p.memberIds, it.id);
}

const handlers = {
  "project.added"(s, e) {
    assert(!s.projects.has(e.projectId), `duplicate project ${e.projectId}`, { event: e });
    assert(typeof e.name === "string" && e.name.trim(), "project needs a name", { event: e });
    s.projects.set(e.projectId, { id: e.projectId, name: e.name.trim(), itemIds: [] });
    insertAt(s.projectOrder, e.projectId, e.index);
  },
  "project.renamed"(s, e) {
    assert(typeof e.name === "string" && e.name.trim(), "project needs a name", { event: e });
    project(s, e.projectId, e).name = e.name.trim();
  },
  "project.moved"(s, e) {
    project(s, e.projectId, e);
    removeFrom(s.projectOrder, e.projectId);
    insertAt(s.projectOrder, e.projectId, e.index);
  },
  "project.removed"(s, e) {
    project(s, e.projectId, e);
    for (const it of [...s.items.values()]) if (it.projectId === e.projectId) dropItem(s, it);
    s.projects.delete(e.projectId);
    removeFrom(s.projectOrder, e.projectId);
  },
  "item.added"(s, e) {
    assert(!s.items.has(e.itemId), `duplicate item ${e.itemId}`, { event: e });
    assert(typeof e.text === "string" && e.text.trim(), "item needs text", { event: e });
    const p = project(s, e.projectId, e);
    s.items.set(e.itemId, {
      id: e.itemId, projectId: e.projectId, text: e.text.trim(), addedAt: e.at,
      due: null, finishedAt: null, finishedIndex: null,
    });
    insertAt(p.itemIds, e.itemId, e.index);
    if (isEpic(p)) insertAt(p.memberIds, e.itemId, e.index);
  },
  "item.edited"(s, e) {
    assert(typeof e.text === "string" && e.text.trim(), "item needs text", { event: e });
    item(s, e.itemId, e).text = e.text.trim();
  },
  "item.moved"(s, e) {
    const it = item(s, e.itemId, e);
    assert(it.finishedAt == null, "cannot move a finished item", { event: e });
    const to = project(s, e.projectId, e);
    assert(!isEpic(to), "cannot move an item into an epic", { event: e });
    removeFrom(s.projects.get(it.projectId).itemIds, it.id);
    it.projectId = to.id;
    insertAt(to.itemIds, it.id, e.index);
  },
  "item.finished"(s, e) {
    const it = item(s, e.itemId, e);
    assert(it.finishedAt == null, "item is already finished", { event: e });
    it.finishedIndex = removeFrom(s.projects.get(it.projectId).itemIds, it.id);
    it.finishedAt = e.at;
  },
  "item.reopened"(s, e) {
    const it = item(s, e.itemId, e);
    assert(it.finishedAt != null, "item is not finished", { event: e });
    insertAt(s.projects.get(it.projectId).itemIds, it.id, it.finishedIndex);
    it.finishedAt = null;
    it.finishedIndex = null;
  },
  "item.removed"(s, e) {
    dropItem(s, item(s, e.itemId, e));
  },
  "item.dueSet"(s, e) {
    assert(e.due === null || /^\d{4}-\d{2}-\d{2}$/.test(e.due), `bad due date ${e.due}`, { event: e });
    item(s, e.itemId, e).due = e.due;
  },
  "block.added"(s, e) {
    item(s, e.blockerId, e);
    item(s, e.blockedId, e);
    assert(e.blockerId !== e.blockedId, "an item cannot block itself", { event: e });
    assert(!wouldCycle(s, e.blockerId, e.blockedId), "this blocker would make a cycle", { event: e });
    s.blocks.set(blockKey(e.blockerId, e.blockedId), { blockerId: e.blockerId, blockedId: e.blockedId });
  },
  "block.removed"(s, e) {
    const key = blockKey(e.blockerId, e.blockedId);
    assert(s.blocks.has(key), "no such blocker", { event: e });
    s.blocks.delete(key);
  },
  "epic.added"(s, e) {
    assert(!s.projects.has(e.projectId), `duplicate project ${e.projectId}`, { event: e });
    assert(typeof e.name === "string" && e.name.trim(), "epic needs a name", { event: e });
    assertEpicColor(e.color, e);
    s.projects.set(e.projectId, {
      id: e.projectId, name: e.name.trim(), itemIds: [], kind: "epic", color: e.color, memberIds: [],
    });
    insertAt(s.projectOrder, e.projectId, e.index);
  },
  "epic.colorSet"(s, e) {
    const p = epic(s, e.projectId, e);
    assertEpicColor(e.color, e);
    p.color = e.color;
  },
  "epic.linked"(s, e) {
    const p = epic(s, e.projectId, e);
    item(s, e.itemId, e);
    assert(!p.memberIds.includes(e.itemId), "item is already in this epic", { event: e });
    insertAt(p.memberIds, e.itemId, e.index);
  },
  "epic.memberMoved"(s, e) {
    const p = epic(s, e.projectId, e);
    assert(p.memberIds.includes(e.itemId), "item is not in this epic", { event: e });
    assert(Number.isInteger(e.index), `bad index ${e.index}`, { event: e });
    removeFrom(p.memberIds, e.itemId);
    insertAt(p.memberIds, e.itemId, e.index);
  },
  "epic.unlinked"(s, e) {
    const p = epic(s, e.projectId, e);
    assert(p.memberIds.includes(e.itemId), "item is not in this epic", { event: e });
    assert(s.items.get(e.itemId).projectId !== p.id, "cannot unlink an epic's own task", { event: e });
    removeFrom(p.memberIds, e.itemId);
  },
};

export const EVENT_TYPES = Object.keys(handlers);

export function apply(state, event) {
  const handler = Object.hasOwn(handlers, event?.type) ? handlers[event.type] : null;
  assert(handler, `unknown event type ${event?.type}`, { event });
  handler(state, event);
  return state;
}

export function replay(events) {
  const state = emptyState();
  events.forEach((event, index) => {
    try {
      apply(state, event);
    } catch (err) {
      if (err instanceof TasketError) err.detail.index = index;
      throw err;
    }
  });
  return state;
}

// --- questions about the state ---------------------------------------------

export const isOpen = (state, id) => state.items.get(id)?.finishedAt == null;

// Open items that block this item.
export function blockersOf(state, itemId) {
  return [...state.blocks.values()]
    .filter((b) => b.blockedId === itemId && isOpen(state, b.blockerId))
    .map((b) => state.items.get(b.blockerId));
}

// Every item (open or finished) that this item is listed as blocking.
export function blockedBy(state, itemId) {
  return [...state.blocks.values()]
    .filter((b) => b.blockerId === itemId)
    .map((b) => state.items.get(b.blockedId));
}

export const isBlocked = (state, itemId) => blockersOf(state, itemId).length > 0;

// True if blocker -> blocked would close a loop, i.e. `blocked` already
// (directly or transitively) blocks `blocker`.
export function wouldCycle(state, blockerId, blockedId) {
  const seen = new Set();
  const stack = [blockedId];
  while (stack.length) {
    const id = stack.pop();
    if (id === blockerId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const b of state.blocks.values()) if (b.blockerId === id) stack.push(b.blockedId);
  }
  return false;
}

// Local calendar date as YYYY-MM-DD.
export function localDate(d = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function daysUntil(due, today) {
  const utc = (s) => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((utc(due) - utc(today)) / 86400000);
}

export function dueLabel(due, today) {
  const n = daysUntil(due, today);
  if (n < -1) return `overdue ${-n} days`;
  if (n === -1) return "overdue 1 day";
  if (n === 0) return "due today";
  if (n === 1) return "due tomorrow";
  return `due in ${n} days`;
}

// Whole calendar days since the item was added (0 on the day it was added).
export function ageDays(item, today) {
  return daysUntil(today, localDate(new Date(item.addedAt)));
}

// Open items with a due date, soonest first.
export function datedItems(state) {
  return [...state.items.values()]
    .filter((it) => it.finishedAt == null && it.due)
    .sort((a, b) => a.due.localeCompare(b.due));
}

export function recentlyFinished(state, limit = 15) {
  return [...state.items.values()]
    .filter((it) => it.finishedAt != null)
    .sort((a, b) => b.finishedAt.localeCompare(a.finishedAt))
    .slice(0, limit);
}

// Epics that contain this item, in projectOrder order.
export function epicsOf(state, itemId) {
  return state.projectOrder
    .map((id) => state.projects.get(id))
    .filter((p) => isEpic(p) && p.memberIds.includes(itemId));
}

// The epic's members as items, each list in memberIds order.
export function epicRow(state, epicId) {
  const members = epic(state, epicId).memberIds.map((id) => state.items.get(id));
  return {
    open: members.filter((it) => it.finishedAt == null),
    finished: members.filter((it) => it.finishedAt != null),
  };
}

export function epicProgress(state, epicId) {
  const { open, finished } = epicRow(state, epicId);
  return { done: finished.length, total: open.length + finished.length };
}

// What a card draws. `due` is the date of an open dated item, else null, which
// matches datedItems. `colors` are EPIC_COLORS names in epicsOf order. `hidden`
// counts the epics that have no room for a border.
export function cardBorders(state, itemId) {
  const it = item(state, itemId);
  const due = it.finishedAt == null ? it.due : null;
  const all = epicsOf(state, itemId).map((p) => p.color);
  const colors = all.slice(0, MAX_CARD_BORDERS - (due ? 1 : 0));
  return { due, colors, hidden: all.length - colors.length };
}

// --- backup files ----------------------------------------------------------

export function makeBackup(events, exportedAt = new Date().toISOString()) {
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt, events };
}

// Parse and check a backup file's text. Returns the backup object, or throws
// a TasketError that says what is wrong.
export function parseBackup(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new TasketError(`not a JSON file: ${err.message}`);
  }
  assert(data && data.format === BACKUP_FORMAT, `not a tasket backup (format is ${JSON.stringify(data?.format)})`);
  assert(data.version === BACKUP_VERSION, `backup version ${data.version} is not supported (expected ${BACKUP_VERSION})`);
  assert(Array.isArray(data.events), "backup has no events list");
  replay(data.events); // throws with the index of the first bad event
  return data;
}
