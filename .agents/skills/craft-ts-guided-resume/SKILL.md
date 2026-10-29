---
name: craft-ts-guided-resume
description: Resume a recorded CraftTS debug session through a valid point, a replayable recipe, or a guided run that writes a recipe. Begin with resume.doctor, interview the person about the objective, then drive Craft state or named page controls, hand secrets back, and save expectations and cleanup. Use when the person clicked « Reprendre ici » in the dashboard or asks to resume, reproduce from, or reopen a recorded session event.
---

# Guided resume

Bring the live app to where a recording was, for a purpose the person has. A
resume that reproduces state without knowing why spends effort on details that
do not matter and misses the ones that do (stale server data, the wrong
account). So: understand the goal, make the setup work, then drive.

The person speaks French in this project: talk to them in French.

Assume the person is checking a business behavior, not debugging Craft or
writing a test. Lead with the visible action and outcome in the person's
domain language. Keep routes, component names, registry addresses, endpoint or
server-function ids, mock case ids, MCP names, and recipe syntax inside the
agent's implementation work. For example, say « la liste affiche le Donut,
puis le Donut disparaît après sa suppression », never ask whether
`admin.overview` is the right case. Translate tool failures into the effect on
the user's scenario and the next useful step.

## 0. Tools

Two MCP servers of this repo (`.mcp.json`): the logs one (`resume.*`,
`session.*`) and the registry one (`resume.doctor`, `app.*`, `checkpoint.*`,
`page`). Hosts that defer MCP tools list them by name only: load them before
concluding they are missing. If neither server is there at all, say so in one
sentence and ask the person to approve the project MCP servers and open a new
session; do not edit global configuration.

## 1. Check setup, then read the point (no app action)

The prompt copied from the dashboard includes a `requestId` and opens a fresh
application tab marked with that id; the replay dashboard stays open. Call
`resume.doctor({ requestId })` first so it selects that tab even when other
tabs are open. Then call `resume.request({ requestId })` and pass the same id
to `session.*`, `resume.say`, and `app.*`. Never resolve this request through a
mutable “latest” lookup or use the dashboard thread to collect the goal
interview. Repair checks you can fix yourself; for
anything that requires the person, ask for one precise action. Do not launch
or mutate the app until the goal interview below is complete.

Read `session.story` up to the point **and a few steps after it**: what the
person did next is usually what they want to look at. Read
`session.prerequisites` (identity, `signedInWhen`, entities, writes, probes),
then inspect `checkpoint.list` and `recipe.list` for the exact session and
event returned by `resume.request`. Choose the best available path, but do not
restore a point, execute a recipe, or mutate the app until the goal interview
is complete.

Inspect these sources once and together where the tools allow it. Do not repeat
the same story, prerequisites, or recorded-call lookups just to rediscover
facts already returned. If a checkpoint or recipe already serves the requested
behavior, continue from it instead of rebuilding the path.

Use this bounded sequence: diagnose the requested tab and read the exact
request; then inspect story, prerequisites, checkpoints, and recipes once;
then choose the existing valid point or prepare one complete recipe. Retrieve
only recorded responses needed by that recipe, in parallel when independent.
After one validation correction, stop and explain the concrete blocker if the
recipe still cannot be saved; do not explore by submitting partial recipes.

## 2. Ask for the goal — one message, before any app action

Ask only what remains unclear, once, with short answers proposed from the
recording, in the active agent conversation. Skip anything the request,
conversation, or prior answers already settled. Usually only the behavior to
observe and whether real server data may change are essential; repeatability
can be inferred when the person explicitly asks to reuse the path. Never turn
an implementation choice (which call to mock, which route or state address to
use, or how to encode a transition) into a question for the person. Decide it
from the recording and application behavior. Do not duplicate questions in the
dashboard thread; the person answers here, in the active conversation. Use
`resume.say` with the same `requestId` for progress, hand-offs, blockers, and
completion. These messages appear in the replay dashboard and in a read-only
panel inside the dedicated app tab. The person cannot reply from that panel
yet; ask questions and receive answers in the active agent conversation.

1. **What to observe.** Ask in business language and offer the next recorded
   behavior: « Veux-tu vérifier que le Donut modifié peut bien être supprimé ? »
   Do not lead with route names, tool names, HTTP status codes, or internal
   function names. Explain an observed error by what the person sees or cannot
   do.
