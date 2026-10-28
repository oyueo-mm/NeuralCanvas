import { describe, expect, it } from "vitest";
import { classStroke, palette, themedClasses } from "./theme";
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
// Derived tints from style.css that text and controls sit on.
const tint2 = "#E4E8DB",
  tint = "#F3F5EC",
  muted = "#536257";
describe("palette accessibility", () => {
  it.each([
    ["body text on white", palette.ink, palette.white],
    ["body text on section header", palette.ink, tint2],
    ["secondary text on white", muted, palette.white],
    ["secondary text on section header", muted, tint2],
    ["primary button label", palette.white, palette.sageDeep],
    ["selected tool label", palette.white, palette.sageDeep],
    ["ink on pink selection", palette.ink, palette.pink],
    ["link on white", palette.sageDeep, palette.white],
    ["link on hover tint", palette.sageDeep, tint],
    ["validation accent text", palette.rose, palette.white],
    ["toast text", palette.white, palette.ink],
  ])("%s keeps WCAG AA text contrast", (_, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });
  it.each([
    ["training point outline", palette.sageDeep],
    ["prediction curve", palette.sageDeep],
    ["validation outline", palette.rose],
    ["boundary contour", palette.ink],
    ["class 0 fill", themedClasses[0].color],
  ])("%s is distinguishable on the graph surface", (_, color) => {
    expect(contrast(color, palette.white)).toBeGreaterThanOrEqual(3);
  });
  it("the two classes differ in lightness, not only in hue", () => {
    expect(
      contrast(themedClasses[0].color, themedClasses[1].color),
    ).toBeGreaterThanOrEqual(3);
  });
  it("class points keep an outline that contrasts with their fill", () => {
    for (const c of themedClasses)
      expect(contrast(c.color, classStroke[c.id])).toBeGreaterThanOrEqual(3);
  });
});
