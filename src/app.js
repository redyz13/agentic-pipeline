import { TaskManager } from "./task-manager.js";

const form = document.querySelector("#task-form");
const titleInput = document.querySelector("#task-title");
const descriptionInput = document.querySelector("#task-description");
const searchInput = document.querySelector("#task-search");
const taskList = document.querySelector("#task-list");
const error = document.querySelector("#task-error");
const success = document.querySelector("#task-success");
const emptyState = document.querySelector("#task-empty");
const totalCount = document.querySelector("#total-count");
const matchCount = document.querySelector("#match-count");
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

  const tasks = manager.getTasks();
  const filteredTasks = manager.search(searchInput.value);

  totalCount.textContent = String(tasks.length);
  matchCount.textContent = String(filteredTasks.length);

  if (filteredTasks.length === 0) {
    emptyState.hidden = false;
    emptyState.textContent = tasks.length === 0
      ? "No tasks yet. Create your first task above."
      : "No tasks match your search.";
  } else {
    emptyState.hidden = true;
  }

  for (const task of filteredTasks) {
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

    taskList.append(item);
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  error.textContent = "";
  success.textContent = "";

  if (storageAccessError) {
    error.textContent = "Unable to save task because browser storage is unavailable.";
    return;
  }

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

searchInput.addEventListener("input", renderTasks);

renderTasks();
