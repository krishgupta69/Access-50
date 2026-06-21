# Access 50

**Building 50 open-source Chrome extensions for the people accessibility tools usually forget.**

Most accessibility extensions chase the same crowded ground — dark mode, dyslexia fonts, read-aloud. Access 50 goes after the gaps: photosensitive epilepsy, low vision reflow, ADHD focus, colorblind correction, motor impairment, aphasia, and more — backed by real complaints from communities like r/Blind, r/ColorBlind, r/dyslexia, r/ADHD, and r/Epilepsy, plus peer-reviewed research, not guesses.

Every extension in this collection is:

- 🆓 Free and open-source (MIT licensed)
- 🎯 Built for one specific, evidence-backed unmet need
- ⚡ Shipped solo, in public, with the build documented
- 🧩 Self-contained — install just the ones you need

## Why this exists

Accessibility tooling is dominated by paywalled suites and abandoned side projects. Access 50 is an experiment: how many genuinely useful, narrowly-scoped accessibility tools can one person ship in public — and what does that teach about building for people other than yourself?

## Progress

**0 / 50 shipped** — see [PROGRESS.md](./PROGRESS.md) for the live, extension-by-extension tracker.

| # | Extension | Helps | Status |
|---|-----------|-------|--------|
| 1 | BigCursor | Low vision, motor | 🔲 Not started |
| 2 | FocusRing | Keyboard-only, low vision | 🔲 Not started |
| 3 | FatScrollbar | Motor, low vision | 🔲 Not started |
| ... | ... | ... | ... |

*(Full 50-item table lives in PROGRESS.md — this is a preview.)*

## How each extension is chosen

Every idea in this collection is filtered through three checks before it earns a slot:

1. **Real complaint evidence** — a documented, recurring pain point from the community it serves
2. **A real gap** — no good free/maintained solution exists today
3. **Realistic adoption** — a credible path to 500–1,000+ real users

Full research notes and rationale for every idea: [docs/opportunity-list.md](./docs/opportunity-list.md)

## Install any extension

Each extension is independent — you don't need to install all 50.

1. Clone this repo: `git clone https://github.com/krishgupta69/Access-50.git`
2. Go to `chrome://extensions` in Chrome
3. Enable **Developer Mode** (top right)
4. Click **Load unpacked** and select the specific extension's folder (e.g. `extensions/01-bigcursor`)

## Follow the build

I'm documenting every ship — the problem, the build, the demo — on Instagram and LinkedIn as part of this project. Follow along for the full series.

## Contributing

Found a bug, have an accessibility need that's missing from the list, or want to suggest the next build? Open an issue. See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

MIT — use any of these freely, fork them, ship your own version. See [LICENSE](./LICENSE).
