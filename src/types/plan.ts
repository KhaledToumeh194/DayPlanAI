export type PlanItemStatus =
  | "planned"
  | "completed"
  | "partial"
  | "skipped"
  | "moved"
  | "blocked";

export type EstimateSource =
  | "ai"
  | "user"
  | null;

export type PlanItem = {
  id: number;
  taskId: number | null;

  title: string;
  detail: string | null;

  estimatedMinutes: number | null;
  actualMinutes: number | null;

  estimateSource: EstimateSource;
  userModified: boolean;

  position: number;
  status: PlanItemStatus;

  reason: string | null;
};

export type Plan = {
  id: number;
  planDate: string;
  inputText: string;

  workloadEstimateMinutes: number | null;
  createdAt: string;

  items: PlanItem[];
};

export type GeneratePlanInput = {
  inputText: string;
};

export type UpdatePlanItemInput = {
  status?: PlanItemStatus;
  estimatedMinutes?: number | null;
  actualMinutes?: number | null;
};