import { useEffect, useState } from "react";

import { CustomCategoryTotals } from "../../bindings/mpesa-analyzer/parseservice";
import type * as categories from "../../bindings/mpesa-analyzer/internal/categories/models";
import type * as parser from "../../bindings/mpesa-analyzer/internal/parser/models";
import { useCategoryVersion } from "@/lib/category-refresh";

/**
 * Totals per user category for one dataset slice, straight from Go so the
 * dashboard donut and the Categories page agree on which row belongs where.
 * Unlabelled transactions come back as an empty-id "Uncategorized" bucket.
 *
 * Only fetches while `enabled` is true - the M-Pesa view never pays for it -
 * and re-runs when a category or assignment changes.
 */
export function useCustomCategoryTotals(
	txs: parser.Transaction[],
	enabled: boolean,
) {
	const [totals, setTotals] = useState<categories.Total[]>([]);
	const [loading, setLoading] = useState(false);
	const version = useCategoryVersion();

	useEffect(() => {
		if (!enabled) return;
		if (txs.length === 0) {
			setTotals([]);
			setLoading(false);
			return;
		}
		let cancelled = false;
		setLoading(true);
		CustomCategoryTotals(txs)
			.then((t) => {
				if (cancelled) return;
				setTotals(t ?? []);
				setLoading(false);
			})
			.catch(() => {
				if (cancelled) return;
				setTotals([]);
				setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [txs, enabled, version]);

	return { totals, loading };
}
