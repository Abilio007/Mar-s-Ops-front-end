import "leaflet/dist/leaflet.css";
import "./App.css";
import MarsGlobeRenderer from "./components/MarsGlobeRenderer";
import MarsMap from "./components/MarsMap";
import { Routes, Route } from "react-router-dom";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<MarsGlobeRenderer />} />
      <Route path="/marsmap" element={<MarsMap />} />
    </Routes>
  );
}
