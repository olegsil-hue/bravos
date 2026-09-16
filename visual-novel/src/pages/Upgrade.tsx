import { FormEvent, useState } from "react";
import { HubNav } from "../HubNav";
import {
  DEFAULT_NAMES,
  HERO_ORDER,
  PERKS,
  defaultUpgrade,
  loadUpgrade,
  saveUpgrade,
} from "../storage";
import type { HeroId, PerkId, UpgradeState } from "../types";

export function Upgrade() {
  const [state, setState] = useState<UpgradeState>(() => loadUpgrade());
  const [id, setId] = useState<HeroId>("kane");
  const [saved, setSaved] = useState("");
  const hero = state[id];
  const perkOptions = Object.entries(PERKS).filter(([, p]) => p.hero === id) as [PerkId, (typeof PERKS)[PerkId]][];

  function persist(e: FormEvent) {
    e.preventDefault();
    saveUpgrade(state);
    setSaved("Suggestion saved. Gameplay will show equipped perks as chips.");
  }

  return (
    <div className="shell upgrade-shell">
      <div className="grain" />
      <img className="full-art dim" src="assets/upgrade/upgrade-room.png" alt="" />
      <img className="studio-frame" src="assets/upgrade/upgrade-plaques.png" alt="" />
      <header className="studio-head">
        <div>
          <p className="kicker">Suggest room · proposal, not canon</p>
          <h1>Hero upgrade</h1>
          <p className="lede">
            A side parlor in the mansion. You may suggest nerve, fatigue, and one perk for the four mains and Laska.
            Nothing here invents a new protagonist. Saved to this browser.
          </p>
        </div>
        <HubNav />
      </header>

      <div className="upgrade-grid">
        <ol className="hero-list">
          {HERO_ORDER.map((h) => (
            <li key={h}>
              <button type="button" className={h === id ? "on" : ""} onClick={() => setId(h)}>
                <img src={`assets/characters/${h}-bust.png`} alt="" />
                <span>
                  <strong>{DEFAULT_NAMES[h]}</strong>
                  <em>{state[h].perk ? PERKS[state[h].perk].label : "No perk suggested"}</em>
                </span>
                <img className="seal" src="assets/upgrade/upgrade-seal.png" alt="" />
              </button>
            </li>
          ))}
        </ol>

        <form className="editor plaque" onSubmit={persist}>
          <h2>{DEFAULT_NAMES[id]}</h2>
          <label>
            Nerve (crowd pressure)
            <input
              type="range"
              min={0}
              max={5}
              value={hero.nerve}
              onChange={(e) => setState((s) => ({ ...s, [id]: { ...s[id], nerve: Number(e.target.value) } }))}
            />
            <span>{hero.nerve}</span>
          </label>
          <label>
            Fatigue
            <input
              type="range"
              min={0}
              max={5}
              value={hero.fatigue}
              onChange={(e) => setState((s) => ({ ...s, [id]: { ...s[id], fatigue: Number(e.target.value) } }))}
            />
            <span>{hero.fatigue}</span>
          </label>
          <fieldset>
            <legend>Suggested perk</legend>
            <label className="chip">
              <input
                type="radio"
                name="perk"
                checked={hero.perk === null}
                onChange={() => setState((s) => ({ ...s, [id]: { ...s[id], perk: null } }))}
              />
              None
            </label>
            {perkOptions.map(([pid, p]) => (
              <label key={pid} className="chip">
                <input
                  type="radio"
                  name="perk"
                  checked={hero.perk === pid}
                  onChange={() => setState((s) => ({ ...s, [id]: { ...s[id], perk: pid } }))}
                />
                {p.label} — {p.blurb}
              </label>
            ))}
          </fieldset>
          {saved ? <p className="ok">{saved}</p> : null}
          <div className="end-row">
            <button type="submit" className="btn-primary">
              Keep suggestion
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                const next = defaultUpgrade();
                setState(next);
                saveUpgrade(next);
                setSaved("Suggestions cleared.");
              }}
            >
              Clear room
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
