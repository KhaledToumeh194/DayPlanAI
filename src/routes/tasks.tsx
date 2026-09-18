import { FormEvent, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Plus, Trash2 } from "lucide-react";

import { type Task } from "@/lib/data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/tasks")({
  head: () => ({
    meta: [
      { title: "Task list — DayPlan" },
      {
        name: "description",
        content:
          "All your tasks in one calm list — add, complete, and filter by status.",
      },
      { property: "og:title", content: "Task list — DayPlan" },
      {
        property: "og:description",
        content:
          "All your tasks in one calm list — add, complete, and filter by status.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TasksPage,
});

type Filter = "all" | "active" | "completed";
type Priority = Task["priority"];

const API_URL = "http://localhost:3001";

const FILTERS: Filter[] = ["all", "active", "completed"];

const PRIORITY_LABEL: Record<Priority, string> = {
  high: "High",
  medium: "Med",
  low: "Low",
};

const PRIORITY_RANK: Record<Priority, number> = {
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
  const [priority, setPriority] = useState<Priority>("medium");

  useEffect(() => {
    async function loadTasks() {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`${API_URL}/api/tasks`);

        if (!response.ok) {
          throw new Error("Failed to load tasks");
        }

        const data: Task[] = await response.json();

        setTasks(data);
      } catch (err) {
        console.error(err);
        setError("Could not load tasks");
      } finally {
        setLoading(false);
      }
    }

    loadTasks();
  }, []);

  const visibleTasks = useMemo(() => {
    const filteredTasks = tasks.filter((task) => {
      if (filter === "active") {
        return !task.completed;
      }

      if (filter === "completed") {
        return task.completed;
      }

      return true;
    });

    return [...filteredTasks].sort((a, b) => {
      if (a.completed !== b.completed) {
        return a.completed ? 1 : -1;
      }

      return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    });
  }, [filter, tasks]);

  const counts = useMemo(
    () => ({
      all: tasks.length,
      active: tasks.filter((task) => !task.completed).length,
      completed: tasks.filter((task) => task.completed).length,
    }),
    [tasks]
  );

  function resetForm() {
    setTitle("");
    setDueDate("");
    setPriority("medium");
  }

  async function addTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedTitle = title.trim();

    if (!trimmedTitle) {
      return;
    }

    try {
      setError(null);

      const response = await fetch(`${API_URL}/api/tasks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: trimmedTitle,
          dueDate: dueDate || null,
          priority,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create task");
      }

      const newTask: Task = await response.json();

      setTasks((currentTasks) => [newTask, ...currentTasks]);

      resetForm();
    } catch (err) {
      console.error(err);
      setError("Could not create task");
    }
  }

  async function toggleTask(id: Task["id"]) {
    const task = tasks.find((task) => task.id === id);

    if (!task) {
      return;
    }

    try {
      setError(null);

      const response = await fetch(`${API_URL}/api/tasks/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          completed: !task.completed,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update task");
      }

      const updatedTask: Task = await response.json();

      setTasks((currentTasks) =>
        currentTasks.map((task) =>
          task.id === id ? updatedTask : task
        )
      );
    } catch (err) {
      console.error(err);
      setError("Could not update task");
    }
  }

  async function removeTask(id: Task["id"]) {
    try {
      setError(null);

      const response = await fetch(`${API_URL}/api/tasks/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete task");
      }

      setTasks((currentTasks) =>
        currentTasks.filter((task) => task.id !== id)
      );
    } catch (err) {
      console.error(err);
      setError("Could not delete task");
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
        onSubmit={addTask}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Add a task…"
            aria-label="Task title"
            className="min-w-0 flex-1 border border-input bg-background px-3 py-2.5 text-sm outline-hidden transition-colors placeholder:text-muted-foreground focus:border-ring"
          />

          <div className="flex shrink-0 gap-3">
            <input
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
              className="border border-input bg-background px-3 py-2.5 font-mono text-xs text-foreground outline-hidden focus:border-ring"
              aria-label="Due date"
            />

            <select
              value={priority}
              onChange={(event) =>
                setPriority(event.target.value as Priority)
              }
              className="border border-input bg-background px-3 py-2.5 text-sm outline-hidden focus:border-ring"
              aria-label="Priority"
            >
              <option value="high">High priority</option>
              <option value="medium">Medium priority</option>
              <option value="low">Low priority</option>
            </select>

            <button
              type="submit"
              disabled={!title.trim()}
              className="inline-flex items-center gap-2 bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus className="size-4" aria-hidden="true" />
              Add
            </button>
          </div>
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

      <div className="mt-8 flex items-center gap-1 border-b border-border">
        {FILTERS.map((filterName) => (
          <button
            key={filterName}
            type="button"
            onClick={() => setFilter(filterName)}
            aria-pressed={filter === filterName}
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
            className="group flex items-center gap-3 py-3"
          >
            <button
              type="button"
              onClick={() => toggleTask(task.id)}
              aria-label={
                task.completed
                  ? "Mark as active"
                  : "Mark as complete"
              }
              className={cn(
                "grid size-4 shrink-0 place-items-center border transition-colors",
                task.completed
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card hover:border-ring"
              )}
            >
              {task.completed && (
                <Check className="size-2.5" aria-hidden="true" />
              )}
            </button>

            <span
              className={cn(
                "min-w-0 flex-1 truncate text-sm",
                task.completed &&
                  "text-muted-foreground line-through"
              )}
            >
              {task.title}
            </span>

            <span
              className={cn(
                "shrink-0 border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide",
                task.priority === "high" && !task.completed
                  ? "border-primary/40 text-foreground"
                  : "border-border text-muted-foreground"
              )}
            >
              {PRIORITY_LABEL[task.priority]}
            </span>

            {task.dueDate && (
              <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                {new Date(
                  `${task.dueDate}T00:00:00`
                ).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                })}
              </span>
            )}

            <button
              type="button"
              onClick={() => removeTask(task.id)}
              aria-label={`Delete ${task.title}`}
              className="shrink-0 p-1.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100"
            >
              <Trash2
                className="size-3.5"
                aria-hidden="true"
              />
            </button>
          </li>
        ))}

        {!loading && visibleTasks.length === 0 && (
          <li className="py-10 text-center text-sm text-muted-foreground">
            Nothing here —{" "}
            {filter === "completed"
              ? "no completed tasks yet."
              : "you're all clear."}
          </li>
        )}
      </ul>
    </div>
  );
}