2. **Real data or simulation.** Ask only if not already answered: « On peut
   vérifier cela avec les données actuelles, ou faire une simulation sans
   modifier les produits du serveur. Que préfères-tu ? » Explain the practical
   consequence in one clause. A request to simulate or avoid server changes
   means no product writes; do not ask them to approve the individual simulated
   responses or their technical labels.
3. **What must match.** Ask only if needed to resolve an actual ambiguity:
   « Le même compte et le Donut à 8 € doivent-ils être conservés ? » Prefer
   visible business facts (product, price, account, form) over state paths.
4. **Repeatability.** Infer « plusieurs fois » from an explicit request to
   repeat or reuse the path. Otherwise ask once only if it changes what must be
   saved. Never ask whether a checkpoint or recipe should be created by those
   names; explain it as « un parcours que tu pourras relancer ».

Do not ask a batch of five questions when the request and recording already
settle the answers. State the inferred goal and safety boundary in one sentence
and proceed. A mocked success response is not consent to write to a real
server.

Before the first app action, form this four-part brief from the request,
conversation, and recording: **behavior to check; data/account that must match;
live or simulated data; one-time or reusable**. Present only the business
summary, for example: « Je vais préparer une simulation relançable pour
modifier puis supprimer le Donut à 8 €, sans changer les produits du serveur. »
If any decision that affects server writes or the expected outcome is still
unknown, ask one concise question about only that decision. Otherwise state the
brief and proceed without waiting for another confirmation.

Keep progress messages to meaningful transitions: setup ready, scenario
prepared, person action needed, outcome verified. Do not narrate each tool
lookup or send a second reminder while the same hand-off remains pending.

If the person answers « fais au mieux », take: the next gesture as the goal,
route + identity + the primitives that gesture uses as what must be exact, no
server write without asking, a point valid for the working session.

If the person does not answer whether they want to repeat the path, keep the
result session-only. Do not call a temporary checkpoint a reusable script.

In mocked behavior mode, select cases for each relevant Craft server-function
or HTTP call from the recording and the requested visible outcome. Never ask
the person to choose a function id, endpoint, HTTP method, or mock case name.
Save these implementation details on the recipe's `network` profile. Pass
`mockChoices` to `recipe.run` for a one-run override. Omit `defaultCaseId` only
when each run must provide an internal case override; never ask the person to
choose that technical id. Save it when the repeatable scenario has a known
outcome. A `success` case returns its decoded value, an `exception`
case constructs a typed Craft exception, and a `failure` case simulates a
transport failure. Any unconfigured Craft call and any non-Craft app fetch or
XHR is blocked while mocked mode is active. The local log server remains
available for recipe progress.

For a `success` case, store the decoded response value in `response` (for
example, the object from `session.recordedCall.response.body`). Do not store
JSON text produced with `JSON.stringify` or a quoted JSON string: the runtime
returns `response` verbatim and does not parse it. If the app expects an object,
a string containing that object's JSON is the wrong response shape even though
it is valid JSON and the recipe may save successfully.

Before saving a recipe, prove that its starting state can exist in a fresh
resume tab. `goto` changes only the route; it does not restore recorded
primitive state, origin storage, local storage, or server entities. Read the
connected tab with `registry.list` / `registry.get` and `page`, and use the
exact active primitive addresses they return. Do not construct nested
addresses by concatenating names from `session.story`, or assume a recorded
cart or draft is present just because the route was restored. For required
client-side state, use a valid checkpoint as the fast path and make sure the
recipe has a supported, write-safe way to recreate it after expiry. If there is
no such setup step, do not save a recipe that claims to verify that state;
report the missing runner capability (for example, a typed local-state seed
step) or narrow the goal only with the person's agreement. If the app does not
answer `registry.list` / `registry.get`, do not guess addresses; use `page` for
visible outcomes and report when the runner cannot encode the needed assertion.

Every mocked call must include at least one `success` case and at least one
`failure` or `exception` case. Check this for every entry in `network.mocks`,
and confirm each `defaultCaseId` names a case in that same entry. A success-only
mock is invalid even when the scenario is expected to succeed. If the person
chooses simulation or says not to affect server data, keep `objective.mayWrite`
false and do not fall back to changing live data when a tool or mock setup
fails; report the blocker instead.

