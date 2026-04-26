import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Loader2, MapPin, Navigation, ExternalLink, Phone, Clock, ChevronDown, ChevronUp, RefreshCw, Store } from 'lucide-react';
import { getBackendUrl } from '../src/lib/backendUrl';

// Fix Leaflet default marker icon issue with bundlers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const userIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

const pharmacyIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

interface Pharmacy {
    id: number | string;
    name: string;
    lat: number;
    lon: number;
    distance: number;
    address?: string;
    phone?: string;
    openingHours?: string;
    type?: string;
    source?: string;
    rating?: number;
    userRatingsTotal?: number;
    openNow?: boolean;
}

interface NearbyPharmacyMapProps {
    searchQuery?: string;
}

function FitBounds({ pharmacies, userLat, userLon }: { pharmacies: Pharmacy[]; userLat: number; userLon: number }) {
    const map = useMap();
    useEffect(() => {
        if (pharmacies.length === 0) return;
        const points: [number, number][] = [[userLat, userLon], ...pharmacies.map(p => [p.lat, p.lon] as [number, number])];
        const bounds = L.latLngBounds(points);
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    }, [pharmacies, userLat, userLon, map]);
    return null;
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Multiple Overpass API endpoints for fallback
const OVERPASS_ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

// Primary search: Overpass API with broad tags
async function searchOverpass(lat: number, lon: number, radiusM: number): Promise<Pharmacy[]> {
    // Broad search: pharmacy, chemist, medical supply, drugstore, healthcare pharmacy
    const query = `
    [out:json][timeout:25];
    (
      node["amenity"="pharmacy"](around:${radiusM},${lat},${lon});
      way["amenity"="pharmacy"](around:${radiusM},${lat},${lon});
      node["shop"="chemist"](around:${radiusM},${lat},${lon});
      way["shop"="chemist"](around:${radiusM},${lat},${lon});
      node["healthcare"="pharmacy"](around:${radiusM},${lat},${lon});
      way["healthcare"="pharmacy"](around:${radiusM},${lat},${lon});
      node["shop"="medical_supply"](around:${radiusM},${lat},${lon});
      way["shop"="medical_supply"](around:${radiusM},${lat},${lon});
      node["amenity"="drugstore"](around:${radiusM},${lat},${lon});
      way["amenity"="drugstore"](around:${radiusM},${lat},${lon});
      node["shop"="drugstore"](around:${radiusM},${lat},${lon});
      way["shop"="drugstore"](around:${radiusM},${lat},${lon});
    );
    out center body;
  `;

    for (const endpoint of OVERPASS_ENDPOINTS) {
        try {
            console.log(`[PharmacyMap] Overpass: ${endpoint} (radius: ${radiusM}m)`);
            const res = await fetchWithTimeout(endpoint, {
                method: 'POST',
                body: `data=${encodeURIComponent(query)}`,
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            }, 20000);

            if (!res.ok) continue;
            const data = await res.json();
            console.log(`[PharmacyMap] Overpass found ${data.elements?.length || 0} results`);

            return (data.elements || []).map((el: any) => {
                const elLat = el.lat ?? el.center?.lat;
                const elLon = el.lon ?? el.center?.lon;
                if (!elLat || !elLon) return null;
                const type = el.tags?.amenity || el.tags?.shop || el.tags?.healthcare || 'pharmacy';
                return {
                    id: el.id,
                    name: el.tags?.name || el.tags?.['name:en'] || 'Medical Store',
                    lat: elLat,
                    lon: elLon,
                    distance: haversineDistance(lat, lon, elLat, elLon),
                    address: [el.tags?.['addr:street'], el.tags?.['addr:housenumber'], el.tags?.['addr:city'], el.tags?.['addr:postcode']].filter(Boolean).join(', ') || undefined,
                    phone: el.tags?.phone || el.tags?.['contact:phone'] || undefined,
                    openingHours: el.tags?.opening_hours || undefined,
                    type,
                };
            }).filter(Boolean).sort((a: Pharmacy, b: Pharmacy) => a.distance - b.distance);
        } catch (err: any) {
            console.warn(`[PharmacyMap] Overpass ${endpoint} failed:`, err.message);
        }
    }
    return [];
}

// Fallback search: Nominatim text-based search
async function searchNominatim(lat: number, lon: number, radiusKm: number): Promise<Pharmacy[]> {
    const results: Pharmacy[] = [];
    const searchTerms = ['pharmacy', 'medical store', 'chemist', 'drugstore'];

    for (const term of searchTerms) {
        try {
            const bbox = getBoundingBox(lat, lon, radiusKm);
            const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(term)}&format=json&limit=20&viewbox=${bbox.lonMin},${bbox.latMax},${bbox.lonMax},${bbox.latMin}&bounded=1&addressdetails=1`;
            console.log(`[PharmacyMap] Nominatim search: "${term}"`);

            const res = await fetchWithTimeout(url, {
                headers: { 'User-Agent': 'HealthGuardAI/1.0' }
            }, 15000);

            if (!res.ok) continue;
            const data = await res.json();

            for (const item of data) {
                const itemLat = parseFloat(item.lat);
                const itemLon = parseFloat(item.lon);
                if (isNaN(itemLat) || isNaN(itemLon)) continue;
                // Skip duplicates
                if (results.some(r => Math.abs(r.lat - itemLat) < 0.0001 && Math.abs(r.lon - itemLon) < 0.0001)) continue;

                results.push({
                    id: item.place_id,
                    name: item.namedetails?.name || item.display_name?.split(',')[0] || term,
                    lat: itemLat,
                    lon: itemLon,
                    distance: haversineDistance(lat, lon, itemLat, itemLon),
                    address: item.display_name ? item.display_name.split(',').slice(0, 4).join(', ') : undefined,
                    type: term,
                });
            }
            // Small delay to respect Nominatim rate limit (1 req/sec)
            await new Promise(r => setTimeout(r, 1100));
        } catch (err: any) {
            console.warn(`[PharmacyMap] Nominatim "${term}" failed:`, err.message);
        }
    }

    console.log(`[PharmacyMap] Nominatim found ${results.length} total results`);
    return results.sort((a, b) => a.distance - b.distance);
}

function getBoundingBox(lat: number, lon: number, radiusKm: number) {
    const latDelta = radiusKm / 111;
    const lonDelta = radiusKm / (111 * Math.cos(lat * Math.PI / 180));
    return {
        latMin: lat - latDelta, latMax: lat + latDelta,
        lonMin: lon - lonDelta, lonMax: lon + lonDelta,
    };
}

// Reverse geocode for location name display
async function reverseGeocode(lat: number, lon: number): Promise<string> {
    try {
        const res = await fetchWithTimeout(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=12`,
            { headers: { 'User-Agent': 'HealthGuardAI/1.0' } },
            8000
        );
        if (!res.ok) return '';
        const data = await res.json();
        const addr = data.address || {};
        return addr.city || addr.town || addr.village || addr.county || addr.state || '';
    } catch {
        return '';
    }
}

