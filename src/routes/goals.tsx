import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/goals")({
  head: () => ({
    meta: [
      { title: "History — DayPlan" },
      {
        name: "description",
        content: "Past entries you've shared with DayPlan — the context behind each day's plan.",
      },
      { property: "og:title", content: "History — DayPlan" },
      {
        property: "og:description",
        content: "Past entries you've shared with DayPlan — the context behind each day's plan.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HistoryPage,
});

type Entry = {
  id: string;
  date: string;
  text: string;
  planSummary: string;
};

const entries: Entry[] = [
  {
    id: "e1",
    date: "2026-09-16",
    text: "University project due Friday — results section still rough. React course due Sunday. Reply to CelVion client. Apply to 2 more jobs this week. Dentist appointment Thursday.",
    planSummary: "5 items · deep work morning, applications after lunch",
  },
  {
    id: "e2",
    date: "2026-09-15",
    text: "Project milestone report needs submitting. Lecture notes from week 4 are piling up. Library books due soon. Feeling behind on the reading habit.",
    planSummary: "4 items · admin first, reading in the evening",
  },
  {
    id: "e3",
    date: "2026-09-14",
    text: "New week. Want to shortlist job openings, get groceries, and finally book the dentist. Keep mornings free for the university project.",
    planSummary: "6 items · light Monday, errands batched together",
  },
  {
    id: "e4",
    date: "2026-09-11",
    text: "Finish the literature review notes. Call the bank about the card. Plan the weekend trip with Omar. Don't overbook today.",
    planSummary: "3 items · short day, recovery focus",
  },
];

function formatEntryDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function HistoryPage() {
  return (
    <div>
      <header className="border-b border-border pb-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          Context
        </p>
        <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight sm:text-5xl">
          Entry history
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
          Everything you've shared on the Today screen, kept as a record. Each entry is
          what that day's plan was built from.
        </p>
      </header>

      <section className="mt-8">
        <ul className="divide-y divide-border border-y border-border">
          {entries.map((entry) => (
            <li key={entry.id} className="flex items-start gap-4 py-5 sm:gap-6">
              <span className="w-24 shrink-0 pt-1 text-right font-mono text-[11px] leading-relaxed text-muted-foreground">
                {formatEntryDate(entry.date)}
              </span>
              <span className="hidden w-px self-stretch bg-border sm:block" />
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-relaxed">{entry.text}</p>
                <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
                  Plan: {entry.planSummary}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
