import { useEffect, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  CalendarDays,
  Target,
  ListTodo,
  Sun,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { title: "Today", to: "/", icon: CalendarDays },
{ title: "History", to: "/history", icon: Target },
{ title: "Task list", to: "/tasks", icon: ListTodo },
] as const;

function useTheme() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("dayplan-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const isDark = stored ? stored === "dark" : prefersDark;
    setDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);
  }, []);

  const toggle = () => {
    setDark((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle("dark", next);
      localStorage.setItem("dayplan-theme", next ? "dark" : "light");
      return next;
    });
  };

  return { dark, toggle };
}

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const { dark, toggle } = useTheme();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-20 hidden flex-col border-r border-border bg-card transition-[width] duration-200 sm:flex",
          collapsed ? "w-16" : "w-60"
        )}
      >
        <div className={cn("flex h-16 items-center gap-3 border-b border-border", collapsed ? "justify-center px-0" : "px-5")}>
          <div className="grid size-8 shrink-0 place-items-center bg-primary font-display text-sm font-semibold text-primary-foreground">
            D
          </div>
          {!collapsed && (
            <div className="min-w-0 leading-none">
              <p className="truncate font-display text-base font-semibold tracking-tight">DayPlan</p>
              <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Personal planner
              </p>
            </div>
          )}
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          {NAV.map((item) => {
            const active = pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                title={collapsed ? item.title : undefined}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 text-sm transition-colors",
                  collapsed && "justify-center px-0",
                  active
                    ? "bg-accent font-medium text-accent-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <item.icon className="size-4 shrink-0" />
                {!collapsed && <span>{item.title}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="space-y-1 border-t border-border p-3">
          <button
            onClick={toggle}
            title={collapsed ? "Toggle theme" : undefined}
            className={cn(
              "flex w-full items-center gap-3 px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
              collapsed && "justify-center px-0"
            )}
          >
            {dark ? <Sun className="size-4 shrink-0" /> : <Moon className="size-4 shrink-0" />}
            {!collapsed && <span>{dark ? "Light mode" : "Dark mode"}</span>}
          </button>
          <button
            onClick={() => setCollapsed((c) => !c)}
            title={collapsed ? "Expand sidebar" : undefined}
            className={cn(
              "flex w-full items-center gap-3 px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
              collapsed && "justify-center px-0"
            )}
          >
            {collapsed ? (
              <PanelLeftOpen className="size-4 shrink-0" />
            ) : (
              <PanelLeftClose className="size-4 shrink-0" />
            )}
            {!collapsed && <span>Collapse</span>}
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-card px-4 py-3 sm:hidden">
        <div className="flex items-center gap-2">
          <div className="grid size-7 place-items-center bg-primary font-display text-xs font-semibold text-primary-foreground">
            D
          </div>
          <span className="font-display text-base font-semibold">DayPlan</span>
        </div>
        <button
          onClick={toggle}
          className="p-2 text-muted-foreground"
          aria-label="Toggle theme"
        >
          {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </button>
      </div>
      <nav className="flex border-b border-border bg-card sm:hidden">
        {NAV.map((item) => {
          const active = pathname === item.to;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 border-b-2 py-2.5 text-xs font-medium transition-colors",
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground"
              )}
            >
              <item.icon className="size-3.5" />
              {item.title}
            </Link>
          );
        })}
      </nav>

      <main className={cn("transition-[margin] duration-200", collapsed ? "sm:ml-16" : "sm:ml-60")}>
        <div className="mx-auto max-w-5xl px-5 py-8 sm:px-10">{children}</div>
      </main>
    </div>
  );
}
