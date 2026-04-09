export const metadata = {
  title: "Laxy Verify Fixture",
  description: "Fixture app for laxy-verify QA",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
