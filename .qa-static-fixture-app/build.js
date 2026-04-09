const fs = require("node:fs");
const path = require("node:path");

const outDir = path.join(__dirname, "dist");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "build.txt"), "static fixture build ok\n", "utf8");
console.log("Static fixture build complete.");
