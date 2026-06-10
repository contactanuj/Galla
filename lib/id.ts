/**
 * Collision-resistant ID generation.
 *
 * IDs are generated client-side before any write and reused as the Supabase
 * primary key (idempotency key). Two devices creating a record offline must
 * never collide, so we use RFC-4122 v4 UUIDs (122 bits of randomness) instead
 * of timestamp-based ids like `order-${Date.now()}`, which collide whenever two
 * writes land in the same millisecond.
 *
 * `crypto.randomUUID` is used when available; otherwise we fall back to a
 * Math.random-based v4 generator (sufficient for uniqueness — these ids are not
 * security tokens).
 */
function uuidv4(): string {
  const c: any = (globalThis as any).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** A new globally-unique id, optionally prefixed for readability (e.g. `order`). */
export function newId(prefix?: string): string {
  const id = uuidv4();
  return prefix ? `${prefix}-${id}` : id;
}

/**
 * A short, stable per-device token. Used to suffix human-friendly invoice
 * numbers so two offline devices in the same business never mint the same
 * invoice number (e.g. `INV-20260610-0007-A3F2`).
 */
let _deviceToken: string | null = null;
export async function getDeviceToken(): Promise<string> {
  if (_deviceToken) return _deviceToken;
  const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
  let token = await AsyncStorage.getItem('device_token');
  if (!token) {
    token = uuidv4().replace(/-/g, '').slice(0, 4).toUpperCase();
    await AsyncStorage.setItem('device_token', token);
  }
  _deviceToken = token;
  return token;
}
