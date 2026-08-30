import type { DispatchNotificationJob } from "@openploy/shared";
import { dispatchNotification } from "../notifications";

export async function processDispatchNotificationJob(job: DispatchNotificationJob): Promise<void> {
  await dispatchNotification(job.organizationId, job.event, job.context);
}