Before `recipe.save`, collect each required recorded response once (in
parallel when independent), assemble the complete recipe and mock profile, and
check the documented schema. Save the complete recipe; do not discover the
schema by repeatedly saving partial profiles. If validation rejects it, use
the returned field or case error to correct that specific entry, then retry
once. Make sure the retry actually changes the rejected field or case; changing
an unrelated field or resending the same incomplete payload cannot resolve the
validation error. Keep the detailed validation work out of the user-facing
conversation.
After saving, verify the scenario in one supervised run. If it is waiting for
the person, keep that run alive and inspect its status instead of starting the
same run repeatedly.
For scenarios whose purpose is to let the person inspect the screen, add an
explicit `handoff` step with a short observation instruction and no `until`
condition; it waits for the person to press « C’est fait ». A hand-off tied to
an already-true route or state condition disappears immediately and is not a
useful viewing pause. Keep `supervised: true` for agent verification, but do
not rely on it to slow a later dashboard replay: ordinary recipe runs continue
through all steps automatically. Where the person needs to observe the result
before an assertion or next action, the saved recipe itself must contain that
human pause. If the runner has no supported pause for the requested scenario,
say so rather than presenting a fast run as observable.
After restoring a still-valid checkpoint, call `recipe.network` with the saved
recipe id and the chosen `mockChoices`; this activates the mock profile without
replaying setup steps. If an override is omitted, the recipe's saved defaults
apply. A one-run override remains active only in that tab until reload.
When a repeatable recipe must sign in against the live server, put a typed
`{ "type": "network", "mode": "mocked" }` step after the login `handoff` and
before the behavior under test. Without that step, the recipe mode applies
from its first step.

When the person should perform the behavior under test, prepare the screen,
then use a `handoff` that waits for the behavior's postcondition. Give one
clear instruction using the visible control and product name. Follow it with
an essential `expect` for the same result. For the Donut deletion case,
the person deletes Donut in the open app; the recipe waits until the product is
absent and verifies that absence. Save the mock's initial choices as defaults
and make the delete success transition the overview call to its no-Donut case;
a fresh run starts from the initial choices and re-arms the scenario.

Restate the goal in one sentence before going on. Everything after this
serves it.

## 3. Finish setup checks

Use the `resume.doctor` result from step 1. For each failed check, fix it
yourself when you can and give a brief user-facing status; otherwise ask for
one precise action. Rerun only the failed check after a fix. Describe readiness
in terms of the user's task (« l'onglet de l'administration est prêt »), not
as MCP, bridge, or provider diagnostics unless they need to change something.

- **log-server** down: ask to start it (`npm run logs:server`, same port as
  `LOG_SERVER_URL`).
- **tab** missing: open `appUrl` in a browser you drive (your own browser pane
  if the host has one) and show it to the person; else give them the URL.
  Run `resume.doctor` again.
- **tab** several: `resume.doctor({ requestId })` selects the application tab
  whose URL carries this request id. Pass its `clientId` to `app.*` and `page`;
  leave the replay dashboard open and do not drive it as the target app.
- **guided-resume** missing in the app: say which providers to add
  (`provideCraftGuidedResume` and `provideCraftGuidedResumeChat` next to
  `provideCraftDevTools`) and stop there.
- **bridge** held by another session: nothing to do, calls are relayed.

Never kill a process or edit the person's configuration to get there; ask.

## 4. Choose the path, check dependencies, then drive

For this event, restore a valid checkpoint with `checkpoint.restore` and
`checkpoint.validate` first. If there is no valid point, execute its recipe
with `recipe.run`. Start a guided resume only when neither is available or
the person's objective changed.

Before rebuilding the screen, check the data the goal needs on the live server:
compare `session.recordedCall` answers with what the app reads now (`page`,
`registry.*`). If they differ and writes are allowed, fix them first (reset,
recreate); otherwise tell the person what will differ and why it matters.

Then prefer Craft state and methods: `registry.*` and `app.replay`, with
`app.diff` to compare. Use `page` with named controls when the interface itself
is part of the scenario. Use the browser only to inspect or show the page;
never use screenshots or browser clicks to act. Pass the same `requestId` to
`app.launch` and `app.diff` so the new tab remains tied to this request. Write
each step in the thread (`resume.say`, one sentence); the app tab displays this
thread so the person can follow progress without switching back to the agent.

## 5. Hand back what only the person may do

