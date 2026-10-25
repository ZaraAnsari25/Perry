# Dashboard redesign: handoff

Work in progress on `feat/optimizer-dashboard`, made with the impeccable design skill (`npx impeccable install`, then `/impeccable` in Claude Code). Direction: "Live Timing" (an F1 timing tower). The contract is in `.impeccable/surfaces/app-page-tsx.md`; the product brief is `PRODUCT.md`.

## Done

- One page per step: Overview `/`, Measure `/measure`, Fix the website `/website`, Shop commands `/commands`, Results `/results`, with a step bar (`app/step-nav.tsx`) and Back/Next (`Pager` in `app/ui.tsx`).
- Theme tokens, fonts (Geist, Geist Mono), focus/selection styling in `app/globals.css`; drawn icons in `app/icons.tsx`.
- The timing tower (`app/timing-tower.tsx`): rows mount in demo order, then rerank by cost; fixed columns for steps, tokens, time and cost; pending rows (`a: null`); wasted laps (`wasted`); clickable rows (`href`).
- Generate / Run the agent / Run the comparison buttons unchanged in behavior. `DEMO.md` follows the pages.

## Left to do (from the finish review)

1. **Measure:** replace the five-number row (`AverageRow` in `app/run-view.tsx`) with a `TimingTower ranked={false}`, one row per run (`href` to `/measure?run=N`, `wasted` from each run's diagnosis), the average in the footer.
2. **Results:** when there's no comparison in this demo session, show a tower of three pending rows (`a: null`). Keep the last recorded comparison folded as a labeled backup (the user wants Results empty until it's run).
3. **Palette:** Feature 1 is violet and Feature 2 blue (`audienceTone` in `app/ui.tsx`, `app/website/page.tsx`, `app/agent-interface-panel.tsx`, `app/apify-panel.tsx`). On the tower purple means "cheapest", so use Perry teal and ink instead. Move the older panels (`agent-interface-panel`, `apify-panel`, `patch-panel`, buttons) from `zinc-*` classes to the tokens (`bg-panel`, `border-seam`, `text-muted`, `bg-ground`, `bg-perry-wash`, `text-perry-deep`).
4. **Shop commands page:** remove cards nested inside cards (the "Why this works" card, the "Try it" cards, the bordered action box in `LiveAction`); it's very long.
5. **Contrast:** set `--color-faint` in `globals.css` to `#646d7a` (4.8:1 on the ground).
6. **Labels:** pass `source` (file and time) to every tower so numbers from different recordings aren't confused.
7. **Finish:** rebuild, capture screenshots, rerun the impeccable finish review, write `DESIGN.md` (impeccable documenter), then merge and tag.
