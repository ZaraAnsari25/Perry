# Perry demo runbook

The demo runs on Michelle's laptop from tag `demo-v3` or later. Everything below is run from `~/Perry`.

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

## Ten minutes before the pitch

1. `npm run reset:demo` puts the demo back to "nothing optimized yet". It keeps the backup fix and stops the store on :3002; :3002 stays off until a fix is made live during the pitch.
2. Open http://localhost:3000 and refresh. Every run should say **No fix yet for this run**.
3. Open these tabs, in order:
   - http://localhost:3001/search?q=black+running+shoe (original store)
   - http://localhost:3000 (dashboard)
4. Check Wi-Fi: Droid (Factory) and the shopping agent (Anthropic) both need the internet.
5. Pick the run you will optimize (e.g. **Run 1 · 7 steps**) so it is selected when you start.

## The three-minute demo

**0:00 · The problem** (original store tab). "AI agents are starting to shop for people. Here's a store's search page: name and price only. Our agent's task: a black running shoe, size 8, in stock, under $120."

**0:20 · What the agent did** (dashboard). Point at **Shopping agent runs**: real runs, 100% verified, about 7 steps each. In **Agent steps**, the amber rows are wasted visits. **Diagnosis**: "it opened 4 product pages to buy 1, because the search results don't show color or stock."

**0:50 · Fix it live.** Click **Optimize with Factory Droid**. While the checklist runs (usually 45 seconds to 2 minutes), explain:

- Droid works on a disposable copy of the store, never the real one.
- It may only change the search card and search code. A permission check blocks everything else, including shell commands.
- Perry then checks the change: only allowed files, it builds, and every price and stock level on the page still matches the catalog.

**~1:50 · The result.** Show the verdict, the **before/after Tempo Lite card** ("Size 8: Sold out" is now visible in search), and the three checks. Click **Make this fix live on localhost:3002**, wait for the green **Live** badge (about 5 seconds), then open http://localhost:3002/search?q=black+running+shoe in a new tab.

**2:15 · Does it work?** Click **Fix history** (top right of the dashboard) and open the fix labeled **Demo backup**: the one Droid made earlier and Perry measured. In **Does this fix help the shopping agent?**: 5 runs per store with the same agent, still 100% verified, **7 → 4 steps** and **−37% cost per verified purchase**. Mention that **Measure this fix** runs this comparison live in about 2 minutes.

**2:40 · Anyone can rerun it.** Click **← Back to the dashboard**, scroll to the bottom to **Cloud audits on Apify**, and click the run ID: the same audit runs as an Apify Actor in the cloud.

**2:50 · Close.** "Perry turns agent traces into safe, verified website fixes, measured by cost per successful task."

## If something goes wrong

| Problem | What to do |
|---|---|
| Optimize is still running at ~1:50 | Keep talking, then use the backup fix: under **Fix for this run**, open **Show the saved backup fix** and click **Make this fix live on localhost:3002**. Say it's one Droid made earlier; it is labeled **Replay of an earlier run**. |
| Optimize says **Fix not accepted** | That's the safety gates working. Show the red reason, then make the backup fix live the same way. |
| No Wi-Fi | Use the backup fix and its saved measurement; both are labeled as recorded. The Apify section shows "unavailable"; skip it. |
| :3002 says "This site can't be reached" | No fix is live yet (normal after a reset). Click **Make this fix live** on the fix you want, wait about 5 seconds, then reload. |
| :3002 shows the wrong fix | Click **Make this fix live** on the fix you want, wait about 5 seconds, then reload. |
| A button says **Busy** | Another Optimize, Measure or switch is still running; wait for it. |
| The agent fails with a Playwright browser error | Run `npx playwright install chromium`. |
| The fixed store won't start | Read `data/results/.serve-patched.log`. |

Never present a recorded result (backup fix, saved measurement, Apify run) as happening live. The dashboard labels them; say the same out loud.

## After the demo

`npm run reset:demo` clears the fixes made during the demo. They stay viewable in **Fix history** (archived).
