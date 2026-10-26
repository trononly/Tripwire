import type { Group } from "@/components/transaction-list";

/**
 * Applies the "My categories" deep link from the dashboard donut. An empty
 * value or "all" keeps every row; "none" keeps the rows no user category
 * labels (the gray slice); anything else matches a category id.
 */
export function filterByCustomCategory(
  groups: Group[],
  customFilter: string,
): Group[] {
  if (!customFilter || customFilter === "all") return groups;
  const out: Group[] = [];
  for (const g of groups) {
    const txs = g.txs.filter((t) =>
      customFilter === "none"
        ? !t.customCategoryId
        : t.customCategoryId === customFilter,
    );
    if (txs.length > 0) out.push({ ...g, txs });
  }
  return out;
}

/**
 * Applies the page toolbar's filters to the prepared day groups. Lives here
 * rather than in the page so it stays unit-testable and the page module only
 * exports components (React Fast Refresh).
 */
export function filterGroups(
  groups: Group[],
  search: string,
  categoryFilter: string,
  directionFilter: "all" | "in" | "out",
  fromDate: string,
  toDate: string,
): Group[] {
  const q = search.trim().toLowerCase();
  const tokens = q ? q.split(/\s+/).filter(Boolean) : [];
  const out: Group[] = [];
  for (const g of groups) {
    const txs = g.txs.filter((t) => {
      if (categoryFilter !== "all" && t.category !== categoryFilter)
        return false;
      if (directionFilter === "in" && t.amount < 0) return false;
      if (directionFilter === "out" && t.amount >= 0) return false;
      const day = t.date.slice(0, 10);
      if (fromDate && day < fromDate) return false;
      if (toDate && day > toDate) return false;
      if (tokens.length > 0) {
        // Match every word rather than the query as one substring, so
        // "Absa PLC" finds "Absa Bank Kenya PLC".
        const hay =
          `${t.description} ${t.category} ${t.counterparty} ${t.type}`.toLowerCase();
        if (!tokens.every((tok) => hay.includes(tok))) return false;
      }
      return true;
    });
    if (txs.length > 0) out.push({ ...g, txs });
  }
  return out;
}
