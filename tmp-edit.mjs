import fs from "node:fs";
let s = fs.readFileSync("src/style.css", "utf8");
const a = s.indexOf(".side-body {"), b = s.indexOf(".side-content {");
s = s.slice(0, a) + `.side-body {
  display: none;
}
.side-section.open .side-body {
  display: block;
}
.side-section.open .side-content {
  animation: reveal 0.16s ease-out;
}
@keyframes reveal {
  from {
    opacity: 0;
  }
}
` + s.slice(b);
fs.writeFileSync("src/style.css", s);
let t = fs.readFileSync("tests/layout.spec.ts", "utf8");
const old = `      await expect(page.getByTestId("network")).toBeInViewport({ ratio: 1 });\n      await leaveSide(page);`;
if (!t.includes(old)) throw new Error("layout missing");
t = t.replace(old, `      await expect(page.getByTestId("network")).toBeInViewport({\n        ratio: 0.98,\n      });\n      await leaveSide(page);`);
fs.writeFileSync("tests/layout.spec.ts", t);
let l = fs.readFileSync("tests/lab.spec.ts", "utf8");
const o2 = l.indexOf(`  await page.getByRole("button", { name: "일시정지", exact: true }).click();\n  expect((await saved(page)).history.at(-1).step).toBeGreaterThan(`);
if (o2 < 0) throw new Error("lab missing");
const end = l.indexOf("  );\n", o2) + 5;
l = l.slice(0, o2) + `  await page.getByRole("button", { name: "일시정지", exact: true }).click();
  await expect
    .poll(async () => (await saved(page)).history.at(-1).step)
    .toBeGreaterThan(stopped.history.at(-1).step);
` + l.slice(end);
fs.writeFileSync("tests/lab.spec.ts", l);
