import test from "node:test";
import assert from "node:assert/strict";

import { createTask, searchTasks, TaskManager } from "../src/task-manager.js";

test("creates a task with a title and optional description", () => {
  const task = createTask("  Write tests  ", "  Cover task creation  ");

  assert.equal(task.title, "Write tests");
  assert.equal(task.description, "Cover task creation");
});

test("creates a task with an omitted description", () => {
  const task = createTask("Review changes");

  assert.equal(task.description, "");
});

test("rejects missing and whitespace-only titles", () => {
  assert.throws(() => createTask(""), /required/);
  assert.throws(() => createTask("   "), /required/);
});

test("saves and lists a created task", () => {
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

  const task = manager.create("Ship change", "Run the targeted tests");

  assert.deepEqual(manager.list(), [task]);
  assert.deepEqual(new TaskManager(storage).list(), [task]);
});

test("does not retain a task when persistence fails", () => {
  const manager = new TaskManager({
    getItem() {
      return null;
    },
    setItem() {
      throw new Error("disk full");
    }
  });

  assert.throws(() => manager.create("Unsaved", "Keep data safe"), /disk full/);
  assert.deepEqual(manager.list(), []);
});

test("searches task titles and descriptions without changing saved tasks", () => {
  const manager = new TaskManager();
  manager.create("Write release notes", "Document the dashboard");
  manager.create("Fix build", "Update the workflow");

  assert.deepEqual(manager.search("DASHBOARD").map((task) => task.title), ["Write release notes"]);
  assert.deepEqual(manager.search("workflow").map((task) => task.title), ["Fix build"]);
  assert.deepEqual(searchTasks(manager.list(), "   "), manager.list());
  assert.equal(manager.list().length, 2);
});
