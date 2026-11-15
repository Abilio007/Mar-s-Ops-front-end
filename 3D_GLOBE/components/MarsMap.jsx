import { MapContainer, ImageOverlay, Marker, Popup } from "react-leaflet";
import Leaflet from "leaflet"
import locations from "../data/location";
import latLonToMap from "./functions/latLonToMAp";
import { FaMapLocationDot, FaExclamation, FaTriangleExclamation } from "react-icons/fa6";

export default function MarsMap() {
  const bounds = [
    [-512, -1024],
    [512, 1024],
  ];

  return (
    <MapContainer
      crs={Leaflet.CRS.Simple}
      center={[0, 0]}
      zoom={-1}
      minZoom={-2}
      maxZoom={2}
      maxBounds={bounds}
      maxBoundsViscosity={1}
      style={{ height: "100vh", width: "100%" }}
    >
      <ImageOverlay url="/textures/2k_mars.jpg" bounds={bounds} />
      {locations.map(location =>(
        <Marker key={location.id} position={latLonToMap(location.latitude, location.longitude)}>
            <Popup>
                <h3 style={{textAlign: "center"}}><FaMapLocationDot />&nbsp;{location.name}</h3>
                <hr />
                <p style={{textAlign: "left", letterSpacing: "2", fontWeight: "bold"}}><FaExclamation />&nbsp;DESCRIPTION: {location.description}</p>
                <p style={{textAlign: "left", letterSpacing: "2", fontWeight: "bold"}}><FaTriangleExclamation />&nbsp;DANGER LEVEL: {location.riskLevel}</p>
            </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
