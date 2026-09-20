import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temporaryDirectory = mkdtempSync(join(tmpdir(), "dayplan-e2e-"));
const databasePath = join(temporaryDirectory, "dayplan-e2e.db");
const developmentDatabasePath = resolve(rootDirectory, "backend/dayplan.db");

if (resolve(databasePath) === developmentDatabasePath) {
  throw new Error("E2E database path must not be backend/dayplan.db");
}

async function findAvailablePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();

    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not reserve an E2E port"));
        return;
      }

      const port = address.port;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolvePort(port);
      });
    });
  });
}

function runPlaywright(environment) {
  return new Promise((resolveExitCode, reject) => {
    const command = process.platform === "win32" ? "npx.cmd" : "npx";
    const child = spawn(command, ["playwright", "test"], {
      cwd: rootDirectory,
      env: environment,
      stdio: "inherit",
    });

    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`Playwright stopped with signal ${signal}`));
        return;
      }
      resolveExitCode(code ?? 1);
    });
  });
}

try {
  const [backendPort, frontendPort] = await Promise.all([findAvailablePort(), findAvailablePort()]);
  const exitCode = await runPlaywright({
    ...process.env,
    DAYPLAN_DATABASE_PATH: databasePath,
    E2E_BACKEND_PORT: String(backendPort),
    E2E_FRONTEND_PORT: String(frontendPort),
  });

  process.exitCode = exitCode;
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
