/** Runs a Management API call that is allowed to fail (paused projects, missing scopes). */
export async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}
