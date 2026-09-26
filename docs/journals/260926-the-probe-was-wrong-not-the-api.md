# The probe was wrong, not the API

**Date**: 2026-09-26
**Component**: Logs endpoint measurement, and five API claims across the Logs and Authentication work
**Status**: Resolved

## What happened

A probe fanned four queries at the logs endpoint five times over. Rounds one to three answered
normally. Rounds four and five printed `0` for every query, including the raw read that had returned
425 rows a second earlier.

The reading was that the endpoint degrades under load — that it starts answering 200 with an empty
result rather than refusing. That is a serious thing to believe about a logs API: it would mean an
empty window is never trustworthy, and the page's "no requests in this window" copy could be a lie
on any busy project.

It was false. The probe's helper ended:

```js
const body = JSON.parse(text);
return body.error ? `FAIL` : `${body.result?.length ?? 0}`;
```

A 429 from this endpoint is `{"message":"ThrottlerException: Too Many Requests"}`. There is no
`error` key, so the failure check missed it; there is no `result` key, so `?? 0` reported zero rows.
**The probe turned a refusal into an empty answer** — the exact confusion the page is supposed to
avoid, committed by the tool measuring it.

## How it was caught

By asking a different question. Rather than concluding degradation, the next probe asked when the
zeros stop: fire the same query immediately, at 20s, at 60s, at 120s. The first line printed
`429 ThrottlerException` and the answer was in the status, which the earlier helper had never shown.

The generalisable part: **a probe that only prints its own interpretation cannot be checked.** The
fixed version prints the status and the first 80 characters of the raw body next to the parsed
count, and every probe written afterwards in that session did the same.

## The same shape, four more times

The session's governing rule was "measurement beats documentation". It held, but only because the
measurements were themselves re-measured. Five claims that had been written down as facts were
wrong, and each was caught by trying the thing rather than by reasoning about it:

- **"`limit 5000` bounds the read."** It never took effect — 1000 rows arrive whatever is asked for.
  Caught by asking for 5000, 10000 and 50000 and getting the same number three times.
- **"Six requests exhaust the logs throttle."** Twelve do not. The figure came from a probe run that
  had been doing other things at the time.
- **"The endpoint supports almost no SQL."** Drawn from four refusals. `group by`,
  `sum(case when …)`, `like` and `offset` all work, which moved the entire aggregation server-side
  and halved the request count.
- **"`generate_link` exhausts a project's email quota in two clicks."** Nine sends, no refusal. The
  claim was inferred from `recovery_sent_at` being set, which shows mail was sent, not that the
  allowance was spent.
- **"`client_secret` exists only in the 201 from create."** A single-client read returns it too. The
  list does not, and the list was the only thing that had been tried.

## What it cost, and what it saved

The false ones were all caught before release, but not before design: the four-statement fan-out for
the service cards was planned around not knowing `sum(case when …)` worked, and a phase was planned
around a mail quota that does not bite. Both were simplified once measured — four requests became
two, and a quota warning became an honest "nothing here limits this".

The one that would have shipped a real defect is the audit filter. Filtering a user's history on
`auth_audit_event.traits.user_id` — the key the research named — returns what was done *to* the
user. Everything they did themselves is under `actor_id`. On the probe user that is two rows out of
eight, and the tab would have looked like it worked.

## The rule that came out of it

Print the status, the raw body and the parsed value. An assertion that reads only the parsed value
cannot tell "it said no" from "there was nothing".
