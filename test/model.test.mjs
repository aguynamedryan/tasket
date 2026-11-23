import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as M from "../model.js";

const e = (type, payload) => M.makeEvent(type, payload, "2026-11-18T12:00:00.000Z");
const base = () => [
  e("project.added", { projectId: "A", name: "alpha" }),
  e("project.added", { projectId: "B", name: "beta" }),
  e("item.added", { itemId: "a1", projectId: "A", text: "one" }),
  e("item.added", { itemId: "a2", projectId: "A", text: "two" }),
  e("item.added", { itemId: "a3", projectId: "A", text: "three" }),
  e("item.added", { itemId: "b1", projectId: "B", text: "bee" }),
];
const order = (s, p) => s.projects.get(p).itemIds;

test("items keep insertion order as priority", () => {
  const s = M.replay(base());
  assert.deepEqual(s.projectOrder, ["A", "B"]);
  assert.deepEqual(order(s, "A"), ["a1", "a2", "a3"]);
});

test("item.moved reorders within a row and moves across rows", () => {
  let s = M.replay([...base(), e("item.moved", { itemId: "a3", projectId: "A", index: 0 })]);
  assert.deepEqual(order(s, "A"), ["a3", "a1", "a2"]);
  s = M.replay([...base(), e("item.moved", { itemId: "a1", projectId: "B", index: 1 })]);
  assert.deepEqual(order(s, "A"), ["a2", "a3"]);
  assert.deepEqual(order(s, "B"), ["b1", "a1"]);
  assert.equal(s.items.get("a1").projectId, "B");
  s = M.replay([...base(), e("item.moved", { itemId: "a1", projectId: "A", index: 99 })]);
  assert.deepEqual(order(s, "A"), ["a2", "a3", "a1"]);
});

test("finishing drops an item from its row; reopening puts it back where it was", () => {
  let s = M.replay([...base(), e("item.finished", { itemId: "a2" })]);
  assert.deepEqual(order(s, "A"), ["a1", "a3"]);
  assert.equal(M.recentlyFinished(s)[0].id, "a2");
  s = M.replay([...base(), e("item.finished", { itemId: "a2" }), e("item.reopened", { itemId: "a2" })]);
  assert.deepEqual(order(s, "A"), ["a1", "a2", "a3"]);
  assert.throws(() => M.replay([...base(), e("item.finished", { itemId: "a2" }), e("item.finished", { itemId: "a2" })]), M.TasketError);
});

test("project.moved and project.removed", () => {
  let s = M.replay([...base(), e("project.moved", { projectId: "B", index: 0 })]);
  assert.deepEqual(s.projectOrder, ["B", "A"]);
  s = M.replay([...base(), e("block.added", { blockerId: "b1", blockedId: "a1" }), e("project.removed", { projectId: "B" })]);
  assert.deepEqual(s.projectOrder, ["A"]);
  assert.equal(s.items.has("b1"), false);
  assert.equal(s.blocks.size, 0);
  assert.equal(M.isBlocked(s, "a1"), false);
});

test("due dates and the dated list", () => {
  const s = M.replay([...base(),
    e("item.dueSet", { itemId: "b1", due: "2026-11-25" }),
    e("item.dueSet", { itemId: "a3", due: "2026-11-19" }),
    e("item.dueSet", { itemId: "a1", due: "2026-11-20" }),
    e("item.dueSet", { itemId: "a1", due: null }),
  ]);
  assert.deepEqual(M.datedItems(s).map((i) => i.id), ["a3", "b1"]);
  assert.throws(() => M.replay([...base(), e("item.dueSet", { itemId: "a1", due: "Thursday" })]), /bad due date/);
});

test("due labels count calendar days", () => {
  const t = "2026-11-18";
  assert.equal(M.dueLabel("2026-11-18", t), "due today");
  assert.equal(M.dueLabel("2026-11-19", t), "due tomorrow");
  assert.equal(M.dueLabel("2026-11-25", t), "due in 7 days");
  assert.equal(M.dueLabel("2026-11-17", t), "overdue 1 day");
  assert.equal(M.dueLabel("2026-11-01", t), "overdue 17 days");
  assert.equal(M.daysUntil("2027-03-01", "2027-02-28"), 1); // DST and month ends do not matter
});

