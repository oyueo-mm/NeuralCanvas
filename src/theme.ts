import { classes, type ClassDefinition } from "./engine";
// SVG exports cannot resolve CSS variables, so drawing code shares these values.
export const palette = {
  ivory: "#FDFAF4",
  paper: "#FFFEFB",
  pink: "#F1E3E9",
  sageLight: "#BECEB5",
  sage: "#8CA185",
  sageDeep: "#4B674E",
  ink: "#29372D",
  muted: "#536257",
  grid: "#E6E9DC",
  axis: "#BECEB5",
  rose: "#A8456A",
  disabled: "#9AA596",
} as const;
// Class 0 is dark and class 1 light, so the pair also differs for color-blind viewers.
export const classStroke = [palette.ivory, palette.ink];
const classColors = ["#3F5F43", "#E9A3BC"];
export const themedClasses: ClassDefinition[] = classes.map((c) => ({
  ...c,
  color: classColors[c.id] ?? c.color,
}));
