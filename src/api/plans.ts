import type { GeneratePlanInput, Plan, PlanItem, UpdatePlanItemInput } from "@/types/plan";

const API_URL = "http://localhost:3001";

export async function getTodayPlan(): Promise<Plan | null> {
  const response = await fetch(`${API_URL}/api/plans/today`);

  if (!response.ok) {
    throw new Error("Failed to load today's plan");
  }

  return response.json();
}

export async function getPlanHistory(): Promise<Plan[]> {
  const response = await fetch(`${API_URL}/api/plans/history`);

  if (!response.ok) {
    throw new Error("Failed to load plan history");
  }

  return response.json();
}

export async function deletePlan(id: number): Promise<void> {
  const response = await fetch(`${API_URL}/api/plans/${id}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error("Failed to delete plan");
  }
}

export async function generatePlan(input: GeneratePlanInput): Promise<Plan> {
  const response = await fetch(`${API_URL}/api/plans/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error("Failed to generate plan");
  }

  return response.json();
}

export async function updatePlanItem(id: number, input: UpdatePlanItemInput): Promise<PlanItem> {
  const response = await fetch(`${API_URL}/api/plan-items/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error("Failed to update plan item");
  }

  return response.json();
}
