import { getDb, type Database } from "@openploy/db";

// Lazy on purpose - see apps/web/src/server/db.ts for why (same eager-init
// footgun applies wherever this module gets imported without DATABASE_URL set).
export const db: Database = new Proxy({} as Database, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});
