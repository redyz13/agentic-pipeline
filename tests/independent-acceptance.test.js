import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { createTask, TaskManager } from "../src/task-manager.js";

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
