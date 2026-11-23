import test from "node:test";
import assert from "node:assert/strict";

import { createTask, TaskManager } from "../src/task-manager.js";

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

test("recovers from a storage read failure and allows task creation", () => {
  const values = new Map();
  let readError;
  let shouldFailRead = true;
  const storage = {
    getItem(key) {
      if (!shouldFailRead) {
        return values.get(key) ?? null;
      }
      shouldFailRead = false;
      readError = new Error("storage unavailable");
      throw readError;
    },
    setItem(key, value) {
      values.set(key, value);
    }
  };
  const manager = new TaskManager(storage);

  assert.deepEqual(manager.list(), []);
  assert.equal(manager.loadError, readError);

  const task = manager.create("Recovered", "Create after read failure");

  assert.deepEqual(manager.list(), [task]);
  assert.equal(values.has("tasks"), true);
  assert.deepEqual(JSON.parse(values.get("tasks")), [task]);
  assert.deepEqual(new TaskManager(storage).list(), [task]);
});
