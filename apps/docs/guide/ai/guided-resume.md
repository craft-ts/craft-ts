# Guided resume

Resume a recorded debug session in the live app: an AI reads what the person
did up to an event, brings a fresh tab to the same state, hands the tab back
for what only the person can do (signing in), then freezes the point so it
reopens later without the AI.

**Use it when** a recording shows a bug in the middle of a long path and you
want to investigate from that exact point, with a real backend.
**Not when** you only want to watch it again — the replay in the debug session
dashboard does that without touching a server.

## What the person does

1. In the debug session dashboard, on an event of the replay: **Reprendre ici**.
2. If a valid resume point exists for that event, the app opens on it directly.
   Its probes run in the tab; a red probe shows a banner.
3. Otherwise the dashboard publishes the point and copies a sentence to paste
   into the AI host (Claude Code, Codex…). The AI drives the tab and shows an
   « À vous » banner when it needs the person, with the field highlighted.
4. The **Reprise** tab of the replay's side panel shows the thread of the
   resume: the AI's steps and hand-offs, and a field to answer it without
   leaving the dashboard.

## Install

The app opts in, in development only:

```ts
import { provideCraftGuidedResume } from '@craft-ts/component';

providers: [
  ...(import.meta.env.DEV
    ? [
        ...provideCraftDevTools(),
        ...provideCraftGuidedResume({ logServerUrl: 'http://127.0.0.1:4319' }),
      ]
    : []),
];
```

The AI host connects two local MCP servers: `npm run logs:mcp` (reading the
archive) and `npm run registry:mcp` (driving the tab). The prompt
`reprise-guidee` of the logs MCP gives it the method; the skill
`craft-ts-guided-resume` says the same.

## Tools

| Tool | Server | Role |
|---|---|---|
| `resume.request` | log-mcp | the point left by **Reprendre ici** |
| `resume.say`, `resume.replies` | log-mcp | write a step, question or hand-off in the dashboard thread; read the person's answers |
| `session.story`, `session.target`, `session.prerequisites`, `session.recordedCall` | log-mcp | what happened, the state to reach, the identity and entities it needs, one recorded call |
| `app.launch`, `app.diff` | registry | reload the tab on the recorded state; compare it with the point |
| `app.replay` | registry | invoke a recorded gesture with arguments adapted to live data |
| `app.handoff` | registry | « À vous » banner, highlighted field, wait for a condition on the live state |
| `app.writes` | registry | writes made since the resume started, allowed or held |
| `checkpoint.save`, `list`, `restore`, `validate`, `cleanup` | registry | freeze, find, reopen, check and clean up a resume point |

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
- **Resume points stay local.** They hold a test session's storage, tokens
  included, under `<DEBUG_SESSION_DIR>/checkpoints`, out of git. Probes only
  reach the app's own origin.
- Where a resume may run is left to each project: the tools refuse no origin.

## Resume points

A point records the live state (primitives, persisted storage, origin
storage), the origin it was taken on, an expiry chosen by the AI with its
reason, probes, what the resume created and how to delete it, and the
deviations accepted. Probe strings may read the live state:

```json
{
  "method": "POST",
  "url": "/api/server-functions",
  "body": { "id": "ecommerce.auth.me", "input": { "token": "{{state service:session / query:signInProcess token}}" } },
  "expect": { "status": 200, "match": ["admin"] }
}
```

`{{state <address> <path>}}` takes an ordinal-free primitive address and a dot
path (`.` for the whole value). A string that is only a placeholder takes the
value itself.

Limits: `HttpOnly` cookies are not captured, and a value that is not JSON
(`Date`, `Map`) loses its shape in a point.
