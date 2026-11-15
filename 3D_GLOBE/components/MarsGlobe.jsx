import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { useTexture } from "@react-three/drei";
import locations from "../data/location";
import latLonToVector3 from "../components/functions/latLonToVector3";

export default function MarsGlobe({ onSelectedLocation, isRotating, onStopRotation }) {
  const marsRef = useRef(null);
  const texture = useTexture("/textures/2k_mars.jpg");

  useFrame((_, delta) => {
    if(isRotating){
      marsRef.current.rotation.y += delta * 0.2;
    }
  });

  return (
    <group ref={marsRef}>
      <mesh>
        <sphereGeometry args={[1, 64, 64]} />
        <meshStandardMaterial map={texture} />
      </mesh>

      {locations.map((location) => (
        <mesh
          key={location.id}
          position={latLonToVector3(
            location.latitude,
            location.longitude,
            1.01,
          )}
          onClick={(event) => {
            event.stopPropagation();
            onSelectedLocation(location);
            onStopRotation()
          }}
        >
          <sphereGeometry args={[0.02, 64, 64]} />
          <meshStandardMaterial
            color={location.color}
            emissive={location.color}
            emissiveIntensity={0.5}
          />
        </mesh>
      ))}
    </group>
  );
}
