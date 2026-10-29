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

## 2. Ask for the goal — one message, before any app action

Ask only what remains unclear, with short answers proposed from the recording,
in the active agent conversation. Skip anything the request or conversation
already answered. Do not duplicate questions in the dashboard thread; the
person answers here, in the active conversation. Use `resume.say` with the
same `requestId` for progress, hand-offs, and completion.

1. **What to observe.** « Que veux-tu regarder à partir de ce point ? » —
   propose the next recorded gesture (« ce qui se passe quand Camille clique
   Enregistrer avec le prix à 4,83 € »), a bug the story shows (an error, a
   4xx/5xx), or « juste retrouver l'écran ».
2. **How to test it.** « Tu veux une reprise fonctionnelle sur le serveur
   actuel, ou tester le comportement sans appeler les API réelles ? » — the
   functional mode uses current server data and the existing write barrier;
   mocked behavior reuses recorded outcomes to reach the point, then uses
   selected cases for future Craft HTTP calls. An unconfigured call fails
   closed and never reaches a real server.
3. **What must be exact.** « Qu'est-ce qui doit être identique à
   l'enregistrement ? » — the account and role, the server data the next step
   reads or writes (name the entity: « l'espresso à 3,50 € »), the form or
   draft; the rest may differ.
4. **Server writes.** « Puis-je écrire sur le serveur pour y arriver ? » —
   reset demo data, recreate an entity, redo a recorded write; or touch nothing
   and note the differences. A mocked success response is not consent to write
   to a real server.
5. **Use of the point.** « Une fois, ou un point à rouvrir plusieurs fois ? » —
   this sets the validity you will choose and how strict its probes are.

If the person answers « fais au mieux », take: the next gesture as the goal,
route + identity + the primitives that gesture uses as what must be exact, no
server write without asking, a point valid for the working session.

If the person does not answer whether they want to repeat the path, keep the
result session-only. Do not call a temporary checkpoint a reusable script.

In mocked behavior mode, ask which named case to use for each relevant Craft
server-function id or Craft HTTP endpoint. Spell an HTTP call as the exact
`METHOD URL` from the graph, for example `POST /api/cart`. Save the cases on
the recipe's `network` profile. Pass
`mockChoices` to `recipe.run` for a one-run override. Keep `defaultCaseId` out
to ask for a choice on each run; save it only when the person wants the same
case remembered. A `success` case returns its decoded value, an `exception`
case constructs a typed Craft exception, and a `failure` case simulates a
transport failure. Any unconfigured Craft call and any non-Craft app fetch or
XHR is blocked while mocked mode is active. The local log server remains
available for recipe progress.
After restoring a still-valid checkpoint, call `recipe.network` with the saved
recipe id and the chosen `mockChoices`; this activates the mock profile without
replaying setup steps. If an override is omitted, the recipe's saved defaults
apply. A one-run override remains active only in that tab until reload.
When a repeatable recipe must sign in against the live server, put a typed
`{ "type": "network", "mode": "mocked" }` step after the login `handoff` and
before the behavior under test. Without that step, the recipe mode applies
from its first step.

Restate the goal in one sentence before going on. Everything after this
serves it.

## 3. Finish setup checks

Use the `resume.doctor` result from step 1. For each failed check, fix it
yourself when you can and say it in one line; otherwise ask the person one
precise thing. Rerun it after a fix.

- **log-server** down: ask to start it (`npm run logs:server`, same port as
  `LOG_SERVER_URL`).
- **tab** missing: open `appUrl` in a browser you drive (your own browser pane
  if the host has one) and show it to the person; else give them the URL.
  Run `resume.doctor` again.
- **tab** several: `resume.doctor({ requestId })` selects the application tab
  whose URL carries this request id. Pass its `clientId` to `app.*` and `page`;
  leave the replay dashboard open and do not drive it as the target app.
- **guided-resume** missing in the app: say which provider to add
  (`provideCraftGuidedResume` next to `provideCraftDevTools`) and stop there.
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
each step in the dashboard thread (`resume.say`, one sentence).

## 5. Hand back what only the person may do

Passwords, codes, choices that are theirs. Never read or type a secret — `page`
refuses sensitive fields. `app.handoff` with `until` =
`session.prerequisites.session.signedInWhen`, the `field`, and a message that
says **where**: the tab you drive (show it if your host can) and its URL.
Say the same in the chat and in the thread (kind `handoff`). If the hand-off
times out, ask once more in the chat and call it again; do not give up.

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
objective answers, autonomous data setup by default, named expectations and
remedies, human hand-offs for secrets, and reverse-order cleanup for every
created entity. The tool accepts typed `goto`, `create`, `ensure`, `handoff`,
`act`, `invoke`, `expect`, and `checkpoint` steps. Empty objective lists,
`mayWrite: false`, `strategy: autonomous`, cleanup, and revision history have
safe defaults; provide them only when the objective needs different values.
Set the recipe's network mode from the test-intent answer. Prepare the route
and data before the `handoff`; wait on the live condition
from `session.prerequisites`, then continue with named actions and essential
expectations. Never include credentials.

Verify the recipe itself with `recipe.run` from the intended starting state,
complete each human hand-off, and confirm the run is `completed` and the goal's
essential state holds. In mocked mode, choose cases through `mockChoices` or
persist a chosen `defaultCaseId` in the recipe. Then freeze the point with
`checkpoint.save`, including
`recipeId` from the saved recipe, and validate it. This link lets an expired or
invalid point start the recipe again. Use `recipe.run` on later resumes; the
tab runner executes conditions and steps, so do not ask the AI to replay a
healthy recipe. Repair a failed essential expectation from that step with
`recipe.repair`. If saving or verifying the recipe fails, say the result is
only a temporary checkpoint and give the concrete failure; do not claim the
path is repeatable.

## 8. Conclude

One short message in the chat and the thread (kind `done`): the point and the
goal it serves, how long it is valid and why, the deviations, and the one
thing the person does next (« clique Enregistrer dans l'onglet ouvert »).

See [guide/ai/guided-resume](../../../apps/docs/guide/ai/guided-resume.md).
