import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { createTask, searchTasks, TaskManager } from "../src/task-manager.js";

function memoryStorage(initial = null) {
  const values = new Map();
  if (initial !== null) {
    values.set("tasks", initial);
  }
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    }
  };
}

test("independent dashboard search matches title or description case-insensitively", () => {
  const tasks = [
    createTask("Fix Navigation", "Update the MOBILE menu"),
    createTask("Write Report", "Include Quarterly totals")
  ];

  assert.deepEqual(
    searchTasks(tasks, "navigation").map((task) => task.title),
    ["Fix Navigation"]
  );
  assert.deepEqual(
    searchTasks(tasks, "QUARTERLY").map((task) => task.title),
    ["Write Report"]
  );
  assert.deepEqual(
    searchTasks(tasks, "mobile").map((task) => task.title),
    ["Fix Navigation"]
  );
});

test("independent dashboard search is live in meaning and never mutates saved tasks", () => {
  const tasks = [
    { id: 2, title: "New", description: "Second", createdAt: "2026-01-02T00:00:00.000Z" },
    { id: 1, title: "Old", description: "First", createdAt: "2026-01-01T00:00:00.000Z" }
  ];
  const before = structuredClone(tasks);

  assert.equal(searchTasks(tasks, "").length, 2);
  assert.equal(searchTasks(tasks, "   ").length, 2);
  assert.equal(searchTasks(tasks, "missing").length, 0);
  assert.deepEqual(tasks, before);
  assert.deepEqual(searchTasks(tasks, "").map((task) => task.id), [2, 1]);
});

test("independent dashboard search helper tolerates malformed task collections", () => {
  assert.deepEqual(searchTasks(null, "title"), []);
  assert.deepEqual(searchTasks({}, "title"), []);
  assert.deepEqual(searchTasks([null, { title: null, description: null }], "title"), []);
});

test("independent dashboard creation, reload, and ordering remain consistent", () => {
  const storage = memoryStorage();
  const manager = new TaskManager(storage);
  const first = manager.create("First", "Old description");
  const second = manager.create("Second", "Newest description");

  assert.deepEqual(
    new TaskManager(storage).list().map((task) => task.title),
    ["Second", "First"]
  );
  assert.deepEqual(manager.list(), [second, first]);
});

test("independent dashboard reload handles invalid persisted JSON and non-array data", () => {
  assert.deepEqual(new TaskManager(memoryStorage("{bad")).list(), []);
  assert.deepEqual(new TaskManager(memoryStorage(JSON.stringify({ tasks: [] }))).list(), []);
});

test("independent dashboard read failures leave an empty usable manager", () => {
  const storage = {
    getItem() {
      throw new Error("storage unavailable");
    }
  };
  const manager = new TaskManager(storage);

  assert.deepEqual(manager.list(), []);
  assert.ok(manager.loadError);
  assert.doesNotThrow(() => manager.create("Recovery", ""));
});

test("independent dashboard write failures keep tasks in memory unchanged", () => {
  const storage = {
    getItem() {
      return null;
    },
    setItem() {
      throw new Error("disk full");
    }
  };
  const manager = new TaskManager(storage);

  assert.throws(() => manager.create("Unsaved", "No persistence"), /disk full/);
  assert.deepEqual(manager.list(), []);
});

test("independent dashboard title and description boundaries remain enforced", () => {
  assert.equal(createTask("x".repeat(120), "d".repeat(1000)).title.length, 120);
  assert.equal(createTask("x".repeat(120), "d".repeat(1000)).description.length, 1000);
  assert.throws(() => createTask("x".repeat(121)), /120|length|title/i);
  assert.throws(() => createTask("title", "d".repeat(1001)), /1000|length|description/i);
  assert.throws(() => createTask(" \n\t "), /required/i);
  assert.equal(createTask("Optional", null).description, "");
});

test("independent dashboard markup exposes dashboard, search, counts, and feedback accessibly", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

  assert.match(html, /<main[^>]+class="dashboard"/);
  assert.match(html, /<header[^>]+class="dashboard-header"/);
  assert.match(html, /<form[^>]+id="task-form"/);
  assert.match(html, /<input[^>]+id="task-title"[^>]+required/s);
  assert.match(html, /<textarea[^>]+id="task-description"/);
  assert.match(html, /<label[^>]+for="task-search"/);
  assert.match(html, /<input[^>]+id="task-search"[^>]+type="search"/);
  assert.match(html, /id="task-count"[^>]+aria-live="polite"/);
  assert.match(html, /id="task-error"[^>]+role="alert"[^>]+aria-live="polite"/);
  assert.match(html, /id="task-empty"[^>]+class="empty-state"[^>]+hidden/);
  assert.match(html, /<ul[^>]+id="task-list"/);
});

test("independent dashboard app preserves live search, counts, states, and safe rendering", async () => {
  const appSource = await readFile(new URL("../src/app.js", import.meta.url), "utf8");

  assert.match(appSource, /searchInput\.addEventListener\("input",\s*renderTasks\)/);
  assert.match(appSource, /searchTasks\(allTasks,\s*searchInput\.value\)/);
  assert.match(appSource, /No tasks yet\. Create your first task above\./);
  assert.match(appSource, /No tasks match your search\./);
  assert.match(appSource, /of \${allTasks\.length} tasks/);
  assert.match(appSource, /Created “\${task\.title}”\./);
  assert.match(appSource, /Unable to load saved tasks/);
  assert.match(appSource, /Unable to create task/);
  assert.match(appSource, /taskList\.replaceChildren\(\)/);
  assert.match(appSource, /\.textContent\s*=/);
  assert.doesNotMatch(appSource, /\.innerHTML\s*=|\binsertAdjacentHTML\s*\(/);
  assert.match(appSource, /titleInput\.focus\(\)/);
});

test("independent dashboard CSS provides responsive desktop, tablet, and mobile layouts", async () => {
  const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(css, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /@media\s*\(max-width:\s*720px\)/);
  assert.match(css, /#task-form\s*\{[^}]*grid-template-columns:\s*1fr/s);
  assert.match(css, /\.task-list\s*\{[^}]*grid-template-columns:\s*1fr/s);
  assert.match(css, /prefers-reduced-motion/);
});
