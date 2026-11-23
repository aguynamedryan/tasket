---
id: tasket-hm7
title: 'Epics: a row that tracks a set of tasks across projects'
status: captured
type: exploration
created_at: 2026-11-23T15:32:35.842560+00:00
updated_at: 2026-11-23T15:54:57.800697+00:00
relationships:
  - target_id: tasket-ruu
    rel_type: questioned-by
    created_at: 2026-11-23T15:32:57.010328+00:00
  - target_id: tasket-3wl
    rel_type: questioned-by
    created_at: 2026-11-23T15:32:57.446962+00:00
  - target_id: tasket-zyw
    rel_type: questioned-by
    created_at: 2026-11-23T15:32:58.003916+00:00
  - target_id: tasket-glx
    rel_type: questioned-by
    created_at: 2026-11-23T15:44:28.706159+00:00
---

# Epics: a row that tracks a set of tasks across projects

## Request (Ryan, 2026-11-23, verbatim)

```
and, just like that, I need epics so I can track a set of cross-repo tasks to monitor
what needs doing before I can consider something done :-)  the use case is I want to
track what I need to complete in order to publicize CSC.  I'm using this site off
github pages as well, so I don't want to lose data.  epics should a row like any repo.
I drag/drop tasks into the row to add an alias to them in the epic.  epics can have a
color assigned and the border for epic'd tasks in a repo will reflect the color of the
epic.  tasks can belong to a single epic at a time right now.  thoughts? questions?
let's do some seeds feedback on this
```

## Stated by Ryan

- An epic is a row, like a project row.
- Dragging a task into the epic row adds an alias. The task stays in its project.
- An epic has a color. The border of its tasks in their project rows shows that color.
- A task belongs to at most one epic.
- No data may be lost.

## Findings from the code (2026-11-23)

Data:

- Epics need no data migration. They can be new event types in the existing log. The IndexedDB schema and the backup version stay at 1.
- A version 1 backup with no epic events still passes `parseBackup`.
- After the first epic event, older code refuses the log with `unknown event type`. So a rollback of the app needs a backup made before the first epic event.
- Existing defect, reproduced against `model.js` but not in Chrome: each tab validates a write against its own copy of the log. Tab A removes an item. Tab B, still open, edits that item. Both writes are stored. The next load refuses the log with `unknown item`.

```
tab A validated its write: yes
tab B validated its write: yes
reload of the combined stored log: REFUSED: unknown item a1 (event 3)
```

- From reading `app.js`: after that refusal, the events stay in IndexedDB and Backup still works. Edits and Restore fail, because both wait on the failed start. `app.js` has no coordination between tabs.

Display:

- A dated card already uses a 2px inset border, in red or turquoise. An epic border on the same card would collide with it. Ryan ruled in `tasket-lmj` that a dated item is the most visible thing on the screen.
- All rows share one column width and rows do not wrap. An epic with 15 tasks would make the grid 16 columns wide, and every row would scroll sideways.

Existing behavior that an alias must not inherit:

- Dragging a card to another row moves the real task. An alias dragged to a project row must not do this.
- Deleting a project deletes its tasks. Deleting an epic must not delete project tasks.

## Proposed defaults (not ruled)

- An epic has its own task order. Reordering it does not change priority in a project row.
- An alias shows its project name, and opens the same editor as the real task.
- Dropping a task on a second epic moves it to that epic.
- Removing an alias, or deleting an epic, leaves the project task in place.
- A dated task in an epic shows two nested borders: the due color inside and the epic color outside.
- Epic colors come from a fixed palette with no red and no turquoise, because those two already signal due dates.
- Fix the two-tab defect before epics ship.

## Open questions

1. Do finished tasks stay visible in the epic row? Leaning yes, dimmed at the end of the row, with a count such as "7 of 12 done".
2. Can an epic hold a task that belongs to no project, such as "write the announcement"? Leaning yes, through the row's "+" cell.
3. How does a long epic row display? Leaning toward wrapping onto more lines, so it does not widen the other rows.

RULED 2026-11-23: finished tasks stay visible in the epic row, an epic can hold a task with no project, and a long epic row wraps as a trial. Nested borders are accepted. Ryan: "1. yes, 2. yes, 3. let's try wrapping" and "nested colors sounds good".

OPEN 2026-11-23: Ryan asked about reversing the one-epic limit: "we could actually allow a task in multiple epics that way?"

- The root font size is 14px and the card's top padding is 0.45rem, which is 6.3px. Three 2px borders (6px) fit with no layout change. A fourth (8px) would overlap the text.
- A dated task uses one of those three borders for its due color, so it can show two epic colors.
- Recommendation: store membership as separate link events (epic plus task) even if the limit stays at one. Events are permanent, so a single-value event such as `item.epicSet` would be harder to widen later.
- If the limit is removed, dropping a task on a second epic adds it to that epic. This replaces the earlier proposed default, where the drop moved it.

RULED 2026-11-23: a task can belong to more than one epic. This reverses the one-epic limit in the original request. Ryan: "allow in more than one". Dropping a task on a second epic adds it there. Removing it from one epic leaves it in the others.

BEADS 2026-11-23: the ruled scope is in `tasket-rth` (stale-tab defect), `tasket-opx` (event model), `tasket-4w6` (epic rows), `tasket-8zg` (drag rules) and `tasket-ly8` (borders and editor). They run in that order.

OPEN 2026-11-23: Ryan asked two scope questions while the beads were being written: "do we need versions for this thing?" and "is this just kanban at this point?"

- Versions, proposed answer: no release numbers. The app has no build step and one user. The data format needs protection, and the rule is to add event types only, checked by a replay test on a fixture of the old format. The backup version changes only if an existing event's meaning must change.
- Kanban, proposed answer: no. Kanban columns are workflow states, and a card moves through them. Tasket rows are projects, position is priority, and a task is only open or finished. Epics add a cross-project view and no workflow states. A status column would be the step that makes tasket a kanban board.
