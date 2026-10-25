# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Now:** Cal Hacks 13.0 judges seeing Perry for the first time, during a three-minute live demo run from Michelle's laptop (dashboard on localhost:3000). They know nothing about the project and must understand it from the page plus the presenter.
- **The product's real users, later:** e-commerce teams (store owners and their developers) who want to know how AI shopping agents perform on their store, and to make it work better for them.

## Product Purpose

AI agents are starting to shop for people, but stores are built for human eyes. Perry sends a real AI agent to a store with a shopping task, records every step, finds where it wastes time and money, and then improves the store in two ways using Factory Droid:

1. **Feature 1, for agents that browse:** Droid fixes the store's website (the search-results card and search code) so browsing agents find answers sooner.
2. **Feature 2, for agents that use tools:** Droid writes `shop` commands that answer straight from the store's catalog and real cart, served to any agent through MCP (`perry-shop`). This is the "even better way": every store already has a catalog; the website is that catalog drawn as pages.

Success is measured as **cost per verified successful task**: the same agent, task and model before and after, and a purchase counts only if the store's real cart holds exactly the right item.

## Positioning

Verified, measured fixes. Perry measures a real agent on the store, has Droid fix it two ways, gates every change (allowed files only, builds, matches the catalog, independent code, a real purchase verifies), and proves each result with the same agent and a check of the store's real cart. Every number on the page is real and labeled with where it came from.

## Operating Context

- The dashboard flow: intro → Step 1 Measure (baseline averages over recorded runs, one run step by step, Perry's diagnosis) → Feature 1 (Optimize with Droid, fix card, make live on localhost:3002) → Feature 2 (why it works, MCP, Droid generates the commands live, then the agent shops with them) → Results (same agent, same task, three ways in) → Apify cloud audits.
- `npm run reset:demo` starts a demo session; Feature 2 and Results stay empty until run in that session, with the last recorded results available as labeled backups.
- Live actions take real time: Droid generation 2–3 minutes, the three-way comparison about 2 minutes, one agent run about 10 seconds. The runbook is `DEMO.md`.
- Outside agents (Claude Desktop) connect through the `perry-shop` MCP server; `verify-cart` checks their cart.

## Capabilities and Constraints

- Monorepo: Next.js 16 / React 19 / Tailwind 4 dashboard (`apps/dashboard`), demo shoe store (`apps/storefront`, Zara's area; never edited from here), packages for the agent runner, benchmark, verifier, diagnosis, optimizer (Droid), agent interface and shared types.
- Droid may change only allowlisted files, always in a disposable git worktree; prices, stock, tasks, expected outcomes and the verifier are off-limits.
- Every fact shown comes from the catalog or the real cart; nothing invented.
- Provenance is mandatory: live, recorded, replay and fixture results are labeled; fixtures or recordings are never shown as live.
- Agents can fill a cart; placing an order stays with a person.
- The shopping agent is `claude-haiku-5-5`; the demo store runs on localhost:3001.

## Brand Commitments

- Name: **Perry** (formerly AgentFix; the package scope is still `@agentfix/*`).
- Terminology: "Step 1 · Measure", "Feature 1 · For agents that browse websites", "Feature 2 · An even better way, for agents that use tools", "Results", "shop commands", "verified purchase", "cost per verified purchase".
- Factory Droid is credited by name for what it does.

## Evidence on Hand

- Recorded runs and results in `data/results/` (gitignored): baseline benchmarks, three-way comparisons (`compare3-*.json`), Droid fix results (`patch-*.json`, Demo backup in `backup/`), interface generation runs (`interface-gen-*.json`), outside-agent checks (`outside-agent-*.json`), the agent guide.
- Real measured outcome (recorded, labeled): shop commands about 87–88% cheaper per verified purchase than the original website, 2 commands vs about 7 browser steps, every condition 5/5 verified.
- A real Claude Desktop purchase through perry-shop, verified against the real cart.
- No customers, testimonials, pricing or deployment exist; never fabricate them.

## Product Principles

1. **Proof over claims.** Show measured, verified results with their source; never a number that wasn't recorded.
2. **Explain before showing.** Assume the viewer knows nothing: say what each part is for before its data.
3. **Earn each section by running it.** Results appear when the viewer runs them in the demo session; recordings are labeled backups.
4. **Two audiences of agents.** Keep the difference between Feature 1 (browsing agents) and Feature 2 (tool-using agents) unmistakable.
5. **Safety is visible.** Every Droid change shows the checks it passed before it was allowed to touch anything.

## Accessibility & Inclusion

WCAG 2.2 AA: readable contrast in light and dark mode, full keyboard use, and screen-reader labels for status icons, live progress and charts.
