# Focus: setup and technical notes

Everything you need to run, configure and back up Focus. For the friendly tour, see the [README](../README.md).

- [Requirements](#requirements)
- [Run it locally](#run-it-locally)
- [Run it all the time (macOS)](#run-it-all-the-time-macos)
- [Run it all the time (Linux, systemd)](#run-it-all-the-time-linux-systemd)
- [Updating](#updating)
- [Configuration](#configuration)
- [Your data file](#your-data-file)
- [Backups](#backups)
- [Project layout](#project-layout)
- [Releasing](#releasing)

## Requirements

Node.js `>=22.12` (needed for the build; the server itself has no dependencies).

## Run it locally

```sh
npm install
npm run build
npm start              # http://127.0.0.1:5180
```

For development with hot reload, use `npm run dev` (same port, same data file).

The board starts empty. No task data ships with this repo, and `data/` is git-ignored.

## Run it all the time (macOS)

A per-user LaunchAgent starts the board at login and restarts it if it crashes.

```sh
npm install && npm run build
npm run service:install        # installs ~/Library/LaunchAgents/local.focus.plist and starts it
```

Then bookmark http://127.0.0.1:5180.

| command | what it does |
|---|---|
| `npm run service:status` | show state and PID |
| `npm run service:logs` | tail `logs/server.log` |
| `npm run service:restart` | restart (do this after `git pull && npm run build`) |
| `npm run service:uninstall` | stop and remove the LaunchAgent (data is untouched) |

Options are read at install time; re-run `service:install` to change them:

```sh
PORT=5180 DATA_FILE=/path/to/tasks.csv NODE=/path/to/node npm run service:install
```

`NODE` defaults to whatever `node` is on your `PATH` when you install. If you use nvm and later remove that Node version, reinstall the service.

## Run it all the time (Linux, systemd)

```ini
# ~/.config/systemd/user/focus.service
[Unit]
Description=Focus board

[Service]
WorkingDirectory=/path/to/focus
ExecStart=/usr/bin/node server.mjs
Environment=PORT=5180
Restart=always

[Install]
WantedBy=default.target
```

```sh
systemctl --user enable --now focus
```

## Updating

When a newer release is on GitHub, an **Update** button appears at the top of the board. Clicking it shows what changed, with a link to the release notes. **Update now** then:

1. fast-forwards this folder to the release (`git merge --ff-only <tag>`),
2. reinstalls dependencies and rebuilds (`npm ci`, `npm run build`),
3. restarts the server and reloads the page.

Your `data/` folder is never touched. The board checks for releases when you open it and every 30 minutes after that.

- It needs this folder to be a git clone of the GitHub repo, and `git` and `npm` to be installed.
- If you have local commits or edits that conflict with the release, it stops and tells you; update by hand with `git pull`, then `npm ci && npm run build && npm run service:restart`.
- Run by the macOS or systemd service, the restart is handled by the service. Started by hand with `npm start`, the server relaunches itself.
- For a private fork, set `GITHUB_TOKEN` in the server's environment so it can read the releases.

## Configuration

| env var | default | notes |
|---|---|---|
| `PORT` | `5180` | |
| `HOST` | `127.0.0.1` | loopback only; set `0.0.0.0` to expose on your network (there is no auth) |
| `GITHUB_TOKEN` | unset | only needed to read releases from a private fork |
| `DATA_FILE` | `data/tasks.csv` | relative paths resolve from the repo root |

## Your data file

All tasks live in `data/tasks.csv`, one row per task, which you can open in Numbers, Excel or a text editor.

| column | meaning |
|---|---|
| `id` | unique id (any string; leave blank on a hand-added row and one is generated) |
| `title` | task title |
| `quadrant` | `Do first`, `Schedule`, `Delegate` or `Let go` |
| `done` | `true` / `false` (`yes`, `1` and `x` also count as done) |
| `due` | `YYYY-MM-DD` or blank |
| `notes` | free text, may span lines |
| `sources`, `links` | JSON list of `{"label","url"}` |
| `x`, `y` | card position on the canvas |
| `created_at`, `updated_at` | ISO timestamps, set by the server |

- The file is re-read on every page load, so hand edits show up after a refresh. Avoid editing while the board is open in a browser, or the next save from the page may overwrite your edit.
- Every save writes atomically and first copies the previous version to `data/tasks.csv.bak`.

## Backups

Copy the file anywhere, or point the board at a synced folder:

```sh
DATA_FILE=~/Library/Mobile\ Documents/com~apple~CloudDocs/focus/tasks.csv npm start
```

## Project layout

- `server.mjs`: zero-dependency Node server that serves the built app and `GET / PUT / DELETE /api/tasks`
- `lib/store.mjs`: CSV read/write, serialized so concurrent saves never clobber each other
- `lib/tasks.ts`: task types, quadrant definitions, card placement
- `src/App.tsx`: the board UI (React 19, Tailwind 4, shadcn/ui dialog)
- `lib/updater.mjs`: checks GitHub for a newer release and installs it
- `src/update.tsx`: the Update button, its dialog, and the "Updated" toast
- `scripts/service.sh`: macOS LaunchAgent install/uninstall
- `scripts/changelog.mjs`: files changelog entries under a version and prints release notes
- `.github/workflows/`: CI and the release pipeline
- `docs/assets/`: logo, diagrams and screenshots used by the README

## Releasing

Releases are cut from `main` by pushing a version tag; GitHub Actions does the rest.

1. As you make changes, add one short bullet per change under **Unreleased** in `CHANGELOG.md`.
2. `npm version patch` (or `minor` / `major`). This bumps `package.json`, files the Unreleased bullets under the new version, commits, and tags `vX.Y.Z`.
3. `npm run release` pushes the commit and the tag.

The **Release** workflow then type-checks, builds and tests, publishes a GitHub release whose notes are that version's bullets, and attaches a prebuilt bundle. Every running board offers the update within half an hour.

The **CI** workflow runs the same checks on every push to `main` and on pull requests.
