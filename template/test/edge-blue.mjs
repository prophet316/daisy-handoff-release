// How blue a display's edges are in a screenshot: the mean of (blue - red) over thin strips just inside the left and
// right edges (middle half of the height, away from the menu bar and Dock). {{ASSISTANT}}'s glow pushes it up a lot.
// Usage: node test/edge-blue.mjs shot.png [...]   prints one number per file
import { execFileSync } from "node:child_process";

for (const f of process.argv.slice(2)) {
  let sum = 0, n = 0;
  for (const side of ["0", "iw-48"]) {
    const raw = execFileSync("ffmpeg", ["-loglevel", "error", "-i", f, "-vf", `crop=48:ih/2:${side}:ih/4,scale=8:32`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]);
    for (let i = 0; i < raw.length; i += 3) { sum += raw[i + 2] - raw[i]; n++; }
  }
  console.log((sum / n).toFixed(1));
}
