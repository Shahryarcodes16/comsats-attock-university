import { useEffect, useState } from "react";
import { Link, Navigate, createFileRoute, useNavigate } from "@tanstack/react-router";
import { UserPlus } from "lucide-react";
import { DeskProvider, useDesk } from "@/components/timetable/context";
import { Brand } from "@/components/timetable/chrome";
import { Onboarding } from "@/components/social/onboarding";
import { SocialProvider, messageOf, useSocial } from "@/components/social/provider";
import { Avatar, Toast } from "@/components/social/ui";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { batches } from "@/lib/schedule";
import { lookupCode, requestByCode } from "@/lib/social/api";
import type { CodeLookup } from "@/lib/social/types";

export const Route = createFileRoute("/add/$code")({
  head: () => ({ meta: [{ title: "Add a friend · CUI Attock Timetable" }] }),
  component: AddFriendPage,
});

function AddFriendPage() {
  return (
    <DeskProvider>
      <SocialProvider>
        <div className="app">
          <main className="auth-wrap">
            <div className="auth-card panel">
              <Brand />
              <AddFriend />
            </div>
          </main>
          <Toast />
        </div>
      </SocialProvider>
    </DeskProvider>
  );
}

function AddFriend() {
  const { code } = Route.useParams();
  const { user, isPending } = useCurrentUserState();
  const { phase, state } = useSocial();
  const { setView } = useDesk();
  const navigate = useNavigate();
  const [found, setFound] = useState<CodeLookup | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const hasProfile = Boolean(state?.profile);

  useEffect(() => {
    if (!hasProfile) return;
    let live = true;
    lookupCode({ data: { code } })
      .then((result) => live && setFound(result))
      .catch((error) => live && setProblem(messageOf(error)));
    return () => {
      live = false;
    };
  }, [code, hasProfile]);

  function openFriends() {
    setView("friends");
    window.setTimeout(() => void navigate({ to: "/" }), 60);
  }

  if (isPending || (user && phase === "loading")) return <p className="quiet">One moment…</p>;
  if (!user) return <Navigate to="/login" search={{ next: `/add/${code}` }} />;
  if (!state?.profile) {
    return (
      <div className="stack gap-lg">
        <p className="quiet">Set up your timetable first, then we&apos;ll add your friend.</p>
        <Onboarding />
      </div>
    );
  }

  async function send() {
    setBusy(true);
    try {
      const { outcome } = await requestByCode({ data: { code } });
      setSent(
        outcome === "accepted"
          ? "You're now friends."
          : outcome === "already_friends"
            ? "You're already friends."
            : "Request sent. They'll need to accept it.",
      );
    } catch (error) {
      setProblem(messageOf(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack gap-lg">
      <h1 className="section-title">Add a friend</h1>
      {problem ? <p className="form-error">{problem}</p> : null}
      {!found && !problem ? <p className="quiet">Looking up that code…</p> : null}
      {found && !found.found ? (
        <p className="quiet">We couldn&apos;t find anyone with that code. Ask your friend to check it.</p>
      ) : null}
      {found && found.found ? (
        <div className="lookup-card">
          <Avatar name={found.name} />
          <div className="grow">
            <b>{found.name}</b>
            <span className="sub">{batches[found.batchId]}</span>
          </div>
        </div>
      ) : null}
      {sent ? <p className="quiet">{sent}</p> : null}
      {found && found.found && !sent ? (
        found.isMe ? (
          <p className="quiet">That&apos;s your own code.</p>
        ) : found.relation === "friends" ? (
          <p className="quiet">You&apos;re already friends.</p>
        ) : found.relation === "requested" ? (
          <p className="quiet">You&apos;ve already sent a request. Waiting for them to accept.</p>
        ) : (
          <button type="button" className="btn solid tap" disabled={busy} onClick={() => void send()}>
            <UserPlus size={16} aria-hidden />
            {found.relation === "incoming" ? "Accept request" : "Send friend request"}
          </button>
        )
      ) : null}
      <button type="button" className="btn tap" onClick={openFriends}>
        Open Friends
      </button>
      <Link to="/" className="back-link">
        Back to the timetable
      </Link>
    </div>
  );
}
