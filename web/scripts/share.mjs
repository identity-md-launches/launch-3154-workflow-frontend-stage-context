import { Resvg } from "@resvg/resvg-js";
import { readFileSync, writeFileSync } from "node:fs";
const svg = new URL("../public/share.svg", import.meta.url);
writeFileSync(
  new URL("../public/share.png", import.meta.url),
  new Resvg(readFileSync(svg), {
    font: { loadSystemFonts: true, defaultFontFamily: "DejaVu Sans" },
  })
    .render()
    .asPng(),
);
