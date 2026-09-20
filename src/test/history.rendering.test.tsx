import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getPlanHistory } from "@/api/plans";
import { Route } from "@/routes/history";
import type { Plan, PlanItem, PlanItemStatus } from "@/types/plan";

vi.mock("@/api/plans", () => ({
  getPlanHistory: vi.fn(),
}));

const mockedGetPlanHistory = vi.mocked(getPlanHistory);
const HistoryPage = Route.options.component!;

function makeItem(id: number, title: string, status: PlanItemStatus): PlanItem {
  return {
    id,
    taskId: id,
    title,
    detail: null,
    estimatedMinutes: 30,
    actualMinutes: null,
    estimateSource: "ai",
    userModified: false,
    position: id,
    status,
    reason: null,
  };
}

function makePlan(id: number, inputText: string, planDate: string, items: PlanItem[] = []): Plan {
  return {
    id,
    planDate,
    inputText,
    workloadEstimateMinutes: items.length > 0 ? 90 : null,
    createdAt: `${planDate} 09:00:00`,
    items,
  };
}

describe("History page rendering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows loading before the empty state", async () => {
    let resolveHistory: ((plans: Plan[]) => void) | undefined;
    mockedGetPlanHistory.mockReturnValue(
      new Promise((resolve) => {
        resolveHistory = resolve;
      }),
    );

    render(<HistoryPage />);

    expect(screen.getByText("Loading history...")).toBeTruthy();
    resolveHistory?.([]);
    expect(await screen.findByText("No history yet")).toBeTruthy();
  });

  it("shows a history load error", async () => {
    mockedGetPlanHistory.mockRejectedValue(new Error("unavailable"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(<HistoryPage />);

    expect(await screen.findByText("Could not load your plan history.")).toBeTruthy();
  });

  it("renders plan items, statuses, workload estimates, and aggregate statistics", async () => {
    const firstPlan = makePlan(1, "Prepare the project demo", "2026-09-20", [
      makeItem(1, "Finish slides", "completed"),
      makeItem(2, "Rehearse demo", "partial"),
      makeItem(3, "Move follow-up", "moved"),
      makeItem(4, "Skip outdated research", "skipped"),
      makeItem(5, "Resolve access issue", "blocked"),
    ]);
    const secondPlan = makePlan(2, "Organize next week", "2026-09-19", [
      makeItem(6, "Review notes", "planned"),
    ]);
    mockedGetPlanHistory.mockResolvedValue([firstPlan, secondPlan]);

    render(<HistoryPage />);

    expect(await screen.findByText("Prepare the project demo")).toBeTruthy();
    expect(screen.getByText("Organize next week")).toBeTruthy();
    expect(screen.getByText("Finish slides")).toBeTruthy();
    expect(screen.getByText("Rehearse demo")).toBeTruthy();
    expect(screen.getByText("Move follow-up")).toBeTruthy();
    expect(screen.getAllByText("About 90 minutes planned")).toHaveLength(2);
    expect(screen.getByText("Skip outdated research")).toBeTruthy();
    expect(screen.getByText("Resolve access issue")).toBeTruthy();
    expect(screen.getAllByText("Completed").some((element) => element.tagName === "SPAN")).toBe(
      true,
    );
    expect(screen.getAllByText("Partial").some((element) => element.tagName === "SPAN")).toBe(true);
    expect(screen.getAllByText("Moved").some((element) => element.tagName === "SPAN")).toBe(true);
    expect(screen.getAllByText("Planned").some((element) => element.tagName === "SPAN")).toBe(true);

    expect(screen.getAllByText("Skipped").some((element) => element.tagName === "SPAN")).toBe(true);
    expect(screen.getAllByText("Blocked").some((element) => element.tagName === "SPAN")).toBe(true);
    for (const [label, value] of [
      ["Plans", "2"],
      ["Items", "6"],
      ["Completed", "1"],
      ["Partial", "1"],
      ["Moved", "1"],
    ] as const) {
      const statistic = screen.getByText(label, { selector: "p" }).parentElement;
      expect(statistic).toBeTruthy();
      expect(within(statistic!).getByText(value, { selector: "p" })).toBeTruthy();
    }
  });
});
