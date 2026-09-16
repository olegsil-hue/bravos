import { FormEvent, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LISTS } from "../HubNav";
import { STORAGE_SESSION } from "../storage";

function makeCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 5 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

export function Title() {
  const navigate = useNavigate();
  const [guest, setGuest] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState("");
  const previewCode = useMemo(() => makeCode(), []);

  function persist(code: string, name: string) {
    localStorage.setItem(STORAGE_SESSION, JSON.stringify({ code, guestName: name }));
  }

  function start(e: FormEvent) {
    e.preventDefault();
    persist(previewCode, guest.trim() || "Guest");
    navigate("/play");
  }

  function join(e: FormEvent) {
    e.preventDefault();
    if (joinCode.trim().length < 4) {
      setError("Need a session code (4+ characters). Host one if you do not have one.");
      return;
    }
    setError("");
    persist(joinCode.trim().toUpperCase(), guest.trim() || "Guest");
    navigate("/play");
  }

  return (
    <div className="shell title-shell">
      <div className="grain" />
      <div className="vignette" />
      <img className="full-art" src="assets/ui/ui-title-card.png" alt="" />
      <header className="title-top">
        <p className="kicker">Online catalog · 17.07.2025 · 20:35</p>
        <h1>Unmapped Peninsula</h1>
        <p className="lede">
          Published lists for the opening session. Kane Avis, Simon Harrison, Mikari / Tsuji, Adena / Deni, and Laska.
          No other mains.
        </p>
      </header>

      <section className="catalog" aria-label="Published lists">
        <img className="catalog-art" src="assets/ui/ui-catalog.png" alt="" />
        <h2>Lists</h2>
        <ol className="catalog-list">
          {LISTS.map((l, i) => (
            <li key={l.to}>
              <Link to={l.to}>
                <span className="idx">{String(i + 1).padStart(2, "0")}</span>
                <span>
                  <strong>{l.name}</strong>
                  <em>{l.blurb}</em>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <div className="title-panels">
        <form className="glass-card" onSubmit={start}>
          <h2>Host a play session</h2>
          <p className="muted">Local online table: a code, a guest name, a chat log of choices.</p>
          <label>
            Display name
            <input value={guest} onChange={(e) => setGuest(e.target.value)} placeholder="Your name at the table" />
          </label>
          <p className="code-line">
            Session <span>{previewCode}</span>
          </p>
          <button type="submit" className="btn-primary">
            Open Gameplay
          </button>
        </form>
        <form className="glass-card" onSubmit={join}>
          <h2>Join</h2>
          <p className="muted">Enter a hosted code to sit the same opening.</p>
          <label>
            Session code
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="e.g. 7K2NQ"
              aria-invalid={Boolean(error)}
            />
          </label>
          {error ? <p className="error">{error}</p> : null}
          <button type="submit" className="btn-ghost">
            Sit down
          </button>
        </form>
      </div>
    </div>
  );
}
