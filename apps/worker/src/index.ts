import { createSmtpSender } from "@countrytopics/email";
import { createEmailWorker, createRedisConnection } from "@countrytopics/jobs";

import { readWorkerEnv } from "./env.ts";

const env = readWorkerEnv();
const connection = createRedisConnection(env.redisUrl, "worker");

const emailWorker = createEmailWorker({
  connection,
  prefix: env.queuePrefix,
  sender: createSmtpSender({ smtpUrl: env.smtpUrl, from: env.emailFrom }),
});

// Log the job id and error only: job data contains sign-in links.
emailWorker.on("failed", (job, error) => {
  console.error(
    `Email job ${job?.id ?? "unknown"} failed (attempt ${job?.attemptsMade ?? "?"}):`,
    error.message,
  );
});
emailWorker.on("error", (error) => {
  console.error("Email worker error:", error.message);
});

console.log(`Worker started: queue "email", prefix "${env.queuePrefix}"`);

// Containers stop with SIGTERM; finish in-flight jobs, then release Redis.
async function shutDown(signal: string): Promise<void> {
  console.log(`${signal} received; finishing in-flight jobs`);
  await emailWorker.close();
  await connection.quit();
  process.exit(0);
}

process.once("SIGTERM", () => void shutDown("SIGTERM"));
process.once("SIGINT", () => void shutDown("SIGINT"));
