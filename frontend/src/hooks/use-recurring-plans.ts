import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  AddRecurringPlan,
  DeleteRecurringPlan,
  ListRecurringPlans,
  UpdateRecurringPlan,
} from "../../bindings/mpesa-analyzer/parseservice";
import type { RecurringPlan } from "../../bindings/mpesa-analyzer/internal/store/models";
import type { PlanDraft } from "@/lib/recurring-plans";

/** Best-effort message for a rejected Wails call. */
function messageOf(err: unknown): string {
  if (err instanceof Error && err.message.trim()) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return "Could not save that payment.";
}

/**
 * The recurring payments the user set up themselves. Storage is SQLite behind
 * the Wails service, like favourites: the hook keeps the list in sync after
 * each write instead of duplicating rows in React state.
 */
export function useRecurringPlans() {
	const [plans, setPlans] = useState<RecurringPlan[]>([]);
	const [loading, setLoading] = useState(true);
	const requestId = useRef(0);

	const refresh = useCallback(async () => {
		const id = ++requestId.current;
		try {
			const list = await ListRecurringPlans();
			if (id === requestId.current) setPlans(list ?? []);
		} catch (e) {
			console.error("Loading recurring plans failed:", e);
		}
	}, []);

	useEffect(() => {
		let current = true;
		refresh().finally(() => {
			if (current) setLoading(false);
		});
		return () => {
			current = false;
		};
	}, [refresh]);

	const add = useCallback(
		async (plan: PlanDraft) => {
			try {
				await AddRecurringPlan(plan);
				await refresh();
				toast.success("Recurring payment added.");
				return true;
			} catch (e) {
				toast.error(messageOf(e));
				return false;
			}
		},
		[refresh],
	);

	const update = useCallback(
		async (id: string, plan: PlanDraft) => {
			try {
				await UpdateRecurringPlan(id, plan);
				await refresh();
				toast.success("Recurring payment updated.");
				return true;
			} catch (e) {
				toast.error(messageOf(e));
				return false;
			}
		},
		[refresh],
	);

	const remove = useCallback(
		async (id: string) => {
			try {
				await DeleteRecurringPlan(id);
				await refresh();
				toast.success("Recurring payment removed.");
				return true;
			} catch (e) {
				toast.error(messageOf(e));
				return false;
			}
		},
		[refresh],
	);

	return { plans, loading, add, update, remove, refresh };
}
