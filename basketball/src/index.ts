import "dotenv/config";
import { fork } from "child_process";
import { resolve } from "path";
import { createCredential } from "./security/createCredential";
import { getClobClient } from "./providers/clobclient";
import { runApprove } from "./security/allowance";
import { logger } from "./utils/logger";
import { MenuApp } from "./services/menu-app";

function spawnMonitorWorker() {
  const workerEntry = resolve(__dirname, "monitor-worker.js");
  const child = fork(workerEntry, [], { cwd: process.cwd(), env: process.env, stdio: "inherit" });
  child.on("exit", (code) => {
    logger.warn("SYSTEM", "Monitor worker exited", code);
  });
  return child;
}

async function bootstrap(): Promise<void> {
  logger.info("BOOT", "Bootstrapping credentials");
  await createCredential();
  const clob = await getClobClient();
  logger.info("BOOT", "Running allowance checks");
  await runApprove(clob);

  const monitorChild = spawnMonitorWorker();
  const app = new MenuApp(monitorChild);
  await app.run();

  monitorChild.kill("SIGTERM");
}

bootstrap().catch((e) => {
  logger.error("SYSTEM", "Fatal bootstrap error", e);
  process.exit(1);
});
