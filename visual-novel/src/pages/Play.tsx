import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { HubNav } from "../HubNav";
import { activePerks, loadStudio, loadUpgrade, portraitSrc, STORAGE_SESSION } from "../storage";
import { beatById } from "../story";
import type { Beat, Flags, HeroId, Session } from "../types";

const EMPTY_FLAGS: Flags = { organizer: null, attention: null, arrival: null };

type LogLine = { id: string; who: string; text: string; choice?: boolean };

function speakerLabel(beat: Beat, studio: ReturnType<typeof loadStudio>) {
  if (!beat.speaker || beat.speaker === "narrator") return "Cabin";
  return studio[beat.speaker].displayName;
}

export function Play() {
  const studio = useMemo(() => loadStudio(), []);
  const upgrade = useMemo(() => loadUpgrade(), []);
  const perks = useMemo(() => activePerks(upgrade), [upgrade]);
  const [session, setSession] = useState<Session | null>(null);
  const [beatId, setBeatId] = useState("open");
  const [flags, setFlags] = useState<Flags>(EMPTY_FLAGS);
  const [log, setLog] = useState<LogLine[]>([]);
  const [missing, setMissing] = useState("");
  const logRef = useRef<HTMLDivElement>(null);
  const beat = beatById(beatId);
  const cinematic = beat?.kind === "scene";

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_SESSION);
      if (raw) setSession(JSON.parse(raw) as Session);
      else setSession({ code: "SOLO", guestName: "Guest" });
    } catch {
      setSession({ code: "SOLO", guestName: "Guest" });
    }
  }, []);

  useEffect(() => {
    if (!beat) {
      setMissing(`Unknown beat “${beatId}”. Return to the hub and restart.`);
      return;
    }
    setMissing("");
    if (beat.kind === "scene") return;
    setLog((prev) => {
      if (prev.some((l) => l.id === beat.id && !l.choice)) return prev;
      return [...prev, { id: beat.id, who: speakerLabel(beat, studio), text: beat.text }];
    });
  }, [beat, beatId, studio]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [log]);

  const go = useCallback(
    (next: string, choiceLabel?: string, set?: Partial<Flags>) => {
      if (choiceLabel) {
        setLog((prev) => [
          ...prev,
          { id: `choice-${next}-${prev.length}`, who: session?.guestName ?? "You", text: choiceLabel, choice: true },
        ]);
      }
      if (set) setFlags((f) => ({ ...f, ...set }));
      setBeatId(next);
    },
    [session]
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!beat) return;
      if (e.key === "Enter" && beat.next && !beat.choices) {
        e.preventDefault();
        go(beat.next);
      }
      if (beat.choices) {
        const n = Number(e.key);
        if (n >= 1 && n <= beat.choices.length) {
          const c = beat.choices[n - 1];
          go(c.next, c.label, c.set);
        }
      }
      if (e.key === "Escape") window.location.hash = "#/";
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [beat, go]);

  if (!beat) {
    return (
      <div className="shell error-shell">
        <p className="error">{missing}</p>
        <Link to="/">Hub</Link>
      </div>
    );
  }

  const onScreen: HeroId[] = beat.sprites ?? (beat.sprite ? [beat.sprite] : []);
  const lead = beat.sprite ?? onScreen[0];
  const expr = beat.expression ?? (lead ? studio[lead].expression : "neutral");
  const perkForLead = lead ? perks.find((p) => p.hero === lead) : undefined;

  return (
    <div className="shell play-shell">
      <div className="grain" />
      <div className="vignette" />
      <img className="full-art" src={beat.bg} alt="" />
      <img className="frame-art" src="assets/ui/ui-chat-frame.png" alt="" />
      <div className="sprite-row">
        {onScreen.map((id, i) => (
          <div
            key={`${id}-${i}`}
            className={`sprite ${studio[id].outfit} ${i === 0 ? "lead" : "support"}`}
            style={{
              ["--tint" as string]: studio[id].color,
              filter: `brightness(${studio[id].hair === "darker" ? 0.82 : studio[id].hair === "lighter" ? 1.18 : 1})`,
            }}
          >
            <img src={portraitSrc(id, id === lead ? expr : studio[id].expression, "full")} alt={studio[id].displayName} />
          </div>
        ))}
      </div>

      <header className="play-hud">
        <div>
          <p className="kicker">Gameplay list · session {session?.code ?? "…"}</p>
          <strong>{session?.guestName ?? "Guest"}</strong>
        </div>
        <HubNav />
      </header>

      <aside className="flags" aria-label="Choice log">
        <p>Organizer: {flags.organizer ?? "—"}</p>
        <p>Attention: {flags.attention ?? "—"}</p>
        <p>Arrival: {flags.arrival ?? "—"}</p>
        {perks.length ? (
          <p className="perk-line">Suggested: {perks.map((p) => p.label).join(" · ")}</p>
        ) : (
          <p className="muted">No suggested perks yet.</p>
        )}
      </aside>

      {cinematic ? (
        <div className="scene-card">
          {beat.title ? <h2>{beat.title}</h2> : null}
          <p>{beat.text}</p>
          {perkForLead ? <p className="perk-line">{perkForLead.label}</p> : null}
          {beat.next ? (
            <button type="button" className="continue" onClick={() => go(beat.next!)}>
              Continue · Enter
            </button>
          ) : (
            <div className="end-row">
              <Link className="btn-primary" to="/">
                Hub
              </Link>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  setBeatId("open");
                  setFlags(EMPTY_FLAGS);
                  setLog([]);
                }}
              >
                Replay
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="dialogue">
          <div className="portrait-slot">
            {lead ? (
              <img src={portraitSrc(lead, expr)} alt="" style={{ borderColor: studio[lead].color }} />
            ) : (
              <img src="assets/ui/ui-chat-bubble.png" alt="" />
            )}
          </div>
          <div className="chat">
            {beat.title ? <p className="kicker">{beat.title}</p> : null}
            <div className="chat-log" ref={logRef}>
              {log.length === 0 ? (
                <p className="muted">The cabin is quiet. Waiting for the first line…</p>
              ) : (
                log.map((line) => (
                  <article key={line.id} className={line.choice ? "bubble choice-echo" : "bubble"}>
                    <header>{line.who}</header>
                    <p>{line.text}</p>
                  </article>
                ))
              )}
            </div>
            {beat.choices ? (
              <div className="choices" style={{ backgroundImage: "url(assets/ui/ui-choice-buttons.png)" }}>
                {beat.choices.map((c, i) => (
                  <button key={c.id} type="button" onClick={() => go(c.next, c.label, c.set)}>
                    <span>{i + 1}</span>
                    {c.label}
                  </button>
                ))}
              </div>
            ) : beat.next ? (
              <button type="button" className="continue" onClick={() => go(beat.next!)}>
                Continue · Enter
              </button>
            ) : (
              <div className="end-row">
                <Link className="btn-primary" to="/">
                  Hub
                </Link>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => {
                    setBeatId("open");
                    setFlags(EMPTY_FLAGS);
                    setLog([]);
                  }}
                >
                  Replay
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
