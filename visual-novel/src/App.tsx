import { Navigate, Route, Routes } from "react-router-dom";
import { Play } from "./pages/Play";
import { Studio } from "./pages/Studio";
import { Title } from "./pages/Title";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Title />} />
      <Route path="/play" element={<Play />} />
      <Route path="/studio" element={<Studio />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
