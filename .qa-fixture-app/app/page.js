export default function Page() {
  return (
    <main style={{ padding: 32, fontFamily: "sans-serif" }}>
      <h1>Laxy Verify Fixture</h1>
      <p>This app exists to exercise build, Lighthouse, and verify E2E flows.</p>
      <form style={{ display: "grid", gap: 12, maxWidth: 420 }}>
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" placeholder="name@example.com" />
        <button type="submit">Submit</button>
      </form>
      <a href="/details">Details</a>
    </main>
  );
}
