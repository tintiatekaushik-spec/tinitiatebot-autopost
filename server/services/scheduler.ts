import { listDueScheduledUploads } from "../storage.js";
import { isAutomationRunning, runAutomation } from "./publisher.js";

let schedulerTimer: NodeJS.Timeout | null = null;
let schedulerCheckActive = false;

function getPollIntervalMs() {
  const configured = Number(process.env.SCHEDULER_POLL_MS ?? 1000);
  return Number.isFinite(configured) ? Math.max(250, configured) : 1000;
}

async function checkScheduledUploads() {
  if (schedulerCheckActive || isAutomationRunning()) return;
  schedulerCheckActive = true;

  try {
    const dueUploads = await listDueScheduledUploads();
    if (dueUploads.length === 0) return;

    console.log(
      `Scheduler found ${dueUploads.length} due post(s): ${dueUploads.map((upload) => upload.id).join(", ")}`,
    );
    await runAutomation({ mode: "scheduledOnly", trigger: "scheduler" });
  } catch (error) {
    console.error("Scheduled automation check failed:", error);
  } finally {
    schedulerCheckActive = false;
  }
}

export function startScheduler() {
  if (schedulerTimer || process.env.SCHEDULER_ENABLED === "false") return;

  const pollIntervalMs = getPollIntervalMs();
  console.log(`Post scheduler active; checking every ${pollIntervalMs}ms.`);
  void checkScheduledUploads();
  schedulerTimer = setInterval(() => void checkScheduledUploads(), pollIntervalMs);
}
