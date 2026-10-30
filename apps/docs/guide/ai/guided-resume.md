# Guided resume

Resume a recorded debug session in the live app: an AI reads what the person
did up to an event, brings a fresh tab to the same state, hands the tab back
for what only the person can do (signing in), then freezes the point so it
reopens later without the AI. First choose the intent: a functional resume uses
the current server, while a behavioral test uses recorded responses to reach
the point and named mock cases for later Craft HTTP calls.

**Use it when** a recording shows a bug in the middle of a long path and you
want to investigate from that exact point, either against current server data
or in an isolated behavioral test.
**Not when** you only want to watch it again — the replay in the debug session
dashboard does that without touching a server.

## What the person does

1. In the debug session dashboard, on an event of the replay: **Reprendre ici**.
   The replay stays open. The dashboard opens a fresh application tab on the
   recorded route, marks it with an immutable request id and copies a prompt
   naming the exact session, event, request and tab—even when a checkpoint or
   recipe already exists.
2. Paste the prompt into the agent conversation. The agent reads the recording
   and asks what you want to observe there. Answer in that conversation for
   now; the dedicated app tab has a read-only **Messages de l’agent** panel for
   progress, instructions, blockers and completion, so you can follow the run
   without switching back. The AI also shows an « À vous » banner when it needs
   the person, with the field highlighted.
3. The **Reprise** tab of the dashboard shows progress, saved recipes and
   their latest runs. A recipe’s detail page also lists the recorded sessions
   started from that recipe; those sessions carry an **Issue d’une recette**
   tag in the sessions list.

## Install

The app opts in, in development only:

```ts
import {
  provideCraftGuidedResume,
  provideCraftGuidedResumeChat,
} from '@craft-ts/component';

providers: [
  ...(import.meta.env.DEV
    ? [
        ...provideCraftDevTools(),
        ...provideCraftGuidedResume({ logServerUrl: 'http://127.0.0.1:4319' }),
        ...provideCraftGuidedResumeChat({ logServerUrl: 'http://127.0.0.1:4319' }),
      ]
    : []),
];
```

The repo's `.mcp.json` declares the two MCP servers the AI host needs:
`craft-logs` (reading the archive) and `craft-registry` (driving the tab),
built from the repo on start. `LOG_SERVER_URL` and `REGISTRY_BRIDGE_PORT`
override their defaults. Several AI sessions can run them at once: the first
registry server holds the bridge port, the next ones relay to it.

The skill `.agents/skills/craft-ts-guided-resume` gives the AI the method, and
the prompt `reprise-guidee` of the logs MCP says the same:

1. run `resume.doctor({ requestId })` to select the marked app tab, then read
   `resume.request({ requestId })` and the point without acting in the app;
2. **ask the person what they want to observe** in the active agent
   conversation, proposing what must be exact and whether the server can be
   written; use only questions the conversation has not already answered;
3. restore a valid point, or execute its recipe, before starting a guided
   resume;
4. check the data the goal depends on, then use Craft state/methods first,
   `page` with named controls when the interface is part of the scenario;
5. pass the same `requestId` to `session.*`, `app.*`, and `resume.say`; never
   replace it with a “latest” request. Hand sign-ins back, saying where;
6. save a replayable recipe with expectations and cleanup, then freeze a point
   that records the goal, with probes that prove it holds.

## Tools

| Tool                                                                               | Server   | Role                                                                                                                            |
| ---------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `resume.request`                                                                   | log-mcp  | read the exact request id copied from **Reprendre ici**, or the latest as a fallback                                            |
| `resume.say`, `resume.replies`                                                     | log-mcp  | write progress, instructions, hand-offs and completion to the thread shown in the dashboard and app tab; keep the goal interview and answers in the agent conversation |
| `session.story`, `session.target`, `session.prerequisites`, `session.recordedCall` | log-mcp  | inspect the exact request's history, state, identity, entities, probes and calls                                                |
| `resume.doctor`                                                                    | registry | check the log server and bridge, and select the app tab marked with this request id                                             |
| `app.launch`, `app.diff`                                                           | registry | reload the tab on the recorded state; compare it with the point                                                                 |
| `app.replay`                                                                       | registry | invoke a recorded gesture with arguments adapted to live data                                                                   |
| `app.handoff`                                                                      | registry | « À vous » banner, highlighted field, wait for a condition on the live state                                                    |
| `app.writes`                                                                       | registry | writes made since the resume started, allowed or held                                                                           |
| `checkpoint.save`, `list`, `restore`, `validate`, `cleanup`                        | registry | freeze, find, reopen, check and clean up a resume point                                                                         |
| `recipe.save`, `recipe.run`, `recipe.repair`                                       | registry | save a deterministic path, execute it in the tab, or repair it from a failed step                                               |
| `recipe.network`                                                                   | registry | activate a recipe's functional or mocked HTTP mode after restoring its linked checkpoint                                        |
| `recipe.list`, `recipe.get`, `recipe.exportPlaywright`                             | logs     | list and read recipes stored with the session archive, or export an exploratory Playwright scaffold                             |

