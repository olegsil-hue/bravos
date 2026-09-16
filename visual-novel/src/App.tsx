import { Navigate, Route, Routes } from "react-router-dom";
import { Briefing } from "./pages/Briefing";
import { Guide } from "./pages/Guide";
import { Play } from "./pages/Play";
import { Studio } from "./pages/Studio";
import { Title } from "./pages/Title";
import { Upgrade } from "./pages/Upgrade";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Title />} />
      <Route path="/briefing" element={<Briefing />} />
      <Route path="/play" element={<Play />} />
      <Route path="/gameplay" element={<Play />} />
      <Route path="/studio" element={<Studio />} />
      <Route path="/upgrade" element={<Upgrade />} />
      <Route path="/guide" element={<Guide />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
