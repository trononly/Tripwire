import { useEffect, useState } from "react";

import {
	ActivateStatement,
	DeleteStatement,
	ListStatements,
} from "../../bindings/mpesa-analyzer/parseservice";
import type * as parser from "../../bindings/mpesa-analyzer/internal/parser/models";
import type * as store from "../../bindings/mpesa-analyzer/internal/store/models";

export function metaOf(record: store.StatementRecord): store.StatementMeta {
	return {
		id: record.id,
		name: record.name,
		source: record.source,
		simId: record.simId,
		simLabel: record.simLabel,
		dateRange: record.dateRange,
		txCount: record.txCount,
		importedAt: record.importedAt,
	};
}

/**
 * Statement history: the stored metas, the session-active statement, and
 * its loaded transactions. The active id is session-only: nothing
 * auto-loads on launch, the user picks a statement (or imports one) every
 * session.
 */
export function useStatements() {
	const [statements, setStatements] = useState<store.StatementMeta[]>([]);
	const [activeId, setActiveId] = useState<string | null>(null);
	const [statementTxs, setStatementTxs] = useState<parser.Transaction[]>([]);
	const activeStatement = statements.find((s) => s.id === activeId) ?? null;

	useEffect(() => {
		ListStatements()
			.then((list) => setStatements(list ?? []))
			.catch((e) => console.error("Loading statement history failed:", e));
	}, []);

	function addMeta(record: store.StatementRecord) {
		setStatements((prev) => [metaOf(record), ...prev]);
	}

	// The refresh merges into the latest SMS record in place, so unlike a
	// statement import this upserts: no duplicate History rows, no jumping.
	function upsertMeta(record: store.StatementRecord) {
		const meta = metaOf(record);
		setStatements((prev) => {
			const i = prev.findIndex((s) => s.id === record.id);
			if (i === -1) return [meta, ...prev];
			const next = prev.slice();
			next[i] = meta;
			return next;
		});
	}

	function loadStatement(id: string) {
		ActivateStatement(id)
			.then((loaded) => {
				setActiveId(id);
				setStatementTxs(loaded ?? []);
			})
			.catch((e) => console.error("Loading statement failed:", e));
	}

	function handleActivate(id: string) {
		loadStatement(id);
	}

	/** A fresh import becomes the active statement with its dataset loaded. */
	function importRecord(record: store.StatementRecord) {
		addMeta(record);
		setActiveId(record.id);
		setStatementTxs(record.txs ?? []);
	}

	/**
	 * Delete a record and, when it was the active statement, drop to the
	 * empty state (no auto-promotion of another statement). Resolves when
	 * the store confirms the delete.
	 */
	function removeRecord(id: string): Promise<void> {
		return DeleteStatement(id)
			.then(() => {
				setStatements((prev) => prev.filter((s) => s.id !== id));
				if (id === activeId) {
					setActiveId(null);
					setStatementTxs([]);
				}
			})
			.catch((e) => console.error("Deleting statement failed:", e));
	}

	return {
		statements,
		setStatements,
		activeId,
		activeStatement,
		statementTxs,
		upsertMeta,
		loadStatement,
		handleActivate,
		importRecord,
		removeRecord,
	};
}