## Safety

- **Secrets stay with the person.** `page` never shows the value of a password,
  one-time code or payment field (`type="password"`, `autocomplete`, or
  `data-craft-sensitive`) and refuses to fill it. Recorded tokens are masked
  (`[REDACTED]` in state, `craft-ref:…` in calls), so a recorded session
  never opens as such: the AI hands the sign-in back and waits for the
  condition `session.prerequisites` gives (`signedInWhen`, a real token).
- **Write barrier.** Once launched, the tab holds writes (`fetch` or
  `XMLHttpRequest` with a body) to another origin than its own or loopback,
  and journals the others; a server function named like a read is counted,
  not listed.
- **Mocked behavior.** A recipe can name decoded success values, typed Craft
  exceptions and transport failures for Craft server functions. Every run must
  select one case per function, either through `mockChoices` or a saved
  `defaultCaseId`. An unconfigured Craft call fails closed. Non-Craft app
  `fetch` and XHR requests are blocked while this mode is active; the local log
  server stays available for recipe progress. The selection is active in the
  current tab until another recipe mode is activated or the tab reloads.
- **Resume points stay local.** They hold a test session's storage, tokens
  included, under `<DEBUG_SESSION_DIR>/checkpoints`, out of git. Probes only
  reach the app's own origin.
- **Recipes stay local.** Recipe definitions and execution journals live under
  `<DEBUG_SESSION_DIR>/recipes`, out of git. The server rejects credential
  fields; recipe inputs use live state references for tokens and hand-off steps
  for anything the person must enter.
- Where a resume may run is left to each project: the tools refuse no origin.

## Resume points

`session.prerequisites` proposes a probe: the recorded read that sent the
session token (a « who am I » when there is one), with the live token. A point
whose session expired then fails instead of passing a bare page load.

A point records the goal the person gave, the live state (primitives, persisted storage, origin
storage), the origin it was taken on, an expiry chosen by the AI with its
reason, probes, what the resume created and how to delete it, and the
deviations accepted. Probe strings may read the live state:

```json
{
  "method": "POST",
  "url": "/api/server-functions",
  "body": {
    "id": "ecommerce.auth.me",
    "input": {
      "token": "{{state service:session / query:signInProcess token}}"
    }
  },
  "expect": { "status": 200, "match": ["admin"] }
}
```

`{{state <address> <path>}}` takes an ordinal-free primitive address and a dot
path (`.` for the whole value). A string that is only a placeholder takes the
value itself.

## Resume recipes

A recipe binds its session and event to an objective interview and a sequence
of typed steps. The tab runner supports `handoff`, `create`, `ensure`, `goto`,
`invoke`, `act`, `expect` and `checkpoint`. Conditions are read from Craft
state or the current route; methods and server function calls are awaited, and
condition checks have a per-step time limit. `act` uses named page controls;
passwords, OTPs and similarly marked controls still require a human hand-off.

An `expect` is `essential` or `accessory`. The runner applies its declared
remedy when one exists, records accessory deviations, and stops on an
unrecoverable essential failure. It then removes created data using cleanup
calls and leaves the run failed at its step for `recipe.repair`. Supervised
runs return after each step with a run id. A successful final checkpoint
records the producing recipe id. If that point later fails its probes, the app
starts its linked recipe. `resume.request` includes the latest failed recipe
run so the AI can repair it from the failing step. The Playwright export is a
reviewable scaffold: human hand-offs and Craft-specific operations are marked
as TODOs for a test-specific implementation.

For a repeatable resume, the recipe is the script and the checkpoint is only
the temporary fast path. A typical flow opens `/connexion`, waits at a
`handoff` until `session.prerequisites.session.signedInWhen` becomes true, then
continues through named actions and state expectations. The runner waits five
minutes for a human step by default (up to fifteen minutes when configured).
After the recipe reaches the target, its checkpoint is linked to the recipe:
reopens use the snapshot while its expiry and probes pass; when they no longer
pass, the app starts the linked recipe, which prepares the page and asks for
sign-in again if needed.

