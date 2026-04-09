export default function Page() {
  return (
    <main style={{ padding: 32, fontFamily: "sans-serif" }}>
      <h1>Broken Navigation Fixture</h1>
      <p>This app looks normal, but the internal link points to a missing route.</p>
      <form style={{ display: "grid", gap: 12, maxWidth: 420 }}>
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" placeholder="name@example.com" required />
        <button type="submit">Submit</button>
      </form>
      <a href="/missing-page">Broken details link</a>
    </main>
  );
}
