# Perry demo runbook

The demo runs on Michelle's laptop from tag `demo-v7` or later (`demo-v6` is the last version without the agent interface). Everything below is run from `~/Perry`.

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

1. `npm run reset:demo` puts the Droid part back to "nothing optimized yet". It keeps the backup fix and stops the store on :3002; :3002 stays off until a fix is made live during the pitch.
2. `npm run interface:export` refreshes the guide shown in "What the agent sees".
3. In `data/results/`: **delete `compare3-sample.json`** if it exists, and check the newest `compare3-*.json` is a real run (`"provenance": "live"`, 5 runs per condition). The dashboard must not say "Sample data, not a real run".
4. Quit Claude Desktop completely (Cmd+Q) and reopen it, so `perry-shop` starts with a fresh cart. In a new chat, **+** → **Connectors** should list perry-shop.
5. Open http://localhost:3000 and refresh. Every run should say **No fix yet for this run**, and **Same agent, three ways in** should show real numbers.
6. Open these, in order:
   - http://localhost:3001/search?q=black+running+shoe (original store)
   - http://localhost:3000 (dashboard)
   - Claude Desktop, new chat with perry-shop on
   - a terminal in `~/Perry` for `verify-cart`
7. Check Wi-Fi: Droid (Factory), the shopping agent (Anthropic) and Claude Desktop all need the internet.
8. Pick the run you will optimize (e.g. **Run 1 · 7 steps**) so it is selected when you start.

## The three-minute demo

**0:00 · The problem** (original store tab). "AI agents are starting to shop for people. They only see a store's website, one page at a time. Here's the search page: name and price only. Our agent's task: a black running shoe, size 8, in stock, under $120."

**0:20 · What the agent did** (dashboard). **Shopping agent runs**: real runs, 100% verified, about 7 steps each. In **Agent steps** the amber rows are wasted visits. **Diagnosis**: "it opened 4 product pages to buy 1, because the search results don't show color or stock."

**0:45 · Fix the website.** Click **Optimize with Factory Droid**. While it runs (45 seconds to 2 minutes):
- Droid works on a disposable copy of the store, and may only change the search card and search code. Everything else is blocked, including shell commands.
- Perry checks the change: only allowed files, it builds, and every price and stock level still matches the catalog.

If it finishes, show the **before/after Tempo Lite card** ("Size 8: Sold out" now visible in search) and click **Make this fix live on localhost:3002**. If it's still running at 1:25, move on and come back to it at the close; if it fails, use the **Demo backup** from **Fix history** and say it's one Droid made earlier.

**1:25 · A second way in** (scroll to **Same agent, three ways in**). "Agents that use tools don't need pages at all. The store has the data, so Perry gives them `shop` commands built from the store's own catalog and real cart." Show **What the agent sees** (the guide), then the transcript: one `shop search` that returns exactly one match plus labeled near misses, one `shop cart add`, and **✅ Verified**. "Every command is checked by contract tests against the catalog: thousands of filter combinations, nothing wrong returned, nothing missed."

**1:55 · Same agent, three ways in.** Read the three costs per verified purchase from the table and chart (original website, Droid-fixed website, agent interface), all with the same model, task and cart check. Then the framing line: "Many agents can only browse, so the website has to work for them. Agents that use tools can use the interface. Perry measures every path with the same agent and the same verified cart." Say it's a recorded run of 15 agent runs.

**2:20 · A real outside agent** (Claude Desktop). Ask: *"Buy me a black running shoe under $120 in size 8 that's in stock."* Approve its `search` and `cart_add` calls. Ask it to show the cart, copy the `cart id`, and in the terminal run:

```bash
npm run verify-cart -w @agentfix/agent-interface -- <cart id>
```

It prints **VERIFIED**: the real store's cart holds exactly the right shoe. If it fails, play the backup video and say it's a recording.

**2:45 · Close.** "Perry measures how AI agents complete tasks on your store, then makes your store work for both kinds of agents: Droid fixes the website for agents that browse, and Perry gives agents that use tools a verified command interface. Same agent, same verified cart, so every number is real."

If there's time or a judge asks: **Fix history → Demo backup** shows the measured website fix (7 → 4 steps, −37% cost), and **Cloud audits on Apify** at the bottom shows the same audit running as an Apify Actor.

## If something goes wrong

| Problem | What to do |
|---|---|
| Optimize is still running at ~1:25 | Move on to the agent interface and come back at the close. If it's still running then, use the backup: **Fix history** → **Demo backup** → **Make this fix live on localhost:3002**, and say it's labeled **Replay of an earlier run**. |
| The checklist ends with **⛔ Droid's fix didn't pass the checks** | That's the safety gates working; say so and read the **Why** line. If there's time, click **Try again with Droid** (Droid is told why the last attempt failed). Otherwise click **Choose an earlier fix** and make the **Demo backup** live. |
| **Same agent, three ways in** is missing | No `compare3-*.json` or guide in `data/results/`. Run `npm run interface:export` for the guide; without a three-way result, skip 1:55 and run the old demo (website fix only). |
| It says **Sample data, not a real run** | Delete `data/results/compare3-sample.json` and refresh. Never present it. |
| perry-shop isn't in Claude Desktop | Quit Claude Desktop completely and reopen it. Its log is `~/Library/Logs/Claude/mcp-server-perry-shop.log`. Otherwise play the backup video, said to be a recording. |
| `verify-cart` says **NOT VERIFIED** | Read the reason. "Already in the cart" or quantity 2 means an earlier test used the same cart: restart Claude Desktop for a fresh cart. A wrong SKU means the agent picked wrong: say so, the verifier caught it. |
| No Wi-Fi | Use the **Demo backup** in Fix history, the recorded three-way result and the backup video; all are labeled or said to be recorded. The Apify section shows "unavailable"; skip it. |
| :3002 says "This site can't be reached" | No fix is live yet (normal after a reset). Click **Make this fix live** on the fix you want, wait about 5 seconds, then reload. |
| :3002 shows the wrong fix | Click **Make this fix live** on the fix you want, wait about 5 seconds, then reload. |
| A button says **Busy** | Another Optimize, Measure or switch is still running; wait for it. |
| The agent fails with a Playwright browser error | Run `npx playwright install chromium`. |
| The fixed store won't start | Read `data/results/.serve-patched.log`. |
| Something is broken and there's no time | `git checkout demo-v7` (or `demo-v6`, the last version without the agent interface), `npm install`, `npm run build:demo`, restart the servers. |

Never present a recorded result (backup fix, saved measurement, three-way comparison, Apify run, backup video) as happening live. The dashboard labels them; say the same out loud.

## Prepared answers

- **"Why fix the website if commands are cheaper?"** Many agents (ChatGPT's agent, Claude in Chrome) can only browse, so the website has to work for them. The interface is an extra way in for agents that use tools.
- **"Why can't agents do this themselves?"** They only see the website; the store has the data. Perry builds the bridge from the store's own data, checks it and measures it.
- **"Doesn't Shopify do this?"** For Shopify stores, partly. Perry builds, checks and measures the interface and the website fix together, with the same agent and a verified cart.
- **"Is the comparison fair?"** Same model, prompt style, task and cart verifier in all three. The Droid fix changes the website's HTML; the agent interface changes the way in and leaves the website alone.
- **"Could the agent cheat?"** Success is read from the store's real cart by the verifier, never from the agent's claim. The sandbox has no network or files, and `shop` refuses unknown, sold-out and duplicate items.

## After the demo

`npm run reset:demo` clears the fixes made during the demo. They stay viewable in **Fix history** (archived).
