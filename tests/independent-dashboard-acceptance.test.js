import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { createTask, searchTasks, TaskManager } from "../src/task-manager.js";

const storedTask = (overrides = {}) => ({
  id: 1,
  title: "Planning review",
  description: "Prepare the quarterly roadmap",
  createdAt: "2026-01-01T00:00:00.000Z",
  ...overrides
});

test("live search matches titles, descriptions, case, and surrounding whitespace", () => {
  const tasks = [
    storedTask({ id: 2, title: "Prepare Report", description: "Review quarterly numbers" }),
    storedTask({ id: 1, title: "Book travel", description: "Conference in Seattle", createdAt: "2026-01-01T00:00:00.000Z" })
  ];

  assert.deepEqual(searchTasks(tasks, "REPORT").map((task) => task.id), [2]);
  assert.deepEqual(searchTasks(tasks, "seattle").map((task) => task.id), [1]);
  assert.deepEqual(searchTasks(tasks, "  quarterly  ").map((task) => task.id), [2]);
  assert.deepEqual(searchTasks(tasks, "travel").map((task) => task.id), [1]);
});

test("cleared or whitespace-only search restores every task without mutation", () => {
  const tasks = [storedTask({ id: 2 }), storedTask({ id: 1 })];
  const original = structuredClone(tasks);

  assert.deepEqual(searchTasks(tasks, ""), tasks);
  assert.deepEqual(searchTasks(tasks, "   "), tasks);
  assert.deepEqual(searchTasks(tasks, "\t\n"), tasks);
  assert.deepEqual(tasks, original);
});

test("search boundaries return no results and never match unrelated text", () => {
  const tasks = [storedTask()];

  assert.deepEqual(searchTasks(tasks, "not present"), []);
  assert.deepEqual(searchTasks([], "planning"), []);
  assert.deepEqual(searchTasks(tasks, null), tasks);
});

test("title and description limits and required-title validation are preserved", () => {
  assert.equal(createTask("x".repeat(120), "d".repeat(1000)).title.length, 120);
  assert.equal(createTask("x", "d".repeat(1000)).description.length, 1000);
  assert.throws(() => createTask(""), /required/i);
  assert.throws(() => createTask(" \t\n "), /required/i);
  assert.throws(() => createTask("x".repeat(121)), /120|length|title/i);
  assert.throws(() => createTask("x", "d".repeat(1001)), /1000|length|description/i);
  assert.equal(createTask("Optional", null).description, "");
});

test("valid tasks persist, reload, and remain in reverse chronological order", () => {
  const values = new Map();
  const storage = {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    }
  };

  const manager = new TaskManager(storage);
  const first = manager.create("Old", "First");
  const second = manager.create("New", "Second");
  const reloaded = new TaskManager(storage);

  assert.deepEqual(reloaded.list(), [second, first]);
  assert.deepEqual(reloaded.list().map((task) => task.title), ["New", "Old"]);
});

test("write failures preserve in-memory state and read failures leave the manager usable", () => {
  const writeFailure = new TaskManager({
    getItem() {
      return null;
    },
    setItem() {
      throw new Error("disk full");
    }
  });

  assert.throws(() => writeFailure.create("Unsaved", ""), /disk full/);
  assert.deepEqual(writeFailure.list(), []);

  const readFailure = new TaskManager({
    getItem() {
      throw new Error("storage unavailable");
    }
  });

  assert.deepEqual(readFailure.list(), []);
  assert.ok(readFailure.loadError instanceof Error);
});

test("malformed and non-array saved data are treated as empty lists", () => {
  for (const saved of ["{broken", JSON.stringify({ tasks: [] }), JSON.stringify("invalid")]) {
    const manager = new TaskManager({
      getItem() {
        return saved;
      }
    });

    assert.deepEqual(manager.list(), []);
  }
});

test("dashboard markup exposes counts, search, empty states, feedback, and accessible controls", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

  assert.match(html, /<header\b[^>]*>[\s\S]*?<h1[^>]*>Taskboard<\/h1>/);
  assert.match(html, /<form[^>]+id="task-form"/);
  assert.match(html, /<label[^>]+for="task-title"[^>]*>[\s\S]*?<\/label>/);
  assert.match(html, /<input[^>]+id="task-title"[^>]+required/s);
  assert.match(html, /<label[^>]+for="task-description"[^>]*>[\s\S]*?<\/label>/);
  assert.match(html, /<textarea[^>]+id="task-description"/);
  assert.match(html, /<label[^>]+for="task-search"[^>]*>[\s\S]*?<\/label>/);
  assert.match(html, /<input[^>]+id="task-search"[^>]+type="search"/);
  assert.match(html, /id="total-count"/);
  assert.match(html, /id="match-count"/);
  assert.match(html, /id="empty-state"[^>]+role="status"/);
  assert.match(html, /id="task-error"[^>]+role="alert"/);
  assert.match(html, /id="task-success"[^>]+role="status"/);
  assert.match(html, /<ul[^>]+id="task-list"[^>]+aria-live="polite"/);
});

test("dashboard behavior renders counts and empty states and preserves safe text", async () => {
  const appSource = await readFile(new URL("../src/app.js", import.meta.url), "utf8");

  assert.match(appSource, /searchTasks\(manager\.getTasks\(\), searchInput\.value\)/);
  assert.match(appSource, /totalCount\.textContent\s*=\s*String\(manager\.list\(\)\.length\)/);
  assert.match(appSource, /matchCount\.textContent\s*=\s*String\(tasks\.length\)/);
  assert.match(appSource, /No tasks yet\. Create one to get started\./);
  assert.match(appSource, /No tasks match your search\./);
  assert.match(appSource, /Task created successfully\./);
  assert.match(appSource, /manager\.create\(titleInput\.value,\s*descriptionInput\.value\)/);
  assert.match(appSource, /renderTasks\(\)/);
  assert.match(appSource, /titleInput\.focus\(\)/);
  assert.match(appSource, /searchInput\.addEventListener\("input"/);
  assert.doesNotMatch(appSource, /\.innerHTML\s*=/);
  assert.match(appSource, /title\.textContent\s*=/);
  assert.match(appSource, /description\.textContent\s*=/);
});

test("responsive layout has desktop, tablet, and mobile rules plus keyboard focus", async () => {
  const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(css, /@media \(max-width: 820px\)/);
  assert.match(css, /@media \(max-width: 560px\)/);
  assert.match(css, /\.dashboard\s*\{[^}]*grid-template-columns/s);
  assert.match(css, /:focus-visible/);
  assert.match(css, /:focus/);
});
