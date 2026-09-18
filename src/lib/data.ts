export type PlanItem = {
  id: string;
  time: string;
  duration: string;
  title: string;
  detail: string;
  status: "done" | "active" | "upcoming";
};

export type Task = {
  id: number;
  title: string;
  dueDate: string | null;
  priority: "low" | "medium" | "high";
  completed: boolean;
};

export type Goal = {
  id: string;
  title: string;
  note?: string;
};

export const initialPlan: PlanItem[] = [
  {
    id: "p1",
    time: "08:30",
    duration: "25 min",
    title: "Morning review & inbox triage",
    detail: "Clear overnight messages, note anything urgent.",
    status: "done",
  },
  {
    id: "p2",
    time: "09:00",
    duration: "90 min",
    title: "Deep work — university project: results section",
    detail: "Draft the analysis chapter; references already collected.",
    status: "active",
  },
  {
    id: "p3",
    time: "11:00",
    duration: "45 min",
    title: "Job applications — 2 of 3 this week",
    detail: "Tailor the cover letter template for the two shortlisted roles.",
    status: "upcoming",
  },
  {
    id: "p4",
    time: "14:00",
    duration: "60 min",
    title: "Read paper: distributed systems survey",
    detail: "Sections 3–5, take notes for the literature review.",
    status: "upcoming",
  },
  {
    id: "p5",
    time: "18:00",
    duration: "30 min",
    title: "Evening walk, no phone",
    detail: "Let the day settle before dinner.",
    status: "upcoming",
  },
];

export const initialTasks: Task[] = [
  {
    id: 1,
    title: "Submit project milestone report",
    dueDate: "2026-09-18",
    priority: "high",
    completed: false,
  },
  {
    id: 2,
    title: "React course",
    dueDate: "2026-09-20",
    priority: "medium",
    completed: false,
  },
  {
    id: 3,
    title: "Reply to client",
    dueDate: null,
    priority: "medium",
    completed: false,
  },
  {
    id: 4,
    title: "Apply to jobs",
    dueDate: null,
    priority: "high",
    completed: false,
  },
  {
    id: 5,
    title: "Dentist appointment",
    dueDate: "2026-09-24",
    priority: "low",
    completed: false,
  },
];
export const initialGoals: Goal[] = [
  {
    id: "g1",
    title: "Finish university project by Friday",
    note: "Results + discussion chapters remaining. Aim for a full draft Thursday night.",
  },
  {
    id: "g2",
    title: "Apply to 3 jobs this week",
    note: "Northwind and Helios shortlisted; find one more by Wednesday.",
  },
  {
    id: "g3",
    title: "Read 30 minutes every evening",
    note: "Currently: 'Designing Data-Intensive Applications'.",
  },
];

export function formatToday(): string {
  return new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
