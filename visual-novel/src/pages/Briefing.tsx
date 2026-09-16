import { Link, useNavigate } from "react-router-dom";
import { HubNav } from "../HubNav";
import { STORAGE_SESSION } from "../storage";

export function Briefing() {
  const navigate = useNavigate();

  function begin() {
    if (!localStorage.getItem(STORAGE_SESSION)) {
      localStorage.setItem(STORAGE_SESSION, JSON.stringify({ code: "SOLO", guestName: "Guest" }));
    }
    navigate("/play");
  }

  return (
    <div className="shell briefing-shell">
      <div className="grain" />
      <div className="vignette" />
      <img className="full-art" src="assets/backgrounds/bg-briefing.png" alt="" />
      <header className="studio-head">
        <div>
          <p className="kicker">30 seconds · then the bus</p>
          <h1>Before you sit</h1>
        </div>
        <HubNav />
      </header>
      <div className="brief-grid">
        <article className="glass-card">
          <p className="kicker">What</p>
          <h2>A choice session</h2>
          <p>
            Unmapped Peninsula is a visual novel. You ride one tourist bus on 17.07.2025. The cast is Kane Avis,
            Simon Harrison, Mikari / Tsuji, Adena / Deni, and the weasel familiar Laska. You choose who speaks.
          </p>
        </article>
        <article className="glass-card">
          <p className="kicker">Why</p>
          <h2>A company trip that does not explain itself</h2>
          <p>
            Vacation in a mansion. Some paid; some were delivered. The peninsula is missing from maps, globes, and
            the internet. The company answered none of Mikari’s questions — then played a recording: “see you on
            site.” It is 20:35. Seats are taken in pairs.
          </p>
        </article>
        <article className="glass-card">
          <p className="kicker">What awaits</p>
          <h2>Names, a gate, and what stays open</h2>
          <p>
            Introductions — if anyone organizes them. Arrival. Then Heroes studio and a Suggest room if you want
            to dress the four mains. The company’s name, who paid, Mikari’s 16.05 / 17.05 versus July, and the
            true name of Simon’s unfriendly seatmate stay mysteries.
          </p>
        </article>
      </div>
      <div className="end-row brief-cta">
        <button type="button" className="btn-primary" onClick={begin}>
          Sit down · 20:35
        </button>
        <Link className="btn-ghost" to="/">
          Hub
        </Link>
      </div>
    </div>
  );
}
