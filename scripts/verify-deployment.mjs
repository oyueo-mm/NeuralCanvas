import { chromium, expect } from "@playwright/test";
const url = process.argv[2] ?? "https://oyueo-mm.github.io/NeuralCanvas/";
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [],
  badResponses = [],
  failed = [],
  workers = [],
  assets = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("requestfailed", (r) => failed.push(r.url()));
page.on("response", (r) => {
  if (r.status() >= 400)
    badResponses.push({ url: r.url(), status: r.status() });
  else if (/\.(js|css)$/.test(r.url()))
    assets.push({ url: r.url(), status: r.status() });
});
page.on("worker", (w) => workers.push(w.url()));
const response = await page.goto(url);
await page.getByRole("button", { name: "한 스텝", exact: true }).click();
await page.waitForFunction(
  () =>
    JSON.parse(localStorage.getItem("neuralcanvas-v1") ?? "{}").history
      ?.length > 0,
);
await page.getByRole("button", { name: "입력 순회", exact: true }).click();
await page.waitForTimeout(200);
await page.getByRole("button", { name: "순회 일시정지", exact: true }).click();
await page.waitForTimeout(800);
const regression = JSON.parse(
  await page.evaluate(() => localStorage.getItem("neuralcanvas-v1")),
);
await page.getByRole("button", { name: /^분류 Classification/ }).click();
await expect(page.getByTestId("decision-boundary")).toBeVisible();
await expect(page.getByTestId("data-point")).toHaveCount(100);
await page.getByRole("button", { name: "한 스텝", exact: true }).click();
await expect(page.getByTestId("accuracy")).toHaveText(/\d+\.\d+%/);
await page.waitForTimeout(800);
const classification = JSON.parse(
  await page.evaluate(() => localStorage.getItem("neuralcanvas-v1")),
);
expect(classification.task).toBe("classification");
expect(classification.model.layers[0].w[0]).toHaveLength(2);
expect(classification.history.at(-1).train).toBeGreaterThan(0);
const boundary = {
  updates: await page
    .getByTestId("data-plot")
    .getAttribute("data-boundary-updates"),
  workerMs: await page
    .getByTestId("data-plot")
    .getAttribute("data-boundary-ms"),
};
await page.getByRole("button", { name: /^회귀 Regression/ }).click();
await page.waitForTimeout(800);
const restored = JSON.parse(
  await page.evaluate(() => localStorage.getItem("neuralcanvas-v1")),
);
expect(restored.model).toEqual(regression.model);
expect(restored.data).toEqual(regression.data);
const workerHTTP = [];
for (const workerURL of new Set(workers)) {
  const r = await page.request.get(workerURL);
  workerHTTP.push({ url: workerURL, status: r.status() });
}
console.log(
  JSON.stringify(
    {
      url,
      htmlStatus: response.status(),
      assets,
      workerHTTP,
      classification: {
        task: classification.task,
        accuracy: classification.history.at(-1).accuracy,
        boundary,
      },
      regressionRestored: true,
      errors,
      badResponses,
      failed,
    },
    null,
    2,
  ),
);
await browser.close();
if (
  response.status() !== 200 ||
  errors.length ||
  badResponses.length ||
  failed.length ||
  !workers.length ||
  workerHTTP.some((r) => r.status !== 200)
)
  process.exitCode = 1;
