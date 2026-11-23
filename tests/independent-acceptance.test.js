import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { createTask, searchTasks, TaskManager } from "../src/task-manager.js";

test("valid task creation trims text and supplies model metadata", () => {
  const task = createTask("  Ship change  ", "  Run the targeted tests  ");

  assert.equal(task.title, "Ship change");
  assert.equal(task.description, "Run the targeted tests");
  assert.ok(task.id !== undefined && task.id !== null, "task id is generated");
  assert.ok(task.createdAt !== undefined && task.createdAt !== null, "creation timestamp is generated");

  const timestamp = typeof task.createdAt === "number"
    ? task.createdAt
    : Date.parse(task.createdAt);
  assert.ok(Number.isFinite(timestamp), "creation timestamp is usable");
});

test("generated task ids are unique", () => {
  const first = createTask("First");
  const second = createTask("Second");
  assert.notEqual(first.id, second.id);
});

test("title and description length boundaries are enforced after trimming", () => {
  assert.equal(createTask("x".repeat(120), "d".repeat(1000)).title.length, 120);
  assert.equal(createTask("x", "d".repeat(1000)).description.length, 1000);

  assert.throws(() => createTask("x".repeat(121)), /120|length|title/i);
  assert.throws(() => createTask("x", "d".repeat(1001)), /1000|length|description/i);
});

test("missing, whitespace-only, and non-string titles are rejected", () => {
  assert.throws(() => createTask(""), /required/i);
  assert.throws(() => createTask(" \t\n "), /required/i);
  assert.throws(() => createTask(null), /string/i);
});

test("missing, empty, and null descriptions remain optional", () => {
  assert.equal(createTask("One").description, "");
  assert.equal(createTask("Two", "").description, "");
  assert.equal(createTask("Three", null).description, "");
});

test("persistence reload restores valid saved tasks", () => {
  const values = new Map();
  const storage = {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    }
  };

  const first = new TaskManager(storage).create("Reload me", "Persisted description");
  const reloaded = new TaskManager(storage);

  assert.deepEqual(reloaded.list(), [first]);
});

test("write failures do not modify the in-memory task list", () => {
  const storage = {
    getItem() {
      return null;
    },
    setItem() {
      throw new Error("disk full");
    }
  };
  const manager = new TaskManager(storage);

  assert.throws(
    () => manager.create("Unsaved", "Safe in-memory state"),
    /disk full/
  );
  assert.deepEqual(manager.list(), []);
});

test("read failures leave the task manager usable with an empty list", () => {
  const storage = {
    getItem() {
      throw new Error("storage unavailable");
    }
  };

  const manager = new TaskManager(storage);
  assert.deepEqual(manager.list(), []);
});

test("tasks are listed in reverse chronological order", () => {
  const storage = {
    getItem() {
      return JSON.stringify([
        { id: 1, title: "Old", description: "", createdAt: "2026-01-01T00:00:00.000Z" },
        { id: 2, title: "New", description: "", createdAt: "2026-01-03T00:00:00.000Z" },
        { id: 3, title: "Middle", description: "", createdAt: "2026-01-02T00:00:00.000Z" }
      ]);
    }
  };

  assert.deepEqual(
    new TaskManager(storage).list().map((task) => task.title),
    ["New", "Middle", "Old"]
  );
});

test("the form and renderer expose accessible feedback and safe text rendering", async () => {
  const [html, appSource] = await Promise.all([
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../src/app.js", import.meta.url), "utf8")
  ]);

  assert.match(html, /<input[^>]+id="task-title"[^>]+required/s);
  assert.match(html, /id="task-error"[^>]+role="alert"/);
  assert.match(html, /<textarea[^>]+id="task-description"/);
  assert.doesNotMatch(appSource, /\.innerHTML\s*=/);
  assert.match(appSource, /\.textContent\s*=/);
  assert.match(appSource, /manager\.create\(/);
  assert.match(appSource, /renderTasks\(\)/);
});

test("dashboard structure exposes overview, search, task list, and distinct empty states", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

  assert.match(html, /<header[^>]*class="workspace-header"/);
  assert.match(html, /id="total-count"/);
  assert.match(html, /id="match-count"/);
  assert.match(html, /<label[^>]+for="task-search"[^>]*>[\s\S]*?Search tasks/);
  assert.match(html, /id="task-search"/);
  assert.match(html, /id="task-list"/);
  assert.match(html, /id="task-empty"[^>]+role="status"/);
  assert.match(html, /id="task-success"[^>]+role="status"/);
});

