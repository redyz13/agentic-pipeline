import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { searchTasks } from "../src/task-manager.js";

const tasks = [
  { id: 2, title: "Prepare Report", description: "Review quarterly numbers", createdAt: "2026-01-02" },
  { id: 1, title: "Book travel", description: "Conference in Seattle", createdAt: "2026-01-01" }
];

test("search matches titles and descriptions case-insensitively", () => {
  assert.deepEqual(searchTasks(tasks, "REPORT").map((task) => task.id), [2]);
  assert.deepEqual(searchTasks(tasks, "seattle").map((task) => task.id), [1]);
  assert.deepEqual(searchTasks(tasks, "  quarterly  ").map((task) => task.id), [2]);
});

test("clearing search restores the complete task list", () => {
  assert.deepEqual(searchTasks(tasks, ""), tasks);
  assert.deepEqual(searchTasks(tasks, "   "), tasks);
});

test("search returns no results for unmatched text", () => {
  assert.deepEqual(searchTasks(tasks, "not present"), []);
});

test("dashboard markup exposes search, counts, feedback, and empty state", async () => {
  const [html, appSource, css] = await Promise.all([
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../src/app.js", import.meta.url), "utf8"),
    readFile(new URL("../src/styles.css", import.meta.url), "utf8")
  ]);

  assert.match(html, /id="task-search"[^>]+type="search"/);
  assert.match(html, /id="total-count"/);
  assert.match(html, /id="match-count"/);
  assert.match(html, /id="empty-state"/);
  assert.match(html, /id="task-error"[^>]+role="alert"/);
  assert.match(html, /id="task-success"[^>]+role="status"/);
  assert.match(appSource, /searchTasks\(manager\.getTasks\(\), searchInput\.value\)/);
  assert.doesNotMatch(appSource, /\.innerHTML\s*=/);
  assert.match(appSource, /\.textContent\s*=/);
  assert.match(css, /@media \(max-width: 820px\)/);
  assert.match(css, /@media \(max-width: 560px\)/);
});
