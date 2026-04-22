import "dotenv/config";
import { PositionMonitorService } from "./services/position-monitor";
import { logger } from "./utils/logger";

const monitor = new PositionMonitorService();

async function main(): Promise<void> {
  await monitor.start();

  process.on("message", (msg: unknown) => {
    if (msg && typeof msg === "object" && (msg as { type?: string }).type === "reload-selection") {
      monitor.handleReloadSignal().catch((e) => logger.error("MONITOR", "Reload failed", e));
    }
  });

  process.on("SIGTERM", () => {
    logger.info("MONITOR", "Stopping monitor (SIGTERM)");
    monitor.stop();
    process.exit(0);
  });
  process.on("SIGINT", () => {
    logger.info("MONITOR", "Stopping monitor (SIGINT)");
    monitor.stop();
    process.exit(0);
  });
}

main().catch((e) => {
  logger.error("MONITOR", "Monitor worker fatal error", e);
  process.exit(1);
});
