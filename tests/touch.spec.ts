import { test, expect } from "@playwright/test";
test("touch pinch, pan, selection, tab retention and keyboard-sized viewport", async ({
  page,
  browserName,
}, info) => {
  test.skip(
    info.project.name !== "mobile" || browserName !== "chromium",
    "Uses Chromium emulated multi-touch input.",
  );
  await page.goto("./");
  await page.waitForTimeout(800);
  const saved = JSON.parse(
      await page.evaluate(() => localStorage.getItem("neuralcanvas-v1")!),
    ),
    session = await page.context().newCDPSession(page);
  async function pinch(testId: string) {
    const box = (await page.getByTestId(testId).boundingBox())!,
      x = box.x + box.width / 2,
      y = box.y + box.height / 2;
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        { x: x - 35, y, id: 1 },
        { x: x + 35, y, id: 2 },
      ],
    });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        { x: x - 75, y: y - 10, id: 1 },
        { x: x + 75, y: y + 10, id: 2 },
      ],
    });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
  }
  const span = Number(
    await page.getByTestId("data-plot").getAttribute("data-span"),
  );
  await pinch("data-plot");
  expect(
    Number(await page.getByTestId("data-plot").getAttribute("data-span")),
  ).toBeLessThan(span);
  await page.waitForTimeout(800);
  expect(
    JSON.parse(
      await page.evaluate(() => localStorage.getItem("neuralcanvas-v1")!),
    ).data,
  ).toEqual(saved.data);
  await page.getByRole("tab", { name: "신경망", exact: true }).tap();
  await pinch("network");
  expect(
    Number(await page.getByTestId("network").getAttribute("data-zoom")),
  ).toBeGreaterThan(1);
  const transform = await page
      .getByTestId("network-transform")
      .getAttribute("transform"),
    box = (await page.getByTestId("network").boundingBox())!;
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: box.x + 30, y: box.y + 30, id: 1 }],
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: box.x + 60, y: box.y + 60, id: 1 }],
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  expect(
    await page.getByTestId("network-transform").getAttribute("transform"),
  ).not.toBe(transform);
  await page.getByRole("button", { name: "신경망 화면 맞춤" }).tap();
  await expect(page.getByTestId("network")).toHaveAttribute("data-zoom", "1");
  await page.getByRole("button", { name: "뉴런 1-0", exact: true }).tap();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("편향", { exact: true }).fill(".125");
  await page.setViewportSize({ width: 390, height: 480 });
  await expect(page.getByLabel("편향", { exact: true })).toBeInViewport({
    ratio: 1,
  });
  await page.getByRole("button", { name: "패널 닫기" }).tap();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("tab", { name: "데이터", exact: true }).tap();
  await page.getByRole("tab", { name: "신경망", exact: true }).tap();
  await expect(page.getByTestId("network")).toHaveAttribute("data-zoom", "1");
  await expect(
    page.getByRole("button", { name: "뉴런 1-0", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(800);
  const after = JSON.parse(
    await page.evaluate(() => localStorage.getItem("neuralcanvas-v1")!),
  );
  expect(after.data).toEqual(saved.data);
  expect(after.model.layers[0].b[0]).toBe(0.125);
  expect(after.model.layers[0].w).toEqual(saved.model.layers[0].w);
  await page.screenshot({ path: "test-results/mobile-network.png" });
  await page.getByRole("tab", { name: "데이터", exact: true }).tap();
  await page.getByRole("button", { name: "데이터 화면 맞춤" }).tap();
  await page.getByTestId("data-point").nth(10).tap();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "선택 점 삭제" }),
  ).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: "test-results/mobile-point-sheet.png" });
  await page.getByRole("button", { name: "패널 닫기" }).tap();
});
