import MissingWidget from "./MissingWidget";

export default function Page() {
  return (
    <main style={{ padding: 32, fontFamily: "sans-serif" }}>
      <h1>Free Build Failure Fixture</h1>
      <p>This app intentionally imports a missing module so build verification must fail.</p>
      <MissingWidget />
    </main>
  );
}
