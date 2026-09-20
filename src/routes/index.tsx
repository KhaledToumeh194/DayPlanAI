import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Check,
  Sparkles,
} from "lucide-react";

import {
  getTasks,
  updateTask,
} from "@/api/tasks";

import {
  generatePlan,
  getTodayPlan,
  updatePlanItem,
} from "@/api/plans";

import type { Task } from "@/types/task";
import type {
  Plan,
  PlanItem,
  PlanItemStatus,
} from "@/types/plan";

import { cn } from "@/lib/utils";
import { formatToday } from "@/lib/data";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Today — DayPlan" },
      {
        name: "description",
        content:
          "Today's plan, active tasks, and current priorities.",
      },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);

  const [plate, setPlate] = useState("");

  const [tasksLoading, setTasksLoading] = useState(true);
  const [planLoading, setPlanLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);

  const [tasksError, setTasksError] = useState<string | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);

  useEffect(() => {
    loadTasks();
    loadTodayPlan();
  }, []);

  async function loadTasks() {
    try {
      setTasksLoading(true);
      setTasksError(null);

      const data = await getTasks();

      setTasks(data);
    } catch (error) {
      console.error(error);
      setTasksError("Could not load tasks.");
    } finally {
      setTasksLoading(false);
    }
  }

  async function loadTodayPlan() {
    try {
      setPlanLoading(true);
      setPlanError(null);

      const data = await getTodayPlan();

      setPlan(data);

      if (data) {
        setPlate(data.inputText);
      }
    } catch (error) {
      console.error(error);
      setPlanError("Could not load today's plan.");
    } finally {
      setPlanLoading(false);
    }
  }

  const activeTasks = useMemo(
    () =>
      tasks.filter(
        (task) => task.status === "active"
      ),
    [tasks]
  );

  const completedPlanItems = useMemo(
    () =>
      plan?.items.filter(
        (item) => item.status === "completed"
      ).length ?? 0,
    [plan]
  );

  async function handleGeneratePlan(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const input = plate.trim();

    if (!input) {
      return;
    }

    try {
      setIsGenerating(true);
      setPlanError(null);

      const newPlan = await generatePlan({
        inputText: input,
      });

      setPlan(newPlan);
    } catch (error) {
      console.error(error);
      setPlanError("Could not generate today's plan.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleTaskComplete(task: Task) {
    try {
      setTasksError(null);

      const updated = await updateTask(
        task.id,
        {
          status:
            task.status === "completed"
              ? "active"
              : "completed",
        }
      );

      setTasks((current) =>
        current.map((item) =>
          item.id === task.id
            ? updated
            : item
        )
      );
    } catch (error) {
      console.error(error);
      setTasksError("Could not update task.");
    }
  }

  async function handlePlanItemStatus(
    item: PlanItem,
    status: PlanItemStatus
  ) {
    try {
      setPlanError(null);

      const updated = await updatePlanItem(
        item.id,
        {
          status,
        }
      );

      setPlan((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          items: current.items.map((planItem) =>
            planItem.id === updated.id
              ? updated
              : planItem
          ),
        };
      });
    } catch (error) {
      console.error(error);
      setPlanError("Could not update plan item.");
    }
  }

  function getStatusLabel(
    status: PlanItemStatus
  ) {
    switch (status) {
      case "completed":
        return "Completed";
      case "partial":
        return "Partial";
      case "skipped":
        return "Skipped";
      case "moved":
        return "Moved";
      case "blocked":
        return "Blocked";
      default:
        return "Planned";
    }
  }

  return (
    <div>
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4 border-b border-border pb-6">
        <div className="min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            {formatToday()}
          </p>

          <h1 className="mt-2 truncate font-display text-4xl font-semibold tracking-tight sm:text-5xl">
            Good morning, Khaled
          </h1>
        </div>

        <p className="hidden shrink-0 text-right text-xs leading-relaxed text-muted-foreground sm:block">
          {completedPlanItems} of{" "}
          {plan?.items.length ?? 0} plan items done
          <br />

          <span className="text-foreground">
            {activeTasks.length} active tasks
          </span>
        </p>
      </header>

      <section className="mt-8">
        <form onSubmit={handleGeneratePlan}>
          <label
            htmlFor="plate"
            className="font-display text-2xl font-semibold tracking-tight"
          >
            What's on your plate?
          </label>

          <p className="mt-1 text-sm text-muted-foreground">
            Tell DayPlan what's going on. Deadlines,
            exams, errands, unfinished work, or anything
            else that matters today.
          </p>

          <textarea
            id="plate"
            value={plate}
            onChange={(event) =>
              setPlate(event.target.value)
            }
            rows={4}
            placeholder="e.g. Homework due tomorrow, networking exam Friday, need to apply to one internship..."
            className="mt-4 w-full resize-y border border-input bg-card px-4 py-3 text-sm leading-relaxed outline-hidden transition-colors placeholder:text-muted-foreground focus:border-ring"
          />

          <div className="mt-3 flex flex-wrap items-center gap-4">
            <button
              type="submit"
              disabled={!plate.trim() || isGenerating}
              className="inline-flex items-center gap-2 bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Sparkles
                className="size-4"
                aria-hidden="true"
              />

              {isGenerating
                ? "Generating..."
                : "Generate today's plan"}
            </button>

            {plan && (
              <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
                Saved plan ·{" "}
                {new Date(
                  `${plan.createdAt}Z`
                ).toLocaleTimeString("en-GB", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
          </div>

          {planError && (
            <p className="mt-3 text-sm text-destructive">
              {planError}
            </p>
          )}
        </form>
      </section>

      {planLoading && (
        <p className="mt-8 text-sm text-muted-foreground">
          Loading today's plan...
        </p>
      )}

      {!planLoading && plan && (
        <section className="mt-10">
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl font-semibold tracking-tight">
                Today's plan
              </h2>

              {plan.workloadEstimateMinutes !== null && (
                <p className="mt-1 text-xs text-muted-foreground">
                  About{" "}
                  {plan.workloadEstimateMinutes} minutes
                  of planned work
                </p>
              )}
            </div>
          </div>

          <p className="mt-3 border-l-2 border-primary/60 pl-3 text-xs leading-relaxed text-muted-foreground">
            Based on what you shared:{" "}
            <span className="text-foreground">
              “
              {plan.inputText.length > 160
                ? `${plan.inputText
                    .slice(0, 160)
                    .trimEnd()}…`
                : plan.inputText}
              ”
            </span>
          </p>

          <ol className="mt-4 divide-y divide-border border-y border-border">
            {plan.items.map((item) => (
              <li
                key={item.id}
                className="py-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-5">
                  <button
                    type="button"
                    onClick={() =>
                      handlePlanItemStatus(
                        item,
                        item.status === "completed"
                          ? "planned"
                          : "completed"
                      )
                    }
                    className={cn(
                      "mt-0.5 grid size-5 shrink-0 place-items-center border transition-colors",
                      item.status === "completed"
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card hover:border-ring"
                    )}
                  >
                    {item.status === "completed" && (
                      <Check
                        className="size-3"
                        aria-hidden="true"
                      />
                    )}
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p
                        className={cn(
                          "text-sm font-medium",
                          item.status === "completed" &&
                            "text-muted-foreground line-through"
                        )}
                      >
                        {item.title}
                      </p>

                      <span className="border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
                        {getStatusLabel(
                          item.status
                        )}
                      </span>
                    </div>

                    {item.detail && (
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        {item.detail}
                      </p>
                    )}

                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      {item.estimatedMinutes !== null && (
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {item.estimateSource === "ai"
                            ? "~"
                            : ""}
                          {item.estimatedMinutes} min
                        </span>
                      )}

                      {item.reason && (
                        <span className="text-[11px] text-muted-foreground">
                          {item.reason}
                        </span>
                      )}
                    </div>
                  </div>

                  <select
                    value={item.status}
                    onChange={(event) =>
                      handlePlanItemStatus(
                        item,
                        event.target
                          .value as PlanItemStatus
                      )
                    }
                    className="shrink-0 border border-input bg-background px-2 py-1.5 text-xs outline-hidden focus:border-ring"
                  >
                    <option value="planned">
                      Planned
                    </option>

                    <option value="completed">
                      Completed
                    </option>

                    <option value="partial">
                      Partial
                    </option>

                    <option value="skipped">
                      Skipped
                    </option>

                    <option value="moved">
                      Moved
                    </option>

                    <option value="blocked">
                      Blocked
                    </option>
                  </select>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="mt-10 grid grid-cols-1 gap-8 md:grid-cols-2">
        <div>
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-display text-2xl font-semibold tracking-tight">
              Active tasks
            </h2>

            <Link
              to="/tasks"
              className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              View all

              <ArrowRight
                className="size-3"
                aria-hidden="true"
              />
            </Link>
          </div>

          {tasksLoading && (
            <p className="mt-4 text-sm text-muted-foreground">
              Loading tasks...
            </p>
          )}

          {tasksError && (
            <p className="mt-4 text-sm text-destructive">
              {tasksError}
            </p>
          )}

          <ul className="mt-4 divide-y divide-border border-y border-border">
            {activeTasks.slice(0, 5).map((task) => (
              <li key={task.id}>
                <button
                  type="button"
                  onClick={() =>
                    handleTaskComplete(task)
                  }
                  className="flex w-full items-center gap-3 py-3 text-left transition-colors hover:bg-muted/60"
                >
                  <span className="grid size-4 shrink-0 place-items-center border border-border bg-card" />

                  <span className="min-w-0 flex-1 truncate text-sm">
                    {task.title}
                  </span>

                  {task.estimatedMinutes !== null && (
                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                      {task.estimateSource === "ai"
                        ? "~"
                        : ""}
                      {task.estimatedMinutes}m
                    </span>
                  )}

                  {task.dueDate && (
                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                      {new Date(
                        `${task.dueDate}T00:00:00`
                      ).toLocaleDateString(
                        "en-GB",
                        {
                          day: "numeric",
                          month: "short",
                        }
                      )}
                    </span>
                  )}
                </button>
              </li>
            ))}

            {!tasksLoading &&
              activeTasks.length === 0 && (
              <li className="py-8 text-center text-sm text-muted-foreground">
                No active tasks.
              </li>
            )}
          </ul>
        </div>

        <div>
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-display text-2xl font-semibold tracking-tight">
              In focus
            </h2>
          </div>

          <div className="mt-4 border border-border bg-card p-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Planning principle
            </p>

            <p className="mt-2 font-display text-lg font-medium leading-snug">
              DayPlan suggests. You decide.
            </p>

            <div className="mt-4 h-px w-full bg-border" />

            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
              Estimates, priorities, and plan
              statuses are suggestions. You can
              adjust them as your day changes.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}