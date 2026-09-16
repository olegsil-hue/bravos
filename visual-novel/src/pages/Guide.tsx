import { HubNav } from "../HubNav";
import { PROCESS_SECTIONS } from "../guideContent";

export function Guide() {
  return (
    <div className="shell guide-shell">
      <div className="grain" />
      <img className="full-art dim" src="assets/backgrounds/bg-mansion.png" alt="" />
      <header className="studio-head">
        <div>
          <p className="kicker">Published list · textual description</p>
          <h1>Game process</h1>
          <p className="lede">How the opening session is played. Same text as the project doc game-process.md.</p>
        </div>
        <HubNav />
      </header>
      <div className="guide-list">
        {PROCESS_SECTIONS.map((sec) => (
          <section key={sec.heading} className="glass-card">
            <h2>{sec.heading}</h2>
            <ol>
              {sec.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </div>
  );
}
