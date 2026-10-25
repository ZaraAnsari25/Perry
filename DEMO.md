# Perry demo runbook

The demo runs on Michelle's laptop from tag `demo-v9` or later (`demo-v8` is the last version without the Droid-generated interface, `demo-v6` the last without the agent interface). Everything below is run from `~/Perry`.

| Address | What it is |
|---|---|
| http://localhost:3000 | Perry dashboard |
| http://localhost:3001 | Original store |
| http://localhost:3002 | Store with a Droid fix (whichever fix was last made live) |

## One-time setup (already done on Michelle's laptop)

- `.env` in the repo root has `ANTHROPIC_API_KEY`, `FACTORY_API_KEY` and `APIFY_TOKEN`, each on its own line with no `#` in front.
- The Droid CLI is installed in `~/.local/bin` (the dashboard finds it there).
- `npx playwright install chromium` has been run (the shopping agent's browser).
- `npm install` has been run after the last pull.
- Claude Desktop has the `perry-shop` MCP server in its config (see [packages/agent-interface/README.md](packages/agent-interface/README.md#add-it-to-claude-desktop-macos)).

## Start everything (after a restart, or if a server stopped)

Each server runs in its own terminal window and keeps running until you press Ctrl+C.

```bash
npm run build:demo        # once after pulling new code; about a minute
npm run start:store       # terminal 1: original store on :3001
npm run start:dashboard   # terminal 2: dashboard on :3000
npm run serve:patched     # terminal 3: newest accepted fix on :3002
```

If a port is busy ("address already in use"), something old is still running on it:

```bash
lsof -ti tcp:3000 -sTCP:LISTEN | xargs kill   # change 3000 to the busy port
```

## Earlier the same day

1. **Three-way result.** Zara runs `npm run bench:three` (15 agent runs, several minutes) and sends the `compare3-*.json` file; save it in `data/results/`. It's always shown as a recorded result, labeled as such.
2. **Backup video** of the Claude Desktop purchase (below), in case the live one fails. If used, say it's a recording.
3. **Test purchase in Claude Desktop** (steps 3–5 of the demo's 2:20 part), then restart the store (Ctrl+C and `npm run start:store` in terminal 1) to clear its carts; they're kept in memory.

## Ten minutes before the pitch

1. `npm run reset:demo` puts the demo back to "nothing run yet" and starts a new demo session: Feature 1 shows **No fix yet**, Feature 2 and Results are empty until you click their buttons (the last recorded ones stay available under **Show the last recorded …**, labeled as backups). It keeps the backup fix and stops the store on :3002; :3002 stays off until a fix is made live during the pitch.
2. `npm run interface:export` refreshes the guide shown in **What the agent is told first** (collapsed at the end of Feature 2).
3. In `data/results/`: **delete `compare3-sample.json`** if it exists. The dashboard must never say "Sample data, not a real run".
4. Quit Claude Desktop completely (Cmd+Q) and reopen it, so `perry-shop` starts with a fresh cart. In a new chat, **+** → **Connectors** should list perry-shop.
5. Open http://localhost:3000 and refresh. Every run should say **No fix yet for this run**; Feature 2 should say **Not generated yet in this demo session**; Results should show its checklist with **Run the comparison** greyed out.
6. Open these, in order:
   - http://localhost:3001/search?q=black+running+shoe (original store)
   - http://localhost:3000 (dashboard)
   - Claude Desktop, new chat with perry-shop on
   - a terminal in `~/Perry` for `verify-cart`
7. Check Wi-Fi: Droid (Factory), the shopping agent (Anthropic) and Claude Desktop all need the internet.
8. Pick the run you'll show (e.g. **Run 1 · 7 steps**) so it is selected when you start, and in **Fix history** check that one fix is labeled **Demo backup**.

## The three-minute demo

**0:00 · The problem** (original store tab). "AI agents are starting to shop for people. They only see a store's website, one page at a time. Here's the search page: name and price only. Our agent's task: a black running shoe, size 8, in stock, under $120."

**0:20 · Step 1: Measure, and start Droid** (dashboard). First scroll to Feature 2 and click **Generate the commands with Droid**: it takes 2 to 3 minutes, so it runs while you talk. Say: "I've just asked Droid to build something; we'll come back to it." Back at the top, read the one-line intro and point at the four boxes. In **Step 1**, read the **Baseline** tiles: 5/5 verified, about 7 steps, the cost per purchase. "This is what we try to beat." In **Look inside one run**, the amber rows are wasted visits. **What Perry found in this run**: "it opened 4 product pages to buy 1, because the search results don't show color or stock."

**0:45 · Fix the website** (a recorded fix; Optimize takes up to 2 minutes, too long for this slot). Click **Fix history** (top right) and open the fix labeled **Demo backup**. Say: "This is a fix Factory Droid made earlier from one of these runs; it's labeled as a replay." Explain while you show it:
- Droid works on a disposable copy of the store, and may only change the search card and search code. Everything else is blocked, including shell commands.
- Perry checked the change: only allowed files, it builds, and every price and stock level still matches the catalog (the three ✓ checks on the card).

Show the **before/after Tempo Lite card** ("Size 8: Sold out" now visible in search), click **Make this fix live on localhost:3002**, wait for the green **Live** badge (about 5 seconds), and open http://localhost:3002/search?q=black+running+shoe in a new tab. Then **← Back to the dashboard**.

**1:25 · Feature 2: an even better way** (scroll to **Skip the web pages: give agents the store's catalog directly**). "Fixing the website helped, but the agent still reads pages built for people. Every store already has all the answers in its catalog; the website is just that catalog drawn as pages. So for agents that use tools, we skip the pages." Point at **Why this works**: browsing reads whole pages every step (about 35,000 tokens); one search on the catalog returns a few lines (about 3,700). Exact, small, fewer steps. In **Try it: Droid builds the commands**, walk the three columns: Droid reads the catalog, the cart API and our written standard (not our version); it writes one file in a throwaway copy; Perry checks it five ways, including a real purchase, before any agent uses it. "Nobody wrote these by hand, and the same works for any store." By now Droid should be done: show its progress list (each ✓ check, then "Agents switch to the new commands"). If it's still going, keep talking about the checks; if it was turned away, read the reason ("that's the gates working") and open **Show the last recorded Droid run**. Then click **Run the shopping agent with these commands** (about 10 seconds) and walk through the run: one search (the filter chips, one match, three products ruled out with reasons), one add to cart, and Perry's check of the real cart. Right after it, scroll to Results and click **Run the comparison** (about 2 minutes); it runs during the Claude Desktop part.

**1:55 · Any agent, through MCP** (Claude Desktop, then back to **Works with any AI agent, through MCP**). "Any MCP client gets these as tools." Ask Claude Desktop: *"Buy me a black running shoe under $120 in size 8 that's in stock."* Approve its `search` and `cart_add` calls. It stops before ordering: "placing the order stays with a person." Ask it to show the cart, copy the `cart id`, and in the terminal run:

```bash
npm run verify-cart -w @agentfix/agent-interface -- <cart id> --save --client "Claude Desktop"
```

It prints **VERIFIED**: the real store's cart holds exactly the right shoe. Refresh the dashboard: **Tried by an outside agent** shows this purchase, recorded just now, using Droid's commands. If it fails, play the backup video and say it's a recording.

**2:25 · Results** (scroll to **Same agent, same task, three ways in**; refresh if it still says Comparing). Read the three headline numbers (how much cheaper per purchase, steps, time), then the rows: original website, fixed website (Feature 1), shop commands (Feature 2), all 5/5 verified with the same model, task and cart check. Point at the Step 1 reference line: the baseline matches. Say it's a recorded run of 15 agent runs.

**2:45 · Close.** "Perry measures how AI agents complete tasks on your store, then makes your store work for both kinds of agents: Droid fixes the website for agents that browse, and Perry gives agents that use tools a verified command interface. Same agent, same verified cart, so every number is real."

If there's time or a judge asks:
- **Run Droid live:** on the dashboard, click **Optimize with Factory Droid** on the selected run and talk through the checklist while it runs (45 seconds to 2 minutes). Its fix card has no **Replay** label, because it was made just now.
- The Demo backup's **Does this fix help the shopping agent?** section shows its measurement (7 → 4 steps, −37% cost).
- **Cloud audits on Apify** at the bottom shows the same audit running as an Apify Actor.

## If something goes wrong

| Problem | What to do |
|---|---|
| A live Optimize (extra time) is still running | Keep talking about the gates, or move on; the Demo backup is already live. |
| The checklist ends with **⛔ Droid's fix didn't pass the checks** | That's the safety gates working; say so and read the **Why** line. If there's time, click **Try again with Droid** (Droid is told why the last attempt failed). Otherwise click **Choose an earlier fix** and make the **Demo backup** live. |
| **Results** or **Feature 2** is missing | No `compare3-*.json` or guide in `data/results/`. Run `npm run interface:export` for the guide; without a three-way result, skip 2:25 and run the old demo (website fix only). |
| The Droid card says **⛔ Turned away**, **⛔ Generation failed** or **Scripted test, not Droid** | A newer generation run (or a `--simulate` test) is the newest file. Move that `interface-gen-*.json` (and its `.core.ts`) out of `data/results/` so the accepted run from `2026-10-25T09-58-51` is newest, and refresh. |
| It says **Sample data, not a real run** | Delete `data/results/compare3-sample.json` and refresh. Never present it. |
| perry-shop isn't in Claude Desktop | Quit Claude Desktop completely and reopen it. Its log is `~/Library/Logs/Claude/mcp-server-perry-shop.log`. Otherwise play the backup video, said to be a recording. |
| `verify-cart` says **NOT VERIFIED** | Read the reason. "Already in the cart" or quantity 2 means an earlier test used the same cart: restart Claude Desktop for a fresh cart. A wrong SKU means the agent picked wrong: say so, the verifier caught it. |
| No Wi-Fi | Use the **Demo backup** in Fix history, the recorded three-way result and the backup video; all are labeled or said to be recorded. The Apify section shows "unavailable"; skip it. |
| :3002 says "This site can't be reached" | No fix is live yet (normal after a reset). Click **Make this fix live** on the fix you want, wait about 5 seconds, then reload. |
| :3002 shows the wrong fix | Click **Make this fix live** on the fix you want, wait about 5 seconds, then reload. |
| Droid or the comparison isn't done when you get there | Keep talking about the checks, or open **Show the last recorded …** (a backup from before this session) and say it's a recording. Results appear on refresh when the run finishes. |
| **Run the comparison** is greyed out | Its checklist says what's missing: make a Feature 1 fix live, or generate the Feature 2 commands. |
| A button says **Busy** | Another Optimize, Measure or switch is still running; wait for it. |
| The agent fails with a Playwright browser error | Run `npx playwright install chromium`. |
| The fixed store won't start | Read `data/results/.serve-patched.log`. |
| Something is broken and there's no time | `git checkout demo-v8` (or `demo-v6`, the last version without the agent interface), `npm install`, `npm run build:demo`, restart the servers. |

Never present a recorded result (backup fix, saved measurement, three-way comparison, Apify run, backup video) as happening live. The dashboard labels them; say the same out loud.

## Prepared answers

- **"Did Droid write the interface?"** Yes. Droid wrote the `shop` commands agents use (`packages/agent-interface/generated/core.ts`) from the store's catalog, its cart API and Perry's written standard (`packages/agent-interface/CONTRACT.md`). Our hand-written reference version was removed from its copy. Perry accepted it only after all five checks, including a real cart purchase. The recorded comparison and Claude Desktop use Droid's version; the footnote says so.

- **"Why fix the website if commands are cheaper?"** Many agents (ChatGPT's agent, Claude in Chrome) can only browse, so the website has to work for them. The interface is an extra way in for agents that use tools.
- **"Why can't agents do this themselves?"** They only see the website; the store has the data. Perry builds the bridge from the store's own data, checks it and measures it.
- **"Doesn't Shopify do this?"** For Shopify stores, partly. Perry builds, checks and measures the interface and the website fix together, with the same agent and a verified cart.
- **"Is the comparison fair?"** Same model, prompt style, task and cart verifier in all three. The Droid fix changes the website's HTML; the agent interface changes the way in and leaves the website alone.
- **"Could the agent cheat?"** Success is read from the store's real cart by the verifier, never from the agent's claim. The sandbox has no network or files, and `shop` refuses unknown, sold-out and duplicate items.

## Which shop commands run

Agents use Droid's generated commands (`packages/agent-interface/generated/core.ts`) by default: the sandbox, the three-way benchmark and perry-shop in Claude Desktop. perry-shop's log (`~/Library/Logs/Claude/mcp-server-perry-shop.log`) says `generated shop commands` when it starts, and the comparison footnote says "generated by Droid".

To regenerate: `npm run generate:interface -- --store-url http://localhost:3001`, then `npm run use:generated` to copy the newest accepted file in (review and commit it yourself), then rerun `npm run bench:three`.

**Fallback:** if Droid's commands ever misbehave, set `PERRY_SHOP_IMPL=handwritten` (for the benchmark, and in perry-shop's `env` in Claude Desktop's config, then restart it) to use the hand-written reference version, `core.ts`. Say out loud which one you're running.

## After the demo

`npm run reset:demo` clears the fixes made during the demo. They stay viewable in **Fix history** (archived).
