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
	const { blurred, reveal } = useReveal();
	return (
		<div
			role={blurred ? "button" : undefined}
			tabIndex={blurred ? 0 : undefined}
			aria-label={blurred ? label : undefined}
			title={blurred ? label : undefined}
			onClick={reveal}
			onKeyDown={(e) => {
				if (blurred && (e.key === "Enter" || e.key === " ")) {
					e.preventDefault();
					reveal();
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