function getFacilityLabel(query?: string): string {
    const q = (query || '').toLowerCase();
    if (/pediatrician|child/.test(q)) return 'pediatricians';
    if (/dermatologist|skin/.test(q)) return 'dermatologists';
    if (/dentist|dental/.test(q)) return 'dentists';
    if (/ophthalmologist|eye/.test(q)) return 'eye specialists';
    if (/cardiologist|heart/.test(q)) return 'cardiologists';
    if (/gynecologist|gynaecologist|women/.test(q)) return 'gynecologists';
    if (/orthopedic|orthopaedic|bone/.test(q)) return 'orthopedic doctors';
    if (/physiotherapist|physio/.test(q)) return 'physiotherapists';
    if (/lab|diagnostic|blood test/.test(q)) return 'diagnostic labs';
    if (/hospital|emergency/.test(q)) return 'hospitals';
    if (/clinic|doctor/.test(q)) return 'clinics and doctors';
    if (/pharmacy|chemist|medical store|blood pressure|bp/.test(q)) return 'pharmacies and medical stores';
    return 'medical facilities';
}

async function searchGooglePlaces(lat: number, lon: number, query?: string): Promise<{ results: Pharmacy[]; radius: number; source: string } | null> {
    try {
        const response = await fetch(`${getBackendUrl()}/api/nearby-medical`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                lat,
                lon,
                query: query || 'medical facilities',
                max_radius_m: 100000,
            }),
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.error || 'Google Places search failed');
        }
        return {
            results: (data.results || []).sort((a: Pharmacy, b: Pharmacy) => a.distance - b.distance),
            radius: data.radius || 100000,
            source: data.source || 'Google Places',
        };
    } catch (error) {
        console.warn('[PharmacyMap] Google Places search failed, falling back:', error);
        return null;
    }
}

