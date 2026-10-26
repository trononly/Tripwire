import { useCallback, useEffect, useState } from "react";

import { ListCategories } from "../../bindings/mpesa-analyzer/parseservice";
import type * as store from "../../bindings/mpesa-analyzer/internal/store/models";
import { useCategoryVersion } from "@/lib/category-refresh";

/**
 * The user's category list. Small and rarely changed, so each consumer can
 * keep its own copy; it reloads whenever a category is created, renamed,
 * reordered or deleted anywhere in the app (the shared revision counter), so
 * a filter chip row can never drift from the picker.
 */
export function useCategories() {
	const [categories, setCategories] = useState<store.Category[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const version = useCategoryVersion();

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
	}, [reload, version]);

	return { categories, loading, error, reload };
}
