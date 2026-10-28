import React, { useState, useEffect } from 'react';
import { formatArabicDate, formatArabicTime, formatHijriDate } from '../utils/date';
import { playClickBeep } from '../utils/sound';
import { GpsLocationInfo } from '../types';

interface HeaderProps {
  currentRole: 'employee' | 'admin';
  onRoleChange: (role: 'employee' | 'admin') => void;
  gpsActive: boolean;
  gpsCoords: { lat: number; lng: number } | null;
  gpsInfo?: GpsLocationInfo | null;
  isLoadingGps?: boolean;
  onRefreshGps: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentRole,
  onRoleChange,
  gpsActive,
  gpsCoords,
  gpsInfo,
  isLoadingGps,
  onRefreshGps,
}) => {
  const [currentTime, setCurrentTime] = useState<string>('');
  const [currentDate, setCurrentDate] = useState<string>('');
  const [hijriDate, setHijriDate] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(formatArabicTime(now));
      setCurrentDate(formatArabicDate(now));
      setHijriDate(formatHijriDate(now));
    };

    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="glass-panel sticky top-0 z-40 border-b border-slate-800/80 no-print">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between gap-4">
        
        {/* Brand Zone */}
        <div className="flex items-center space-x-3 space-x-reverse shrink-0">
          <div className="relative w-11 h-11 rounded-2xl bg-gradient-to-tr from-cyan-400 via-sky-500 to-indigo-600 p-0.5 shadow-neon-cyan">
            <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
              <i className="fa-solid fa-face-viewfinder text-cyan-400 text-xl animate-pulse"></i>
            </div>
          </div>
          <div>
            <div className="flex items-center space-x-2 space-x-reverse">
              <h1 className="font-black text-lg tracking-wide bg-clip-text text-transparent bg-gradient-to-r from-cyan-300 via-sky-200 to-indigo-300 whitespace-nowrap">
                نظام بصمة الوجه والـ GPS الذكي
              </h1>
            </div>
            <p className="text-[11px] text-cyan-400/80 font-medium tracking-wide">
              BIO-GPS VISION · التحقق البيومتري والجغرافي الحي
            </p>
          </div>
        </div>

        {/* Live Clock & Date Center Display */}
        <div className="hidden lg:flex flex-col items-center justify-center px-4 py-1.5 rounded-2xl bg-slate-900/60 border border-slate-800/80">
          <div className="text-xl font-black font-mono tracking-widest text-cyan-300 tabular-nums">
            {currentTime || '00:00:00 ص'}
          </div>
          <div className="text-[11px] text-slate-400 flex items-center space-x-2 space-x-reverse">
            <span>{currentDate}</span>
            {hijriDate && (
              <>
                <span className="text-slate-600">/</span>
                <span className="text-cyan-400/80 font-medium">{hijriDate}</span>
              </>
            )}
          </div>
        </div>

        {/* Actions Zone: GPS indicator & Role Switcher */}
        <div className="flex items-center space-x-3 space-x-reverse shrink-0">
          
          {/* Realtime GPS Indicator Badge */}
          <button
            onClick={() => {
              playClickBeep();
              onRefreshGps();
            }}
            title={gpsInfo?.address ? `الموقع: ${gpsInfo.address}` : 'انقر لتحديث إشارة الموقع الجغرافي الفعلي'}
            className="flex items-center space-x-2 space-x-reverse px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-cyan-500/50 transition cursor-pointer"
          >
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                isLoadingGps
                  ? 'bg-cyan-400 animate-ping'
                  : gpsActive
                  ? 'bg-emerald-400 animate-pulse'
                  : 'bg-amber-400'
              }`}
            ></span>
            <div className="text-right">
              <div className="text-[10px] text-slate-400 leading-tight flex items-center gap-1">
                <span>حالة الـ GPS</span>
                {gpsInfo?.source === 'gps' && (
                  <span className="text-[9px] text-emerald-400 font-bold">(أقمار)</span>
                )}
                {gpsInfo?.source === 'ip' && (
                  <span className="text-[9px] text-sky-400 font-bold">(IP)</span>
                )}
              </div>
              <div className="font-mono text-[11px] font-bold text-cyan-300 whitespace-nowrap">
                {isLoadingGps
                  ? 'جاري التحديد...'
                  : gpsCoords
                  ? `${gpsCoords.lat.toFixed(4)}, ${gpsCoords.lng.toFixed(4)}`
                  : 'غير محدد'}
              </div>
            </div>
            <i
              className={`fa-solid fa-arrows-rotate text-xs text-slate-500 hover:text-cyan-400 mr-1 ${
                isLoadingGps ? 'animate-spin text-cyan-400' : ''
              }`}
            ></i>
          </button>

          {/* Mode Switcher */}
          <div className="bg-slate-950/90 p-1 rounded-2xl border border-slate-800 flex text-xs font-bold shadow-inner">
            <button
              onClick={() => {
                playClickBeep();
                onRoleChange('employee');
              }}
              className={`px-3.5 py-2 rounded-xl transition-all duration-300 flex items-center space-x-1.5 space-x-reverse ${
                currentRole === 'employee'
                  ? 'bg-gradient-to-r from-cyan-500 to-sky-500 text-slate-950 shadow-neon-cyan font-black'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <i className="fa-solid fa-user-check ml-1"></i>
              <span>واجهة الموظف</span>
            </button>
            <button
              onClick={() => {
                playClickBeep();
                onRoleChange('admin');
              }}
              className={`px-3.5 py-2 rounded-xl transition-all duration-300 flex items-center space-x-1.5 space-x-reverse ${
                currentRole === 'admin'
                  ? 'bg-gradient-to-r from-cyan-500 to-sky-500 text-slate-950 shadow-neon-cyan font-black'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <i className="fa-solid fa-shield-halved ml-1"></i>
              <span>لوحة تحكم المدير</span>
            </button>
          </div>

        </div>

      </div>
    </header>
  );
};
