import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Plus, Trash2 } from "lucide-react";

import {
  createTask,
  deleteTask,
  getTasks,
  updateTask,
} from "@/api/tasks";

import type {
  Task,
  TaskFlexibility,
  TaskPriority,
} from "@/types/task";

import { cn } from "@/lib/utils";

export const Route = createFileRoute("/tasks")({
  head: () => ({
    meta: [
      { title: "Task list — DayPlan" },
      {
        name: "description",
        content:
          "Manage your tasks, priorities, deadlines, and estimates.",
      },
    ],
  }),
  component: TasksPage,
});

type Filter = "all" | "active" | "completed" | "blocked";

const FILTERS: Filter[] = [
  "all",
  "active",
  "completed",
  "blocked",
];

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  high: "High",
  medium: "Med",
  low: "Low",
};

const PRIORITY_RANK: Record<TaskPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filter, setFilter] = useState<Filter>("all");

  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] =
    useState<TaskPriority>("medium");

  const [estimatedMinutes, setEstimatedMinutes] =
    useState("");

  const [flexibility, setFlexibility] =
    useState<TaskFlexibility>("flexible");

  useEffect(() => {
    loadTasks();
  }, []);

  async function loadTasks() {
    try {
      setLoading(true);
      setError(null);

      const data = await getTasks();

      setTasks(data);
    } catch (error) {
      console.error(error);
      setError("Could not load tasks.");
    } finally {
      setLoading(false);
    }
  }

  const visibleTasks = useMemo(() => {
    const filtered = tasks.filter((task) => {
      if (filter === "all") {
        return true;
      }

      return task.status === filter;
    });

    return [...filtered].sort((a, b) => {
      if (a.status !== b.status) {
        const statusRank = {
          active: 0,
          blocked: 1,
          completed: 2,
        };

        return (
          statusRank[a.status] -
          statusRank[b.status]
        );
      }

      return (
        PRIORITY_RANK[a.priority] -
        PRIORITY_RANK[b.priority]
      );
    });
  }, [filter, tasks]);

  const counts = useMemo(
    () => ({
      all: tasks.length,
      active: tasks.filter(
        (task) => task.status === "active"
      ).length,
      completed: tasks.filter(
        (task) => task.status === "completed"
      ).length,
      blocked: tasks.filter(
        (task) => task.status === "blocked"
      ).length,
    }),
    [tasks]
  );

  function resetForm() {
    setTitle("");
    setDueDate("");
    setPriority("medium");
    setEstimatedMinutes("");
    setFlexibility("flexible");
  }

  async function handleAddTask(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const trimmedTitle = title.trim();

    if (!trimmedTitle) {
      return;
    }

    try {
      setError(null);

      const newTask = await createTask({
        title: trimmedTitle,
        dueDate: dueDate || null,
        priority,
        estimatedMinutes:
          estimatedMinutes.trim() !== ""
            ? Number(estimatedMinutes)
            : null,
        estimateSource:
          estimatedMinutes.trim() !== ""
            ? "user"
            : null,
        flexibility,
      });

      setTasks((current) => [
        newTask,
        ...current,
      ]);

      resetForm();
    } catch (error) {
      console.error(error);
      setError("Could not create task.");
    }
  }

  async function toggleComplete(task: Task) {
    try {
      setError(null);

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
      setError("Could not update task.");
    }
  }

  async function toggleBlocked(task: Task) {
    try {
      setError(null);

      const updated = await updateTask(
        task.id,
        {
          status:
            task.status === "blocked"
              ? "active"
              : "blocked",
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
      setError("Could not update task.");
    }
  }

  async function handleDelete(id: number) {
    try {
      setError(null);

      await deleteTask(id);

      setTasks((current) =>
        current.filter(
          (task) => task.id !== id
        )
      );
    } catch (error) {
      console.error(error);
      setError("Could not delete task.");
    }
  }

  return (
    <div>
      <header className="border-b border-border pb-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          Everything, one list
        </p>

        <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight sm:text-5xl">
          Task list
        </h1>
      </header>

      <form
        className="mt-8 border border-border bg-card p-4"
        onSubmit={handleAddTask}
      >
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
          <input
            value={title}
            onChange={(event) =>
              setTitle(event.target.value)
            }
            placeholder="Add a task…"
            aria-label="Task title"
            className="min-w-0 border border-input bg-background px-3 py-2.5 text-sm outline-hidden transition-colors placeholder:text-muted-foreground focus:border-ring"
          />

          <button
            type="submit"
            disabled={!title.trim()}
            className="inline-flex items-center justify-center gap-2 bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus
              className="size-4"
              aria-hidden="true"
            />
            Add task
          </button>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input
            type="date"
            value={dueDate}
            onChange={(event) =>
              setDueDate(event.target.value)
            }
            className="border border-input bg-background px-3 py-2.5 font-mono text-xs outline-hidden focus:border-ring"
            aria-label="Due date"
          />

          <select
            value={priority}
            onChange={(event) =>
              setPriority(
                event.target.value as TaskPriority
              )
            }
            className="border border-input bg-background px-3 py-2.5 text-sm outline-hidden focus:border-ring"
          >
            <option value="high">
              High priority
            </option>
            <option value="medium">
              Medium priority
            </option>
            <option value="low">
              Low priority
            </option>
          </select>

          <input
            type="number"
            min="1"
            value={estimatedMinutes}
            onChange={(event) =>
              setEstimatedMinutes(
                event.target.value
              )
            }
            placeholder="Estimate (minutes)"
            className="border border-input bg-background px-3 py-2.5 text-sm outline-hidden focus:border-ring"
          />

          <select
            value={flexibility}
            onChange={(event) =>
              setFlexibility(
                event.target
                  .value as TaskFlexibility
              )
            }
            className="border border-input bg-background px-3 py-2.5 text-sm outline-hidden focus:border-ring"
          >
            <option value="fixed">
              Fixed
            </option>

            <option value="important">
              Important
            </option>

            <option value="flexible">
              Flexible
            </option>

            <option value="optional">
              Optional
            </option>
          </select>
        </div>
      </form>

      {loading && (
        <p className="mt-6 text-sm text-muted-foreground">
          Loading tasks...
        </p>
      )}

      {error && (
        <p className="mt-6 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-1 border-b border-border">
        {FILTERS.map((filterName) => (
          <button
            key={filterName}
            type="button"
            onClick={() =>
              setFilter(filterName)
            }
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm capitalize transition-colors",
              filter === filterName
                ? "border-primary font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {filterName}

            <span className="ml-1.5 font-mono text-[11px] text-muted-foreground">
              {counts[filterName]}
            </span>
          </button>
        ))}
      </div>

      <ul className="divide-y divide-border">
        {visibleTasks.map((task) => (
          <li
            key={task.id}
            className="group py-4"
          >
            <div className="flex items-start gap-3">
              <button
                type="button"
                onClick={() =>
                  toggleComplete(task)
                }
                aria-label={
                  task.status ===
                  "completed"
                    ? "Mark as active"
                    : "Mark as complete"
                }
                className={cn(
                  "mt-0.5 grid size-4 shrink-0 place-items-center border transition-colors",
                  task.status ===
                    "completed"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card hover:border-ring"
                )}
              >
                {task.status ===
                  "completed" && (
                  <Check
                    className="size-2.5"
                    aria-hidden="true"
                  />
                )}
              </button>

              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "text-sm",
                    task.status ===
                      "completed" &&
                      "text-muted-foreground line-through"
                  )}
                >
                  {task.title}
                </p>

                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase">
                    {
                      PRIORITY_LABEL[
                        task.priority
                      ]
                    }
                  </span>

                  <span className="border border-border px-1.5 py-0.5 font-mono text-[10px] capitalize text-muted-foreground">
                    {task.flexibility}
                  </span>

                  {task.estimatedMinutes !==
                    null && (
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {task.estimateSource ===
                        "ai"
                        ? "~"
                        : ""}
                      {
                        task.estimatedMinutes
                      }{" "}
                      min
                    </span>
                  )}

                  {task.dueDate && (
                    <span className="font-mono text-[11px] text-muted-foreground">
                      Due{" "}
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

                  {task.status ===
                    "blocked" && (
                    <span className="font-mono text-[10px] uppercase text-destructive">
                      Blocked
                    </span>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  toggleBlocked(task)
                }
                className="shrink-0 px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
              >
                {task.status === "blocked"
                  ? "Unblock"
                  : "Block"}
              </button>

              <button
                type="button"
                onClick={() =>
                  handleDelete(task.id)
                }
                aria-label={`Delete ${task.title}`}
                className="shrink-0 p-1.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100"
              >
                <Trash2
                  className="size-3.5"
                  aria-hidden="true"
                />
              </button>
            </div>
          </li>
        ))}

        {!loading &&
          visibleTasks.length === 0 && (
          <li className="py-10 text-center text-sm text-muted-foreground">
            Nothing here.
          </li>
        )}
      </ul>
    </div>
  );
}