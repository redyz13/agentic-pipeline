let nextId = 1;
const MAX_TITLE_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 1000;

function toTimestamp(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
}

function sortByReverseChronological(tasks) {
  tasks.sort((left, right) => {
    const timestampDifference =
      toTimestamp(right.createdAt) - toTimestamp(left.createdAt);
    if (timestampDifference !== 0) {
      return timestampDifference;
    }

    const rightId = typeof right?.id === "number" ? right.id : 0;
    const leftId = typeof left?.id === "number" ? left.id : 0;
    return rightId - leftId;
  });
  return tasks;
}

function updateNextId(tasks) {
  let maxId = 0;
  for (const task of tasks) {
    if (typeof task?.id === "number" && Number.isFinite(task.id)) {
      maxId = Math.max(maxId, task.id);
    }
  }
  nextId = Math.max(nextId, maxId + 1);
}

export function createTask(title, description = "") {
  if (typeof title !== "string") {
    throw new TypeError("Task title must be a string");
  }

  const normalizedTitle = title.trim();
  if (!normalizedTitle) {
    throw new RangeError("Task title is required");
  }
  if (normalizedTitle.length > MAX_TITLE_LENGTH) {
    throw new RangeError(`Task title must be ${MAX_TITLE_LENGTH} characters or fewer`);
  }

  if (description == null) {
    description = "";
  }
  if (typeof description !== "string") {
    throw new TypeError("Task description must be a string");
  }
  const normalizedDescription = description.trim();
  if (normalizedDescription.length > MAX_DESCRIPTION_LENGTH) {
    throw new RangeError(`Task description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer`);
  }

  return {
    id: nextId++,
    title: normalizedTitle,
    description: normalizedDescription,
    createdAt: new Date().toISOString()
  };
}

export function searchTasks(tasks, query) {
  const normalizedQuery = typeof query === "string" ? query.trim().toLowerCase() : "";
  if (!normalizedQuery) {
    return [...tasks];
  }

  return tasks.filter((task) => {
    const title = typeof task?.title === "string" ? task.title : "";
    const description = typeof task?.description === "string" ? task.description : "";
    return title.toLowerCase().includes(normalizedQuery)
      || description.toLowerCase().includes(normalizedQuery);
  });
}

export class TaskManager {
  constructor(storage = null) {
    this.storage = storage;
    this.loadError = null;
    this.tasks = this.loadTasks();
    updateNextId(this.tasks);
  }

  loadTasks() {
    if (!this.storage) {
      return [];
    }

    let saved;
    try {
      saved = this.storage.getItem("tasks");
    } catch (error) {
      this.loadError = error;
      return [];
    }

    if (!saved) {
      return [];
    }

    try {
      const tasks = JSON.parse(saved);
      if (!Array.isArray(tasks)) {
        this.loadError = new Error("Saved tasks are invalid");
        return [];
      }
      return sortByReverseChronological(tasks);
    } catch (error) {
      this.loadError = error;
      return [];
    }
  }

  create(title, description) {
    const task = createTask(title, description);
    const tasks = sortByReverseChronological([...this.tasks, task]);

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

export default TaskManager;
