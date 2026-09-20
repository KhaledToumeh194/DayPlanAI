import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { deletePlan, getPlanHistory } from "@/api/plans";
import { Route } from "@/routes/history";
import type { Plan } from "@/types/plan";

vi.mock("@/api/plans", () => ({
  deletePlan: vi.fn(),
  getPlanHistory: vi.fn(),
}));

const mockedDeletePlan = vi.mocked(deletePlan);
const mockedGetPlanHistory = vi.mocked(getPlanHistory);
const HistoryPage = Route.options.component!;

function makePlan(id: number, inputText: string, planDate: string): Plan {
  return {
    id,
    planDate,
    inputText,
    workloadEstimateMinutes: null,
    createdAt: `${planDate} 09:00:00`,
    items: [],
  };
}

describe("History plan deletion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("confirms deletion and immediately removes only the deleted plan", async () => {
    const deletedPlan = makePlan(11, "Delete me", "2026-09-20");
    const retainedPlan = makePlan(12, "Keep me", "2026-09-19");
    mockedGetPlanHistory.mockResolvedValue([deletedPlan, retainedPlan]);
    mockedDeletePlan.mockResolvedValue();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();

    render(<HistoryPage />);

    expect(await screen.findByText("Delete me")).toBeTruthy();
    expect(screen.getByText("Keep me")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Delete plan: Delete me" }));

    expect(confirm).toHaveBeenCalledOnce();
    await waitFor(() => expect(mockedDeletePlan).toHaveBeenCalledWith(11));
    await waitFor(() => expect(screen.queryByText("Delete me")).toBeNull());
    expect(screen.getByText("Keep me")).toBeTruthy();
  });

  it("shows an error and retains the plan when deletion fails", async () => {
    const plan = makePlan(21, "Keep after failure", "2026-09-20");
    mockedGetPlanHistory.mockResolvedValue([plan]);
    mockedDeletePlan.mockRejectedValue(new Error("request failed"));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const user = userEvent.setup();

    render(<HistoryPage />);

    await user.click(
      await screen.findByRole("button", { name: "Delete plan: Keep after failure" }),
    );

    expect(await screen.findByText("Could not delete this plan.")).toBeTruthy();
    expect(screen.getByText("Keep after failure")).toBeTruthy();
  });
});
