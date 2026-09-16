import { Link } from "react-router-dom";

const LISTS = [
  { to: "/briefing", name: "Gameplay", blurb: "Briefing, then the bus — choices, voices, arrival." },
  { to: "/studio", name: "Heroes studio", blurb: "Design list: four mains + Laska." },
  { to: "/upgrade", name: "Suggest room", blurb: "Proposed upgrades — stats, perks, cosmetics." },
  { to: "/guide", name: "Game process", blurb: "How a session is played, as a readable list." },
];

export function HubNav() {
  return (
    <nav className="hub-nav" aria-label="Published lists">
      {LISTS.map((l) => (
        <Link key={l.to} to={l.to} className="hub-chip">
          {l.name}
        </Link>
      ))}
    </nav>
  );
}

export { LISTS };
