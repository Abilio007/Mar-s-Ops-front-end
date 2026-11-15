export default function latLonToMap(latitute, longitude){
    if(longitude > 180){
        longitude -= 360;
    }
    const x = longitude * (1024 / 180);
    const y = latitute * (512 / 90);

    return [y, x]
}
