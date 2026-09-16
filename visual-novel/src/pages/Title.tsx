import { FormEvent, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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
    localStorage.setItem(
      STORAGE_SESSION,
      JSON.stringify({ code, guestName: name })
    );
  }

  function start(e: FormEvent) {
    e.preventDefault();
    const name = guest.trim() || "Guest";
    persist(previewCode, name);
    navigate("/play");
  }

  function join(e: FormEvent) {
    e.preventDefault();
    if (joinCode.trim().length < 4) {
      setError("Need a session code (4+ characters). Host one above if you do not have one.");
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
        <p className="kicker">Online session · 17.07.2025 · 20:35</p>
        <h1>Unmapped Peninsula</h1>
        <p className="lede">
          A company vacation bus on a peninsula that is not on any map. Four passengers — Kane Avis,
          Simon Harrison, Mikari / Tsuji, Adena / Deni — and the weasel familiar Laska. Sit in pairs.
          Choose who speaks before the mansion.
        </p>
      </header>
      <div className="title-panels">
        <form className="glass-card" onSubmit={start}>
          <h2>Host a play session</h2>
          <p className="muted">Local “online” table: a code, a guest name, a chat log of choices. No server required.</p>
          <label>
            Display name
            <input value={guest} onChange={(e) => setGuest(e.target.value)} placeholder="Your name at the table" />
          </label>
          <p className="code-line">
            Session <span>{previewCode}</span>
          </p>
          <button type="submit" className="btn-primary">
            Start the bus
          </button>
        </form>
        <form className="glass-card" onSubmit={join}>
          <h2>Join</h2>
          <p className="muted">Enter a hosted code to sit the same opening. Story still runs in this browser.</p>
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
      <nav className="title-nav">
        <Link to="/studio">Hero studio</Link>
        <span className="dot" />
        <a href="#cast">Cast</a>
      </nav>
      <section id="cast" className="cast-row">
        {[
          ["kane", "Kane Avis"],
          ["simon", "Simon Harrison"],
          ["mikari", "Mikari / Tsuji"],
          ["adena", "Adena / Deni"],
          ["laska", "Laska"],
        ].map(([id, name]) => (
          <figure key={id}>
            <img src={`assets/characters/${id}-bust.png`} alt={name} />
            <figcaption>{name}</figcaption>
          </figure>
        ))}
      </section>
    </div>
  );
}
