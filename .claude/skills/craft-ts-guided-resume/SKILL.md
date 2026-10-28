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

Call `resume.doctor` first. Repair checks you can fix yourself; for anything
that requires the person, ask for one precise action. Do not launch or mutate
the app until the goal interview below is complete.

`resume.request` (the session and the point; its `method` repeats these steps),
then `session.story` up to the point **and a few steps after it**
(`session.story` without `beforeSequence`, look at what follows): what the
person did next is usually what they want to look at. `session.prerequisites`
(identity, `signedInWhen`, entities, writes, ready `probes`). Then inspect
`checkpoint.list` and `recipe.list` for this session and event. Choose the
best available path, but do not restore a point, execute a recipe, or mutate
the app until the goal interview is complete.

## 2. Ask for the goal — one message, before any app action

Ask at most four short questions, each with answers you propose from the
recording, so the person can reply in a few words. Skip a question the request
or the conversation already answered. Write the same questions in the dashboard
thread (`resume.say`, kind `question`) and wait for the answer in the chat.

1. **What to observe.** « Que veux-tu regarder à partir de ce point ? » —
   propose the next recorded gesture (« ce qui se passe quand Camille clique
   Enregistrer avec le prix à 4,83 € »), a bug the story shows (an error, a
   4xx/5xx), or « juste retrouver l'écran ».
2. **What must be exact.** « Qu'est-ce qui doit être identique à
   l'enregistrement ? » — the account and role, the server data the next step
   reads or writes (name the entity: « l'espresso à 3,50 € »), the form or
   draft; the rest may differ.
3. **Server writes.** « Puis-je écrire sur le serveur pour y arriver ? » —
   reset demo data, recreate an entity, redo a recorded write; or touch nothing
   and note the differences.
4. **Use of the point.** « Une fois, ou un point à rouvrir plusieurs fois ? » —
   this sets the validity you will choose and how strict its probes are.

If the person answers « fais au mieux », take: the next gesture as the goal,
route + identity + the primitives that gesture uses as what must be exact, no
server write without asking, a point valid for the working session.

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
- **tab** several: pick the one to drive and pass its `clientId` to `app.*` and
  `page`, or ask to close the others. A dashboard replay counts as a tab.
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
never use screenshots or browser clicks to act. Write each step in the thread
(`resume.say`, one sentence).

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

## 7. Freeze

`checkpoint.save` with:
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

Save a `ResumeRecipe` for a repeatable path with `recipe.save`. Include the
objective interview answers, autonomous data setup by default, named
expectations and remedies, human hand-offs for secrets, and reverse-order
cleanup for every created entity. Use `recipe.run` on later resumes. The tab's
runner executes conditions and steps; do not re-ask the AI to replay a healthy
recipe. A failed essential expectation without a remedy is repaired from that
step with `recipe.repair`.

## 8. Conclude

One short message in the chat and the thread (kind `done`): the point and the
goal it serves, how long it is valid and why, the deviations, and the one
thing the person does next (« clique Enregistrer dans l'onglet ouvert »).

See [guide/ai/guided-resume](../../../apps/docs/guide/ai/guided-resume.md).
