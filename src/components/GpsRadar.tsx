import React, { useRef, useEffect, useState } from 'react';
import { Employee, GpsLocationInfo } from '../types';
import { formatDistance } from '../utils/geo';
import { playClickBeep, playSuccessChime } from '../utils/sound';
import Swal from 'sweetalert2';

interface GpsRadarProps {
  currentEmployee: Employee;
  userCoords: { lat: number; lng: number };
  distanceMeters: number;
  isInsideGeofence: boolean;
  gpsInfo: GpsLocationInfo | null;
  onRefreshRealGps: () => Promise<void>;
  onSetCurrentLocationAsWorkplace: (
    empId: string,
    coords: { lat: number; lng: number },
    address?: string
  ) => void;
  onUpdateEmployeeRadius: (empId: string, newRadius: number) => void;
  onSimulateInside: () => void;
  onSimulateOutside: () => void;
  isSimulatedLocation: boolean;
  isLiveTracking: boolean;
  onToggleLiveTracking: () => void;
  isLoadingGps: boolean;
}

declare global {
  interface Window {
    L?: any;
  }
}

export const GpsRadar: React.FC<GpsRadarProps> = ({
  currentEmployee,
  userCoords,
  distanceMeters,
  isInsideGeofence,
  gpsInfo,
  onRefreshRealGps,
  onSetCurrentLocationAsWorkplace,
  onUpdateEmployeeRadius,
  onSimulateInside,
  onSimulateOutside,
  isSimulatedLocation,
  isLiveTracking,
  onToggleLiveTracking,
  isLoadingGps,
}) => {
  const [viewMode, setViewMode] = useState<'map' | 'radar'>('map');
  const [mapStyle, setMapStyle] = useState<'dark' | 'satellite' | 'street'>('dark');
  const radarCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const leafletMapRef = useRef<any>(null);
  const tileLayerRef = useRef<any>(null);
  const layersGroupRef = useRef<any>(null);

  // Initialize and update Leaflet Map
  useEffect(() => {
    if (viewMode !== 'map') return;
    if (!mapContainerRef.current) return;

    const L = window.L;
    if (!L) return;

    // Create map instance once
    if (!leafletMapRef.current) {
      try {
        const map = L.map(mapContainerRef.current, {
          center: [userCoords.lat, userCoords.lng],
          zoom: 16,
          zoomControl: true,
          attributionControl: false,
        });

        // Reliable 100% free tile layer (OpenStreetMap / Esri World Imagery)
        const tileUrl =
          mapStyle === 'satellite'
            ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
            : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

        const tileLayer = L.tileLayer(tileUrl, {
          maxZoom: 19,
          subdomains: mapStyle === 'satellite' ? [] : ['a', 'b', 'c'],
        }).addTo(map);

        tileLayerRef.current = tileLayer;

        layersGroupRef.current = L.layerGroup().addTo(map);
        leafletMapRef.current = map;

        setTimeout(() => {
          map.invalidateSize();
        }, 200);
      } catch (err) {
        console.warn('Leaflet initialization warning:', err);
      }
    }

    const map = leafletMapRef.current;
    const group = layersGroupRef.current;
    if (!map || !group) return;

    if (tileLayerRef.current) {
      // Update tile layer URL dynamically if style changed
      const tileUrl =
        mapStyle === 'satellite'
          ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
          : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
      
      tileLayerRef.current.setUrl(tileUrl);
    }

    // Clear previous dynamic layers
    group.clearLayers();

    try {
      // 1. Designated Workplace Geofence Circle
      const workplaceColor = isInsideGeofence ? '#10b981' : '#00f2fe';
      const fenceCircle = L.circle([currentEmployee.lat, currentEmployee.lng], {
        radius: currentEmployee.radius,
        color: workplaceColor,
        weight: 2,
        fillColor: workplaceColor,
        fillOpacity: 0.18,
        dashArray: isInsideGeofence ? undefined : '6, 6',
      }).addTo(group);

      fenceCircle.bindPopup(`
        <div style="font-family: Cairo, sans-serif; text-align: right; direction: rtl; color: #0f172a; font-size: 12px;">
          <strong style="color: #0284c7;">${currentEmployee.workplaceName}</strong><br/>
          نصف قطر النطاق: <b>${currentEmployee.radius} متر</b>
        </div>
      `);

      // 2. Workplace Pin Marker
      const workplaceIcon = L.divIcon({
        className: 'custom-wp-pin',
        html: `
          <div style="
            background: #0284c7;
            color: #fff;
            width: 34px;
            height: 34px;
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 2px solid #ffffff;
            box-shadow: 0 0 14px rgba(2, 132, 199, 0.8);
            font-size: 14px;
          ">
            <i class="fa-solid fa-building"></i>
          </div>
        `,
        iconSize: [34, 34],
        iconAnchor: [17, 34],
      });

      L.marker([currentEmployee.lat, currentEmployee.lng], { icon: workplaceIcon })
        .addTo(group)
        .bindPopup(`
          <div style="font-family: Cairo, sans-serif; text-align: right; direction: rtl; color: #0f172a; font-size: 12px;">
            <b>مقر العمل المعتمد:</b><br/>${currentEmployee.workplaceName}
          </div>
        `);

      // 3. User Current Real Location Marker (Pulsing Blip)
      const userDotColor = isInsideGeofence ? '#10b981' : '#f43f5e';
      const userIcon = L.divIcon({
        className: 'custom-user-blip',
        html: `
          <div style="position: relative; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;">
            <div style="
              position: absolute;
              width: 100%;
              height: 100%;
              border-radius: 50%;
              background: ${userDotColor};
              opacity: 0.4;
              animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;
            "></div>
            <div style="
              width: 16px;
              height: 16px;
              border-radius: 50%;
              background: ${userDotColor};
              border: 2.5px solid #ffffff;
              box-shadow: 0 0 12px ${userDotColor};
              z-index: 2;
            "></div>
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      L.marker([userCoords.lat, userCoords.lng], { icon: userIcon })
        .addTo(group)
        .bindPopup(`
          <div style="font-family: Cairo, sans-serif; text-align: right; direction: rtl; color: #0f172a; font-size: 12px;">
            <b>موقعك الفعلي الحالي</b><br/>
            الدقة: ±${gpsInfo?.accuracy || 15} متر<br/>
            البعد عن المقر: <b>${formatDistance(distanceMeters)}</b>
          </div>
        `);

      // 4. Accuracy Circle if available
      if (gpsInfo && gpsInfo.accuracy > 0 && gpsInfo.accuracy < 500) {
        L.circle([userCoords.lat, userCoords.lng], {
          radius: gpsInfo.accuracy,
          color: '#38bdf8',
          weight: 1,
          fillColor: '#38bdf8',
          fillOpacity: 0.08,
          dashArray: '3, 4',
        }).addTo(group);
      }

      // 5. Connecting line between user and workplace if distance > 20m
      if (distanceMeters > 20) {
        L.polyline(
          [
            [userCoords.lat, userCoords.lng],
            [currentEmployee.lat, currentEmployee.lng],
          ],
          {
            color: isInsideGeofence ? '#10b981' : '#f43f5e',
            weight: 2,
            dashArray: '5, 8',
            opacity: 0.8,
          }
        ).addTo(group);
      }

      // Fit bounds to show both user and workplace if distance > 50m
      const bounds = L.latLngBounds([
        [userCoords.lat, userCoords.lng],
        [currentEmployee.lat, currentEmployee.lng],
      ]);
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 17 });
    } catch (err) {
      console.warn('Leaflet layer render warning:', err);
    }
  }, [viewMode, mapStyle, userCoords, currentEmployee, distanceMeters, isInsideGeofence, gpsInfo]);

  // Radar Animation Loop (Canvas Mode)
  useEffect(() => {
    if (viewMode !== 'radar') return;
    const canvas = radarCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let angle = 0;
    let animId: number;

    const renderRadar = () => {
      angle = (angle + 0.035) % (Math.PI * 2);
      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;
      const maxRadius = cx - 14;

      ctx.clearRect(0, 0, w, h);

      // Radar Screen Background
      ctx.fillStyle = '#060a14';
      ctx.beginPath();
      ctx.arc(cx, cy, maxRadius, 0, Math.PI * 2);
      ctx.fill();

      // Radar Concentric Rings
      [0.33, 0.66, 1].forEach((fraction) => {
        ctx.beginPath();
        ctx.arc(cx, cy, maxRadius * fraction, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.15)';
        ctx.lineWidth = 1;
        ctx.stroke();
      });

      // Crosshairs
      ctx.beginPath();
      ctx.moveTo(cx - maxRadius, cy);
      ctx.lineTo(cx + maxRadius, cy);
      ctx.moveTo(cx, cy - maxRadius);
      ctx.lineTo(cx, cy + maxRadius);
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.1)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Sweeping Beam Wedge
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, maxRadius, angle - 0.35, angle);
      ctx.closePath();
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxRadius);
      gradient.addColorStop(0, 'rgba(0, 242, 254, 0)');
      gradient.addColorStop(1, 'rgba(0, 242, 254, 0.22)');
      ctx.fillStyle = gradient;
      ctx.fill();
      ctx.restore();

      // Center Workplace Marker (Target HQ)
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#38bdf8';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      const normalizedRatio = Math.min(
        1.1,
        (distanceMeters / (currentEmployee.radius || 100)) * 0.75
      );
      const userDotDist = maxRadius * Math.min(0.92, normalizedRatio);
      const userAngle = -Math.PI / 4;
      const ux = cx + Math.cos(userAngle) * userDotDist;
      const uy = cy + Math.sin(userAngle) * userDotDist;

      // Draw Employee Blip Dot
      ctx.beginPath();
      ctx.arc(ux, uy, 6, 0, Math.PI * 2);
      ctx.fillStyle = isInsideGeofence ? '#10b981' : '#f43f5e';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Pulsing outer ripple on employee dot
      const pulseSize = 6 + (Math.sin(Date.now() * 0.005) + 1) * 4;
      ctx.beginPath();
      ctx.arc(ux, uy, pulseSize, 0, Math.PI * 2);
      ctx.strokeStyle = isInsideGeofence
        ? 'rgba(16, 185, 129, 0.5)'
        : 'rgba(244, 63, 94, 0.5)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      animId = requestAnimationFrame(renderRadar);
    };

    renderRadar();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [viewMode, distanceMeters, isInsideGeofence, currentEmployee]);

  // Handle setting current real location as official workplace
  const handleSetCurrentAsWorkplace = () => {
    playSuccessChime();
    onSetCurrentLocationAsWorkplace(
      currentEmployee.id,
      userCoords,
      gpsInfo?.address || 'مقر العمل (الموقع الفعلي للموظف)'
    );

    Swal.fire({
      title: '🎯 تم اعتماد موقعك الفعلي كمقر عمل!',
      html: `
        <div class="text-right text-xs space-y-2 text-slate-300">
          <p class="font-bold text-emerald-400">
            تم ضبط إحداثيات مقر العمل للموظف (${currentEmployee.name}) لتطابق موقعك الحقيقي تماماً.
          </p>
          <div class="bg-slate-900 p-2.5 rounded-xl font-mono text-[11px] text-cyan-300 border border-slate-800">
            <div>خط العرض: ${userCoords.lat.toFixed(6)}</div>
            <div>خط الطول: ${userCoords.lng.toFixed(6)}</div>
            ${gpsInfo?.address ? `<div class="mt-1 text-slate-300 font-sans">العنوان: ${gpsInfo.address}</div>` : ''}
          </div>
          <p class="text-emerald-300 font-bold">
            المسافة الحالية: <span class="underline">0 متر</span> (أنت الآن رسمياً داخل النطاق ويمكنك تسجيل الحضور والانصراف).
          </p>
        </div>
      `,
      icon: 'success',
      confirmButtonText: 'حسناً، فهمت',
      confirmButtonColor: '#00f2fe',
      background: '#0b1329',
      color: '#f8fafc',
    });
  };

  const percentageInside = Math.min(
    100,
    Math.max(0, 100 - (distanceMeters / (currentEmployee.radius || 100)) * 100)
  );

  return (
    <div className="glass-panel p-5 sm:p-6 rounded-3xl flex flex-col justify-between space-y-4">
      {/* Geofence Radar Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-slate-800 pb-3 gap-2">
        <div className="flex items-center space-x-2 space-x-reverse">
          <div className="w-8 h-8 rounded-xl bg-cyan-950/80 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
            <i
              className={`fa-solid ${viewMode === 'map' ? 'fa-map-location-dot' : 'fa-radar'} ${
                isLoadingGps ? 'animate-spin' : ''
              }`}
            ></i>
          </div>
          <div>
            <div className="flex items-center space-x-2 space-x-reverse">
              <h3 className="font-extrabold text-white text-base">رادار التحقق الجغرافي الفعلي</h3>
              {isLiveTracking && (
                <span className="flex items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-950 text-emerald-400 border border-emerald-500/40 animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 ml-1"></span>
                  تتبع مباشر
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400">نظام الملاحة والحظر المكاني الفعلي (GPS Live)</p>
          </div>
        </div>

        {/* View Switcher & Status Pill */}
        <div className="flex items-center space-x-2 space-x-reverse">
          {/* Switch View Toggle */}
          <div className="bg-slate-950 p-0.5 rounded-xl border border-slate-800 flex text-[11px]">
            <button
              onClick={() => {
                playClickBeep();
                setViewMode('map');
              }}
              className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
                viewMode === 'map'
                  ? 'bg-cyan-500 text-slate-950 shadow-neon-cyan'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <i className="fa-solid fa-map ml-1"></i>
              الخريطة الحية
            </button>
            <button
              onClick={() => {
                playClickBeep();
                setViewMode('radar');
              }}
              className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
                viewMode === 'radar'
                  ? 'bg-cyan-500 text-slate-950 shadow-neon-cyan'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <i className="fa-solid fa-radar ml-1"></i>
              رادار
            </button>
          </div>

          {/* Current Geofence Status Pill */}
          <span
            className={`px-3 py-1 rounded-full text-xs font-black flex items-center shadow-sm ${
              isInsideGeofence
                ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/50 shadow-neon-emerald'
                : 'bg-rose-950 text-rose-300 border border-rose-500/50 shadow-neon-rose'
            }`}
          >
            <i
              className={`fa-solid ${
                isInsideGeofence
                  ? 'fa-circle-check text-emerald-400'
                  : 'fa-circle-xmark text-rose-400'
              } ml-1.5`}
            ></i>
            {isInsideGeofence ? 'مقبول (داخل النطاق)' : 'مرفوض (خارج النطاق)'}
          </span>
        </div>
      </div>

      {/* Visual Display (Interactive Map or Canvas Radar) */}
      <div className="space-y-3">
        {viewMode === 'map' ? (
          <div className="relative w-full h-56 sm:h-64 rounded-2xl overflow-hidden border border-cyan-500/30 shadow-neon-cyan bg-slate-950">
            <div
              ref={mapContainerRef}
              className={`w-full h-full z-10 ${mapStyle === 'dark' ? 'dark-leaflet-map' : ''}`}
            />

            {/* Floating Map Legend Overlay (Top Left) */}
            <div className="absolute top-2 left-2 z-20 bg-slate-950/85 backdrop-blur-md px-2.5 py-1.5 rounded-xl border border-slate-700/80 text-[10px] space-y-1">
              <div className="flex items-center space-x-2 space-x-reverse">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-neon-cyan"></span>
                <span className="text-slate-300">مقر العمل المعتمد</span>
              </div>
              <div className="flex items-center space-x-2 space-x-reverse">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    isInsideGeofence ? 'bg-emerald-400' : 'bg-rose-400'
                  }`}
                ></span>
                <span className="text-slate-300">موقعك الفعلي الحالي</span>
              </div>
            </div>

            {/* Map Style Selector Overlay (Top Right) */}
            <div className="absolute top-2 right-2 z-20 bg-slate-950/90 backdrop-blur-md p-1 rounded-xl border border-slate-700/80 flex items-center space-x-1 space-x-reverse text-[10px]">
              <button
                onClick={() => {
                  playClickBeep();
                  setMapStyle('dark');
                }}
                className={`px-2 py-0.5 rounded-lg font-bold transition cursor-pointer ${
                  mapStyle === 'dark'
                    ? 'bg-cyan-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="النمط الداكن المضيء"
              >
                🌌 داكن
              </button>
              <button
                onClick={() => {
                  playClickBeep();
                  setMapStyle('satellite');
                }}
                className={`px-2 py-0.5 rounded-lg font-bold transition cursor-pointer ${
                  mapStyle === 'satellite'
                    ? 'bg-cyan-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="أقمار صناعية Esri"
              >
                🛰️ أقمار
              </button>
              <button
                onClick={() => {
                  playClickBeep();
                  setMapStyle('street');
                }}
                className={`px-2 py-0.5 rounded-lg font-bold transition cursor-pointer ${
                  mapStyle === 'street'
                    ? 'bg-cyan-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="شوارع قياسية OpenStreetMap"
              >
                🗺️ شوارع
              </button>
            </div>

            {/* Recenter Button on Map */}
            <button
              onClick={() => {
                playClickBeep();
                if (leafletMapRef.current) {
                  leafletMapRef.current.setView([userCoords.lat, userCoords.lng], 16);
                }
              }}
              title="التركيز على موقعي الحالي"
              className="absolute bottom-2 left-2 z-20 bg-slate-900/90 hover:bg-slate-800 text-cyan-300 p-2 rounded-xl border border-cyan-500/40 text-xs shadow-lg transition cursor-pointer"
            >
              <i className="fa-solid fa-crosshairs"></i>
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center relative py-2">
            <div className="relative w-44 h-44 rounded-full p-1 bg-gradient-to-tr from-cyan-500/30 to-purple-500/30 shadow-neon-cyan">
              <canvas
                ref={radarCanvasRef}
                width={176}
                height={176}
                className="w-full h-full rounded-full"
              />
            </div>
            <div className="flex items-center space-x-3 space-x-reverse text-[10px] text-slate-400 mt-2">
              <span className="flex items-center">
                <span className="w-2 h-2 rounded-full bg-sky-400 ml-1"></span> مقر العمل
              </span>
              <span className="flex items-center">
                <span
                  className={`w-2 h-2 rounded-full ${
                    isInsideGeofence ? 'bg-emerald-400' : 'bg-rose-400'
                  } ml-1`}
                ></span>{' '}
                موقعك
              </span>
            </div>
          </div>
        )}

        {/* Telemetry and Workplace Coordinates Card */}
        <div className="bg-slate-950/90 p-4 rounded-2xl border border-slate-800 text-right space-y-3">
          {/* Real Address Bar if detected */}
          {gpsInfo?.address && (
            <div className="bg-cyan-950/40 p-2 rounded-xl border border-cyan-800/50 flex items-start space-x-2 space-x-reverse text-xs">
              <i className="fa-solid fa-location-dot text-cyan-400 mt-0.5 shrink-0"></i>
              <div className="text-right">
                <span className="text-[10px] text-slate-400 block font-medium">العنوان الفعلي المقروء:</span>
                <span className="font-bold text-cyan-200">{gpsInfo.address}</span>
              </div>
            </div>
          )}

          <div>
            <div className="text-[11px] text-slate-400 font-medium">مقر العمل المعتمد:</div>
            <div className="text-xs font-extrabold text-cyan-300 truncate">
              {currentEmployee.workplaceName}
            </div>
            <div className="text-[10px] font-mono text-slate-500 mt-0.5">
              إحداثيات المقر: {currentEmployee.lat.toFixed(5)}, {currentEmployee.lng.toFixed(5)}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-900">
            <div>
              <div className="text-[10px] text-slate-400">النطاق المسموح:</div>
              <div className="font-mono text-xs font-bold text-slate-200">
                {currentEmployee.radius} متر
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400">البعد الفعلي الحالي:</div>
              <div
                className={`font-mono text-sm font-black ${
                  isInsideGeofence ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {formatDistance(distanceMeters)}
              </div>
            </div>
          </div>

          {/* Quick Radius Adjuster for easy testing / workplace sizing */}
          <div className="pt-2 border-t border-slate-900 flex items-center justify-between text-[11px]">
            <span className="text-slate-400">تعديل محيط السماح للمقر:</span>
            <div className="flex items-center space-x-1 space-x-reverse">
              {[50, 100, 250, 500, 1000].map((r) => (
                <button
                  key={r}
                  onClick={() => {
                    playClickBeep();
                    onUpdateEmployeeRadius(currentEmployee.id, r);
                  }}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition cursor-pointer ${
                    currentEmployee.radius === r
                      ? 'bg-cyan-500 text-slate-950 font-black'
                      : 'bg-slate-900 text-slate-400 hover:text-cyan-300 border border-slate-800'
                  }`}
                >
                  {r}م
                </button>
              ))}
            </div>
          </div>

          {/* Proximity Distance Bar */}
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-slate-400">
              <span>القرب من النطاق</span>
              <span className="font-mono">{percentageInside}%</span>
            </div>
            <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden border border-slate-800">
              <div
                className={`h-full transition-all duration-500 ${
                  isInsideGeofence
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                    : 'bg-gradient-to-r from-rose-500 to-amber-500'
                }`}
                style={{ width: `${percentageInside}%` }}
              ></div>
            </div>
          </div>

          <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 pt-1">
            <span>
              موقعك: {userCoords.lat.toFixed(5)}, {userCoords.lng.toFixed(5)}
            </span>
            <span>
              {gpsInfo?.source === 'gps'
                ? '🟢 إشارة أقمار GPS حقيقية'
                : gpsInfo?.source === 'network'
                ? '🟡 شبكة خلوية / Wi-Fi'
                : gpsInfo?.source === 'ip'
                ? '🔵 موقع مزود الإنترنت (IP)'
                : '🟣 موقع محاكى'}
            </span>
          </div>
        </div>
      </div>

      {/* CORE ACTION: Set Current Real Location As Official Workplace */}
      <div className="p-3 bg-gradient-to-r from-emerald-950/60 to-cyan-950/60 rounded-2xl border border-emerald-500/40 text-right space-y-2 shadow-neon-emerald">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 space-x-reverse">
            <i className="fa-solid fa-bullseye text-emerald-400 text-sm"></i>
            <span className="text-xs font-black text-emerald-300">
              اعتماد موقعي الحالي الفعلي كمقر عمل رسمي
            </span>
          </div>
          <span className="text-[10px] text-emerald-400/80 font-bold">تصفير المسافة فورياً</span>
        </div>
        <p className="text-[11px] text-slate-300 leading-relaxed">
          انقر هنا لتعيين إحداثياتك الفعلية الحالية كمقر عمل للموظف الحالي. سيتم تصفير المسافة (0
          متر) وتصبح داخل النطاق الأخضر فوراً، لتتمكن من تسجيل الحضور ببصمة الوجه الحقيقية.
        </p>
        <button
          onClick={handleSetCurrentAsWorkplace}
          className="w-full py-2.5 px-3 bg-gradient-to-r from-emerald-500 to-teal-400 hover:brightness-110 active:scale-95 text-slate-950 font-black text-xs rounded-xl shadow-neon-emerald transition flex items-center justify-center cursor-pointer"
        >
          <i className="fa-solid fa-map-pin ml-1.5 text-sm"></i>
          <span>تعيين موقعي الحالي الفعلي مقر عمل لـ ({currentEmployee.name})</span>
        </button>
      </div>

      {/* Geolocation Controls & Live Tracking Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
        {/* Real GPS Refresh Button */}
        <button
          onClick={() => {
            playClickBeep();
            onRefreshRealGps();
          }}
          disabled={isLoadingGps}
          className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-cyan-300 rounded-xl text-xs font-bold border border-cyan-500/40 transition flex items-center cursor-pointer disabled:opacity-50"
        >
          <i
            className={`fa-solid fa-location-crosshairs ml-1.5 text-cyan-400 ${
              isLoadingGps ? 'animate-spin' : ''
            }`}
          ></i>
          {isLoadingGps ? 'جاري قراءة الـ GPS الفعلي...' : 'تحديث موقعي الفعلي الآن (GPS)'}
        </button>

        {/* Live Tracking Watcher Toggle */}
        <button
          onClick={() => {
            playClickBeep();
            onToggleLiveTracking();
          }}
          className={`px-3 py-2 rounded-xl text-xs font-bold border transition flex items-center cursor-pointer ${
            isLiveTracking
              ? 'bg-emerald-950 text-emerald-300 border-emerald-500/60 shadow-neon-emerald'
              : 'bg-slate-900 text-slate-400 hover:text-slate-200 border-slate-800'
          }`}
        >
          <i
            className={`fa-solid fa-satellite-dish ml-1.5 ${
              isLiveTracking ? 'text-emerald-400 animate-pulse' : 'text-slate-500'
            }`}
          ></i>
          <span>{isLiveTracking ? 'إيقاف التتبع الحي' : 'تفعيل التتبع المباشر'}</span>
        </button>

        {/* Simulation Shortcuts for Demos */}
        <div className="flex items-center space-x-1.5 space-x-reverse text-xs">
          <span className="text-[11px] text-slate-400 hidden sm:inline">محاكاة:</span>

          <button
            onClick={() => {
              playClickBeep();
              onSimulateInside();
            }}
            title="تعيين موقع الموظف داخل مقر العمل (15 متر)"
            className="px-2.5 py-1.5 bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-700/60 rounded-lg text-[11px] font-bold transition cursor-pointer"
          >
            <i className="fa-solid fa-building-circle-check ml-1"></i>
            داخل المقر
          </button>

          <button
            onClick={() => {
              playClickBeep();
              onSimulateOutside();
            }}
            title="تعيين موقع الموظف خارج النطاق (1,250 متر)"
            className="px-2.5 py-1.5 bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-700/60 rounded-lg text-[11px] font-bold transition cursor-pointer"
          >
            <i className="fa-solid fa-building-circle-xmark ml-1"></i>
            خارج المقر
          </button>
        </div>
      </div>
    </div>
  );
};
