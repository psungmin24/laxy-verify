export default function Page() {
  return (
    <main
      style={{
        padding: 48,
        fontFamily: "monospace",
        background: "#05010d",
        color: "#fef3c7",
        minHeight: "100vh",
      }}
    >
      <section
        style={{
          border: "6px solid #f43f5e",
          padding: 32,
          background: "linear-gradient(135deg, #4c1d95, #111827)",
        }}
      >
        <h1 style={{ fontSize: 64, marginBottom: 20, textTransform: "uppercase" }}>
          Visual Regression Fixture
        </h1>
        <p style={{ fontSize: 24, maxWidth: 840 }}>
          This version intentionally changes the full-page look, typography, spacing, and contrast to trigger
          a strong visual diff.
        </p>
      </section>
      <form style={{ display: "grid", gap: 20, maxWidth: 560, marginTop: 40 }}>
        <label htmlFor="email" style={{ fontSize: 22 }}>Email</label>
        <input
          id="email"
          name="email"
          type="email"
          placeholder="name@example.com"
          required
          style={{ padding: 18, fontSize: 20, borderRadius: 16, border: "3px solid #f59e0b" }}
        />
        <button
          type="submit"
          style={{
            padding: 18,
            fontSize: 22,
            fontWeight: 700,
            background: "#f43f5e",
            color: "white",
            border: "none",
            borderRadius: 999,
          }}
        >
          Ship It
        </button>
      </form>
      <a
        href="/details"
        style={{
          display: "inline-block",
          marginTop: 32,
          color: "#67e8f9",
          fontSize: 22,
        }}
      >
        Open release notes
      </a>
    </main>
  );
}
