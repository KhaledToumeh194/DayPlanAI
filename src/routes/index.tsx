import { FormEvent, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Check, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  formatToday,
  initialPlan,
  initialTasks,
  type PlanItem,
  type Task,
} from "@/lib/data";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Today — DayPlan" },
      {
        name: "description",
        content:
          "Today's AI-generated plan, your active tasks, and a calm start to the day.",
      },
      { property: "og:title", content: "Today — DayPlan" },
      {
        property: "og:description",
        content:
          "Today's AI-generated plan, your active tasks, and a calm start to the day.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

function StatusMark({ status }: { status: PlanItem["status"] }) {
  if (status === "done") {
    return (
      <span className="grid size-5 shrink-0 place-items-center bg-primary text-primary-foreground">
        <Check className="size-3" aria-hidden="true" />
      </span>
    );
  }

  return (
    <span
      className={cn(
        "size-5 shrink-0 border",
        status === "active"
          ? "border-primary bg-accent"
          : "border-border bg-card"
      )}
      aria-hidden="true"
    />
  );
}

function Dashboard() {
  // TEMPORARY MOCK DATA
  //
  // Later:
  // tasks -> GET /api/tasks
  // plan  -> GET /api/plans/today
  const [plan, setPlan] = useState<PlanItem[]>(() => initialPlan);
  const [tasks, setTasks] = useState<Task[]>(() => initialTasks);

  const [plate, setPlate] = useState(
    "University project due Friday — results section still rough. React course due Sunday. Reply to CelVion client. Apply to 2 more jobs this week. Dentist appointment Thursday."
  );

  const [generatedFrom, setGeneratedFrom] = useState<string | null>(plate);

  const [generatedAt, setGeneratedAt] = useState<Date | null>(
    () => new Date()
  );

  const completedPlanItems = useMemo(
    () => plan.filter((item) => item.status === "done").length,
    [plan]
  );

  const activeTasks = useMemo(
    () => tasks.filter((task) => !task.completed),
    [tasks]
  );

  function togglePlanItem(id: PlanItem["id"]) {
    // TEMPORARY:
    // Later this should update the generated plan item
    // through the backend / database.

    setPlan((currentPlan) =>
      currentPlan.map((item) =>
        item.id === id
          ? {
              ...item,
              status:
                item.status === "done"
                  ? "upcoming"
                  : "done",
            }
          : item
      )
    );
  }

  function toggleTask(id: Task["id"]) {
    // TEMPORARY:
    //
    // Later:
    // PATCH /api/tasks/:id

    setTasks((currentTasks) =>
      currentTasks.map((task) =>
        task.id === id
          ? {
              ...task,
              completed: !task.completed,
            }
          : task
      )
    );
  }

  function generatePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const input = plate.trim();

    if (!input) {
      return;
    }

    // TEMPORARY MOCK BEHAVIOR:
    //
    // Right now clicking Generate simply displays initialPlan.
    //
    // Later this becomes:
    //
    // POST /api/plans/generate
    //
    // Body:
    // {
    //   inputText: input
    // }
    //
    // Express
    //   -> reads tasks
    //   -> calls Gemini
    //   -> validates response
    //   -> stores plan in SQLite
    //   -> returns generated plan

    setGeneratedFrom(input);
    setGeneratedAt(new Date());

    // Clone the mock plan instead of sharing the same array reference.
    setPlan(initialPlan.map((item) => ({ ...item })));
  }

  return (
    <div>
      {/* Header */}
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
          {completedPlanItems} of {plan.length} plan items done
          <br />

          <span className="text-foreground">
            {activeTasks.length} active tasks
          </span>
        </p>
      </header>

      {/* What's on your plate */}
      <section className="mt-8">
        <form onSubmit={generatePlan}>
          <label
            htmlFor="plate"
            className="font-display text-2xl font-semibold tracking-tight"
          >
            What's on your plate?
          </label>

          <p className="mt-1 text-sm text-muted-foreground">
            Dump everything on your mind — deadlines, errands, loose ends.
            One line or ten.
          </p>

          <textarea
            id="plate"
            value={plate}
            onChange={(event) => setPlate(event.target.value)}
            rows={4}
            placeholder="e.g. React course due Sunday, university project due Friday, reply to client, apply to 2 more jobs this week, dentist appointment Thursday."
            className="mt-4 w-full resize-y border border-input bg-card px-4 py-3 text-sm leading-relaxed outline-hidden transition-colors placeholder:text-muted-foreground focus:border-ring"
          />

          <div className="mt-3 flex flex-wrap items-center gap-4">
            <button
              type="submit"
              disabled={!plate.trim()}
              className="inline-flex items-center gap-2 bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Sparkles
                className="size-4"
                aria-hidden="true"
              />

              Generate today's plan
            </button>

            {generatedFrom && generatedAt && (
              <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
                Drafted{" "}
                {generatedAt.toLocaleTimeString("en-GB", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}{" "}
                · AI
              </span>
            )}
          </div>
        </form>
      </section>

      {/* Today's plan */}
      {generatedFrom && (
        <section className="mt-10">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-display text-2xl font-semibold tracking-tight">
              Today's plan
            </h2>
          </div>

          <p className="mt-2 border-l-2 border-primary/60 pl-3 text-xs leading-relaxed text-muted-foreground">
            Based on what you shared:{" "}
            <span className="text-foreground">
              “
              {generatedFrom.length > 140
                ? `${generatedFrom.slice(0, 140).trimEnd()}…`
                : generatedFrom}
              ”
            </span>
          </p>

          <ol className="mt-4 divide-y divide-border border-y border-border">
            {plan.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => togglePlanItem(item.id)}
                  aria-label={
                    item.status === "done"
                      ? `Mark ${item.title} as not completed`
                      : `Mark ${item.title} as completed`
                  }
                  className={cn(
                    "flex w-full items-start gap-4 py-4 text-left transition-colors hover:bg-muted/60 sm:items-center sm:gap-6",
                    item.status === "active" && "bg-accent/50"
                  )}
                >
                  <span className="w-12 shrink-0 pt-0.5 text-right font-mono text-xs text-muted-foreground sm:pt-0">
                    {item.time}
                  </span>

                  <span className="hidden w-px self-stretch bg-border sm:block" />

                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "text-sm font-medium",
                        item.status === "done" &&
                          "text-muted-foreground line-through"
                      )}
                    >
                      {item.title}
                    </p>

                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {item.detail}
                    </p>
                  </div>

                  <span className="hidden shrink-0 font-mono text-[11px] text-muted-foreground sm:block">
                    {item.duration}
                  </span>

                  <StatusMark status={item.status} />
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Bottom section */}
      <section className="mt-10 grid grid-cols-1 gap-8 md:grid-cols-2">
        {/* Active tasks */}
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

          <ul className="mt-4 divide-y divide-border border-y border-border">
            {activeTasks.slice(0, 5).map((task) => (
              <li key={task.id}>
                <button
                  type="button"
                  onClick={() => toggleTask(task.id)}
                  aria-label={`Mark ${task.title} as completed`}
                  className="flex w-full items-center gap-3 py-3 text-left transition-colors hover:bg-muted/60"
                >
                  <span className="grid size-4 shrink-0 place-items-center border border-border bg-card">
                    <span className="sr-only">
                      Incomplete
                    </span>
                  </span>

                  <span className="min-w-0 flex-1 truncate text-sm">
                    {task.title}
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
                </button>
              </li>
            ))}

            {activeTasks.length === 0 && (
              <li className="py-8 text-center text-sm text-muted-foreground">
                No active tasks.
              </li>
            )}
          </ul>
        </div>

        {/* Focus summary */}
        <div>
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-display text-2xl font-semibold tracking-tight">
              In focus
            </h2>
          </div>

          <div className="mt-4 border border-border bg-card p-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              This week
            </p>

            <p className="mt-2 font-display text-lg font-medium leading-snug">
              Finish the university project draft and send two job
              applications.
            </p>

            <div className="mt-4 h-px w-full bg-border" />

            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
              The plan above weights your mornings toward deep work and keeps
              late afternoon free for applications and reading.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}