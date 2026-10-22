export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const REGIONS: { name: string; lat: number; lon: number; radius: number }[] = [
  { name: 'EASTERN EUROPE / UKRAINE THEATER', lat: 48, lon: 35, radius: 8 },
  { name: 'MIDDLE EAST / PERSIAN GULF', lat: 28, lon: 50, radius: 12 },
  { name: 'EASTERN MEDITERRANEAN', lat: 33, lon: 35, radius: 6 },
  { name: 'HORN OF AFRICA', lat: 8, lon: 45, radius: 10 },
  { name: 'SAHEL REGION', lat: 14, lon: 0, radius: 12 },
  { name: 'SOUTH CHINA SEA', lat: 12, lon: 114, radius: 8 },
  { name: 'TAIWAN STRAIT', lat: 24, lon: 120, radius: 4 },
  { name: 'KOREAN PENINSULA', lat: 37, lon: 127, radius: 5 },
  { name: 'SOUTH ASIA', lat: 24, lon: 75, radius: 12 },
  { name: 'CENTRAL ASIA', lat: 40, lon: 65, radius: 10 },
  { name: 'WEST AFRICA', lat: 8, lon: -5, radius: 10 },
  { name: 'CENTRAL AFRICA / GREAT LAKES', lat: -2, lon: 28, radius: 8 },
  { name: 'NORTH ATLANTIC', lat: 50, lon: -30, radius: 15 },
  { name: 'ARCTIC', lat: 75, lon: 0, radius: 15 },
  { name: 'CARIBBEAN / CENTRAL AMERICA', lat: 15, lon: -75, radius: 10 },
  { name: 'SOUTH AMERICA', lat: -15, lon: -55, radius: 15 },
  { name: 'SOUTHEAST ASIA', lat: 5, lon: 105, radius: 10 },
  { name: 'WESTERN EUROPE', lat: 48, lon: 5, radius: 10 },
  { name: 'NORTH AMERICA', lat: 40, lon: -100, radius: 15 },
  { name: 'EAST AFRICA', lat: -5, lon: 37, radius: 8 },
  { name: 'SOUTHERN AFRICA', lat: -28, lon: 25, radius: 10 },
  { name: 'OCEANIA', lat: -25, lon: 135, radius: 15 },
];

export function identifyRegion(lat: number, lon: number): string | null {
  for (const r of REGIONS) {
    const dist = Math.sqrt((lat - r.lat) ** 2 + (lon - r.lon) ** 2);
    if (dist < r.radius) return r.name;
  }
  return null;
}
