import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  defaultStudio,
  loadStudio,
  portraitSrc,
  saveStudio,
} from "../storage";
import type { Expression, HairId, HeroId, OutfitId, StudioState } from "../types";

const HEROES: HeroId[] = ["kane", "simon", "mikari", "adena", "laska"];
const EXPRESSIONS: Expression[] = ["neutral", "tired", "annoyed", "smile"];
const OUTFITS: { id: OutfitId; label: string }[] = [
  { id: "jacket", label: "Charcoal jacket" },
  { id: "knit", label: "Travel knit" },
  { id: "hoodie", label: "Black hoodie" },
  { id: "travel", label: "Road layer" },
];
const HAIR: { id: HairId; label: string }[] = [
  { id: "canon", label: "Canon" },
  { id: "darker", label: "Dusk darker" },
  { id: "lighter", label: "Lamp lighter" },
  { id: "dusk", label: "Peninsula dusk" },
];

export function Studio() {
  const [state, setState] = useState<StudioState>(() => loadStudio());
  const [id, setId] = useState<HeroId>("adena");
  const [saved, setSaved] = useState("");
  const [err, setErr] = useState("");
  const hero = state[id];
  const layerNote = useMemo(() => {
    const bits: string[] = [hero.outfit, hero.hair, hero.expression];
    if (hero.accessory) bits.push("accessory");
    return bits.join(" · ");
  }, [hero]);

  function patch(partial: Partial<typeof hero>) {
    setState((s) => ({ ...s, [id]: { ...s[id], ...partial } }));
    setSaved("");
  }

  function persist() {
    try {
      if (!hero.displayName.trim()) {
        setErr("A hero still needs a display name.");
        return;
      }
      setErr("");
      saveStudio(state);
      setSaved("Saved to this browser. Play will use these names, colors, and default expressions.");
    } catch {
      setErr("Could not write localStorage.");
    }
  }

  return (
    <div className="shell studio-shell">
      <div className="grain" />
      <img className="full-art dim" src="assets/studio/studio-backdrop.png" alt="" />
      <img className="studio-frame" src="assets/studio/studio-frame.png" alt="" />
      <header className="studio-head">
        <div>
          <p className="kicker">Atelier · not the bus HUD</p>
          <h1>Hero studio</h1>
          <p className="lede">
            Four mains and Laska only. Edits stay in localStorage and tint the playthrough. Canon facts
            are in each bio — including Mikari’s unresolved dates and Simon’s unnamed seatmate.
          </p>
        </div>
        <nav>
          <Link to="/">Title</Link>
          <Link to="/play">Play</Link>
        </nav>
      </header>

      <div className="studio-grid">
        <aside className="hero-rail">
          {HEROES.map((h) => (
            <button
              key={h}
              type="button"
              className={h === id ? "on" : ""}
              onClick={() => setId(h)}
            >
              <img src={`assets/characters/${h}-bust.png`} alt="" />
              <span>{state[h].displayName}</span>
            </button>
          ))}
        </aside>

        <section className="preview">
          <div className="preview-stage" style={{ ["--tint" as string]: hero.color }}>
            <img
              className="preview-hero"
              src={portraitSrc(id, hero.expression, "full")}
              alt={hero.displayName}
              style={{
                filter: `brightness(${hero.hair === "darker" ? 0.82 : hero.hair === "lighter" ? 1.2 : 1}) saturate(${hero.hair === "dusk" ? 1.15 : 1})`,
              }}
            />
            {id === "adena" && hero.accessory ? (
              <img className="laska-pin" src="assets/characters/laska-sleep.png" alt="Laska" />
            ) : null}
          </div>
          <p className="layer-note">{layerNote}</p>
        </section>

        <form
          className="editor"
          onSubmit={(e) => {
            e.preventDefault();
            persist();
          }}
        >
          <label>
            Display name
            <input value={hero.displayName} onChange={(e) => patch({ displayName: e.target.value })} />
          </label>
          <label>
            Color
            <input type="color" value={hero.color} onChange={(e) => patch({ color: e.target.value })} />
          </label>
          <fieldset>
            <legend>Outfit layer</legend>
            {OUTFITS.map((o) => (
              <label key={o.id} className="chip">
                <input
                  type="radio"
                  name="outfit"
                  checked={hero.outfit === o.id}
                  onChange={() => patch({ outfit: o.id })}
                />
                {o.label}
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>Hair grade</legend>
            {HAIR.map((h) => (
              <label key={h.id} className="chip">
                <input
                  type="radio"
                  name="hair"
                  checked={hero.hair === h.id}
                  onChange={() => patch({ hair: h.id })}
                />
                {h.label}
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>Expression</legend>
            {id === "laska" ? (
              <p className="muted">Laska keeps the sleepy familiar face from the posts.</p>
            ) : (
              EXPRESSIONS.map((ex) => (
                <label key={ex} className="chip">
                  <input
                    type="radio"
                    name="expr"
                    checked={hero.expression === ex}
                    onChange={() => patch({ expression: ex })}
                  />
                  {ex}
                </label>
              ))
            )}
          </fieldset>
          <label className="chip">
            <input
              type="checkbox"
              checked={hero.accessory}
              onChange={(e) => patch({ accessory: e.target.checked })}
            />
            Signature accessory (glasses, headphones, Laska, book)
          </label>
          <label>
            Short bio
            <textarea value={hero.bio} onChange={(e) => patch({ bio: e.target.value })} rows={5} />
          </label>
          {err ? <p className="error">{err}</p> : null}
          {saved ? <p className="ok">{saved}</p> : null}
          <div className="end-row">
            <button type="submit" className="btn-primary">
              Save for play
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                const next = defaultStudio();
                setState(next);
                saveStudio(next);
                setSaved("Canon defaults restored.");
              }}
            >
              Reset canon
            </button>
          </div>
        </form>
      </div>

      <section className="studio-refs">
        <figure>
          <img src="assets/studio/studio-wardrobe.png" alt="Wardrobe reference" />
          <figcaption>Wardrobe</figcaption>
        </figure>
        <figure>
          <img src="assets/studio/studio-hair.png" alt="Hair reference" />
          <figcaption>Hair</figcaption>
        </figure>
        <figure>
          <img src="assets/studio/studio-eyes.png" alt="Eyes reference" />
          <figcaption>Eyes</figcaption>
        </figure>
        <figure>
          <img src="assets/studio/studio-accessories.png" alt="Accessories" />
          <figcaption>Accessories</figcaption>
        </figure>
        <figure>
          <img src="assets/studio/studio-swatches.png" alt="Color swatches" />
          <figcaption>Swatches</figcaption>
        </figure>
      </section>
    </div>
  );
}