Passwords, codes, choices that are theirs. Never read or type a secret — `page`
refuses sensitive fields. `app.handoff` with `until` =
`session.prerequisites.session.signedInWhen`, the `field`, and a message that
says **where**: the tab you drive (show it if your host can) and its URL.
Say what to do and where in the thread (kind `handoff`); the app tab also shows
an « À vous » banner. Do not send repeated reminders while a hand-off is
pending. If it times out, check the same run's status and report that it is
still ready for the person's action. Do not start a duplicate run or restart a
long wait. Ask once whether they want to continue now; keep the prepared state
available when possible.

## 6. Check against the goal

`app.diff` until the route matches and every remaining difference is either
irrelevant to the goal or accepted by the person. `app.writes` tells what the
resume wrote; a held write to a third party never goes out without consent.

## 7. Freeze and make repeatable

For a one-time observation, `checkpoint.save` with:

- `goal`: the sentence from step 2;
- `ttlMs` + `ttlReason`: from what expires (token lifetime, data reset) and how
  the point will be used;
- `probes`: start from `session.prerequisites.probes` (the session is still
  open), add one for the data the goal needs (« l'espresso existe à 3,50 € »),
  same origin, `{{state <address> <path>}}` for live ids and tokens;
- `created`: what you created, with the request that deletes it;
- `deviations`: what differs and why it does not matter for the goal.

Then `checkpoint.validate`. A failing probe is repaired from the point, not by
starting over.

When the person wants to repeat or reopen the path, a checkpoint alone is not
completion. First save a `ResumeRecipe` with `recipe.save`, including the
short recognizable `name` and one-sentence `summary` for the dashboard,
objective answers, autonomous data setup by default, named expectations and
remedies, human hand-offs for secrets, and reverse-order cleanup for every
created entity. Keep `objective.goal` as the precise behavior under test. The
tool accepts typed `goto`, `create`, `ensure`, `handoff`,
`act`, `invoke`, `expect`, and `checkpoint` steps. Empty objective lists,
`mayWrite: false`, `strategy: autonomous`, cleanup, and revision history have
safe defaults; provide them only when the objective needs different values.
Set the recipe's network mode from the test-intent answer. Prepare the route
and data before the `handoff`; wait on the live condition
from `session.prerequisites`, then continue with named actions and essential
expectations. Never include credentials.

Verify the recipe itself with `recipe.run` from the intended starting state,
complete each human hand-off, and confirm the run is `completed` and the goal's
essential state holds. Set `supervised: true` for this first verification.
Review the run's step events and inspect the resulting page; a `completed`
status means only that the listed steps completed, not that the stated goal was
achieved. When `objective.mayWrite` is false, also confirm `app.writes` is
empty. Confirm required starting state is present before interpreting any
later assertion: an absent state address is a broken setup or expectation, not
a successful empty-state outcome. `objective.exact` documents what must match; it does not execute
assertions by itself. Encode every essential outcome in typed `expect` steps
(or a human hand-off with a matching postcondition). The typed `expect`
condition supports a route or a Craft state address. `page` can inspect named
controls outside the recipe, but that inspection does not become an assertion
in future dashboard runs. If an essential visual result such as a disabled
button cannot be expressed by a supported recipe condition, do not replace it
with a route-only expectation or call the recipe fully verified; report that
the runner needs a supported control assertion. In mocked mode, choose cases
through `mockChoices` or persist a chosen `defaultCaseId` in the recipe. Then
freeze the point with
`checkpoint.save`, including
`recipeId` from the saved recipe, and validate it. This link lets an expired or
invalid point start the recipe again. Use `recipe.run` on later resumes; the
tab runner executes conditions and steps, so do not ask the AI to replay a
healthy recipe. Repair a failed essential expectation from that step with
`recipe.repair`. Repair the failed setup or condition while preserving the
same essential postcondition; never make a run green by deleting or weakening
the failed assertion, or by replacing it with a route-only check. Re-run the
repaired recipe and inspect its result. If saving or verifying the recipe fails,
say the result is only a temporary checkpoint and give the concrete failure;
do not claim the path is repeatable. A saved recipe with no completed run (for example,
`runs: []`) is saved but unverified; do not present it as ready to replay until
one run completes and its essential outcomes are confirmed.

## 8. Conclude

One short message in the chat and the thread (kind `done`): the point and the
goal it serves, how long it is valid and why, the deviations, and the one
thing the person does next (« clique Enregistrer dans l'onglet ouvert »).

See [guide/ai/guided-resume](../../../apps/docs/guide/ai/guided-resume.md).
