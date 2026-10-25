import assert from "node:assert/strict";
import test from "node:test";

import {
	buildBody,
	extractWhatsNew,
	prNumbersFromLog,
	uniqueBullets,
} from "./draft-release-notes.mjs";

const PR_BODY = `## Summary
- Internal details that should not ship.

## What's new
- App updates in Settings has a Changelog button
- Charts only animate when their section is on screen
- Top Counterparties remembers the last direction
- Reduced motion stops the pulsating Pay menu icons

## Testing
- [ ] \`go test ./...\` passes
`;

test("extractWhatsNew returns only the bullets in the section", () => {
	assert.deepEqual(extractWhatsNew(PR_BODY), [
		"App updates in Settings has a Changelog button",
		"Charts only animate when their section is on screen",
		"Top Counterparties remembers the last direction",
		"Reduced motion stops the pulsating Pay menu icons",
	]);
});

test("extractWhatsNew joins wrapped bullet lines", () => {
	assert.deepEqual(
		extractWhatsNew(`## What's new\n- First line\n  continues here\n- Second\n`),
		["First line continues here", "Second"],
	);
});

test("extractWhatsNew ignores comments and horizontal rules", () => {
	assert.deepEqual(
		extractWhatsNew(`## What's new\n<!-- hidden -->\n- One\n---\n- Two\n`),
		["One", "Two"],
	);
});

test("extractWhatsNew returns empty without a section", () => {
	assert.deepEqual(extractWhatsNew("## Summary\n- nothing\n"), []);
	assert.deepEqual(extractWhatsNew(""), []);
});

test("prNumbersFromLog finds merge and squash commits once", () => {
	const log = [
		"Merge pull request #9 from trononly/feat/whats-new",
		"feat(ui): counterparty card (#8)",
		"fix: a follow-up for #9",
		"Merge pull request #9 from a duplicate",
	].join("\n");

	assert.deepEqual(prNumbersFromLog(log), ["9", "8"]);
});

test("uniqueBullets keeps the first spelling and drops duplicates", () => {
	assert.deepEqual(
		uniqueBullets(["Same line", "same line", "Other", "  "]),
		["Same line", "Other"],
	);
});

test("buildBody includes the compare link and hidden PR list", () => {
	const body = buildBody({
		tag: "tripwire-0.9.7",
		prevTag: "tripwire-0.9.6",
		bullets: ["One", "Two"],
		prNumbers: [9, 10],
	});

	assert.equal(
		body,
		[
			"## What's new",
			"- One",
			"- Two",
			"",
			"<!-- PRs: #9, #10 -->",
			"",
			"**Full Changelog**: https://github.com/trononly/Tripwire/compare/tripwire-0.9.6...tripwire-0.9.7",
			"",
		].join("\n"),
	);
});
