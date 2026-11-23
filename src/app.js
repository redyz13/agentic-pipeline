import { TaskManager, searchTasks } from "./task-manager.js";

const form = document.querySelector("#task-form");
const titleInput = document.querySelector("#task-title");
const descriptionInput = document.querySelector("#task-description");
const searchInput = document.querySelector("#task-search");
const taskList = document.querySelector("#task-list");
const error = document.querySelector("#task-error");
const success = document.querySelector("#task-success");
const totalCount = document.querySelector("#total-count");
const matchCount = document.querySelector("#match-count");
const emptyState = document.querySelector("#empty-state");
let storage = null;
let storageAccessError = null;

try {
  storage = globalThis.localStorage ?? null;
} catch (failure) {
  storageAccessError = failure;
}

const manager = new TaskManager(storage);

if (storageAccessError || manager.loadError) {
  error.textContent = "Unable to load saved tasks. You can continue creating new tasks.";
}

function renderTasks() {
  taskList.replaceChildren();
  const tasks = searchTasks(manager.getTasks(), searchInput.value);

  totalCount.textContent = String(manager.list().length);
  matchCount.textContent = String(tasks.length);
  emptyState.hidden = tasks.length > 0;

  if (tasks.length === 0) {
    emptyState.textContent = manager.list().length === 0
      ? "No tasks yet. Create one to get started."
      : "No tasks match your search.";
  }

  for (const task of tasks) {
    const item = document.createElement("li");
    item.className = "task-card";

    const title = document.createElement("h3");
    title.textContent = task.title;
    item.append(title);

    if (task.description) {
      const description = document.createElement("p");
      description.textContent = task.description;
      item.append(description);
    }

    const date = document.createElement("time");
    const timestamp = Date.parse(task.createdAt);
    if (Number.isFinite(timestamp)) {
      date.dateTime = task.createdAt;
      date.textContent = new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short"
      }).format(timestamp);
    } else {
      date.textContent = "Created";
    }
    item.append(date);

    taskList.append(item);
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  error.textContent = "";
  success.textContent = "";

  try {
    manager.create(titleInput.value, descriptionInput.value);
    form.reset();
    success.textContent = "Task created successfully.";
    titleInput.focus();
    renderTasks();
  } catch (failure) {
    error.textContent = failure instanceof Error
      ? failure.message
      : "Unable to create task";
  }
});

searchInput.addEventListener("input", () => {
  success.textContent = "";
  renderTasks();
});

renderTasks();
