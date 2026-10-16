import type { MouseEvent, ReactNode } from "react";

import { openExternalUrl } from "@/lib/external-url";
import {
	type Block,
	type InlineNode,
	parseReleaseNotes,
} from "@/lib/release-notes";

function renderInline(node: InlineNode, key: number): ReactNode {
	switch (node.kind) {
		case "text":
			return node.value;
		case "bold":
			return (
				<strong key={key} className="font-semibold text-foreground">
					{node.value}
				</strong>
			);
		case "italic":
			return <em key={key}>{node.value}</em>;
		case "code":
			return (
				<code
					key={key}
					className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]"
				>
					{node.value}
				</code>
			);
		case "link":
			return (
				<a
					key={key}
					href={node.href}
					onClick={(e: MouseEvent<HTMLAnchorElement>) => {
						// Never navigate the WebView; hand the URL to the OS.
						e.preventDefault();
						openExternalUrl(node.href);
					}}
					className="text-primary underline underline-offset-2 break-words"
				>
					{node.text}
				</a>
			);
	}
}

function BlockView({ block }: { block: Block }) {
	switch (block.kind) {
		case "heading": {
			const size =
				block.level <= 2
					? "text-sm font-semibold text-foreground"
					: "text-xs font-semibold text-foreground";
			return (
				<p className={`${size} mt-2 first:mt-0`}>
					{block.content.map(renderInline)}
				</p>
			);
		}
		case "list": {
			const List = block.ordered ? "ol" : "ul";
			return (
				<List
					className={`space-y-0.5 pl-4 ${
						block.ordered ? "list-decimal" : "list-disc"
					}`}
				>
					{block.items.map((item, i) => (
						<li key={i} className="pl-0.5">
							{item.map(renderInline)}
						</li>
					))}
				</List>
			);
		}
		case "rule":
			return <hr className="border-border" />;
		case "paragraph":
			return <p>{block.content.map(renderInline)}</p>;
	}
}

/**
 * Renders release-note Markdown as styled, non-navigating content. Links
 * open in the system browser, matching the rest of the app.
 */
export function ReleaseNotes({ notes }: { notes: string }) {
	const blocks = parseReleaseNotes(notes);
	return (
		<div className="space-y-2">
			{blocks.map((block, i) => (
				<BlockView key={i} block={block} />
			))}
		</div>
	);
}
