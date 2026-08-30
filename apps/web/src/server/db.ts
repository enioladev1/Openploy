import "server-only";
import { getDb, type Database } from "@openploy/db";

// Lazy on purpose - getDb() reads DATABASE_URL and throws if it's unset.
// Next's build-time route analysis imports every route module (never calls
// the handlers), so an eager `getDb()` here fails the build itself, since no
// real DATABASE_URL exists at build time - only at container runtime.
export const db: Database = new Proxy({} as Database, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});