const NearbyPharmacyMap: React.FC<NearbyPharmacyMapProps> = ({ searchQuery }) => {
    const [status, setStatus] = useState<'locating' | 'searching' | 'done' | 'error'>('locating');
    const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
    const [userPos, setUserPos] = useState<{ lat: number; lon: number } | null>(null);
    const [locationName, setLocationName] = useState('');
    const [searchRadius, setSearchRadius] = useState(3000);
    const [searchSource, setSearchSource] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [showAll, setShowAll] = useState(false);
    const maxRadius = 100000; // 100km cap
    const facilityLabel = getFacilityLabel(searchQuery);
    const CACHE_KEY = `healthguard_pharmacy_cache_${(searchQuery || 'medical').toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
    const CACHE_TTL = 60 * 60 * 1000; // 1 hour
    const startLocationSearch = () => {
        setStatus('locating');
        setErrorMsg('');

        if (!navigator.geolocation) {
            setStatus('error');
            setErrorMsg('Geolocation is not supported by your browser.');
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const loc = { lat: pos.coords.latitude, lon: pos.coords.longitude };
                console.log(`[PharmacyMap] Got location: ${loc.lat}, ${loc.lon}`, searchQuery || '');
                setUserPos(loc);
                setStatus('searching');
                // Fetch location name in parallel
                reverseGeocode(loc.lat, loc.lon).then(name => setLocationName(name));
                dynamicSearch(loc.lat, loc.lon, 3000);
            },
            (err) => {
                console.error('[PharmacyMap] Geolocation error:', err);
                setStatus('error');
                setErrorMsg(
                    err.code === 1
                        ? 'Location permission denied. Please allow location access in your browser settings and try again.'
                        : err.code === 2
                            ? 'Location unavailable. Make sure your device location is enabled.'
                            : 'Location request timed out. Please try again.'
                );
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
        );
    };

    useEffect(() => {
        // Check localStorage cache first
        try {
            const cached = localStorage.getItem(CACHE_KEY);
            if (cached) {
                const data = JSON.parse(cached);
                if (Date.now() - data.timestamp < CACHE_TTL && data.pharmacies?.length >= 0) {
                    console.log('[PharmacyMap] Using cached data (' + data.pharmacies.length + ' results)');
                    setUserPos(data.userPos);
                    setPharmacies(data.pharmacies);
                    setLocationName(data.locationName || '');
                    setSearchRadius(data.searchRadius || 100000);
                    setSearchSource(data.searchSource || '');
                    setStatus('done');
                    return;
                }
            }
        } catch (e) {
            console.warn('[PharmacyMap] Cache read error, doing fresh search');
        }
        startLocationSearch();
    }, []);

    const dynamicSearch = async (lat: number, lon: number, radius: number) => {
        try {
            setSearchRadius(radius);
            setStatus('searching');

            // Step 1: Try Google Places via backend. This keeps the API key out of the Android APK.
            const googleResults = await searchGooglePlaces(lat, lon, searchQuery);
            if (googleResults && googleResults.results.length > 0) {
                setSearchSource(googleResults.source);
                setPharmacies(googleResults.results);
                setSearchRadius(googleResults.radius);
                setStatus('done');
                saveToCache(googleResults.results, { lat, lon }, googleResults.radius, googleResults.source);
                return;
            }

            // Step 2: Fall back to Overpass API
            let results = await searchOverpass(lat, lon, radius);

            if (results.length > 0) {
                setSearchSource('OpenStreetMap');
                setPharmacies(results);
                setSearchRadius(radius);
                setStatus('done');
                saveToCache(results, { lat, lon }, radius, 'OpenStreetMap');
                return;
            }

            // Expand Overpass radius before switching to Nominatim
            if (radius < maxRadius) {
                const newRadius = Math.min(radius * 2, maxRadius);
                console.log(`[PharmacyMap] No Overpass results at ${radius}m, expanding to ${newRadius}m`);
                setSearchRadius(newRadius);

                results = await searchOverpass(lat, lon, newRadius);
                if (results.length > 0) {
                    setSearchSource('OpenStreetMap');
                    setPharmacies(results);
                    setSearchRadius(newRadius);
                    setStatus('done');
                    saveToCache(results, { lat, lon }, newRadius, 'OpenStreetMap');
                    return;
                }
            }

            // Step 3: Overpass found nothing, try Nominatim text search
            console.log('[PharmacyMap] Overpass empty, trying Nominatim fallback...');
            setSearchSource('Nominatim');
            results = await searchNominatim(lat, lon, maxRadius / 1000);

            setPharmacies(results);
            setSearchRadius(maxRadius);
            setStatus('done');

            // Save to localStorage cache
            saveToCache(results, { lat, lon }, maxRadius, 'Nominatim');
        } catch (err: any) {
            console.error('[PharmacyMap] Search failed:', err);
            setStatus('error');
            setErrorMsg(`Failed to search for ${facilityLabel}: ${err.message || 'Unknown error'}`);
        }
    };

    const saveToCache = (results: Pharmacy[], pos: { lat: number; lon: number }, radius: number, source: string) => {
        try {
            const cacheData = {
                pharmacies: results,
                userPos: pos,
                locationName,
                searchRadius: radius,
                searchSource: source,
                timestamp: Date.now(),
            };
            localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
            console.log('[PharmacyMap] Cached ' + results.length + ' results');
        } catch (e) {
            console.warn('[PharmacyMap] Cache write error');
        }
    };

    const handleRetry = () => {
        // Bypass cache on manual retry
        localStorage.removeItem(CACHE_KEY);
        if (userPos) {
            setPharmacies([]);
            dynamicSearch(userPos.lat, userPos.lon, 3000);
        } else {
            startLocationSearch();
        }
    };

    const openDirections = (lat: number, lon: number) => {
        window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`, '_blank');
    };

    const openGoogleMapsPage = (name: string, lat: number, lon: number) => {
        window.open(`https://www.google.com/maps/search/${encodeURIComponent(name)}/@${lat},${lon},17z`, '_blank');
    };

    const displayedPharmacies = showAll ? pharmacies : pharmacies.slice(0, 5);

    // Loading states
    if (status === 'locating') {
        return (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 max-w-2xl w-full">
                <div className="flex items-center gap-3 text-slate-600 dark:text-slate-300">
                    <div className="w-10 h-10 rounded-full bg-teal-50 dark:bg-teal-900/30 flex items-center justify-center">
                        <Loader2 className="w-5 h-5 animate-spin text-teal-500" />
                    </div>
                    <div>
                        <p className="font-semibold text-sm">Getting your location...</p>
                        <p className="text-xs text-slate-400 mt-0.5">Please allow location access when prompted</p>
                    </div>
                </div>
            </div>
        );
    }

    if (status === 'searching') {
        return (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 max-w-2xl w-full">
                <div className="flex items-center gap-3 text-slate-600 dark:text-slate-300">
                    <div className="w-10 h-10 rounded-full bg-teal-50 dark:bg-teal-900/30 flex items-center justify-center">
                        <Loader2 className="w-5 h-5 animate-spin text-teal-500" />
                    </div>
                    <div>
                        <p className="font-semibold text-sm">Searching for {facilityLabel}{locationName ? ` near ${locationName}` : ''}...</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                            Scanning within {(searchRadius / 1000).toFixed(1)} km radius
                            {searchRadius > 3000 && ' (expanding search area)'}
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    if (status === 'error') {
        return (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-red-200 dark:border-red-800/30 shadow-sm p-6 max-w-2xl w-full">
                <div className="flex items-start gap-3 text-red-600 dark:text-red-400">
                    <MapPin className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                        <p className="font-semibold text-sm">Could not find {facilityLabel}</p>
                        <p className="text-xs text-red-400 mt-0.5">{errorMsg}</p>
                        <button
                            onClick={handleRetry}
                            className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-white bg-teal-500 hover:bg-teal-600 px-4 py-2 rounded-full transition-colors"
                        >
                            <RefreshCw className="w-3.5 h-3.5" /> Try Again
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (!userPos) return null;

    return (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden max-w-2xl w-full">
            {/* Header */}
            <div className="px-4 py-3 bg-gradient-to-r from-teal-500 to-emerald-500 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    <span className="font-bold text-sm">
                        Nearby Pharmacies{locationName ? ` — ${locationName}` : ''}
                    </span>
                </div>
                <span className="text-[11px] bg-white/20 px-2 py-0.5 rounded-full font-medium">
                    {pharmacies.length} found • {(searchRadius / 1000).toFixed(0)} km
                </span>
            </div>

            {/* Map */}
            <div className="h-[280px] w-full relative z-0">
                <MapContainer
                    center={[userPos.lat, userPos.lon]}
                    zoom={14}
                    scrollWheelZoom={true}
                    style={{ height: '100%', width: '100%' }}
                    zoomControl={true}
                >
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />

                    <Marker position={[userPos.lat, userPos.lon]} icon={userIcon}>
                        <Popup>
                            <div className="text-center">
                                <strong className="text-blue-600">📍 You are here</strong>
                                {locationName && <p className="text-xs text-slate-500 mt-1">{locationName}</p>}
                            </div>
                        </Popup>
                    </Marker>

                    {pharmacies.map(ph => (
                        <Marker key={ph.id} position={[ph.lat, ph.lon]} icon={pharmacyIcon}>
                            <Popup>
                                <div className="min-w-[180px]">
                                    <strong className="text-teal-700 text-sm cursor-pointer hover:underline" onClick={() => openGoogleMapsPage(ph.name, ph.lat, ph.lon)}>{ph.name}</strong>
                                    {ph.address && <p className="text-xs text-slate-500 mt-1">{ph.address}</p>}
                                    <p className="text-xs text-slate-400 mt-1">
                                        {ph.distance < 1 ? `${(ph.distance * 1000).toFixed(0)} m away` : `${ph.distance.toFixed(1)} km away`}
                                    </p>
                                    <div className="flex flex-col gap-2 mt-2">
                                        <button onClick={() => openDirections(ph.lat, ph.lon)} className="text-xs bg-teal-500 text-white px-3 py-1.5 rounded-full hover:bg-teal-600 transition-colors flex items-center justify-center gap-1">
                                            <Navigation className="w-3 h-3" /> Directions
                                        </button>
                                        <button onClick={() => openGoogleMapsPage(ph.name, ph.lat, ph.lon)} className="text-xs bg-blue-500 text-white px-3 py-1.5 rounded-full hover:bg-blue-600 transition-colors flex items-center justify-center gap-1">
                                            <ExternalLink className="w-3 h-3" /> View on Google Maps
                                        </button>
                                    </div>
                                </div>
                            </Popup>
                        </Marker>
                    ))}

                    {pharmacies.length > 0 && <FitBounds pharmacies={pharmacies} userLat={userPos.lat} userLon={userPos.lon} />}
                </MapContainer>
            </div>

            {/* Pharmacy List */}
            {pharmacies.length === 0 ? (
                <div className="p-5 text-center">
                    <Store className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm text-slate-500 font-medium">No {facilityLabel} found within {(searchRadius / 1000).toFixed(0)} km</p>
                    <p className="text-xs text-slate-400 mt-1">This area may have limited map data coverage</p>
                    <button onClick={handleRetry} className="mt-3 text-xs text-teal-600 hover:text-teal-800 font-semibold flex items-center gap-1 mx-auto">
                        <RefreshCw className="w-3.5 h-3.5" /> Search Again
                    </button>
                </div>
            ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-700">
                    {displayedPharmacies.map((ph, idx) => (
                        <div key={ph.id} className="px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                            <div className="flex items-start gap-3">
                                <div className="w-7 h-7 rounded-full bg-teal-50 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                                    {idx + 1}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p
                                        onClick={() => openGoogleMapsPage(ph.name, ph.lat, ph.lon)}
                                        className="font-semibold text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline truncate cursor-pointer"
                                    >
                                        {ph.name}
                                    </p>
                                    {ph.address && (
                                        <p className="text-xs text-slate-400 mt-0.5 flex items-start gap-1">
                                            <MapPin className="w-3 h-3 flex-shrink-0 mt-0.5" />
                                            <span className="line-clamp-2">{ph.address}</span>
                                        </p>
                                    )}
                                    <div className="flex flex-wrap items-center gap-2 mt-1.5">
                                        {ph.phone && (
                                            <span className="text-xs text-slate-400 flex items-center gap-1">
                                                <Phone className="w-3 h-3" /> {ph.phone}
                                            </span>
                                        )}
                                        {ph.openingHours && (
                                            <span className="text-xs text-slate-400 flex items-center gap-1">
                                                <Clock className="w-3 h-3" /> {ph.openingHours}
                                            </span>
                                        )}
                                    </div>
                                    {/* Action buttons */}
                                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mt-2">
                                        <button
                                            onClick={() => openGoogleMapsPage(ph.name, ph.lat, ph.lon)}
                                            className="text-[10px] sm:text-[11px] bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 px-2.5 py-1.5 sm:py-1 rounded-full font-medium flex items-center justify-center sm:justify-start gap-1 transition-colors"
                                        >
                                            <ExternalLink className="w-3 h-3" /> View on Google Maps
                                        </button>
                                        <button
                                            onClick={() => openDirections(ph.lat, ph.lon)}
                                            className="text-[10px] sm:text-[11px] bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400 hover:bg-teal-100 dark:hover:bg-teal-900/40 px-2.5 py-1.5 sm:py-1 rounded-full font-medium flex items-center justify-center sm:justify-start gap-1 transition-colors"
                                        >
                                            <Navigation className="w-3 h-3" /> Get Directions
                                        </button>
                                    </div>
                                </div>
                                <div className="flex-shrink-0 text-right">
                                    <span className="text-[11px] font-bold text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/30 px-2 py-0.5 rounded-full whitespace-nowrap">
                                        {ph.distance < 1 ? `${(ph.distance * 1000).toFixed(0)} m` : `${ph.distance.toFixed(1)} km`}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))}

                    {pharmacies.length > 5 && (
                        <button
                            onClick={() => setShowAll(!showAll)}
                            className="w-full py-2.5 text-xs font-semibold text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors flex items-center justify-center gap-1"
                        >
                            {showAll ? (
                                <><ChevronUp className="w-3.5 h-3.5" /> Show Less</>
                            ) : (
                                <><ChevronDown className="w-3.5 h-3.5" /> Show All {pharmacies.length} Results</>
                            )}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

export default NearbyPharmacyMap;
