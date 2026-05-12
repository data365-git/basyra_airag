/**
 * Next.js instrumentation hook — runs once when the server process starts.
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 *
 * We use it to validate env vars at boot time so misconfiguration surfaces
 * immediately in Railway's deploy log rather than at first feature use.
 */
export async function register() {
  // Only run in the Node.js runtime (not the Edge runtime, not build phase)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateEnv } = await import("@/lib/env");
    validateEnv();
  }
}
