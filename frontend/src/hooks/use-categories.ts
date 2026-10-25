import { useCallback, useEffect, useState } from "react";

import { ListCategories } from "../../bindings/mpesa-analyzer/parseservice";
import type * as store from "../../bindings/mpesa-analyzer/internal/store/models";

/**
 * The user's category list. Small and rarely changed, so each consumer can
 * keep its own copy and call reload after a create/rename elsewhere.
 */
export function useCategories() {
	const [categories, setCategories] = useState<store.Category[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const reload = useCallback(async () => {
		setLoading(true);
		try {
			const list = await ListCategories();
			setCategories(list ?? []);
			setError(null);
		} catch (e) {
			setError(String(e));
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void reload();
	}, [reload]);

	return { categories, loading, error, reload };
}
