# Objectives Feature

**Spec ID:** 001
**Date:** 2025-12-26
**Status:** Accepted

---

## Summary

Extend the existing `Goal` type with optional `type` field. No migration needed - existing goals default to tasks.

---

## Data Model

### Updated Goal Type

```typescript
type GoalType = 'task' | 'objective';

interface Goal {
  id: string;
  text: string;
  completed: boolean;
  createdAt: string;
  date: string;                    // Due date (YYYY-MM-DD) - works for both

  // Optional type - defaults to 'task' if not set
  type?: GoalType;

  // Task-specific (optional)
  parentId?: string;               // Links task to parent objective
  transferCount?: number;          // Times deferred

  // Objective-specific (optional)
  description?: string;            // Longer description for objectives
}

// Helper to get type safely
function getGoalType(goal: Goal): GoalType {
  return goal.type ?? 'task';
}
```

### Field Usage

| Field | Task | Objective |
|-------|------|-----------|
| `type` | `undefined` or `'task'` | `'objective'` |
| `text` | Task description | Objective title |
| `date` | Daily due date | Target due date |
| `completed` | ✅ | ✅ |
| `parentId` | Links to objective | Not used |
| `description` | Not used | Optional details |
| `transferCount` | Times deferred | Not used |

### No Migration Needed

Existing goals work as-is:
```typescript
// Existing goal (no type field)
{ id: '1', text: 'Exercise', completed: false, date: '2025-12-26' }

// Treated as task because type is undefined
getGoalType(goal) → 'task'
```

---

## Relationships

```
┌─────────────────────────────────────┐
│ Objective (type: 'objective')       │
│ "Launch side project"               │
│ Due: 2025-01-15                     │
└─────────────────────────────────────┘
          ▲
          │ parentId
          │
┌─────────┴─────────┬─────────────────┬─────────────────┐
│ Task              │ Task            │ Task            │
│ "Set up repo"     │ "Build auth"    │ "Write docs"    │
│ 2025-12-20 ✓      │ 2025-12-24 ✓    │ 2025-12-26 ☐    │
└───────────────────┴─────────────────┴─────────────────┘
```

---

## Progress Calculation

```typescript
interface ObjectiveProgress {
  total: number;
  completed: number;
  percent: number;
  tasks: Goal[];
  daysRemaining: number | null;
  isOverdue: boolean;
}

function getObjectiveProgress(objective: Goal, allGoals: Goal[]): ObjectiveProgress {
  const tasks = allGoals.filter(
    g => getGoalType(g) === 'task' && g.parentId === objective.id
  );
  const completed = tasks.filter(t => t.completed).length;

  const today = getTodayDateString();
  const daysRemaining = objective.date
    ? daysBetween(today, objective.date)
    : null;

  return {
    total: tasks.length,
    completed,
    percent: tasks.length > 0 ? Math.round((completed / tasks.length) * 100) : 0,
    tasks,
    daysRemaining,
    isOverdue: daysRemaining !== null && daysRemaining < 0,
  };
}
```

---

## User Experience

### Creating an Objective

```
┌─────────────────────────────────┐
│ New Objective                   │
│                                 │
│ Title: [Launch side project   ] │
│                                 │
│ Description (optional):         │
│ [Ship MVP before conference   ] │
│                                 │
│ Due date: [Jan 15, 2025      ] │
│                                 │
│        [Cancel]  [Create]       │
└─────────────────────────────────┘
```

### Linking a Task to an Objective

When adding a daily task:
```
Add Task:
[Write landing page copy        ]

Link to objective (optional):
[── None ──────────────────────▼]
  None
  Launch side project (Jan 15)
  Learn Spanish (Mar 1)
```

### Daily View

```
Today's Tasks:
☐ Write landing page copy  → Launch project
☐ Exercise
☐ Study vocabulary         → Learn Spanish

🎯 Objectives (2 active)
├── Launch project    ████████░░ 75%  12 days left
└── Learn Spanish     ██░░░░░░░░ 20%  75 days left
```

### Objective Detail View

```
🎯 Launch side project
   Ship MVP before conference

   ████████████░░░░░░░░ 75%
   Due: Jan 15, 2025 (12 days remaining)

   Linked Tasks (3/4 completed):
   ☑ Set up repository          Dec 20
   ☑ Design database schema     Dec 22
   ☑ Build authentication       Dec 24
   ☐ Write landing page copy    Today

   [+ Add Task]
```

