# Releasing Tripwire

One page from merged code to a published GitHub Release. For the PR and
release-notes standard, see `AGENTS.md` and `release-notes/README.md`.

## Model

- `main` is always releasable and protected: every change lands through a
  green pull request.
- A release is an **annotated** `tripwire-x.y.z` tag on a commit on `main`.
  The tag is the version; there is no version file to bump.
- **No release branch is needed.** Tags are immutable, so `main` can keep
  moving. Create `release/x.y` only if you must patch an older line after
  `main` has moved on (see [Hotfixes](#hotfixes)).
- Only the release manager tags. Contributors open PRs.

## Versioning

Semantic versioning, `tripwire-<major>.<minor>.<patch>`:

- **Patch** (`1.0.1`): fixes, copy changes, no new behaviour.
- **Minor** (`1.1.0`): new features, backwards compatible.
- **Major** (`2.0.0`): breaking changes, data migration, or a change users
  must act on.

`0.x` means unstable. `1.0.0` is a promise that the database schema, import
format, and upgrade path stay compatible for the rest of `1.x`.

Use annotated tags: they carry the tagger, date and message, and can be
signed. See [Annotated tags](#annotated-tags).

Do not publish `-rc`/`-beta` tags yet: the versionCode mapping ignores the
suffix, so a pre-release would share a code with the final release.

## Release day

1. `git switch main && git pull --ff-only`
2. Confirm CI is green on `main`:
   `gh run list --workflow CI --branch main --limit 1`
3. Draft the notes:
   `node scripts/draft-release-notes.mjs tripwire-X.Y.Z`
4. Edit `release-notes/X.Y.Z.md`. Group related changes, drop duplicates and
   internal details, order by user impact, and call out anything a 0.9.x user
   must know. The draft is a starting point.
5. Commit the notes through a PR, because `main` is protected:

   ```bash
   git switch -c release/X.Y.Z-notes
   git add release-notes/X.Y.Z.md
   git commit -m "docs: release notes for X.Y.Z"
   gh pr create --title "Release notes for X.Y.Z" \
     --body "## What's new
   - Release notes for X.Y.Z" --label skip-release-notes
   ```

   Use the `skip-release-notes` label: the file is the content, so the PR
   does not need its own bullet. Merge once CI is green.
6. Tag the **merge commit** with an annotated tag and push only that tag:

   ```bash
   git switch main && git pull --ff-only
   git tag -a tripwire-X.Y.Z -m "Tripwire X.Y.Z"
   git push origin tripwire-X.Y.Z
   ```

7. Watch the release workflow. It builds the APK/AAB, refuses to publish
   without the notes file, and creates the GitHub Release.
8. Install the released APK **over the previous version** on a real device.
   Verify the database and settings survived, the in-app What's new shows the
   new notes, and the updater offers the new version.
9. If the release is broken, ship `X.Y.(Z+1)`. Never move or delete a
   published tag.

## Annotated tags

A tag is just a name for a commit. There are two kinds:

- **Lightweight** (`git tag tripwire-1.0.0`): a bare pointer to the commit.
  `git cat-file -t tripwire-0.9.6` reports `commit`.
- **Annotated** (`git tag -a tripwire-1.0.0 -m "Tripwire 1.0.0"`): a real
  object with its own ID containing the tagger name/email, the date, a
  message, and a pointer to the commit. `git cat-file -t` reports `tag`.

Annotated tags are what `git describe` prefers and what most projects mean by
a release tag: the message and date travel with the tag, and it can be signed
(`git tag -s`) so anyone can verify who cut the release. GitHub Releases
attach to either kind, but annotated is the convention.

```bash
git tag -a tripwire-1.0.0 -m "Tripwire 1.0.0"
git show tripwire-1.0.0          # tag metadata, then the commit
git tag -v tripwire-1.0.0        # verify, if signed
```

Existing `tripwire-0.9.x` tags are lightweight. Leave them alone and start
annotating with the next release.

## versionCode

`release.yml` derives it from the tag so every build is deterministic:

```text
major * 1_000_000 + minor * 1_000 + patch
```

`0.9.7` -> `9007`, `1.0.0` -> `1000000`. It must strictly increase for every
published build; Android will not install a lower code over an installed app.
The maximum Android accepts is `2_100_000_000`.

Do not reuse a version number. A re-run of an old tag produces the same code,
which is intentional: it cannot outrank a newer release.

## Hotfixes

If `main` has no unreleased work, fix through a PR and tag the merge commit.

If `main` has moved on and the fix must ship on the old line:

```bash
git switch -c release/1.0 tripwire-1.0.0
# fix through a PR into release/1.0, then merge
git switch release/1.0 && git pull
git tag -a tripwire-1.0.1 -m "Tripwire 1.0.1"
git push origin tripwire-1.0.1
# merge the fix back into main so it does not regress
```

Keep the release branch only while that line is supported.

## Signing

- The Android signing key is permanent. Losing it means installed users
  cannot update; they must uninstall and reinstall. Back it up offline.
- CI reads `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`,
  `ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD` from repository secrets.
  Without them, CI signs with the debug key: installable for testing, not
  distributable.
- Never commit a keystore. `.gitignore` already blocks `*.jks`/`*.keystore`.

## Checklist

Copy this into the release PR or a tracking issue:

- [ ] `main` CI green
- [ ] version chosen per SemVer
- [ ] notes drafted and edited (not just the raw PR bullets)
- [ ] notes committed via PR and merged
- [ ] annotated tag points at the notes merge commit
- [ ] release workflow green
- [ ] APK installs over the previous version; data intact
- [ ] in-app What's new shows the new notes
- [ ] updater offers the new version
- [ ] signing key unchanged and backed up