test("age counts whole local days since the item was added", () => {
  const s = M.replay([
    e("project.added", { projectId: "A", name: "alpha" }),
    M.makeEvent("item.added", { itemId: "x", projectId: "A", text: "t" }, new Date(2026, 10, 15, 23, 30).toISOString()),
  ]);
  const x = s.items.get("x");
  assert.equal(M.ageDays(x, "2026-11-15"), 0);
  assert.equal(M.ageDays(x, "2026-11-18"), 3);
});

test("blockers: blocked while the blocker is open, unblocked when it finishes", () => {
  let s = M.replay([...base(), e("block.added", { blockerId: "b1", blockedId: "a1" })]);
  assert.equal(M.isBlocked(s, "a1"), true);
  assert.deepEqual(M.blockedBy(s, "b1").map((i) => i.id), ["a1"]);
  s = M.replay([...base(), e("block.added", { blockerId: "b1", blockedId: "a1" }), e("item.finished", { itemId: "b1" })]);
  assert.equal(M.isBlocked(s, "a1"), false);
  s = M.replay([...base(), e("block.added", { blockerId: "b1", blockedId: "a1" }), e("block.removed", { blockerId: "b1", blockedId: "a1" })]);
  assert.equal(M.isBlocked(s, "a1"), false);
});

test("blockers refuse self-blocks and cycles", () => {
  assert.throws(() => M.replay([...base(), e("block.added", { blockerId: "a1", blockedId: "a1" })]), /itself/);
  const chain = [...base(), e("block.added", { blockerId: "a1", blockedId: "a2" }), e("block.added", { blockerId: "a2", blockedId: "b1" })];
  const s = M.replay(chain);
  assert.equal(M.wouldCycle(s, "b1", "a1"), true);
  assert.equal(M.wouldCycle(s, "a1", "b1"), false);
  assert.throws(() => M.replay([...chain, e("block.added", { blockerId: "b1", blockedId: "a1" })]), /cycle/);
});

test("removing an item drops its blocks", () => {
  const s = M.replay([...base(), e("block.added", { blockerId: "b1", blockedId: "a1" }), e("item.removed", { itemId: "b1" })]);
  assert.equal(s.blocks.size, 0);
  assert.equal(M.isBlocked(s, "a1"), false);
});

test("bad events are refused with the index of the first bad one", () => {
  assert.throws(() => M.replay([e("item.added", { itemId: "x", projectId: "nope", text: "t" })]), /unknown project/);
  assert.throws(() => M.replay([e("mystery", {})]), /unknown event type/);
  try {
    M.replay([...base(), e("item.edited", { itemId: "zz", text: "t" })]);
    assert.fail("should throw");
  } catch (err) {
    assert.equal(err.detail.index, 6);
  }
});

test("backup round trip gives the same state; bad files are refused", () => {
  const events = [...base(), e("item.dueSet", { itemId: "a1", due: "2026-11-19" }), e("block.added", { blockerId: "b1", blockedId: "a2" })];
  const text = JSON.stringify(M.makeBackup(events, "2026-11-18T13:00:00.000Z"));
  const back = M.parseBackup(text);
  assert.deepEqual(M.replay(back.events), M.replay(events));
  assert.throws(() => M.parseBackup("{nope"), /not a JSON file/);
  assert.throws(() => M.parseBackup(JSON.stringify({ format: "other" })), /not a tasket backup/);
  assert.throws(() => M.parseBackup(JSON.stringify({ format: M.BACKUP_FORMAT, version: 99, events: [] })), /version 99/);
  assert.throws(() => M.parseBackup(JSON.stringify(M.makeBackup([e("item.edited", { itemId: "q", text: "t" })]))), /unknown item/);
});

// --- version 1 logs ---------------------------------------------------------

const fixture = (name) => readFileSync(new URL(`fixtures/${name}`, import.meta.url), "utf8");
const snapshot = (s) => ({
  projects: [...s.projects.entries()],
  projectOrder: s.projectOrder,
  items: [...s.items.entries()],
  blocks: [...s.blocks.entries()],
});
const PRE_EPIC_TYPES = [
  "project.added", "project.renamed", "project.moved", "project.removed",
  "item.added", "item.edited", "item.moved", "item.finished", "item.reopened", "item.removed", "item.dueSet",
  "block.added", "block.removed",
];

test("the version 1 fixture uses every pre-epic event type", () => {
  const { events } = JSON.parse(fixture("v1-log.json"));
  assert.deepEqual(new Set(events.map((ev) => ev.type)), new Set(PRE_EPIC_TYPES));
  assert.deepEqual(M.EVENT_TYPES.filter((t) => !t.startsWith("epic.")), PRE_EPIC_TYPES);
});