---

## Store Implementation

### Helpers

```typescript
// Filter helpers
const isTask = (g: Goal) => getGoalType(g) === 'task';
const isObjective = (g: Goal) => getGoalType(g) === 'objective';

// In store
const tasks = goals.filter(isTask);
const objectives = goals.filter(isObjective);
const activeObjectives = objectives.filter(o => !o.completed);
```

### New Actions

```typescript
// Add objective
addObjective: async (title: string, dueDate: string, description?: string) => {
  const objective: Goal = {
    id: generateId(),
    text: title,
    type: 'objective',
    completed: false,
    createdAt: new Date().toISOString(),
    date: dueDate,
    description,
  };
  // ... save
}

// Link task to objective
linkTaskToObjective: async (taskId: string, objectiveId: string | null) => {
  const updated = goals.map(g =>
    g.id === taskId
      ? { ...g, parentId: objectiveId ?? undefined }
      : g
  );
  // ... save
}
```

---

## Storage

Everything stays in same `goals` array:

```typescript
chrome.storage.sync.get('goals') → Goal[]

// Contains both tasks and objectives
[
  { id: '1', text: 'Exercise', date: '2025-12-26', completed: false },
  { id: '2', text: 'Launch project', type: 'objective', date: '2025-01-15', ... },
  { id: '3', text: 'Write docs', date: '2025-12-26', parentId: '2', ... },
]
```

---

## Analytics

### Tracking Metrics

| Metric | Description |
|--------|-------------|
| Active objectives | Count where `type: 'objective'` and not completed |
| Objective progress | Tasks completed / total linked tasks |
| Tasks with objectives | % of tasks that have `parentId` |
| Completion rate | Objectives completed / total created |
| Avg tasks per objective | Total linked tasks / objectives |

### Insights Addition

```typescript
// Add to InsightsData
activeObjectives: number;
objectivesCompletedThisMonth: number;
avgObjectiveProgress: number;
```

---

## Implementation Checklist

### Phase 1: Core

**Types:**
- [ ] Add `GoalType` type to types.ts
- [ ] Add optional `type`, `parentId`, `description` to Goal
- [ ] Add `getGoalType()` helper function
- [ ] Update constants with defaults

**Store:**
- [ ] Add `addObjective()` action
- [ ] Add `linkTaskToObjective()` action
- [ ] Add derived `objectives` / `activeObjectives`
- [ ] Add `getObjectiveProgress()` helper

**Components:**
- [ ] `ObjectivesSection.tsx` - collapsed list on dashboard
- [ ] `ObjectiveCard.tsx` - single objective with progress
- [ ] `ObjectiveForm.tsx` - create/edit modal
- [ ] `ObjectivePicker.tsx` - dropdown for linking
- [ ] Update `GoalInput` with objective picker
- [ ] Add objective badge to task items

### Phase 2: Enhancements

- [ ] Objective detail page/modal
- [ ] Due date warnings (overdue, due soon)
- [ ] Color coding
- [ ] Bulk link tasks
- [ ] Archive objectives

### Phase 3: Analytics

- [ ] Add objective metrics to Insights
- [ ] Progress history chart
- [ ] Export with objectives

---

## Edge Cases

| Case | Handling |
|------|----------|
| Delete linked task | Objective progress recalculates |
| Delete objective | Linked tasks become standalone (`parentId` removed) |
| Transfer task | Stays linked to same objective |
| All tasks completed | Show "Complete objective?" prompt |
| No linked tasks | Show "0 tasks" with add button |
| Objective overdue | Red "Overdue" badge |
| Task with deleted objective | Treat as standalone (parentId points to nothing) |

---

## File Changes

| File | Change |
|------|--------|
| `packages/shared/src/types.ts` | Add `GoalType`, optional fields |
| `packages/shared/src/utils.ts` | Add `getGoalType()`, progress helpers |
| `apps/.../stores/goal-store.ts` | Add objective actions |
| `apps/.../components/ObjectivesSection.tsx` | NEW |
| `apps/.../components/ObjectiveCard.tsx` | NEW |
| `apps/.../components/ObjectiveForm.tsx` | NEW |
| `apps/.../components/ObjectivePicker.tsx` | NEW |
| `packages/test-utils/.../goal.factory.ts` | Add objective factory |
