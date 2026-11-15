import styles from "./locationInfo.module.css";
import { FaInfo, FaSearchLocation, FaExclamationTriangle} from "react-icons/fa";

export default function LocationInfo({ location }) {

  return (
      <div className={styles.tooltip_container}>
          {/*<p onClick={Close()} style={{fontWeight: "bold", color: "red", cursor: "pointer"}}>X</p>*/}
        <h2>
          <span>
            <FaSearchLocation />
          </span>
          &nbsp;{location.name}
        </h2>
        <hr></hr>
        <p>
          <span>
            <FaInfo />
            &nbsp;
            <i>DETAILS:</i>
          </span>
          &nbsp;{location.description}
        </p>

        <p>
          <span>
            <FaExclamationTriangle />
            &nbsp;
            <i>RISK LEVEL:</i>
          </span>
          &nbsp;{location.riskLevel}
        </p>
      </div>
  );
}
