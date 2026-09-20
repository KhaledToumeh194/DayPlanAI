import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getTasks, updateTask } from "@/api/tasks";
import { generatePlan, getTodayPlan, updatePlanItem } from "@/api/plans";
import { Route } from "@/routes/index";
import type { Plan, PlanItem, PlanItemStatus } from "@/types/plan";
import type { Task } from "@/types/task";

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  };
});

vi.mock("@/api/tasks", () => ({
  getTasks: vi.fn(),
  updateTask: vi.fn(),
}));

vi.mock("@/api/plans", () => ({
  generatePlan: vi.fn(),
  getTodayPlan: vi.fn(),
  updatePlanItem: vi.fn(),
}));

const mockedGeneratePlan = vi.mocked(generatePlan);
const mockedGetTasks = vi.mocked(getTasks);
const mockedGetTodayPlan = vi.mocked(getTodayPlan);
const mockedUpdatePlanItem = vi.mocked(updatePlanItem);
const mockedUpdateTask = vi.mocked(updateTask);
const TodayPage = Route.options.component!;

function makeTask(id: number, title: string, status: Task["status"] = "active"): Task {
  return {
    id,
    title,
    description: null,
    priority: "medium",
    dueDate: null,
    estimatedMinutes: 25,
    estimateSource: "user",
    flexibility: "flexible",
    status,
    createdAt: "2026-09-20 09:00:00",
    updatedAt: "2026-09-20 09:00:00",
  };
}

function makeItem(id: number, title: string, status: PlanItemStatus = "planned"): PlanItem {
  return {
    id,
    taskId: id,
    title,
    detail: "Details",
    estimatedMinutes: 30,
    actualMinutes: null,
    estimateSource: "ai",
    userModified: false,
    position: id,
    status,
    reason: "Scheduled next",
  };
}

function makePlan(items: PlanItem[], inputText = "Prepare for the presentation"): Plan {
  return {
    id: 1,
    planDate: "2026-09-20",
    inputText,
    workloadEstimateMinutes: 90,
    createdAt: "2026-09-20 09:00:00",
    items,
  };
}

describe("Today page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads a saved plan, restores its input, renders active tasks, and shows counts", async () => {
    const plan = makePlan([
      makeItem(1, "Outline slides", "completed"),
      makeItem(2, "Practice talk"),
    ]);
    mockedGetTodayPlan.mockResolvedValue(plan);
    mockedGetTasks.mockResolvedValue([
      makeTask(1, "Send notes"),
      makeTask(2, "Already complete", "completed"),
    ]);

    render(<TodayPage />);

    expect(await screen.findByRole("heading", { name: "Today's plan" })).toBeTruthy();
    expect(screen.getByDisplayValue("Prepare for the presentation")).toBeTruthy();
    expect(screen.getByText("Outline slides")).toBeTruthy();
    expect(screen.getByText("Practice talk")).toBeTruthy();
    expect(screen.getByText("About 90 minutes of planned work")).toBeTruthy();
    expect(screen.getByText("Send notes")).toBeTruthy();
    expect(screen.queryByText("Already complete")).toBeNull();
    expect(screen.getByText(/1 of 2 plan items done/)).toBeTruthy();
    expect(screen.getByText("1 active tasks")).toBeTruthy();
  });

  it("shows loading then leaves the plan section absent when there is no saved plan", async () => {
    let resolvePlan: ((plan: Plan | null) => void) | undefined;
    mockedGetTodayPlan.mockReturnValue(
      new Promise((resolve) => {
        resolvePlan = resolve;
      }),
    );
    mockedGetTasks.mockResolvedValue([]);

    render(<TodayPage />);

    expect(screen.getByText("Loading today's plan...")).toBeTruthy();
    resolvePlan?.(null);

    await waitFor(() => expect(screen.queryByText("Loading today's plan...")).toBeNull());
    expect(screen.queryByRole("heading", { name: "Today's plan" })).toBeNull();
  });

  it("generates a plan and reports plan failures", async () => {
    mockedGetTodayPlan.mockResolvedValue(null);
    mockedGetTasks.mockResolvedValue([]);
    const generated = makePlan([makeItem(3, "Generated work")], "Finish a draft");
    mockedGeneratePlan.mockResolvedValue(generated);
    const user = userEvent.setup();

    render(<TodayPage />);

    await screen.findByText("No active tasks.");
    await user.type(screen.getByLabelText("What's on your plate?"), "  Finish a draft  ");
    await user.click(screen.getByRole("button", { name: "Generate today's plan" }));

    await waitFor(() =>
      expect(mockedGeneratePlan).toHaveBeenCalledWith({ inputText: "Finish a draft" }),
    );
    expect(await screen.findByText("Generated work")).toBeTruthy();

    mockedGeneratePlan.mockRejectedValueOnce(new Error("unavailable"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await user.clear(screen.getByLabelText("What's on your plate?"));
    await user.type(screen.getByLabelText("What's on your plate?"), "Try again");
    await user.click(screen.getByRole("button", { name: "Generate today's plan" }));

    expect(await screen.findByText("Could not generate today's plan.")).toBeTruthy();
  });

  it("updates plan-item status and completion count, and completes active tasks", async () => {
    const plan = makePlan([makeItem(1, "Finish outline")]);
    const task = makeTask(1, "Call advisor");
    mockedGetTodayPlan.mockResolvedValue(plan);
    mockedGetTasks.mockResolvedValue([task]);
    mockedUpdatePlanItem.mockImplementation(async (id, input) => ({
      ...plan.items.find((item) => item.id === id)!,
      status: input.status ?? "planned",
    }));
    mockedUpdateTask.mockImplementation(async (id, input) => ({
      ...task,
      id,
      status: input.status ?? task.status,
    }));
    const user = userEvent.setup();

    render(<TodayPage />);

    await screen.findByText("Finish outline");
    await user.selectOptions(screen.getByRole("combobox"), "partial");
    await waitFor(() =>
      expect(mockedUpdatePlanItem).toHaveBeenCalledWith(1, { status: "partial" }),
    );
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("partial");

    await user.click(within(screen.getByText("Finish outline").closest("li")!).getByRole("button"));
    await waitFor(() =>
      expect(mockedUpdatePlanItem).toHaveBeenLastCalledWith(1, { status: "completed" }),
    );
    expect(screen.getByText(/1 of 1 plan items done/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /Call advisor/ }));
    await waitFor(() => expect(mockedUpdateTask).toHaveBeenCalledWith(1, { status: "completed" }));
    expect(screen.getByText("No active tasks.")).toBeTruthy();
  });

  it("shows task and saved-plan load errors", async () => {
    mockedGetTodayPlan.mockRejectedValue(new Error("plan unavailable"));
    mockedGetTasks.mockRejectedValue(new Error("tasks unavailable"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(<TodayPage />);

    expect(await screen.findByText("Could not load today's plan.")).toBeTruthy();
    expect(await screen.findByText("Could not load tasks.")).toBeTruthy();
  });
});
