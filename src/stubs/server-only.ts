// Empty stand-in for the "server-only" package.
//
// The real package throws whenever it is loaded outside a Next.js server
// bundle. Server modules import it as a guard against accidental use in client
// components, but the same modules also run in the pg-boss worker (plain Node
// via tsx) and in vitest. Both of those map "server-only" here instead:
//   - worker: tsconfig.worker.json `paths`
//   - tests:  vitest.config.ts `resolve.alias`
export {};
