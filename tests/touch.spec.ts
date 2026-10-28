import { test, expect } from "@playwright/test";
import { closeDialog, goPage } from "./helpers";
test("classification touch stroke, undo, point move and bottom sheet", async ({
  page,
  browserName,
}, info) => {
  test.skip(
    info.project.name !== "mobile" || browserName !== "chromium",
    "Chromium multi-touch input.",
  );
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./");
  await goPage(page, "lab");
  await page.getByRole("button", { name: "분류", exact: true }).tap();
  await page.getByRole("button", { name: "클래스 1", exact: true }).tap();
  await page.getByRole("button", { name: "연속 그리기", exact: true }).tap();
  const b = (await page.getByTestId("data-plot").boundingBox())!,
    session = await page.context().newCDPSession(page);
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: b.x + 55, y: b.y + 65, id: 1 }],
  });
  for (let i = 1; i <= 12; i++)
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: b.x + 55 + i * 17, y: b.y + 65 + i * 2, id: 1 }],
    });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  const count = await page.getByTestId("data-point").count();
  expect(count).toBeGreaterThan(105);
  await page.getByRole("button", { name: "편집 도구 열기", exact: true }).tap();
  await page.getByRole("button", { name: "실행 취소", exact: true }).tap();
  await expect(page.getByTestId("data-point")).toHaveCount(100);
  await page.getByRole("button", { name: "다시 실행", exact: true }).tap();
  await expect(page.getByTestId("data-point")).toHaveCount(count);
  await page.getByRole("button", { name: "패널 닫기" }).tap();
  await page.getByRole("button", { name: "점 편집", exact: true }).tap();
  const p = (await page.getByTestId("data-point").last().boundingBox())!;
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: p.x + p.width / 2, y: p.y + p.height / 2, id: 1 }],
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: p.x - 20, y: p.y + 25, id: 1 }],
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await page.getByTestId("data-point").last().tap();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "선택 점 삭제" }),
  ).toBeInViewport({ ratio: 1 });
  await expect(page.getByLabel("선택 점 클래스")).toHaveValue("1");
  await page.getByRole("button", { name: "선택 점 삭제" }).tap();
  await page.getByRole("button", { name: "패널 닫기" }).tap();
  await expect(page.getByTestId("data-point")).toHaveCount(count - 1);
  await expect(page.getByTestId("decision-boundary")).toBeVisible();
  expect(errors).toEqual([]);
});
test("touch pinch, pan, drawer retention and keyboard-sized viewport", async ({
  page,
  browserName,
}, info) => {
  test.skip(
    info.project.name !== "mobile" || browserName !== "chromium",
    "Uses Chromium emulated multi-touch input.",
  );
  await page.goto("./");
  await goPage(page, "lab");
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
  await goPage(page, "network");
  await expect(page.getByTestId("network")).toBeVisible();
  await page.waitForTimeout(400);
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
  await page.getByLabel("편향", { exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByLabel("편향", { exact: true })).toBeInViewport({
    ratio: 1,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await closeDialog(page);
  await goPage(page, "lab");
  await goPage(page, "network");
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
  await goPage(page, "lab");
  await page.getByRole("button", { name: "데이터 화면 맞춤" }).tap();
  await page.getByTestId("data-point").nth(10).tap();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "선택 점 삭제" }),
  ).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: "test-results/mobile-point-sheet.png" });
  await page.getByRole("button", { name: "패널 닫기" }).tap();
});
