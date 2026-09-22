import { defineConfig, devices } from "@playwright/test";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const frontendPort = process.env.E2E_FRONTEND_PORT;
const backendPort = process.env.E2E_BACKEND_PORT;
const databasePath = process.env.DAYPLAN_DATABASE_PATH;

if (!frontendPort || !backendPort || !databasePath) {
  throw new Error("Run Playwright through npm run test:e2e so it receives isolated E2E settings.");
}

const frontendUrl = `http://127.0.0.1:${frontendPort}`;
const backendUrl = `http://127.0.0.1:${backendPort}`;

const rootDirectory = dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  outputDir: "test-results/e2e",
  timeout: 45_000,
  use: {
    baseURL: frontendUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "node e2e/backend.mjs",
      cwd: rootDirectory,
      env: {
        ...process.env,
        PORT: backendPort,
        DAYPLAN_DATABASE_PATH: databasePath,
      },
      url: `${backendUrl}/api/hello`,
      timeout: 30_000,
      reuseExistingServer: false,
      name: "E2E backend",
    },
    {
      command: `npx vite --host 127.0.0.1 --port ${frontendPort}`,
      cwd: rootDirectory,
      env: {
        ...process.env,
        VITE_API_URL: backendUrl,
      },
      url: frontendUrl,
      timeout: 30_000,
      reuseExistingServer: false,
      name: "E2E frontend",
    },
  ],
});
