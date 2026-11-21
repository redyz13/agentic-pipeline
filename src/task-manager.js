let nextId = 1;

export function createTask(title, description = "") {
  if (typeof title !== "string") {
    throw new TypeError("Task title must be a string");
  }

  const normalizedTitle = title.trim();
  if (!normalizedTitle) {
    throw new RangeError("Task title is required");
  }

  if (description == null) {
    description = "";
  }
  if (typeof description !== "string") {
    throw new TypeError("Task description must be a string");
  }

  return {
    id: nextId++,
    title: normalizedTitle,
    description: description.trim()
  };
}

export class TaskManager {
  constructor(storage = null) {
    this.storage = storage;
    this.tasks = this.loadTasks();
  }

  loadTasks() {
    if (!this.storage) {
      return [];
    }

    const saved = this.storage.getItem("tasks");
    if (!saved) {
      return [];
    }

    try {
      const tasks = JSON.parse(saved);
      return Array.isArray(tasks) ? tasks : [];
    } catch {
      return [];
    }
  }

  create(title, description) {
    const task = createTask(title, description);
    const tasks = [...this.tasks, task];

    if (this.storage) {
      this.storage.setItem("tasks", JSON.stringify(tasks));
    }

    this.tasks = tasks;
    return task;
  }

  list() {
    return [...this.tasks];
  }

  getTasks() {
    return this.list();
  }

  addTask(title, description) {
    return this.create(title, description);
  }
}
