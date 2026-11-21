import { TaskManager } from "./task-manager.js";

const storage = globalThis.localStorage ?? null;
const manager = new TaskManager(storage);

const form = document.querySelector("#task-form");
const titleInput = document.querySelector("#task-title");
const descriptionInput = document.querySelector("#task-description");
const taskList = document.querySelector("#task-list");
const error = document.querySelector("#task-error");

function renderTasks() {
  taskList.replaceChildren();

  for (const task of manager.getTasks()) {
    const item = document.createElement("li");

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

  try {
    manager.create(titleInput.value, descriptionInput.value);
    form.reset();
    titleInput.focus();
    renderTasks();
  } catch (failure) {
    error.textContent = failure instanceof Error
      ? failure.message
      : "Unable to create task";
  }
});

renderTasks();
