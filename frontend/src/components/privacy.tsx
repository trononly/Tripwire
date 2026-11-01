import type { ReactNode } from "react";
import { useReveal } from "@/lib/privacy-mode";
import { cn } from "@/lib/utils";

/**
 * A money figure behind the Privacy Mode veil. When Privacy Mode is on the
 * wrapped content is blurred in place (nothing is edited or hidden from the
 * DOM), and tapping it lifts the blur for that figure only. Off by default:
 * with Privacy Mode disabled this renders a plain passthrough.
 */
export function Private({
	children,
	className,
	label = "Tap to reveal",
}: {
	children: ReactNode;
	className?: string;
	label?: string;
}) {
	const { blurred, toggle, enabled } = useReveal();
	return (
		<div
			role={blurred ? "button" : undefined}
			tabIndex={blurred ? 0 : undefined}
			aria-label={blurred ? label : undefined}
			title={blurred ? label : undefined}
			onClick={(event) => {
				if (!enabled) return;
				// While veiled any tap reveals. Once revealed, re-blur on a
				// blank-area tap, but never steal a click from a real control
				// inside the figure (a chart tab, a counterparty row).
				if (blurred) {
					toggle();
					return;
				}
				const target = event.target as HTMLElement;
				if (target.closest("button, a, input, select, textarea, [role='button'], [role='tab']")) {
					return;
				}
				toggle();
			}}
			onKeyDown={(e) => {
				if (blurred && (e.key === "Enter" || e.key === " ")) {
					e.preventDefault();
					toggle();
				}
			}}
			className={cn("relative", blurred && "cursor-pointer", className)}
		>
			<div
				aria-hidden={blurred || undefined}
				className={cn(
					"transition-[filter,opacity] duration-200",
					// Inert while veiled so a tap always reveals instead of
					// drilling into the blurred chart underneath.
					blurred && "pointer-events-none blur-[7px] select-none opacity-80",
				)}
			>
				{children}
			</div>
		</div>
	);
}

/**
 * Inline variant for a sentence that carries a money figure (the dashboard
 * finding). Tapping toggles the veil like a card does.
 */
export function PrivateText({
	children,
	label = "Tap to reveal",
}: {
	children: ReactNode;
	label?: string;
}) {
	const { blurred, toggle, enabled } = useReveal();
	return (
		<span
			role={enabled ? "button" : undefined}
			tabIndex={enabled ? 0 : undefined}
			aria-pressed={enabled ? !blurred : undefined}
			aria-label={enabled ? (blurred ? label : "Hide figure") : undefined}
			onClick={enabled ? toggle : undefined}
			onKeyDown={(e) => {
				if (enabled && (e.key === "Enter" || e.key === " ")) {
					e.preventDefault();
					toggle();
				}
			}}
			className={cn(
				"rounded-sm transition-[filter,opacity] duration-200",
				blurred && "cursor-pointer blur-[7px] select-none opacity-80",
			)}
		>
			{children}
		</span>
	);
}
