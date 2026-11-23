import { TaskManager, searchTasks } from "./task-manager.js";

const form = document.querySelector("#task-form");
const titleInput = document.querySelector("#task-title");
const descriptionInput = document.querySelector("#task-description");
const searchInput = document.querySelector("#task-search");
const taskList = document.querySelector("#task-list");
const feedback = document.querySelector("#task-error");
const count = document.querySelector("#task-count");
const emptyState = document.querySelector("#task-empty");
let storage = null;
let storageAccessError = null;

try {
  storage = globalThis.localStorage ?? null;
} catch (failure) {
  storageAccessError = failure;
}

const manager = new TaskManager(storage);

if (storageAccessError || manager.loadError) {
  feedback.textContent = "Unable to load saved tasks. You can continue creating new tasks.";
  feedback.className = "feedback error";
}

function renderTasks() {
  taskList.replaceChildren();
  const allTasks = manager.getTasks();
  const visibleTasks = searchTasks(allTasks, searchInput.value);

  count.textContent = searchInput.value.trim()
    ? `${visibleTasks.length} of ${allTasks.length} tasks`
    : `${allTasks.length} ${allTasks.length === 1 ? "task" : "tasks"}`;

  if (!allTasks.length) {
    emptyState.textContent = "No tasks yet. Create your first task above.";
    emptyState.hidden = false;
  } else if (!visibleTasks.length) {
    emptyState.textContent = "No tasks match your search.";
    emptyState.hidden = false;
  } else {
    emptyState.hidden = true;
  }

  for (const task of visibleTasks) {
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
  feedback.textContent = "";
  feedback.className = "feedback";

  try {
    const task = manager.create(titleInput.value, descriptionInput.value);
    form.reset();
    feedback.textContent = `Created “${task.title}”.`;
    feedback.className = "feedback success";
    titleInput.focus();
    renderTasks();
  } catch (failure) {
    feedback.textContent = failure instanceof Error
      ? failure.message
      : "Unable to create task";
    feedback.className = "feedback error";
  }
});

searchInput.addEventListener("input", renderTasks);
renderTasks();
