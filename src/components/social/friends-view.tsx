import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { Segment } from "@/components/timetable/chrome";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { GroupsTab } from "@/components/social/groups-tab";
import { MeTab } from "@/components/social/me-tab";
import { NowTab } from "@/components/social/now-tab";
import { Onboarding } from "@/components/social/onboarding";
import { PeopleTab } from "@/components/social/people-tab";
import { PlansTab } from "@/components/social/plans-tab";
import { useSocial, type SocialTab } from "@/components/social/provider";
import { Toast } from "@/components/social/ui";

function Hero({ lede }: { lede: string }) {
  return (
    <section className="hero">
      <p className="kicker">
        <i className="pip" aria-hidden />
        Friends
      </p>
      <h1 className="display">Find time together</h1>
      <p className="lede">{lede}</p>
    </section>
  );
}

function Skeleton() {
  return (
    <div className="page" aria-busy="true">
      <div className="skeleton tall" />
      <div className="skeleton" />
      <div className="skeleton" />
    </div>
  );
}

export function FriendsView() {
  const { user, isPending } = useCurrentUserState();
  const { phase, state, loadError, refresh } = useSocial();

  if (isPending || phase === "loading") return <Skeleton />;

  if (!user || phase === "signed_out") {
    return (
      <div className="page">
        <Hero lede="Add friends with a code, see who is free right now, and plan when your whole group can meet." />
        <section className="panel stack">
          <h2>Sign in to get started</h2>
          <p className="quiet">
            The timetable works for everyone without an account. Friends and groups need one so only the people
            you approve can see when you are free.
          </p>
          <Link to="/login" search={{ next: "/" }} className="btn solid tap">
            Sign in or create an account
          </Link>
        </section>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="page">
        <Hero lede="Add friends with a code, see who is free right now, and plan when your whole group can meet." />
        <section className="panel stack">
          <h2>We couldn&apos;t load your friends</h2>
          <p className="quiet">{loadError ?? "Something went wrong."}</p>
          <button type="button" className="btn solid tap" onClick={() => void refresh()}>
            Try again
          </button>
        </section>
      </div>
    );
  }

  if (!state.profile) return <Onboarding />;
  return <Hub />;
}

function Hub() {
  const { state, tab, setTab, loadError } = useSocial();

  const counts = useMemo(() => {
    if (!state) return { people: 0, groups: 0, plans: 0 };
    return {
      people: state.incoming.length,
      groups: state.groups.filter((g) => g.myStatus === "invited").length,
      plans: state.meetups.filter(
        (m) =>
          !m.iAmCreator &&
          m.phase !== "past" &&
          (m.status === "proposed" || m.status === "needs_change") &&
          m.participants.some((p) => p.isMe && p.response === "pending"),
      ).length,
    };
  }, [state]);

  const tabLabel = (text: string, count: number) => (
    <>
      {text}
      {count > 0 ? <b className="tab-badge">{count}</b> : null}
    </>
  );

  return (
    <div className="page">
      <Hero lede="Who is free right now, and when your friends and groups can all meet." />
      <Segment
        label="Friends sections"
        value={tab}
        options={[
          { value: "now", label: "Now" },
          { value: "people", label: tabLabel("People", counts.people) },
          { value: "groups", label: tabLabel("Groups", counts.groups) },
          { value: "plans", label: tabLabel("Plans", counts.plans) },
          { value: "me", label: "Me" },
        ]}
        onChange={(value) => setTab(value as SocialTab)}
      />
      {loadError ? (
        <p className="form-error" role="status">
          Couldn&apos;t refresh just now, so this may be out of date. {loadError}
        </p>
      ) : null}
      {tab === "now" ? <NowTab /> : null}
      {tab === "people" ? <PeopleTab /> : null}
      {tab === "groups" ? <GroupsTab /> : null}
      {tab === "plans" ? <PlansTab /> : null}
      {tab === "me" ? <MeTab /> : null}
      <Toast />
    </div>
  );
}
