---
version: 1
slug: "app-page-tsx"
primary_target: "app/page.tsx"
related_targets: ["app/layout.tsx"]
---

# Perry dashboard

Scope: the dashboard's pages (Overview, Measure, Fix the website, Shop commands, Results, Fix history). Mode: Operate.

Audience and job: Cal Hacks judges seeing Perry for the first time in a three-minute live demo; later, e-commerce teams. The presenter walks the steps in order and triggers live runs (Optimize, Generate, agent run, comparison). The memorable takeaway: Perry measured a real agent, Droid fixed the store two ways, and every result is verified on the real cart.

Constraints: an overview plus one page per step, with a step bar on every page and Next/Back in demo order. Borrow the agent world only through confident naming and the signature move; never Disney's character, likeness or assets. Steered: professional, techy, motion on the front page.

## Direction contract

THESIS: The three ways into the store race like cars on a timing tower: same track, same task, fastest verified purchase wins. Refuses the grey card-grid SaaS dashboard with a hero-metric row.

OWN-WORLD: Light working shell (#f5f6f8 ground, white panels on 1px #e3e6eb seams, ink #0d1117) with Perry teal #0e9f8e as the brand and progress color; a carbon timing tower (#0d1117) as the one dark object; motorsport state code carried only where it means something: purple #8b5cf6 best, green #22c55e improved, amber #f59e0b baseline, red #ef4444 failed. Geist for UI and display, Geist Mono for every figure and measurement.

STORY: Overview says what Perry does and shows the tower; Measure sets the baseline; Feature 1 fixes the website for browsing agents; Feature 2 gives tool-using agents the catalog directly via MCP; Results races all three, verified.

FIRST VIEWPORT: White top bar with the perry wordmark and a five-step bar (each step shows its progress as a fill line). Left: one heading at about 56px and two lines of explanation, a single dark primary button "Start the measurement". Right, 660px: the timing tower with three rows (position, way in, one lap segment per agent step, cost in mono), segments filling in sequence on load, the best row in purple.

FORM: Formula 1 live timing tower, ordered 7 of 7 on my list. seed:9eb60f26d272e791. Signature move: the timing tower, whose lap segments fill one per agent step and whose rows rerank in place; one motion grammar of 600ms cubic-bezier(.2,.8,.2,1), reduced motion shows the final state. Raises: values change in place in a fixed grid (split-flap); one motion grammar (zoo map); the step bar shows each step's extent (software manual); every way in has the same fields in the same places (mascot catalog).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
