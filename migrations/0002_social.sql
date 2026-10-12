-- Friends, groups, privacy and meetups.
--
-- Every user_id column is TEXT: Better Auth ids are text, and so is the preview
-- dev user. Nothing here references the auth tables, so the schema works the
-- same in the PGLite preview and on Neon.

-- One row per signed-in person who has set up their timetable.
create table if not exists profiles (
  user_id        text primary key,
  display_name   text not null,
  batch_id       integer not null,
  friend_code    text not null unique,
  -- Opt in to friend suggestions. Off until the person turns it on.
  discoverable   boolean not null default false,
  -- What a new friend can see until the owner picks something per friend.
  default_share  text not null default 'free' check (default_share in ('none', 'free', 'full')),
  -- Personal changes to the batch timetable, as "day.slot.batch.subject" keys.
  dropped        jsonb not null default '[]'::jsonb,
  added          jsonb not null default '[]'::jsonb,
  -- "I'm not on campus" for one calendar day (YYYY-MM-DD, campus time).
  away_date      text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists friendships (
  id            serial primary key,
  requester_id  text not null,
  addressee_id  text not null,
  -- A declined request stays on file so the person is never nudged again, but
  -- the requester still sees it as pending: nobody is told they were ignored.
  status        text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at    timestamptz not null default now(),
  responded_at  timestamptz,
  unique (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);
create index if not exists friendships_addressee_idx on friendships (addressee_id);
create index if not exists friendships_requester_idx on friendships (requester_id);

create table if not exists blocks (
  blocker_id  text not null,
  blocked_id  text not null,
  created_at  timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);

create table if not exists reports (
  id           serial primary key,
  reporter_id  text not null,
  reported_id  text not null,
  reason       text not null default '',
  created_at   timestamptz not null default now()
);

-- What `owner_id` lets someone see: per friend (target_id = the friend's user id)
-- or per group (target_id = the group id). Missing row = the owner's default.
create table if not exists share_settings (
  owner_id   text not null,
  kind       text not null check (kind in ('friend', 'group')),
  target_id  text not null,
  level      text not null check (level in ('none', 'free', 'full')),
  primary key (owner_id, kind, target_id)
);

-- A viewer-side preference: stop showing this friend's live status to me.
create table if not exists friend_prefs (
  user_id      text not null,
  friend_id    text not null,
  hide_status  boolean not null default false,
  primary key (user_id, friend_id)
);

create table if not exists groups (
  id          text primary key,
  name        text not null,
  emoji       text not null default '',
  owner_id    text not null,
  created_at  timestamptz not null default now()
);

create table if not exists group_members (
  group_id    text not null references groups (id) on delete cascade,
  user_id     text not null,
  -- Only joined members count in any calculation; invited people see nothing yet.
  status      text not null check (status in ('invited', 'joined')),
  invited_by  text not null,
  created_at  timestamptz not null default now(),
  joined_at   timestamptz,
  primary key (group_id, user_id)
);
create index if not exists group_members_user_idx on group_members (user_id);

create table if not exists meetups (
  id             text primary key,
  creator_id     text not null,
  activity       text not null check (activity in ('study', 'gossip', 'game')),
  audience_kind  text not null check (audience_kind in ('friend', 'group')),
  audience_id    text not null,
  day            integer not null check (day between 0 and 4),
  start_slot     integer not null check (start_slot between 0 and 4),
  end_slot       integer not null check (end_slot between 0 and 4),
  -- 'gap' = free lectures, 'break' = the lunch break between L3 and L4.
  kind           text not null default 'gap' check (kind in ('gap', 'break')),
  -- The calendar date of the next occurrence, in campus time (YYYY-MM-DD).
  on_date        text not null,
  -- 'all' = everyone invited must accept, 'some' = at least quorum_n people.
  quorum         text not null default 'all' check (quorum in ('all', 'some')),
  quorum_n       integer,
  note           text not null default '',
  status         text not null default 'active' check (status in ('active', 'cancelled')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists meetups_creator_idx on meetups (creator_id);

create table if not exists meetup_participants (
  meetup_id     text not null references meetups (id) on delete cascade,
  user_id       text not null,
  response      text not null default 'pending' check (response in ('pending', 'accepted', 'declined')),
  responded_at  timestamptz,
  primary key (meetup_id, user_id)
);
create index if not exists meetup_participants_user_idx on meetup_participants (user_id);

-- A decliner can suggest another slot; the organiser decides.
create table if not exists meetup_counters (
  meetup_id   text not null references meetups (id) on delete cascade,
  user_id     text not null,
  day         integer not null,
  start_slot  integer not null,
  end_slot    integer not null,
  kind        text not null default 'gap',
  created_at  timestamptz not null default now(),
  primary key (meetup_id, user_id)
);
