import { defineConfig } from "@playwright/test";

// End-to-end tests drive real browsers against a production build of the app and the
// Supabase project in .env.local. Run `pnpm build` first, then `pnpm test:e2e`.
// Set E2E_BASE_URL to run the same tests against a deployed site instead of a local build.
const remote = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "e2e",
  timeout: 240_000,
  expect: { timeout: 20_000 },
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: remote ?? "http://localhost:3000",
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
    launchOptions: {
      // Fake microphone so voice chat can be exercised without real hardware or prompts.
      args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
    },
  },
  webServer: remote
    ? undefined
    : { command: "pnpm start", url: "http://localhost:3000", reuseExistingServer: true, timeout: 120_000 },
});
