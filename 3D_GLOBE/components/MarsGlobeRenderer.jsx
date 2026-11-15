import MarsGlobe from "./MarsGlobe";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useState } from "react";
import { FaPlayCircle, FaPauseCircle  } from "react-icons/fa";
import LocationInfo from "./tooltipLocation/LocationInfo";

export default function MarsGlobeRenderer() {
  const [selectedLocation, setSelectdLocation] = useState(null);
  const [isRotating, setIsRotating] = useState(true);

  return (
    <div style={{ width: "100%", height: "85vh", position: "relative" }}>
      <Canvas>
        <ambientLight intensity={1.5} />
        <OrbitControls minDistance={2} maxDistance={4} enablePan={false} />
        <MarsGlobe onStopRotation={()=>setIsRotating(false)} isRotating={isRotating} onSelectedLocation={setSelectdLocation} />
      </Canvas>



      <button onClick={()=> setIsRotating((prev)=> !prev)} className="rotacionar">
        {isRotating ? <FaPauseCircle /> : <FaPlayCircle />}
      </button>
      {selectedLocation && <LocationInfo location={selectedLocation} />}
    </div>
  );
}
