import { expect, test } from "@playwright/test";

const userTaskTitle = "Persistent E2E task";
const planInput = "Prepare a reliable E2E workflow";
const generatedItems = [
  "Work on your most urgent task",
  "Continue an important ongoing task",
  "Review and prepare for tomorrow",
];

test("persists a task and a generated plan across the full DayPlan workflow", async ({ page }) => {
  await page.goto("/tasks");

  await expect(page.getByText("Loading tasks...")).toHaveCount(0);

  await page.getByLabel("Task title").fill(userTaskTitle);
  await expect(page.getByLabel("Task title")).toHaveValue(userTaskTitle);
  await page.getByRole("button", { name: "Add task" }).click();
  await expect(page.getByText(userTaskTitle, { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText(userTaskTitle, { exact: true })).toBeVisible();

  await page.goto("/");
  await expect(page.getByText("Loading today's plan...")).toHaveCount(0);
  await expect(page.getByText("Loading tasks...")).toHaveCount(0);

  await page.getByLabel("What's on your plate?").fill(planInput);
  await page.getByRole("button", { name: "Generate today's plan" }).click();

  for (const itemTitle of generatedItems) {
    await expect(page.getByText(itemTitle, { exact: true }).first()).toBeVisible();
  }

  await page.getByRole("button", { name: "Generate today's plan" }).click();
  await expect(page.getByRole("heading", { name: "Today's plan" })).toBeVisible();

  await page.goto("/tasks");
  await expect(page.getByText(userTaskTitle, { exact: true })).toBeVisible();
  for (const itemTitle of generatedItems) {
    await expect(page.getByText(itemTitle, { exact: true })).toHaveCount(1);
  }

  await page.goto("/");
  await expect(page.getByText("Loading today's plan...")).toHaveCount(0);
  const firstStatus = page.locator("select").first();
  await firstStatus.selectOption("partial");
  await expect(firstStatus).toHaveValue("partial");

  await page.reload();
  await expect(page.locator("select").first()).toHaveValue("partial");
  await expect(page.getByText("Partial", { exact: true }).first()).toBeVisible();

  await page.goto("/history");
  await expect(page.getByText(planInput, { exact: true })).toHaveCount(1);
  await expect(page.locator("article").getByText("Partial", { exact: true })).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: `Delete plan: ${planInput}` }).click();
  await expect(page.getByText(planInput, { exact: true })).toHaveCount(0);

  await page.goto("/tasks");
  await expect(page.getByText(userTaskTitle, { exact: true })).toBeVisible();
  for (const itemTitle of generatedItems) {
    await expect(page.getByText(itemTitle, { exact: true })).toHaveCount(1);
  }
});
