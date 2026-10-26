---
name: craft-ts-guided-resume
description: Resume a recorded CraftTS debug session in the live app — read the archive with the log MCP (resume.request, session.story/target/prerequisites/recordedCall), drive the tab with the function-registry MCP (app.launch, app.diff, app.replay, page), hand control back for credentials with app.handoff, then freeze a resume point (checkpoint.save) with an expiry you justify. Use when the person clicked « Reprendre ici » in the debug session dashboard or asks to resume, reproduce from, or reopen a recorded session at an event.
---

# Guided resume

Bring the live app to the state a recorded session had at one point, with as
little human help as possible, then freeze that point so it reopens without you.
The logs MCP prompt `reprise-guidee` holds the same method.

## Steps

1. **Read.** `resume.request` gives the session and point (else ask for a session
   id). `checkpoint.list` with that session and `beforeSequence`: a point not
   expired → `checkpoint.restore`, then `checkpoint.validate`; valid means done.
   Then `session.story`, `session.target`, `session.prerequisites`.
2. **Propose** in two or three sentences: who does what, where; what is needed
   (role, data); what you will do. Ask only before an irreversible action.
   Write each step in the dashboard thread too (`resume.say`): the person
   follows the resume from the replay and may answer there; `resume.say`
   returns what they wrote since your previous message, `resume.replies`
   reads it again.
3. **Drive.** `app.launch` reloads the tab on the recorded state (write barrier
   on). `app.diff` tells what is missing; close the gap with `page` (goto, fill,
   click), `app.replay` (a recorded gesture with arguments fitted to live data)
   and `registry.*`. Create what does not exist here instead of giving up.
   `session.recordedCall` gives recorded answers to copy values from.
4. **Hand back** only what you must not or cannot do: passwords, codes, choices
   that belong to the person. Never read or type a secret — `page` refuses a
   sensitive field. `app.handoff` with a short message, the `field`, and an
   `until` condition on the live state. Recorded tokens are masked
   (`[REDACTED]` in state, `craft-ref:…` in calls), so wait for a real one —
   `session.prerequisites` gives it as `session.signedInWhen`:

   ```json
   { "address": "service:session / state:currentSession / state:currentSession", "path": "token", "unmasked": true }
   ```

   Say the same instruction in the chat and in the thread (`resume.say`, kind
   `handoff`).
5. **Check.** `app.diff` until the route matches and the remaining differences
   are accepted. `app.writes` lists what the resume wrote; a held write to a
   third party never goes out without explicit consent.
6. **Freeze.** `checkpoint.save` with `ttlMs` and `ttlReason` you choose from
   what expires (token lifetime, data reset…), same-origin `probes` proving the
   point holds (signed in, entity exists — use `{{state <address> <path>}}` for
   a live token or id), `created` entities with the request that deletes them,
   and `deviations` you accepted. Then `checkpoint.validate`.
7. **Conclude** in one sentence, in the chat and the thread (kind `done`): the point, how long it is valid and why, the
   deviations. The person takes the tab back.

A point whose probe fails is repaired from itself, not rebuilt from scratch.

See [guide/ai/guided-resume](../../../apps/docs/guide/ai/guided-resume.md).
