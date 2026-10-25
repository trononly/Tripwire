// Tiny Markdown reader for the GitHub release notes shown as the Changelog.
// The notes are curated in `release-notes/<version>.md` and are a narrow GFM
// subset - ATX headings, `*`/`-` bullets, **bold**, `code`, [links](url) and
// bare URLs - so a full Markdown engine is not worth the bundle weight. This
// keeps the parsing pure and testable; the React rendering lives in
// components/release-notes.tsx.

export type InlineNode =
	| { kind: "text"; value: string }
	| { kind: "bold"; value: string }
	| { kind: "italic"; value: string }
	| { kind: "code"; value: string }
	| { kind: "link"; text: string; href: string };

export type Block =
	| { kind: "heading"; level: number; content: InlineNode[] }
	| { kind: "paragraph"; content: InlineNode[] }
	| { kind: "list"; ordered: boolean; items: InlineNode[][] }
	| { kind: "rule" };

// Order matters: **bold** is tried before *italic*. Underscore emphasis is
// deliberately unsupported so identifiers like `send_money` stay literal.
const INLINE_RE =
	/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\)|https?:\/\/[^\s<>()]+)/g;

function inlineToken(token: string): InlineNode {
	if (token.startsWith("**") && token.endsWith("**")) {
		return { kind: "bold", value: token.slice(2, -2) };
	}
	if (token.startsWith("`") && token.endsWith("`")) {
		return { kind: "code", value: token.slice(1, -1) };
	}
	if (token.startsWith("*") && token.endsWith("*")) {
		return { kind: "italic", value: token.slice(1, -1) };
	}
	const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token);
	if (link) return { kind: "link", text: link[1], href: link[2] };
	// A bare URL renders as a link whose text is the URL itself.
	return { kind: "link", text: token, href: token };
}

/** Split one line of text into text / bold / italic / code / link nodes. */
export function parseInline(text: string): InlineNode[] {
	const nodes: InlineNode[] = [];
	let last = 0;
	INLINE_RE.lastIndex = 0;
	for (let m = INLINE_RE.exec(text); m; m = INLINE_RE.exec(text)) {
		if (m.index > last) {
			nodes.push({ kind: "text", value: text.slice(last, m.index) });
		}
		nodes.push(inlineToken(m[0]));
		last = m.index + m[0].length;
	}
	if (last < text.length) nodes.push({ kind: "text", value: text.slice(last) });
	return nodes;
}

/** Parse release-note Markdown into render-ready blocks. */
export function parseReleaseNotes(markdown: string): Block[] {
	const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
	const blocks: Block[] = [];
	let paragraph: string[] = [];
	let list: { ordered: boolean; items: InlineNode[][] } | null = null;

	const flushParagraph = () => {
		if (paragraph.length) {
			blocks.push({ kind: "paragraph", content: parseInline(paragraph.join(" ")) });
			paragraph = [];
		}
	};
	const flushList = () => {
		if (list) {
			blocks.push({ kind: "list", ordered: list.ordered, items: list.items });
			list = null;
		}
	};

	for (const raw of lines) {
		// Drop GitHub's HTML comments (e.g. contributor hints).
		const content = raw.replace(/<!--.*?-->/g, "").trim();

		const heading = /^(#{1,6})\s+(.*)$/.exec(content);
		if (heading) {
			flushParagraph();
			flushList();
			blocks.push({
				kind: "heading",
				level: heading[1].length,
				content: parseInline(heading[2].trim()),
			});
			continue;
		}

		if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(content)) {
			flushParagraph();
			flushList();
			blocks.push({ kind: "rule" });
			continue;
		}

		const bullet = /^[-*+]\s+(.*)$/.exec(content);
		const ordered = /^\d+[.)]\s+(.*)$/.exec(content);
		if (bullet || ordered) {
			flushParagraph();
			const isOrdered = ordered !== null;
			if (!list || list.ordered !== isOrdered) {
				flushList();
				list = { ordered: isOrdered, items: [] };
			}
			list.items.push(parseInline((bullet ?? ordered)![1].trim()));
			continue;
		}

		if (content === "") {
			flushParagraph();
			flushList();
			continue;
		}

		// A plain line inside a list is a wrapped continuation of its item.
		if (list) {
			list.items[list.items.length - 1].push({ kind: "text", value: ` ${content}` });
		} else {
			paragraph.push(content);
		}
	}

	flushParagraph();
	flushList();
	return blocks;
}
