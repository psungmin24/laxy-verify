export function generateBadge(grade: string): string {
  const gradeLower = grade.toLowerCase();
  const colors: Record<string, string> = {
    gold: "yellow",
    silver: "brightgreen",
    bronze: "blue",
    unverified: "lightgrey",
  };
  const color = colors[gradeLower] ?? "lightgrey";
  return `![Laxy Verify: ${grade}](https://img.shields.io/badge/laxy_verify-${gradeLower}-${color})`;
}
