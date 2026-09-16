import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { loadStudio, portraitSrc, STORAGE_SESSION } from "../storage";
import { beatById } from "../story";
import type { Beat, Flags, HeroId, Session } from "../types";

const EMPTY_FLAGS: Flags = { organizer: null, attention: null, arrival: null };

type LogLine = { id: string; who: string; text: string; choice?: boolean };

function speakerLabel(beat: Beat, studio: ReturnType<typeof loadStudio>) {
  if (!beat.speaker || beat.speaker === "narrator") return "Session";
  return studio[beat.speaker].displayName;
}

export function Play() {
  const studio = useMemo(() => loadStudio(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [beatId, setBeatId] = useState("open");
  const [flags, setFlags] = useState<Flags>(EMPTY_FLAGS);
  const [log, setLog] = useState<LogLine[]>([]);
  const [missing, setMissing] = useState("");
  const logRef = useRef<HTMLDivElement>(null);
  const beat = beatById(beatId);

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
      setMissing(`Unknown beat “${beatId}”. Return to the title and restart.`);
      return;
    }
    setMissing("");
    setLog((prev) => {
      if (prev.some((l) => l.id === beat.id && !l.choice)) return prev;
      return [
        ...prev,
        {
          id: beat.id,
          who: speakerLabel(beat, studio),
          text: beat.text,
        },
      ];
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
          {
            id: `choice-${next}-${prev.length}`,
            who: session?.guestName ?? "You",
            text: choiceLabel,
            choice: true,
          },
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
        <Link to="/">Title</Link>
      </div>
    );
  }

  const expr = beat.expression ?? (beat.sprite ? studio[beat.sprite].expression : "neutral");
  const spriteId = beat.sprite as HeroId | undefined;
  const tint = spriteId ? studio[spriteId].color : "#d4af77";
  const hairShift =
    spriteId && studio[spriteId].hair === "darker"
      ? 0.82
      : spriteId && studio[spriteId].hair === "lighter"
        ? 1.18
        : spriteId && studio[spriteId].hair === "dusk"
          ? 0.92
          : 1;

  return (
    <div className="shell play-shell">
      <div className="grain" />
      <div className="vignette" />
      <img className="full-art" src={beat.bg} alt="" />
      <img className="frame-art" src="assets/ui/ui-chat-frame.png" alt="" />
      {spriteId ? (
        <div
          className={`sprite ${studio[spriteId].outfit}`}
          style={{ ["--tint" as string]: tint, filter: `brightness(${hairShift})` }}
        >
          <img src={portraitSrc(spriteId, expr, "full")} alt={studio[spriteId].displayName} />
        </div>
      ) : null}

      <header className="play-hud">
        <div>
          <p className="kicker">Live session {session?.code ?? "…"}</p>
          <strong>{session?.guestName ?? "Guest"}</strong>
        </div>
        <div className="hud-links">
          <Link to="/">Leave</Link>
          <Link to="/studio">Studio</Link>
        </div>
      </header>

      <aside className="flags" aria-label="Choice log">
        <p>Organizer: {flags.organizer ?? "—"}</p>
        <p>Attention: {flags.attention ?? "—"}</p>
        <p>Arrival: {flags.arrival ?? "—"}</p>
      </aside>

      <div className="dialogue">
        <div className="portrait-slot">
          {spriteId ? (
            <img
              src={portraitSrc(spriteId, expr)}
              alt=""
              style={{ borderColor: tint }}
            />
          ) : (
            <img src="assets/ui/ui-chat-bubble.png" alt="" />
          )}
        </div>
        <div className="chat">
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
                Title
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
    </div>
  );
}