test("a version 1 backup replays to the state that the pre-epic model produced", () => {
  const backup = M.parseBackup(fixture("v1-log.json"));
  assert.equal(backup.version, 1);
  assert.deepEqual(snapshot(M.replay(backup.events)), JSON.parse(fixture("v1-state.json")));
});

// --- epics ------------------------------------------------------------------

const epics = () => [
  ...base(),
  e("epic.added", { projectId: "E", name: "launch", color: "indigo" }),
  e("epic.added", { projectId: "F", name: "cleanup", color: "green" }),
];
const members = (s, id) => s.projects.get(id).memberIds;
const link = (projectId, itemId, index) => e("epic.linked", { projectId, itemId, index });
const ids = (list) => list.map((it) => it.id);

test("epic.added creates an epic row and leaves plain projects unchanged", () => {
  const s = M.replay([...base(), e("epic.added", { projectId: "E", name: " launch ", color: "violet", index: 1 })]);
  assert.deepEqual(s.projectOrder, ["A", "E", "B"]);
  assert.deepEqual(s.projects.get("E"), { id: "E", name: "launch", itemIds: [], kind: "epic", color: "violet", memberIds: [] });
  assert.deepEqual(Object.keys(s.projects.get("A")), ["id", "name", "itemIds"]);
  assert.throws(() => M.replay([...base(), e("epic.added", { projectId: "A", name: "x", color: "blue" })]), /duplicate project/);
  assert.throws(() => M.replay([e("epic.added", { projectId: "E", name: " ", color: "blue" })]), /needs a name/);
});

test("epic colors must be palette names, with no red or turquoise", () => {
  assert.deepEqual(Object.keys(M.EPIC_COLORS), ["indigo", "violet", "magenta", "orange", "amber", "green", "blue", "slate"]);
  for (const color of ["red", "turquoise", "#4f46e5", "constructor", undefined, ["indigo"]]) {
    assert.throws(() => M.replay([e("epic.added", { projectId: "E", name: "x", color })]), /unknown epic color/);
  }
});

test("epic.colorSet changes the color of an epic only", () => {
  const s = M.replay([...epics(), e("epic.colorSet", { projectId: "E", color: "slate" })]);
  assert.equal(s.projects.get("E").color, "slate");
  assert.throws(() => M.replay([...epics(), e("epic.colorSet", { projectId: "A", color: "slate" })]), /not an epic/);
  assert.throws(() => M.replay([...epics(), e("epic.colorSet", { projectId: "E", color: "red" })]), /unknown epic color/);
});

test("epic.linked adds a task to several epics and leaves its project alone", () => {
  const s = M.replay([...epics(), link("E", "a1"), link("E", "b1", 0), link("F", "a1")]);
  assert.deepEqual(members(s, "E"), ["b1", "a1"]);
  assert.deepEqual(members(s, "F"), ["a1"]);
  assert.equal(s.items.get("a1").projectId, "A");
  assert.deepEqual(order(s, "A"), ["a1", "a2", "a3"]);
  assert.deepEqual(s.projects.get("E").itemIds, []);
});

test("epic.linked refuses a non-epic, an unknown item and an existing member", () => {
  assert.throws(() => M.replay([...epics(), link("A", "b1")]), /not an epic/);
  assert.throws(() => M.replay([...epics(), link("E", "nope")]), /unknown item/);
  assert.throws(() => M.replay([...epics(), link("E", "a1"), link("E", "a1")]), /already in this epic/);
  const own = e("item.added", { itemId: "o1", projectId: "E", text: "own" });
  assert.throws(() => M.replay([...epics(), own, link("E", "o1")]), /already in this epic/);
});

test("epic.memberMoved reorders the epic and never changes project priority", () => {
  const s = M.replay([...epics(), link("E", "a1"), link("E", "a2"), link("E", "a3"),
    e("epic.memberMoved", { projectId: "E", itemId: "a3", index: 0 })]);
  assert.deepEqual(members(s, "E"), ["a3", "a1", "a2"]);
  assert.deepEqual(order(s, "A"), ["a1", "a2", "a3"]);
  assert.throws(() => M.replay([...epics(), e("epic.memberMoved", { projectId: "A", itemId: "a1", index: 0 })]), /not an epic/);
  assert.throws(() => M.replay([...epics(), e("epic.memberMoved", { projectId: "E", itemId: "a1", index: 0 })]), /not in this epic/);
  assert.throws(() => M.replay([...epics(), link("E", "a1"), e("epic.memberMoved", { projectId: "E", itemId: "a1" })]), /bad index/);
});

