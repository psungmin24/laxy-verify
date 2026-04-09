const http = require("node:http");

const port = Number(process.env.PORT || 3310);

function renderLayout(title, body, extra = "") {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      :root {
        color-scheme: light;
        font-family: Arial, sans-serif;
      }
      body {
        margin: 0;
        background: linear-gradient(180deg, #f6f7fb 0%, #ffffff 100%);
        color: #101828;
      }
      .page {
        max-width: 960px;
        margin: 0 auto;
        padding: 40px 20px 120px;
      }
      .hero {
        background: white;
        border: 1px solid #d0d5dd;
        border-radius: 24px;
        padding: 28px;
        box-shadow: 0 14px 40px rgba(16, 24, 40, 0.08);
      }
      .hero h1 {
        margin: 0 0 10px;
        font-size: 40px;
        line-height: 1.1;
      }
      .hero p {
        margin: 0 0 18px;
        color: #475467;
        font-size: 18px;
      }
      .form-row {
        display: grid;
        gap: 12px;
        grid-template-columns: minmax(0, 1fr) auto;
        margin-top: 18px;
      }
      input, textarea, button, a.cta {
        font: inherit;
      }
      input {
        padding: 14px 16px;
        border-radius: 14px;
        border: 1px solid #d0d5dd;
        background: #fff;
      }
      button, a.cta {
        padding: 14px 18px;
        border-radius: 14px;
        border: none;
        background: #111827;
        color: white;
        cursor: pointer;
        text-decoration: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      .meta {
        margin-top: 16px;
        color: #475467;
        min-height: 24px;
      }
      .alert {
        color: #b42318;
        font-weight: 600;
      }
      .cards {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 16px;
        margin-top: 24px;
      }
      .card {
        background: white;
        border: 1px solid #d0d5dd;
        border-radius: 18px;
        padding: 18px;
      }
      .filler {
        margin-top: 28px;
        display: grid;
        gap: 16px;
      }
      .filler section {
        background: rgba(255,255,255,0.9);
        border: 1px solid #eaecf0;
        border-radius: 18px;
        padding: 20px;
      }
      @media (max-width: 900px) {
        .cards {
          grid-template-columns: 1fr;
        }
        .form-row {
          grid-template-columns: 1fr;
        }
      }
      @media (max-width: 480px) {
        .hero h1 {
          font-size: 30px;
        }
      }
    </style>
    ${extra}
  </head>
  <body>
    <main class="page">${body}</main>
  </body>
</html>`;
}

function renderHome() {
  const filler = Array.from({ length: 10 }, (_, index) => `
    <section>
      <h2>Release checkpoint ${index + 1}</h2>
      <p>Static fixture content to validate scroll stability, viewport responsiveness, and repeated interaction safety.</p>
    </section>
  `).join("");

  return renderLayout(
    "Static QA Fixture",
    `
      <div class="hero">
        <h1>Release-ready QA fixture</h1>
        <p>This page is intentionally simple so laxy-verify can prove its Pro and Pro+ checks without framework worker noise.</p>
        <form id="signup-form">
          <label for="email">Email</label>
          <div class="form-row">
            <input id="email" name="email" type="email" required aria-required="true" placeholder="you@example.com" />
            <button type="submit" aria-label="Submit release check">Run check</button>
          </div>
          <p id="feedback" class="meta" role="status" aria-live="polite"></p>
          <p id="error" class="meta alert" role="alert" hidden>Please enter a valid email address.</p>
        </form>
        <div class="cards">
          <article class="card">
            <h2>Fast</h2>
            <p>Low-complexity markup keeps Lighthouse stable across repeated runs.</p>
          </article>
          <article class="card">
            <h2>Responsive</h2>
            <p>Desktop, tablet, and mobile layouts all render from one clean surface.</p>
          </article>
          <article class="card">
            <h2>Traceable</h2>
            <p>Visual diff and interaction state are deterministic.</p>
          </article>
        </div>
        <p class="meta"><a class="cta" href="/details">Open verification details</a></p>
      </div>
      <div class="filler">${filler}</div>
    `,
    `
      <script>
        const form = document.getElementById('signup-form');
        const email = document.getElementById('email');
        const feedback = document.getElementById('feedback');
        const error = document.getElementById('error');

        form.addEventListener('submit', (event) => {
          event.preventDefault();
          if (!email.checkValidity()) {
            error.hidden = false;
            feedback.textContent = '';
            email.setAttribute('aria-invalid', 'true');
            return;
          }
          error.hidden = true;
          email.removeAttribute('aria-invalid');
          feedback.textContent = 'Release check queued for ' + email.value;
        });
      </script>
    `
  );
}

function renderDetails() {
  return renderLayout(
    "Fixture Details",
    `
      <div class="hero">
        <h1>Verification details</h1>
        <p>This route exists so internal navigation checks have a stable destination.</p>
        <p><a class="cta" href="/">Back to home</a></p>
      </div>
    `
  );
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);

  if (url.pathname === "/details") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(renderDetails());
    return;
  }

  if (url.pathname === "/" || url.pathname === "/index.html") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(renderHome());
    return;
  }

  if (url.pathname === "/robots.txt") {
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    res.end("User-agent: *\\nAllow: /\\n");
    return;
  }

  res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  res.end("Not found");
});

server.listen(port, () => {
  console.log(`Static fixture listening on http://127.0.0.1:${port}`);
});
