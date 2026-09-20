export type TaskPriority = "low" | "medium" | "high";

export type TaskFlexibility =
  | "fixed"
  | "important"
  | "flexible"
  | "optional";

export type TaskStatus =
  | "active"
  | "completed"
  | "blocked";

export type EstimateSource =
  | "ai"
  | "user"
  | null;

export type Task = {
  id: number;
  title: string;
  description: string | null;

  priority: TaskPriority;
  dueDate: string | null;

  estimatedMinutes: number | null;
  estimateSource: EstimateSource;

  flexibility: TaskFlexibility;
  status: TaskStatus;

  createdAt: string;
  updatedAt: string;
};

export type CreateTaskInput = {
  title: string;
  description?: string | null;
  priority?: TaskPriority;
  dueDate?: string | null;
  estimatedMinutes?: number | null;
  estimateSource?: EstimateSource;
  flexibility?: TaskFlexibility;
};

export type UpdateTaskInput = Partial<CreateTaskInput> & {
  status?: TaskStatus;
};