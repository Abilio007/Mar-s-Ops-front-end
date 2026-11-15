export function formatDistance(distanceKm, unit = 'km') {
  const num = Number(distanceKm) || 0;
  if (unit === 'mi') {
    const miles = num * 0.621371;
    return `${miles.toLocaleString('pt-PT', { maximumFractionDigits: 1 })} mi`;
  }
  return `${num.toLocaleString('pt-PT', { maximumFractionDigits: 1 })} km`;
}

export function formatSpeed(speedKmH, unit = 'km') {
  const num = Number(speedKmH) || 0;
  if (unit === 'mi') {
    const mph = num * 0.621371;
    return `${mph.toLocaleString('pt-PT', { maximumFractionDigits: 0 })} mph`;
  }
  return `${num.toLocaleString('pt-PT', { maximumFractionDigits: 0 })} km/h`;
}

export function formatTemperature(celsius, unit = 'C') {
  const c = Number(celsius);
  if (Number.isNaN(c)) return '--';
  if (unit === 'K') {
    return `${(c + 273.15).toFixed(1)} K`;
  }
  if (unit === 'F') {
    return `${((c * 9) / 5 + 32).toFixed(1)} °F`;
  }
  return `${c.toFixed(0)} °C`;
}

export function formatCoordinates(lat, lon) {
  const latStr = `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'N' : 'S'}`;
  const lonStr = `${Math.abs(lon).toFixed(2)}° ${lon >= 0 ? 'E' : 'O'}`;
  return `${latStr} · ${lonStr}`;
}

export function formatDate(isoDate, locale = 'pt-PT') {
  if (!isoDate) return '--';
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return date.toLocaleDateString(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatTimestamp(isoString, locale = 'pt-PT') {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getRiskLabel(risk) {
  const map = {
    baixo: 'Risco Baixo',
    moderado: 'Risco Moderado',
    elevado: 'Risco Elevado',
    critico: 'Risco Crítico',
  };
  return map[risk] || risk;
}

export function getStatusLabel(status) {
  const map = {
    planned: 'Planeada',
    active: 'Em Andamento',
    completed: 'Concluída',
  };
  return map[status] || status;
}
