#!/usr/bin/env node
// Drafts release-notes/<version>.md from the merged PRs in a tag range.
//
// The draft is intentionally not published automatically: the release
// manager edits it, commits it, and only then tags the release. The
// release workflow publishes that committed file verbatim.
//
// Usage:
//   node scripts/draft-release-notes.mjs tripwire-0.9.7
//   node scripts/draft-release-notes.mjs tripwire-0.9.7 --force
//
// Requires the GitHub CLI (`gh`) to be installed and authenticated.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const REPO = "trononly/Tripwire";

/** Pull the bullets out of a PR's `## What's new` section. */
export function extractWhatsNew(body = "") {
	const heading = /^##\s+What's new\s*$/im.exec(body);
	if (!heading) return [];
	const section = body
		.slice(heading.index + heading[0].length)
		.split(/^##\s+/m)[0];
	const bullets = [];
	for (const raw of section.split("\n")) {
		const line = raw.trim();
		if (!line || line.startsWith("<!--") || line === "---") continue;
		const bullet = /^[-*]\s+(.+)$/.exec(line);
		if (bullet) bullets.push(bullet[1].trim());
		else if (bullets.length) bullets[bullets.length - 1] += ` ${line}`;
	}
	return bullets;
}

/** `Merge pull request #9` and squash-style `... (#9)` lines. */
export function prNumbersFromLog(log = "") {
	const numbers = [];
	const seen = new Set();
	for (const match of log.matchAll(
		/Merge pull request #(\d+)|\(#(\d+)\)/g,
	)) {
		const number = match[1] ?? match[2];
		if (!number || seen.has(number)) continue;
		seen.add(number);
		numbers.push(number);
	}
	return numbers;
}

/** Drop duplicate bullets while keeping their original order and wording. */
export function uniqueBullets(bullets) {
	const seen = new Set();
	return bullets.filter((bullet) => {
		const key = bullet.trim().toLowerCase();
		if (!key || seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

/** The Markdown body the release workflow publishes. */
export function buildBody({ tag, prevTag, bullets, prNumbers = [] }) {
	const lines = ["## What's new", ...bullets.map((b) => `- ${b}`), ""];
	if (prNumbers.length > 0) {
		lines.push(
			`<!-- PRs: ${prNumbers.map((n) => `#${n}`).join(", ")} -->`,
			"",
		);
	}
	if (prevTag) {
		lines.push(
			`**Full Changelog**: https://github.com/${REPO}/compare/${prevTag}...${tag}`,
			"",
		);
	}
	return lines.join("\n");
}

function run(command, args) {
	try {
		return execFileSync(command, args, {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		}).trim();
	} catch (error) {
		const detail = String(error.stderr ?? error.message ?? "").trim();
		throw new Error(`${command} ${args.join(" ")} failed: ${detail}`);
	}
}

function git(...args) {
	return run("git", args);
}

function ghJson(...args) {
	return JSON.parse(run("gh", args));
}

function main() {
	const args = process.argv.slice(2);
	const tag = args.find((arg) => !arg.startsWith("--"));
	const force = args.includes("--force");

	if (!tag?.startsWith("tripwire-")) {
		console.error(
			"Usage: node scripts/draft-release-notes.mjs tripwire-0.9.7 [--force]",
		);
		process.exit(1);
	}

	let prevTag = "";
	try {
		prevTag = git(
			"describe",
			"--tags",
			"--abbrev=0",
			"--match",
			"tripwire-*",
			`${tag}^`,
		);
	} catch {
		// First release, or a tag with no earlier release tag.
	}

	const range = prevTag ? `${prevTag}..${tag}` : tag;
	const log = git("log", "--format=%B", range);
	const prNumbers = prNumbersFromLog(log);

	const prs = [];
	for (const number of prNumbers) {
		try {
			prs.push(
				ghJson(
					"pr",
					"view",
					number,
					"--json",
					"number,title,body,mergedAt",
				),
			);
		} catch (error) {
			console.warn(`Skipping PR #${number}: ${error.message}`);
		}
	}

	const fromPrs = prs
		.sort((a, b) => (a.mergedAt ?? "").localeCompare(b.mergedAt ?? ""))
		.flatMap((pr) => {
			const bullets = extractWhatsNew(pr.body ?? "");
			return bullets.length > 0 ? bullets : [pr.title];
		});

	// No PRs in range (direct commits): fall back to the commit subjects,
	// excluding merge plumbing and chore commits.
	const fallback = git("log", "--format=%s", range)
		.split("\n")
		.map((line) => line.trim())
		.filter(
			(line) =>
				line &&
				!line.startsWith("Merge ") &&
				!/^chore(\(|:)/.test(line),
		);

	const bullets = uniqueBullets(fromPrs.length > 0 ? fromPrs : fallback);
	if (bullets.length === 0) {
		console.error(
			`No user-facing changes found between ${prevTag || "the repo root"} and ${tag}.`,
		);
		process.exit(1);
	}

	const version = tag.replace(/^tripwire-/, "");
	const path = `release-notes/${version}.md`;
	if (existsSync(path) && !force) {
		console.error(
			`${path} already exists. Edit it by hand, or pass --force to replace it with a fresh draft.`,
		);
		process.exit(1);
	}

	mkdirSync("release-notes", { recursive: true });
	writeFileSync(
		path,
		buildBody({
			tag,
			prevTag,
			bullets,
			prNumbers: prs.map((pr) => pr.number),
		}),
	);
	console.log(path);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
	main();
}
