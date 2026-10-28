import { GpsLocationInfo } from '../types';

/**
 * Calculates distance in meters between two GPS coordinates using Haversine formula
 */
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const deltaPhi = toRad(lat2 - lat1);
  const deltaLambda = toRad(lon2 - lon1);

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

/**
 * Formats distance in meters or kilometers in Arabic
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${meters} متر`;
  }
  return `${(meters / 1000).toFixed(2)} كم`;
}

/**
 * Reverse geocodes coordinates to a human-readable Arabic address
 * using OpenStreetMap Nominatim with caching and timeout
 */
const addressCache = new Map<string, string>();

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  if (addressCache.has(cacheKey)) {
    return addressCache.get(cacheKey)!;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=ar`,
      {
        headers: {
          'Accept-Language': 'ar,en',
        },
        signal: controller.signal,
      }
    );
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      const addr = data.address || {};
      
      const parts: string[] = [];
      if (addr.road) parts.push(addr.road);
      if (addr.neighbourhood || addr.suburb) parts.push(addr.neighbourhood || addr.suburb);
      if (addr.city || addr.town || addr.municipality || addr.village) {
        parts.push(addr.city || addr.town || addr.municipality || addr.village);
      }
      if (addr.state || addr.province) parts.push(addr.state || addr.province);
      if (addr.country) parts.push(addr.country);

      const formatted = parts.length > 0 ? parts.join('، ') : data.display_name?.split('،').slice(0, 3).join('، ') || 'الموقع الحالي';
      addressCache.set(cacheKey, formatted);
      return formatted;
    }
  } catch {
    // Timeout or network error
  } finally {
    clearTimeout(timeoutId);
  }

  return `إحداثيات: ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

/**
 * Robust multi-tiered location resolver:
 * 1. High-accuracy device GPS (with generous timeout)
 * 2. Low-accuracy / Wi-Fi network positioning
 * 3. Fallback to free IP Geolocation service if browser geolocation is blocked/unavailable
 */
export async function getRealGeolocation(): Promise<GpsLocationInfo> {
  // Check browser geolocation support
  if ('geolocation' in navigator) {
    try {
      // Tier 1: Try high accuracy GPS (satellite / hardware)
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 8000,
          maximumAge: 0,
        });
      });

      const { latitude, longitude, accuracy, altitude, speed } = pos.coords;
      let address: string | undefined;
      try {
        address = await reverseGeocode(latitude, longitude);
      } catch {
        // Reverse geocode is non-blocking
      }

      return {
        lat: latitude,
        lng: longitude,
        accuracy: Math.round(accuracy || 15),
        altitude,
        speed,
        source: accuracy && accuracy <= 50 ? 'gps' : 'network',
        address,
        timestamp: pos.timestamp,
      };
    } catch {
      // Tier 2: Try low-accuracy (cellular / Wi-Fi network triangulation)
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: false,
            timeout: 10000,
            maximumAge: 60000,
          });
        });

        const { latitude, longitude, accuracy, altitude, speed } = pos.coords;
        let address: string | undefined;
        try {
          address = await reverseGeocode(latitude, longitude);
        } catch {
          // Ignore
        }

        return {
          lat: latitude,
          lng: longitude,
          accuracy: Math.round(accuracy || 150),
          altitude,
          speed,
          source: 'network',
          address,
          timestamp: pos.timestamp,
        };
      } catch {
        // Fall through to IP geolocation tier
      }
    }
  }

  // Tier 3: Fetch location via IP Geolocation (e.g. if permissions blocked in iframe)
  return await getIpGeolocation();
}

/**
 * IP-based geolocation fallback
 */
async function getIpGeolocation(): Promise<GpsLocationInfo> {
  const apis = [
    async () => {
      const res = await fetch('https://freeipapi.com/api/json', { signal: AbortSignal.timeout(5000) });
      const data = await res.json();
      return {
        lat: Number(data.latitude),
        lng: Number(data.longitude),
        city: data.cityName,
        country: data.countryName,
        address: `${data.cityName ? data.cityName + '، ' : ''}${data.countryName || 'موقع مزود الخدمة'}`,
      };
    },
    async () => {
      const res = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(5000) });
      const data = await res.json();
      return {
        lat: Number(data.latitude),
        lng: Number(data.longitude),
        city: data.city,
        country: data.country_name,
        address: `${data.city ? data.city + '، ' : ''}${data.country_name || 'موقع مزود الخدمة'}`,
      };
    },
  ];

  for (const api of apis) {
    try {
      const res = await api();
      if (!isNaN(res.lat) && !isNaN(res.lng) && res.lat !== 0) {
        return {
          lat: res.lat,
          lng: res.lng,
          accuracy: 2500, // typical city-level IP accuracy
          source: 'ip',
          city: res.city,
          country: res.country,
          address: res.address,
          timestamp: Date.now(),
        };
      }
    } catch {
      continue;
    }
  }

  // Ultimate fallback if completely offline or unreachable
  return {
    lat: 33.3152,
    lng: 44.3661,
    accuracy: 50,
    source: 'simulated',
    address: 'بغداد، العراق (موقع افتراضي)',
    timestamp: Date.now(),
  };
}

/**
 * Starts continuous live GPS position watcher
 */
export function watchRealGeolocation(
  onUpdate: (location: GpsLocationInfo) => void,
  onError?: (error: GeolocationPositionError) => void
): () => void {
  if (!('geolocation' in navigator)) {
    return () => {};
  }

  const watchId = navigator.geolocation.watchPosition(
    (pos) => {
      onUpdate({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: Math.round(pos.coords.accuracy || 20),
        altitude: pos.coords.altitude,
        speed: pos.coords.speed,
        source: pos.coords.accuracy && pos.coords.accuracy <= 50 ? 'gps' : 'network',
        timestamp: pos.timestamp,
      });
    },
    (err) => {
      if (onError) onError(err);
    },
    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 3000,
    }
  );

  return () => {
    navigator.geolocation.clearWatch(watchId);
  };
}
