---
phase: 36-playwright-setup-test-specs
plan: 03
subsystem: e2e-specs
tags: [playwright, e2e, pom, chat, agents, workers, skills, tasks]
dependency_graph:
  requires: [playwright-config, base-pom, test-fixtures, test-helpers]
  provides: [chat-pom, agents-pom, workers-pom, skills-pom, tasks-pom, chat-spec, agents-spec, workers-spec, skills-spec, tasks-spec]
  affects: []
tech_stack:
  added: []
  patterns: [page-object-model, serial-crud-specs, test-prefix-cleanup]
key_files:
  created:
    - app/e2e/pages/chat.pom.ts
    - app/e2e/pages/agents.pom.ts
    - app/e2e/pages/workers.pom.ts
    - app/e2e/pages/skills.pom.ts
    - app/e2e/pages/tasks.pom.ts
    - app/e2e/specs/chat.spec.ts
    - app/e2e/specs/agents.spec.ts
    - app/e2e/specs/workers.spec.ts
    - app/e2e/specs/skills.spec.ts
    - app/e2e/specs/tasks.spec.ts
  modified: []
decisions:
  - "ChatPOM navigates to project chat tab via /projects/{id} + tab click; does not assert full LLM response, only UI state"
  - "AgentsPOM.createAgent uses Manual mode card in AgentCreator dialog — simplest flow for E2E"
  - "Agents delete uses window.confirm — spec sets page.on('dialog') handler before clicking delete"
  - "Workers and Skills use Sheet+Dialog pattern — POM waits for dialog visibility before interacting"
  - "TasksPOM handles both template-based and manual wizard flows; wizard step detection via active step styling"
  - "All specs use afterAll cleanup via API to delete [TEST] prefixed items in case CRUD tests fail mid-flow"
metrics:
  duration: 180s
  completed: "2026-03-13T18:41:00Z"
---

# Phase 36 Plan 03: Chat, Agents, Workers, Skills, Tasks POMs + E2E Specs Summary

5 Page Object Models and 5 E2E spec files covering chat RAG interaction, agents CRUD, workers CRUD, skills CRUD, and tasks wizard — all using Spanish UI labels extracted from actual component source.

## What Was Built

### 1. Page Object Models (5 files)

**chat.pom.ts (ChatPOM)**
- Locators: messageInput (placeholder text), sendButton, stopButton, exampleQuestions, welcomeHeading, streamingIndicator, botMessages, userMessages, chatUnavailableMessage
- Methods: navigateToProjectChat(id), sendMessage(text), clickExampleQuestion(text), getBotMessageCount(), getUserMessageCount()

**agents.pom.ts (AgentsPOM)**
- Locators: pageTitle, createButton, openclawSection, customSection, createDialog, editSheet
- Methods: goto(), findAgent(name), createAgent(name, opts) using Manual mode, editAgent(name, updates), deleteAgent(name) with confirm dialog

**workers.pom.ts (WorkersPOM)**
- Locators: pageTitle, createButton, workersTable, emptyState, sheet, deleteDialog
- Methods: goto(), findWorker(name), createWorker(name, opts), editWorker(name, updates), deleteWorker(name)

**skills.pom.ts (SkillsPOM)**
- Locators: pageTitle, createButton, skillsGrid, emptyState, searchInput, sheet, deleteDialog, filterAll
- Methods: goto(), findSkill(name), createSkill(name, opts with instructions), editSkill(name, updates), deleteSkill(name)

**tasks.pom.ts (TasksPOM)**
- Locators: pageTitle, newTaskButton, taskGrid, emptyState, templatesHeading, templateCards, filter buttons, wizard elements (heading, steps, name input, next/prev buttons, save/launch)
- Methods: goto(), gotoNewTask(), findTemplate(name), findTask(name), useTemplate(name), createFromTemplate(templateName, taskName), createTask(taskName, opts), getCurrentWizardStep()

### 2. E2E Spec Files (5 files)

**chat.spec.ts (E2E-06)** — 3 tests in serial
- beforeAll: creates [TEST] project via API, adds note source, enables RAG
- Tests: chat panel shows input, example questions displayed, send message shows response area
- afterAll: deletes test project

**agents.spec.ts (E2E-07)** — 5 tests in serial
- Tests: page loads with list, OpenClaw + custom sections visible, create agent, edit agent description, delete agent
- afterAll: API cleanup of [TEST] agents

**workers.spec.ts (E2E-08)** — 4 tests in serial
- Tests: page loads, create worker, edit worker, delete worker
- afterAll: API cleanup of [TEST] workers

**skills.spec.ts (E2E-09)** — 4 tests in serial
- Tests: page loads, create skill (with instructions), edit skill, delete skill
- afterAll: API cleanup of [TEST] skills

**tasks.spec.ts (E2E-10)** — 3 tests in serial
- Tests: page loads with heading, templates visible (conditional), wizard step-through with draft save
- afterAll: API cleanup of [TEST] tasks

## Verification Results

- All 5 POM files exist under e2e/pages/
- All 5 spec files exist under e2e/specs/
- POMs use Spanish labels extracted from source (placeholders, button text, headings)
- Specs use [TEST] prefix via testName() and serial ordering for CRUD
- `npm run build` passes without errors

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 58c1cd4 | 5 POM files for chat, agents, workers, skills, tasks |
| 2 | 2ab2894 | 5 E2E spec files covering E2E-06 through E2E-10 |

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

All 10 created files verified on disk (5 POMs, 5 specs). Both commit hashes (58c1cd4, 2ab2894) verified in git log.
