"use client";

function blockMainThread(ms) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    Math.sqrt(Math.random() * 1000);
  }
}

export default function Page() {
  blockMainThread(2200);

  return (
    <main style={{ padding: 32, fontFamily: "sans-serif" }}>
      <h1>Pro+ Performance Fixture</h1>
      <p>This fixture intentionally blocks the main thread and renders excessive content.</p>
      <form style={{ display: "grid", gap: 12, maxWidth: 420 }}>
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" placeholder="name@example.com" required />
        <button type="submit">Submit</button>
      </form>
      <a href="/details">Details</a>
      <section style={{ display: "grid", gap: 8, marginTop: 32 }}>
        {Array.from({ length: 1200 }).map((_, index) => (
          <div
            key={index}
            style={{
              height: 6,
              background: index % 2 === 0 ? "#111" : "#444",
            }}
          />
        ))}
      </section>
    </main>
  );
}