test("epic.unlinked removes one membership and refuses the epic's own task", () => {
  const s = M.replay([...epics(), link("E", "a1"), link("F", "a1"), e("epic.unlinked", { projectId: "E", itemId: "a1" })]);
  assert.deepEqual(members(s, "E"), []);
  assert.deepEqual(members(s, "F"), ["a1"]);
  assert.equal(s.items.get("a1").projectId, "A");
  assert.throws(() => M.replay([...epics(), e("epic.unlinked", { projectId: "A", itemId: "a1" })]), /not an epic/);
  assert.throws(() => M.replay([...epics(), e("epic.unlinked", { projectId: "E", itemId: "a1" })]), /not in this epic/);
  const own = e("item.added", { itemId: "o1", projectId: "E", text: "own" });
  assert.throws(() => M.replay([...epics(), own, e("epic.unlinked", { projectId: "E", itemId: "o1" })]), /own task/);
});

test("item.added into an epic makes an own task and a member", () => {
  const s = M.replay([...epics(), link("E", "a1"),
    e("item.added", { itemId: "o1", projectId: "E", text: "own" }),
    e("item.added", { itemId: "o2", projectId: "E", text: "own two", index: 0 })]);
  assert.deepEqual(members(s, "E"), ["o2", "a1", "o1"]);
  assert.equal(s.items.get("o1").projectId, "E");
  assert.deepEqual([...order(s, "E")].sort(), ["o1", "o2"]);
  assert.equal(M.replay(base()).projects.get("A").memberIds, undefined);
});

test("item.moved refuses an epic, and an own task moved out becomes a linked task", () => {
  const own = e("item.added", { itemId: "o1", projectId: "E", text: "own" });
  assert.throws(() => M.replay([...epics(), e("item.moved", { itemId: "a1", projectId: "E", index: 0 })]), /into an epic/);
  assert.throws(() => M.replay([...epics(), own, e("item.moved", { itemId: "o1", projectId: "E", index: 0 })]), /into an epic/);
  const moved = [...epics(), own, e("item.moved", { itemId: "o1", projectId: "A", index: 0 })];
  let s = M.replay(moved);
  assert.equal(s.items.get("o1").projectId, "A");
  assert.deepEqual(order(s, "A"), ["o1", "a1", "a2", "a3"]);
  assert.deepEqual(order(s, "E"), []);
  assert.deepEqual(members(s, "E"), ["o1"]);
  s = M.replay([...moved, e("epic.unlinked", { projectId: "E", itemId: "o1" })]);
  assert.deepEqual(members(s, "E"), []);
  assert.equal(s.items.has("o1"), true);
});

test("removing an item removes it from every epic", () => {
  const s = M.replay([...epics(), link("E", "a1"), link("F", "a1"), e("item.removed", { itemId: "a1" })]);
  assert.deepEqual(members(s, "E"), []);
  assert.deepEqual(members(s, "F"), []);
  const r = M.replay([...epics(), link("E", "b1"), e("project.removed", { projectId: "B" })]);
  assert.deepEqual(members(r, "E"), []);
});

test("project.removed on an epic deletes its own tasks and links, and linked tasks stay", () => {
  const s = M.replay([...epics(),
    e("item.added", { itemId: "o1", projectId: "E", text: "own open" }),
    e("item.added", { itemId: "o2", projectId: "E", text: "own finished" }),
    e("item.finished", { itemId: "o2" }),
    link("F", "o1"), link("E", "a1"), link("F", "a1"),
    e("block.added", { blockerId: "o1", blockedId: "a2" }),
    e("project.removed", { projectId: "E" })]);
  assert.equal(s.projects.has("E"), false);
  assert.deepEqual(s.projectOrder, ["A", "B", "F"]);
  assert.equal(s.items.has("o1"), false);
  assert.equal(s.items.has("o2"), false);
  assert.equal(s.items.get("a1").projectId, "A");
  assert.deepEqual(order(s, "A"), ["a1", "a2", "a3"]);
  assert.deepEqual(members(s, "F"), ["a1"]);
  assert.equal(s.blocks.size, 0);
});

