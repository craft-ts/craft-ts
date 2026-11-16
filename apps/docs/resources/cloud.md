---
description: CraftTS Cloud — session replay, end-to-end tests from real sessions, frustration insights and business analytics, hosted for you. Join the early-access waitlist.
---

# CraftTS Cloud

CraftTS records what an application does: every state change, every request, every
event a user triggers. The open-source toolkit already turns that into
[session replay](/guide/ai/guided-resume), tests from real journeys and
[agents that drive the running app](/guide/ai/dev-page). Today you run all of it
yourself: a log server, a dashboard, storage, a replay worker.

**CraftTS Cloud would run it for you.** Add one provider to your app, and the
recordings, the tests and the insights are there.

::: info Not available yet
CraftTS Cloud is not built yet. Before building it, I want to know who would use it
and for what. If it would help you, join the waitlist below: it takes thirty
seconds, and your answers decide what comes first.
:::

## What it would do

### Reproduce any session

Open a recorded session and watch what the user really did — then reopen the live
app at the exact moment before it went wrong, with the same state, to debug it
where it happened. No more "cannot reproduce".

### End-to-end tests from real sessions

Pick the journeys that matter and turn them into regression tests. They replay
against every change, and point at the route or action that behaves differently.
Your tests follow how people actually use the product, not how you guessed they
would.

### Find where users get frustrated

Repeated clicks, abandoned forms, errors, back-and-forth navigation: the cloud
finds the moments where people hesitate, retry or give up, ranks them by how many
users they affect, and links each one to the sessions that show it.

### Business event analytics

Sign-ups, orders, upgrades, the events your product cares about: follow them from
the same recordings, as funnels and trends, without adding a second tracking
library.

## Why it fits CraftTS

A CraftTS application is declarative: services, states, queries and mutations are
named and known to the framework. That is what makes a recording precise enough to
be replayed, compared and turned into a test — and what makes the analysis speak
the language of your code (`cart.checkout failed`), not of the DOM
(`click on div.btn-3`).

## Join the waitlist

<CloudWaitlist />
