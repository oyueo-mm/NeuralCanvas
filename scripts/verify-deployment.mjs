import { chromium } from "@playwright/test";
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
const workerHTTP = [];
for (const workerURL of workers) {
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
