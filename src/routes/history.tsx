import { useEffect, useMemo, useState } from "react";

import { createFileRoute } from "@tanstack/react-router";

import { Check, CircleAlert, Clock3, Minus, MoveRight, X } from "lucide-react";

import { deletePlan, getPlanHistory } from "@/api/plans";

import type { Plan, PlanItem, PlanItemStatus } from "@/types/plan";

import { cn } from "@/lib/utils";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      {
        title: "History — DayPlan",
      },
      {
        name: "description",
        content: "Review your previous DayPlan plans and progress.",
      },
    ],
  }),

  component: HistoryPage,
});

function HistoryPage() {
  const [plans, setPlans] = useState<Plan[]>([]);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  const [deletingPlanId, setDeletingPlanId] = useState<number | null>(null);

  useEffect(() => {
    loadHistory();
  }, []);

  async function loadHistory() {
    try {
      setLoading(true);
      setError(null);

      const data = await getPlanHistory();

      setPlans(data);
    } catch (error) {
      console.error(error);

      setError("Could not load your plan history.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDeletePlan(plan: Plan) {
    const confirmed = window.confirm(
      `Delete the plan from ${formatPlanDate(plan.planDate)}? This cannot be undone.`,
    );

    if (!confirmed) {
      return;
    }

    try {
      setDeletingPlanId(plan.id);
      setError(null);

      await deletePlan(plan.id);

      setPlans((currentPlans) => currentPlans.filter((currentPlan) => currentPlan.id !== plan.id));
    } catch (error) {
      console.error(error);
      setError("Could not delete this plan.");
    } finally {
      setDeletingPlanId(null);
    }
  }

  const statistics = useMemo(() => {
    const allItems = plans.flatMap((plan) => plan.items);

    const completed = allItems.filter((item) => item.status === "completed").length;

    const partial = allItems.filter((item) => item.status === "partial").length;

    const moved = allItems.filter((item) => item.status === "moved").length;

    return {
      plans: plans.length,
      items: allItems.length,
      completed,
      partial,
      moved,
    };
  }, [plans]);

  return (
    <div>
      <header className="border-b border-border pb-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          Your planning record
        </p>

        <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight sm:text-5xl">
          History
        </h1>

        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          See what you planned, what you completed, and how your days actually unfolded.
        </p>
      </header>

      {!loading && plans.length > 0 && (
        <section className="mt-8 grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-5">
          <Statistic label="Plans" value={statistics.plans} />

          <Statistic label="Items" value={statistics.items} />

          <Statistic label="Completed" value={statistics.completed} />

          <Statistic label="Partial" value={statistics.partial} />

          <Statistic label="Moved" value={statistics.moved} />
        </section>
      )}

      {loading && <p className="mt-8 text-sm text-muted-foreground">Loading history...</p>}

      {error && <p className="mt-8 text-sm text-destructive">{error}</p>}

      {!loading && !error && plans.length === 0 && (
        <div className="mt-8 border border-border bg-card p-8 text-center">
          <p className="font-display text-xl font-medium">No history yet</p>

          <p className="mt-2 text-sm text-muted-foreground">
            Generate your first daily plan and it will appear here.
          </p>
        </div>
      )}

      {!loading && plans.length > 0 && (
        <section className="mt-10">
          <div className="space-y-10">
            {plans.map((plan) => (
              <PlanHistoryCard
                key={plan.id}
                plan={plan}
                onDelete={handleDeletePlan}
                isDeleting={deletingPlanId === plan.id}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Statistic({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-background p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
        {label}
      </p>

      <p className="mt-1 font-display text-2xl font-semibold">{value}</p>
    </div>
  );
}

function PlanHistoryCard({
  plan,
  onDelete,
  isDeleting,
}: {
  plan: Plan;
  onDelete: (plan: Plan) => void;
  isDeleting: boolean;
}) {
  const completed = plan.items.filter((item) => item.status === "completed").length;

  const percentage =
    plan.items.length === 0 ? 0 : Math.round((completed / plan.items.length) * 100);

  return (
    <article>
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            {formatPlanDate(plan.planDate)}
          </p>

          <h2 className="mt-1 font-display text-2xl font-semibold">Daily plan</h2>
        </div>

        <div className="text-right">
          <p className="font-mono text-xs text-muted-foreground">
            {completed} / {plan.items.length} completed
          </p>

          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            {percentage}%
          </p>

          <button
            type="button"
            onClick={() => onDelete(plan)}
            disabled={isDeleting}
            aria-label={`Delete plan: ${plan.inputText}`}
            className="mt-3 border border-destructive/40 px-2.5 py-1.5 text-xs font-medium text-destructive transition-colors hover:border-destructive hover:bg-destructive/5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>

      <div className="mt-4 border-l-2 border-primary/60 pl-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
          What was on your plate
        </p>

        <p className="mt-1 text-sm leading-relaxed">{plan.inputText}</p>
      </div>

      <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
        {plan.workloadEstimateMinutes !== null && (
          <span className="inline-flex items-center gap-1.5">
            <Clock3 className="size-3" />
            About {plan.workloadEstimateMinutes} minutes planned
          </span>
        )}

        <span>Created {formatCreatedTime(plan.createdAt)}</span>
      </div>

      <ol className="mt-4 divide-y divide-border border-y border-border">
        {plan.items.map((item) => (
          <HistoryItem key={item.id} item={item} />
        ))}
      </ol>
    </article>
  );
}

function HistoryItem({ item }: { item: PlanItem }) {
  return (
    <li className="py-4">
      <div className="flex items-start gap-3">
        <StatusIcon status={item.status} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p
              className={cn(
                "text-sm font-medium",
                item.status === "completed" && "text-muted-foreground line-through",
              )}
            >
              {item.title}
            </p>

            <span className="border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
              {statusLabel(item.status)}
            </span>
          </div>

          {item.detail && (
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.detail}</p>
          )}

          <div className="mt-2 flex flex-wrap gap-3 font-mono text-[11px] text-muted-foreground">
            {item.estimatedMinutes !== null && (
              <span>
                {item.estimateSource === "ai" ? "~" : ""}
                {item.estimatedMinutes} min
              </span>
            )}

            {item.actualMinutes !== null && <span>Actual {item.actualMinutes} min</span>}

            {item.userModified && <span>Edited by you</span>}
          </div>

          {item.reason && (
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{item.reason}</p>
          )}
        </div>
      </div>
    </li>
  );
}

function StatusIcon({ status }: { status: PlanItemStatus }) {
  if (status === "completed") {
    return (
      <span className="mt-0.5 grid size-5 shrink-0 place-items-center bg-primary text-primary-foreground">
        <Check className="size-3" />
      </span>
    );
  }

  if (status === "partial") {
    return (
      <span className="mt-0.5 grid size-5 shrink-0 place-items-center border border-border text-muted-foreground">
        <Minus className="size-3" />
      </span>
    );
  }

  if (status === "moved") {
    return (
      <span className="mt-0.5 grid size-5 shrink-0 place-items-center border border-border text-muted-foreground">
        <MoveRight className="size-3" />
      </span>
    );
  }

  if (status === "blocked") {
    return (
      <span className="mt-0.5 grid size-5 shrink-0 place-items-center border border-border text-muted-foreground">
        <CircleAlert className="size-3" />
      </span>
    );
  }

  if (status === "skipped") {
    return (
      <span className="mt-0.5 grid size-5 shrink-0 place-items-center border border-border text-muted-foreground">
        <X className="size-3" />
      </span>
    );
  }

  return <span className="mt-0.5 size-5 shrink-0 border border-border" />;
}

function statusLabel(status: PlanItemStatus) {
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

function formatPlanDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatCreatedTime(value: string) {
  const date = new Date(`${value}Z`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
