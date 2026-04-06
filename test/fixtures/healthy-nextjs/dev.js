// Simulates a Next.js dev server on port 3000
const http = require("http");

const port = parseInt(process.env.PORT || "3000");

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end("<html><body><h1>Hello from laxy-verify fixture</h1></body></html>");
});

server.listen(port, () => {
  console.log(`  ▲ Next.js 15.0.0`);
  console.log(`  - Local: http://localhost:${port}`);
  console.log(`  ✓ Ready in 1234ms`);
});

// Keep alive until killed
process.on("SIGTERM", () => server.close());
process.on("SIGINT", () => server.close());