test("finished tasks stay in the epic, and reopening keeps their place", () => {
  const events = [...epics(), link("E", "a1"),
    e("item.added", { itemId: "o1", projectId: "E", text: "own" }), link("E", "a2"),
    e("item.finished", { itemId: "o1" }), e("item.finished", { itemId: "a1" })];
  let s = M.replay(events);
  assert.deepEqual(members(s, "E"), ["a1", "o1", "a2"]);
  assert.deepEqual(order(s, "E"), []);
  s = M.replay([...events, e("item.reopened", { itemId: "o1" })]);
  assert.deepEqual(members(s, "E"), ["a1", "o1", "a2"]);
  assert.deepEqual(order(s, "E"), ["o1"]);
});

test("isEpic tells an epic from a plain project", () => {
  const s = M.replay(epics());
  assert.equal(M.isEpic(s.projects.get("E")), true);
  assert.equal(M.isEpic(s.projects.get("A")), false);
  assert.equal(M.isEpic(undefined), false);
});

test("epicsOf lists epics in projectOrder order", () => {
  const events = [...epics(), link("F", "a1"), link("E", "a1")];
  assert.deepEqual(M.epicsOf(M.replay(events), "a1").map((p) => p.id), ["E", "F"]);
  const s = M.replay([...events, e("project.moved", { projectId: "F", index: 0 })]);
  assert.deepEqual(M.epicsOf(s, "a1").map((p) => p.id), ["F", "E"]);
  assert.deepEqual(M.epicsOf(s, "a2"), []);
});

test("epicRow splits members into open and finished, each in member order", () => {
  const s = M.replay([...epics(), link("E", "a3"), link("E", "a1"), link("E", "b1"), link("E", "a2"),
    e("item.finished", { itemId: "a2" }), e("item.finished", { itemId: "a3" })]);
  const row = M.epicRow(s, "E");
  assert.deepEqual(ids(row.open), ["a1", "b1"]);
  assert.deepEqual(ids(row.finished), ["a3", "a2"]);
  assert.throws(() => M.epicRow(s, "A"), /not an epic/);
  assert.throws(() => M.epicRow(s, "nope"), /unknown project/);
});

test("epicProgress counts finished members", () => {
  const s = M.replay([...epics(), link("E", "a1"), link("E", "a2"),
    e("item.added", { itemId: "o1", projectId: "E", text: "own" }), e("item.finished", { itemId: "a2" })]);
  assert.deepEqual(M.epicProgress(s, "E"), { done: 1, total: 3 });
  assert.deepEqual(M.epicProgress(s, "F"), { done: 0, total: 0 });
});

test("cardBorders draws at most 3 borders and counts the rest as hidden", () => {
  const four = [...base(),
    e("epic.added", { projectId: "E1", name: "one", color: "indigo" }),
    e("epic.added", { projectId: "E2", name: "two", color: "green" }),
    e("epic.added", { projectId: "E3", name: "three", color: "amber" }),
    e("epic.added", { projectId: "E4", name: "four", color: "slate" }),
    link("E1", "a1"), link("E2", "a1"), link("E3", "a1"), link("E4", "a1"),
    link("E1", "a2"), link("E2", "a2"), link("E3", "a2")];
  let s = M.replay(four);
  assert.deepEqual(M.cardBorders(s, "b1"), { due: null, colors: [], hidden: 0 });
  assert.deepEqual(M.cardBorders(s, "a2"), { due: null, colors: ["indigo", "green", "amber"], hidden: 0 });
  assert.deepEqual(M.cardBorders(s, "a1"), { due: null, colors: ["indigo", "green", "amber"], hidden: 1 });
  s = M.replay([...four, e("item.dueSet", { itemId: "a2", due: "2026-12-01" })]);
  assert.deepEqual(M.cardBorders(s, "a2"), { due: "2026-12-01", colors: ["indigo", "green"], hidden: 1 });
  s = M.replay([...four, e("item.dueSet", { itemId: "a2", due: "2026-12-01" }), e("item.finished", { itemId: "a2" })]);
  assert.deepEqual(M.cardBorders(s, "a2"), { due: null, colors: ["indigo", "green", "amber"], hidden: 0 });
  assert.throws(() => M.cardBorders(s, "nope"), /unknown item/);
});

test("a backup with epic events round-trips at version 1", () => {
  const events = [...epics(), link("E", "a1"), e("item.added", { itemId: "o1", projectId: "E", text: "own" })];
  const back = M.parseBackup(JSON.stringify(M.makeBackup(events, "2026-11-18T13:00:00.000Z")));
  assert.equal(back.version, 1);
  assert.deepEqual(M.replay(back.events), M.replay(events));
});
