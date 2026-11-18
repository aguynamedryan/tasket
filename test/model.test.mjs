import { test } from "node:test";
import assert from "node:assert/strict";
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
