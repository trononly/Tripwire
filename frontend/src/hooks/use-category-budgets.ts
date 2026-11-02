import { useEffect, useState } from "react";

import { CategoryBudgetReport } from "../../bindings/mpesa-analyzer/parseservice";
import type * as categories from "../../bindings/mpesa-analyzer/internal/categories/models";
import type * as parser from "../../bindings/mpesa-analyzer/internal/parser/models";
import { useCategoryVersion } from "@/lib/category-refresh";

/**
 * Every category's spend against its monthly cap, straight from Go so the
 * Categories page, the edit sheet's preview and the dashboard warning all read
 * the same rules. The report follows the dataset's newest month; `current`
 * says whether that month is the real current month, which is what gates the
 * launch-time toast.
 *
 * Re-runs when the dataset changes, when a category or rule changes, and when
 * the caller turns it on.
 */
export function useCategoryBudgets(
	txs: parser.Transaction[],
	enabled = true,
) {
	const [report, setReport] = useState<categories.BudgetReport | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const version = useCategoryVersion();

	useEffect(() => {
		if (!enabled) return;
		let cancelled = false;
		setLoading(true);
		CategoryBudgetReport(txs)
			.then((next) => {
				if (cancelled) return;
				setReport(next ?? null);
				setError(null);
			})
			.catch((e) => {
				if (cancelled) return;
				setError(String(e));
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [txs, enabled, version]);

	return { report, loading, error };
}