`recipe.save` exposes typed steps so an agent can build the sequence from the
live registry and `session.prerequisites`. Give every recipe a short,
recognizable `name` and a one-sentence `summary` for the dashboard; keep
`objective.goal` as the precise behavior to reproduce. The example below shows
the human boundary; replace the session, origin, state address, route, and
probe with values read from the current app. Empty objective lists,
`mayWrite: false`, `strategy: "autonomous"`, cleanup, and revision history are
the defaults.
To make a result observable in a later dashboard run, add a `handoff` without
`until` after the relevant screen; the person continues by confirming « C'est
fait ».
For a behavioral test, add `network: { mode: "mocked", mocks: [...] }` with
one entry per server-function id or Craft HTTP endpoint and its named cases.
Use the exact `METHOD URL` graph identity for a `CraftHttpClient` call, such
as `POST /api/cart`. Leave out
`defaultCaseId` to choose on every run; set it to remember a case. A
`recipe.network` activation applies that profile after a valid checkpoint has
been restored, without replaying the recipe's setup steps. The log server
requires at least one success and one failure case per mocked call; exception
cases preserve their Craft discriminant. The success `response` is the value
the app's server-function client receives (often a JSON string in this repo).
For stateful scenarios, a success case may include `nextChoices`, mapping other
call ids to case ids. The current response is returned first; those cases apply
to subsequent calls. For example, a successful delete can switch the next
`ecommerce.admin.overview` response to a dataset without the deleted product.
A fresh `recipe.run` starts from the saved defaults again, so it can re-arm the
initial dataset.
When the person should do the deletion, prepare the admin view first, pause on
a hand-off that waits for the Donut to disappear, then add an essential
expectation for that same absence. The person clicks Delete in the app; the
mocked delete response switches the following overview read to the no-Donut
case. Starting the recipe again uses the initial overview choice and restores
the Donut for another run.
To sign in against the live server and then isolate the behavior under test,
put `{ "type": "network", "mode": "mocked" }` after the `handoff` step and
before the tested actions. Without a `network` step, the recipe's mode starts
at the first recipe step.

```json
{
  "network": {
    "mode": "mocked",
    "mocks": [
      {
        "call": "ecommerce.cart.addLine",
        "defaultCaseId": "added",
        "cases": [
          { "id": "added", "kind": "success", "response": "{\"id\":\"cart-1\"}" },
          { "id": "store-error", "kind": "exception", "tag": "StoreError", "payload": { "code": "STORE_ERROR", "status": 400, "message": "Cart is full" } },
          { "id": "offline", "kind": "failure", "message": "Simulated offline transport" }
        ]
      }
    ]
  }
}
```

```json
{
  "sessionId": "<session UUID>",
  "beforeSequence": 175,
  "origin": "https://shop.example",
  "name": "Vérifier la formule avant achat",
  "summary": "Reconnecte l’utilisateur puis confirme le contenu de la formule.",
  "objective": {
    "goal": "Revenir à la formule choisie, avant l’ajout au panier."
  },
  "steps": [
    { "type": "goto", "route": "/connexion" },
    {
      "type": "handoff",
      "message": "Connecte-toi dans cet onglet ; je poursuis dès que la session est ouverte.",
      "field": "sign-in-password",
      "until": {
        "address": "service:session / query:currentUser",
        "path": "token",
        "unmasked": true
      }
    },
    { "type": "goto", "route": "/formule/pause-cafe" },
    {
      "type": "expect",
      "level": "essential",
      "condition": {
        "address": "service:composition / state:selection",
        "path": "items",
        "equals": ["croissant", "donut"]
      }
    },
    {
      "type": "checkpoint",
      "ttlMs": 1800000,
      "ttlReason": "Le point dépend de la session de connexion."
    }
  ]
}
```

The checkpoint step captures the successful result and links it to the saved
recipe automatically. On a later open, a valid snapshot restores immediately;
an expired session starts the same recipe at `/connexion`, waits for the person,
then verifies the selected items again.

Limits: `HttpOnly` cookies are not captured, and a value that is not JSON
(`Date`, `Map`) loses its shape in a point.

The end-to-end demonstration in `apps/demo-ecommerce/e2e/guided-resume.spec.ts`
uses this full path: the recipe opens the login page, pauses for a human sign-in,
continues the admin scenario, checks its essential state, and creates a linked
checkpoint. It also runs the recipe again without another sign-in, reopens the
valid snapshot without an agent, reports a failed probe, and simulates expiry
to show the linked recipe returning to the login hand-off before it continues.
