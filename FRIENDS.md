# Friends, groups and plans

Sign in, add friends with a code, see who is free right now, find the best shared
free time for a group, and plan something everyone can say yes or no to.
The timetable itself still works for everyone without an account.

## How it works

**Everything is derived from timetables and the clock.** A person's week is a
25-bit mask (5 days x 5 lectures). Whether someone is in class, free or done is
a pure function of that mask and the time (`src/lib/social/engine.ts`), so the
server never tracks "live" status. It only sends each viewer the slice of a
timetable they are allowed to see.

| Piece | What it does |
|---|---|
| Profile | Signed-in person + batch + optional skipped/added classes. Gets a friend code (`K7M-2QX`). |
| Friends | Request by code or invite link (`/add/K7M2QX`). Nothing is shared until the other person accepts. |
| Privacy | Per friend and per group: **Full** (classes), **Free slots** (busy/free only) or **Nothing**. Default is Free slots. |
| Now | Free now / in class / not started / done, per friend, with how long they're free. A per-friend switch hides someone from your list (your view only). |
| Groups | 3 to 10 people. Ranked shared free times; "most of the group" fallback names who has class. |
| Plans | Pick a friend or group and Study / Gossip / Game. The app proposes up to 3 times; everyone accepts or declines; decliners can suggest another time. |
| Suggestions | Opt-in only. Name, batch and number of shared classes, never anything live. |

### Privacy rules (enforced on the server, not in the UI)
- `core.server.ts` `loadVisibility()` decides the level for every viewer/owner pair
  and `sharedWeek()` builds the response from it. Fields above the level are never sent.
- Non-friends and blocked people always resolve to **Nothing**.
- In a group, the stricter of the group setting and an explicit setting for that
  friend wins.
- Invited (not yet joined) people receive no member data. Only joined members count
  in calculations.
- A declined friend request still looks "waiting" to the requester, and that person
  stops being suggested. Blocking looks like "no such code".
- Every server function runs behind `authMiddleware`; the caller's id always comes
  from the verified session.

## Where things live

```
migrations/0001_auth.sql, 0002_social.sql   schema (auth copied up, then social tables)
src/lib/social/engine.ts          pure: levels, presence, ranked windows, campus dates
src/lib/social/meetup-status.ts   pure: proposed / confirmed / needs_change / ...
src/lib/social/*.server.ts         database + privacy + business rules
src/lib/social/api.ts             server functions (one round trip: getSocialState)
src/components/social/            Friends screens (Now, People, Groups, Plans, Me)
src/routes/login.tsx, add.$code.tsx   sign in / sign up, invite link
```

`src/lib/social/slots.ts` is the single definition of days and lecture times;
`schedule.ts` re-exports it.

## Running and testing

- `npm test` includes `src/lib/social/engine.test.ts` (21 tests).
- Email + password sign-in is switched on (`src/lib/auth/email-password.ts`), alongside
  Google and X. There is no password reset or email verification yet.
- Campus time is Pakistan Standard Time (UTC+5, no DST) for meetup dates.

## Known limits
- "Free" means free in the timetable, not necessarily on campus. The "I'm not on
  campus today" switch covers the gap.
- Updates arrive by refreshing every 45 seconds, when the tab becomes visible, and
  after every change you make. There are no push notifications yet.
- Make-up classes are not in the published timetable, so they are not counted.
- Suggestions look at the 500 most recent opted-in profiles.
