import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTask, deleteTask, getTasks, updateTask } from "@/api/tasks";
import { Route } from "@/routes/tasks";
import type { Task, TaskStatus } from "@/types/task";

vi.mock("@/api/tasks", () => ({
  createTask: vi.fn(),
  deleteTask: vi.fn(),
  getTasks: vi.fn(),
  updateTask: vi.fn(),
}));

const mockedCreateTask = vi.mocked(createTask);
const mockedDeleteTask = vi.mocked(deleteTask);
const mockedGetTasks = vi.mocked(getTasks);
const mockedUpdateTask = vi.mocked(updateTask);
const TasksPage = Route.options.component!;

function makeTask(id: number, title: string, status: TaskStatus = "active"): Task {
  return {
    id,
    title,
    description: null,
    priority: id === 1 ? "high" : "medium",
    dueDate: null,
    estimatedMinutes: id === 1 ? 45 : null,
    estimateSource: id === 1 ? "user" : null,
    flexibility: "flexible",
    status,
    createdAt: "2026-09-20 09:00:00",
    updatedAt: "2026-09-20 09:00:00",
  };
}

function rowFor(title: string) {
  const row = screen.getByText(title).closest("li");
  if (!row) {
    throw new Error(`No task row for ${title}`);
  }
  return row;
}

describe("Tasks page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows loading before rendering the empty state", async () => {
    let resolveTasks: ((tasks: Task[]) => void) | undefined;
    mockedGetTasks.mockReturnValue(
      new Promise((resolve) => {
        resolveTasks = resolve;
      }),
    );

    render(<TasksPage />);

    expect(screen.getByText("Loading tasks...")).toBeTruthy();
    resolveTasks?.([]);

    expect(await screen.findByText("Nothing here.")).toBeTruthy();
  });

  it("shows a load error", async () => {
    mockedGetTasks.mockRejectedValue(new Error("unavailable"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(<TasksPage />);

    expect(await screen.findByText("Could not load tasks.")).toBeTruthy();
  });

  it("renders task states, filters/counts, and task mutations", async () => {
    const active = makeTask(1, "Write report");
    const completed = makeTask(2, "Completed work", "completed");
    const blocked = makeTask(3, "Waiting on feedback", "blocked");
    const created = makeTask(4, "New task");
    const tasks = [active, completed, blocked];
    mockedGetTasks.mockResolvedValue(tasks);
    mockedCreateTask.mockResolvedValue(created);
    mockedUpdateTask.mockImplementation(async (id, input) => {
      const task = [...tasks, created].find((item) => item.id === id);
      if (!task) {
        throw new Error("unknown task");
      }
      return { ...task, status: input.status ?? task.status };
    });
    mockedDeleteTask.mockResolvedValue();
    const user = userEvent.setup();

    render(<TasksPage />);

    expect(await screen.findByText("Write report")).toBeTruthy();
    expect(screen.getByText("Completed work")).toBeTruthy();
    expect(screen.getByText("Waiting on feedback")).toBeTruthy();
    expect(screen.getByRole("button", { name: "all3" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "active1" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "completed1" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "blocked1" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "completed1" }));
    expect(screen.getByText("Completed work")).toBeTruthy();
    expect(screen.queryByText("Write report")).toBeNull();

    await user.click(screen.getByRole("button", { name: "all3" }));
    await user.type(screen.getByLabelText("Task title"), "  New task  ");
    await user.type(screen.getByPlaceholderText("Estimate (minutes)"), "30");
    await user.click(screen.getByRole("button", { name: "Add task" }));

    await waitFor(() =>
      expect(mockedCreateTask).toHaveBeenCalledWith({
        title: "New task",
        dueDate: null,
        priority: "medium",
        estimatedMinutes: 30,
        estimateSource: "user",
        flexibility: "flexible",
      }),
    );
    expect(await screen.findByText("New task")).toBeTruthy();

    await user.click(
      within(rowFor("Write report")).getByRole("button", { name: "Mark as complete" }),
    );
    await waitFor(() => expect(mockedUpdateTask).toHaveBeenCalledWith(1, { status: "completed" }));
    expect(
      within(rowFor("Write report")).getByRole("button", { name: "Mark as active" }),
    ).toBeTruthy();

    await user.click(
      within(rowFor("Waiting on feedback")).getByRole("button", { name: "Unblock" }),
    );
    await waitFor(() => expect(mockedUpdateTask).toHaveBeenCalledWith(3, { status: "active" }));
    expect(
      within(rowFor("Waiting on feedback")).getByRole("button", { name: "Block" }),
    ).toBeTruthy();

    await user.click(within(rowFor("Waiting on feedback")).getByRole("button", { name: "Block" }));
    await waitFor(() => expect(mockedUpdateTask).toHaveBeenCalledWith(3, { status: "blocked" }));

    await user.click(
      within(rowFor("Completed work")).getByRole("button", { name: "Delete Completed work" }),
    );
    await waitFor(() => expect(mockedDeleteTask).toHaveBeenCalledWith(2));
    expect(screen.queryByText("Completed work")).toBeNull();
  });
});
