// Remembers the last result of each page's list requests while the app is open.
// Coming back to a page shows that result at once, while a fresh request runs
// and replaces it, so the screen is never left out of date.

const store = new Map<string, unknown>();

/** A cache key from a name plus the request arguments. */
export const keyOf = (name: string, args: unknown = {}) => `${name}:${JSON.stringify(args)}`;

/** The last result stored under this key, if any. */
export function peek<T>(key: string): T | undefined {
  return store.get(key) as T | undefined;
}

/** Waits for a request and stores its result under the key. */
export async function remember<T>(key: string, request: Promise<T>): Promise<T> {
  const value = await request;
  store.set(key, value);
  return value;
}

/** Drops every stored result whose key starts with this prefix. */
export function forget(prefix = '') {
  for (const k of [...store.keys()]) if (k.startsWith(prefix)) store.delete(k);
}
