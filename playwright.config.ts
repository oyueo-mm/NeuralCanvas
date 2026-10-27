import { defineConfig, devices } from "@playwright/test";
import process from "node:process";
export default defineConfig({
  testDir: "./tests",
  timeout: 90000,
  fullyParallel: false,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL:
      process.env.NEURALCANVAS_URL ?? "http://127.0.0.1:4175/NeuralCanvas/",
    trace: "retain-on-failure",
  },
  webServer: process.env.NEURALCANVAS_URL
    ? undefined
    : {
        command: "npm run preview -- --port 4175 --strictPort",
        url: "http://127.0.0.1:4175/NeuralCanvas/",
        reuseExistingServer: !process.env.CI,
      },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: {
        ...devices["iPhone 13"],
        viewport: { width: 390, height: 844 },
        defaultBrowserType: "chromium",
      },
    },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
  ],
});
