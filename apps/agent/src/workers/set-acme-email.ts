import type { SetAcmeEmailJob } from "@openploy/shared";
import { setAcmeEmail } from "../traefik-acme";

export async function processSetAcmeEmailJob(job: SetAcmeEmailJob): Promise<void> {
  await setAcmeEmail(job.email);
}
