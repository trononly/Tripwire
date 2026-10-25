import { formatAmountInput } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface AmountFieldProps {
	id: string;
	/** Raw digits only; grouping is display-only. */
	value: string;
	onChange: (digits: string) => void;
	invalid?: boolean;
	error?: string;
}

/**
 * The page's visual anchor: a large grouped amount with the currency as a
 * quiet prefix. Same hierarchy as the dashboard totals, so the number is
 * readable at a glance instead of being one small field among many.
 */
export function AmountField({
	id,
	value,
	onChange,
	invalid = false,
	error,
}: AmountFieldProps) {
	return (
		<div className="space-y-1.5">
			<label
				htmlFor={id}
				className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
			>
				Amount
			</label>
			<div
				className={cn(
					"flex items-baseline gap-2 border border-input bg-muted/30 px-3 py-2.5 transition-colors focus-within:border-ring focus-within:ring-1 focus-within:ring-ring/50",
					invalid && "border-destructive",
				)}
			>
				<span className="text-sm font-medium text-muted-foreground">KSh</span>
				<input
					id={id}
					inputMode="numeric"
					autoComplete="off"
					placeholder="0"
					value={formatAmountInput(value)}
					onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
					aria-invalid={invalid}
					className="min-w-0 flex-1 bg-transparent text-3xl font-semibold tracking-tight tabular-nums outline-none placeholder:text-muted-foreground/40"
				/>
			</div>
			{error && <span className="text-xs text-destructive">{error}</span>}
		</div>
	);
}

export default AmountField;