test("live search matches title and description case-insensitively and not metadata", () => {
  const tasks = [
    { id: 1, title: "Write Release Notes", description: "Document the Dashboard", createdAt: "2026-01-01" },
    { id: 2, title: "Fix build", description: "Update the workflow", createdAt: "2026-01-02" }
  ];

  assert.deepEqual(searchTasks(tasks, "release").map((task) => task.id), [1]);
  assert.deepEqual(searchTasks(tasks, "DASHBOARD").map((task) => task.id), [1]);
  assert.deepEqual(searchTasks(tasks, "workflow").map((task) => task.id), [2]);
  assert.deepEqual(searchTasks(tasks, "2026"), []);
  assert.deepEqual(searchTasks(tasks, "2"), [], "search must not match ids");
  assert.equal(tasks.length, 2, "search must not mutate the source array");
});

test("whitespace-only search clears filtering and does not alter task order", () => {
  const tasks = [
    { id: 1, title: "Old", description: "", createdAt: "2026-01-01" },
    { id: 2, title: "New", description: "", createdAt: "2026-01-02" }
  ];
  const result = searchTasks(tasks, " \t\n ");

  assert.notEqual(result, tasks);
  assert.deepEqual(result, tasks);
});

test("search safely handles HTML-like text and never interprets it as markup", () => {
  const hostile = '<img src=x onerror="alert(1)">';
  const tasks = [{ id: 1, title: hostile, description: "<script>alert(1)</script>", createdAt: "2026-01-01" }];

  assert.deepEqual(searchTasks(tasks, "img src"), tasks);
  assert.deepEqual(searchTasks(tasks, "script"), tasks);
});

test("persistence write failure preserves existing in-memory tasks", () => {
  const existing = { id: 1, title: "Existing", description: "", createdAt: "2026-01-01T00:00:00.000Z" };
  const manager = new TaskManager({
    getItem() {
      return JSON.stringify([existing]);
    },
    setItem() {
      throw new Error("disk full");
    }
  });

  assert.throws(() => manager.create("Unsaved", "Must not appear"), /disk full/);
  assert.deepEqual(manager.list(), [existing]);
});

test("corrupt persisted JSON leaves an empty usable manager with load feedback data", () => {
  const manager = new TaskManager({
    getItem() {
      return "{not valid json";
    }
  });

  assert.deepEqual(manager.list(), []);
  assert.ok(manager.loadError instanceof Error);
  assert.equal(manager.create("Continue safely", "").title, "Continue safely");
});

test("dashboard renderer updates counts and handles both empty states", async () => {
  const [appSource, html] = await Promise.all([
    readFile(new URL("../src/app.js", import.meta.url), "utf8"),
    readFile(new URL("../index.html", import.meta.url), "utf8")
  ]);

  assert.match(appSource, /totalCount\.textContent\s*=/);
  assert.match(appSource, /matchCount\.textContent\s*=/);
  assert.match(appSource, /manager\.search\(searchInput\.value\)/);
  assert.match(appSource, /searchInput\.addEventListener\("input",\s*renderTasks\)/);
  assert.match(appSource, /No tasks yet\. Create your first task above\./);
  assert.match(appSource, /No tasks match your search\./);
  assert.match(html, /role="status"[\s\S]*aria-live="polite"|aria-live="polite"[\s\S]*role="status"/);
});

test("creation and persistence feedback remain visible and announced", async () => {
  const [html, appSource] = await Promise.all([
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../src/app.js", import.meta.url), "utf8")
  ]);

  assert.match(html, /id="task-error"[^>]+role="alert"/);
  assert.match(html, /id="task-success"[^>]+role="status"/);
  assert.match(appSource, /Task created successfully\./);
  assert.match(appSource, /Unable to save task because browser storage is unavailable\./);
  assert.match(appSource, /Unable to load saved tasks\. You can continue creating new tasks\./);
});

test("responsive stylesheet includes desktop and narrow-screen layouts", async () => {
  const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(css, /@media\s*\([^)]*(max|min)-width/s);
  assert.match(css, /@media\s*\([^)]*max-width\s*:\s*(?:[678][0-9]{2}|[1][01][0-9]{2})px/s);
  assert.match(css, /:focus-visible/);
  assert.match(css, /grid-template-columns/);
});
