
# Lab Application Architecture

Status: Approved for the experimental repository only.

## 1. Purpose

Develop a minimal browser-based task management application to validate the agentic development workflow.

This architecture does not apply to the E.C.H.O. production system.

## 2. Technology Stack

- HTML5, CSS3, and vanilla JavaScript (ES modules).
- Browser localStorage for persistence.
- Node.js built-in test runner for automated tests.
- No backend or external database.
- No frontend framework.
- No third-party runtime dependencies without approval.

## 3. Application Structure

- `src/`: Application source code.
- `tests/`: Automated tests.
- `docs/`: Approved specifications and documentation.

The Planning Agent may propose the specific files within these directories.

## 4. Task Model

Each task contains:

- `id`: Unique identifier.
- `title`: Required string, 1–120 characters after trimming.
- `description`: Optional string, maximum 1000 characters.
- `createdAt`: Creation timestamp.

## 5. Functional Behavior

- Users can create tasks through a web form.
- A title is required.
- A description is optional.
- Invalid input must produce a visible error.
- Successfully created tasks must be persisted.
- Persisted tasks must survive page reloads.
- Tasks must be displayed in reverse chronological order.
- Newly created tasks must appear without a page reload.
- Persistence errors must be reported to the user.
- User-provided text must be rendered safely.

## 6. Scope Exclusions

The initial application does not support:

- Authentication or authorization.
- Multiple users or shared task lists.
- Editing or deleting tasks.
- Task status or priority.
- Backend APIs.
- Remote synchronization.

## 7. Testing Requirements

Business logic must be testable independently from the browser interface.

Automated tests must cover:

- Valid task creation.
- Missing and whitespace-only titles.
- Optional descriptions.
- Input length boundaries.
- Persistence and retrieval.
- Persistence failures.
- Task ordering.

Browser interaction must also be verified before accepting the implementation.

## 8. Engineering Constraints

- Keep the implementation minimal and modular.
- Use semantic HTML and accessible form controls.
- Avoid unsafe HTML injection.
- Do not modify repository governance or security files without explicit human approval.
- Do not introduce unrelated functionality.
- Do not store sensitive or personal information.

## 9. Change Control

Any deviation from this architecture requires explicit human approval before implementation.
