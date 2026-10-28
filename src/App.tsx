/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Employee, AttendanceRecord, PunchType, GpsLocationInfo } from './types';
import { INITIAL_EMPLOYEES, INITIAL_ATTENDANCE_LOGS } from './data/mockData';
import { calculateDistanceMeters, getRealGeolocation, watchRealGeolocation } from './utils/geo';
import { getTodayDateString, formatArabicTime } from './utils/date';
import { playSuccessChime, playErrorBuzz, playClickBeep } from './utils/sound';
import { Header } from './components/Header';
import { EmployeePortal } from './components/EmployeePortal';
import { AdminDashboard } from './components/AdminDashboard';
import Swal from 'sweetalert2';
import confetti from 'canvas-confetti';

export default function App() {
  // Persistence with localStorage fallback
  const [employees, setEmployees] = useState<Employee[]>(() => {
    try {
      const saved = localStorage.getItem('bio_gps_employees');
      if (saved) return JSON.parse(saved);
    } catch {
      // Ignore storage error
    }
    return INITIAL_EMPLOYEES;
  });

  const [logs, setLogs] = useState<AttendanceRecord[]>(() => {
    try {
      const saved = localStorage.getItem('bio_gps_logs');
      if (saved) return JSON.parse(saved);
    } catch {
      // Ignore storage error
    }
    return INITIAL_ATTENDANCE_LOGS;
  });

  const [currentEmpId, setCurrentEmpId] = useState<string>('EMP-101');
  const [currentRole, setCurrentRole] = useState<'employee' | 'admin'>('employee');

  // GPS Coordinates & Location State
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number }>({
    lat: 33.31522,
    lng: 44.36615,
  });
  const [gpsInfo, setGpsInfo] = useState<GpsLocationInfo | null>(null);
  const [isLoadingGps, setIsLoadingGps] = useState<boolean>(false);
  const [isLiveTracking, setIsLiveTracking] = useState<boolean>(false);
  const [isSimulatedLocation, setIsSimulatedLocation] = useState<boolean>(true);
  const [gpsActive, setGpsActive] = useState<boolean>(true);
  const watchCleanupRef = useRef<(() => void) | null>(null);

  // Sync to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('bio_gps_employees', JSON.stringify(employees));
    } catch {
      // Ignore storage error
    }
  }, [employees]);

  useEffect(() => {
    try {
      localStorage.setItem('bio_gps_logs', JSON.stringify(logs));
    } catch {
      // Ignore storage error
    }
  }, [logs]);

  // Current active employee
  const currentEmployee = useMemo(() => {
    return employees.find((e) => e.id === currentEmpId) || employees[0];
  }, [employees, currentEmpId]);

  // Distance to current employee's designated workplace
  const distanceMeters = useMemo(() => {
    if (!currentEmployee) return 0;
    return calculateDistanceMeters(
      userCoords.lat,
      userCoords.lng,
      currentEmployee.lat,
      currentEmployee.lng
    );
  }, [userCoords, currentEmployee]);

  const isInsideGeofence = useMemo(() => {
    if (!currentEmployee) return false;
    return distanceMeters <= (currentEmployee.radius || 100);
  }, [distanceMeters, currentEmployee]);

  // Fetch real device geolocation via multi-tiered service
  const handleRefreshRealGps = useCallback(async (silent = false) => {
    setIsLoadingGps(true);
    try {
      const loc = await getRealGeolocation();
      setUserCoords({ lat: loc.lat, lng: loc.lng });
      setGpsInfo(loc);
      setIsSimulatedLocation(false);
      setGpsActive(true);

      if (!silent) {
        playClickBeep();
        Swal.fire({
          title: 'تم قراءة موقعك الفعلي بنجاح',
          html: `
            <div class="text-right text-xs space-y-2 text-slate-300">
              <p class="font-mono text-cyan-300">خط العرض: ${loc.lat.toFixed(6)}</p>
              <p class="font-mono text-cyan-300">خط الطول: ${loc.lng.toFixed(6)}</p>
              <p class="text-slate-300">الدقة التقريبية: ±${loc.accuracy} متر</p>
              ${
                loc.address
                  ? `<div class="bg-slate-900 p-2.5 rounded-xl border border-slate-800 text-cyan-200 mt-2">
                      <div class="text-[10px] text-slate-400">العنوان المكتشف:</div>
                      <b>${loc.address}</b>
                    </div>`
                  : ''
              }
              <div class="text-[11px] text-slate-400 pt-1">
                مصدر الإشارة: <b class="text-emerald-400">${
                  loc.source === 'gps'
                    ? 'أقمار صناعية (GPS عالي الدقة)'
                    : loc.source === 'network'
                    ? 'أبراج الاتصال وشبكات Wi-Fi'
                    : 'تحديد جغرافي عبر شبكة الإنترنت (IP)'
                }</b>
              </div>
            </div>
          `,
          icon: 'success',
          confirmButtonColor: '#00f2fe',
          background: '#0b1329',
          color: '#f8fafc',
        });
      }
    } catch (err) {
      console.warn('Geolocation acquisition error:', err);
      if (!silent) {
        Swal.fire({
          title: 'تنبيه الموقع الجغرافي',
          text: 'تعذر الاتصال بخدمة الموقع بدقة، يمكنك تفعيل إذن الموقع في متصفحك أو استخدام أدوات المحاكاة.',
          icon: 'warning',
          confirmButtonColor: '#00f2fe',
          background: '#0b1329',
          color: '#f8fafc',
        });
      }
    } finally {
      setIsLoadingGps(false);
    }
  }, []);

  // Auto-detect real location on initial mount
  useEffect(() => {
    handleRefreshRealGps(true);
    return () => {
      if (watchCleanupRef.current) {
        watchCleanupRef.current();
      }
    };
  }, [handleRefreshRealGps]);

  // Toggle Live Tracking
  const handleToggleLiveTracking = useCallback(() => {
    if (isLiveTracking) {
      if (watchCleanupRef.current) {
        watchCleanupRef.current();
        watchCleanupRef.current = null;
      }
      setIsLiveTracking(false);
    } else {
      const cleanup = watchRealGeolocation((newLoc) => {
        setUserCoords({ lat: newLoc.lat, lng: newLoc.lng });
        setGpsInfo(newLoc);
        setIsSimulatedLocation(false);
        setGpsActive(true);
      });
      watchCleanupRef.current = cleanup;
      setIsLiveTracking(true);
    }
  }, [isLiveTracking]);

  // Set Current Real Location as Workplace Coordinates for employee
  const handleSetCurrentLocationAsWorkplace = useCallback(
    (empId: string, coords: { lat: number; lng: number }, address?: string) => {
      setEmployees((prev) =>
        prev.map((emp) => {
          if (emp.id === empId) {
            return {
              ...emp,
              lat: coords.lat,
              lng: coords.lng,
              workplaceName: address || emp.workplaceName || 'مقر العمل (الموقع الفعلي للموظف)',
            };
          }
          return emp;
        })
      );
    },
    []
  );

  // Update employee geofence radius
  const handleUpdateEmployeeRadius = useCallback((empId: string, newRadius: number) => {
    setEmployees((prev) =>
      prev.map((emp) => (emp.id === empId ? { ...emp, radius: newRadius } : emp))
    );
  }, []);

  // Simulate being strictly inside office
  const handleSimulateInside = () => {
    if (!currentEmployee) return;
    setUserCoords({
      lat: currentEmployee.lat + 0.00008,
      lng: currentEmployee.lng + 0.00008,
    });
    setIsSimulatedLocation(true);
    setGpsActive(true);
  };

  // Simulate being far outside office
  const handleSimulateOutside = () => {
    if (!currentEmployee) return;
    setUserCoords({
      lat: currentEmployee.lat + 0.0125,
      lng: currentEmployee.lng + 0.0145,
    });
    setIsSimulatedLocation(true);
    setGpsActive(true);
  };

  // Select or identify employee and sync simulated workplace location
  const handleSelectEmployee = useCallback(
    (empId: string) => {
      setCurrentEmpId(empId);
      const emp = employees.find((e) => e.id === empId);
      if (emp && isSimulatedLocation) {
        setUserCoords({
          lat: emp.lat + 0.00008,
          lng: emp.lng + 0.00008,
        });
      }
    },
    [employees, isSimulatedLocation]
  );

  // Biometric Punch Registration (IN / OUT)
  const handlePunch = (
    type: PunchType,
    snapshotUrl?: string,
    livenessTask: string = 'SMILE',
    confidence: number = 99.2
  ) => {
    const today = getTodayDateString();
    const nowTimeStr = formatArabicTime(new Date());

    // Check if already registered
    const existingLogIndex = logs.findIndex(
      (l) => l.empId === currentEmpId && l.date === today
    );

    if (type === 'IN') {
      if (existingLogIndex >= 0 && logs[existingLogIndex].timeIn) {
        playErrorBuzz();
        Swal.fire({
          title: 'تنبيه: مسجل مسبقاً',
          text: `لقد قمت بتسجيل بصمة الدخول مسبقاً لهذا اليوم في تمام الساعة ${logs[existingLogIndex].timeIn}.`,
          icon: 'warning',
          confirmButtonColor: '#00f2fe',
          background: '#0b1329',
          color: '#f8fafc',
        });
        return;
      }

      // Check shift start for lateness (allow 15 minutes grace)
      const now = new Date();
      const [startHour, startMin] = currentEmployee.shiftStart.split(':').map(Number);
      const shiftLimitDate = new Date();
      shiftLimitDate.setHours(startHour, startMin + 15, 0, 0);
      const isLate = now > shiftLimitDate;

      const newRecord: AttendanceRecord = {
        id: `REC-${Date.now().toString().slice(-6)}`,
        empId: currentEmployee.id,
        empName: currentEmployee.name,
        dept: currentEmployee.dept,
        date: today,
        timeIn: nowTimeStr,
        timeOut: undefined,
        userLat: userCoords.lat,
        userLng: userCoords.lng,
        workplaceLat: currentEmployee.lat,
        workplaceLng: currentEmployee.lng,
        distanceMeters,
        isGeofenceValid: true,
        livenessPassed: true,
        livenessTask,
        confidenceScore: confidence,
        status: isLate ? 'LATE' : 'PRESENT',
        notes: `تم توثيق الحضور ببصمة الوجه الحية (${confidence}%) داخل نطاق العمل (${distanceMeters}م)`,
        snapshot: snapshotUrl,
      };

      setLogs((prev) => [newRecord, ...prev]);
      playSuccessChime();

      // Confetti celebration
      confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.6 },
        colors: ['#00f2fe', '#10b981', '#38bdf8', '#7000ff'],
      });

      Swal.fire({
        title: 'تم تسجيل الحضور بنجاح! 🎉',
        html: `
          <div class="text-right space-y-2 text-sm">
            <p><strong class="text-cyan-300">الموظف:</strong> ${currentEmployee.name}</p>
            <p><strong class="text-cyan-300">وقت البصمة:</strong> <span class="font-mono">${nowTimeStr}</span></p>
            <p><strong class="text-cyan-300">التطابق البيومتري:</strong> <span class="text-emerald-400 font-bold">${confidence}%</span></p>
            <p><strong class="text-cyan-300">البعد الجغرافي:</strong> داخل النطاق (${distanceMeters} متر)</p>
            <p class="text-xs text-slate-400 border-t border-slate-800 pt-2">${
              isLate ? '⚠️ تنبيه: تم تسجيل الدخول بعد موعد بداية الدوام المحدد.' : '✅ حضور منتظم في الموعد.'
            }</p>
          </div>
        `,
        icon: 'success',
        confirmButtonColor: '#00f2fe',
        background: '#0b1329',
        color: '#f8fafc',
      });
    } else {
      // Punch OUT
      if (existingLogIndex < 0 || !logs[existingLogIndex].timeIn) {
        playErrorBuzz();
        Swal.fire({
          title: 'تعذر تسجيل الانصراف',
          text: 'لم يتم العثور على بصمة حضور (دخول) مسجلة لك اليوم لتتمكن من تسجيل الانصراف!',
          icon: 'warning',
          confirmButtonColor: '#00f2fe',
          background: '#0b1329',
          color: '#f8fafc',
        });
        return;
      }

      if (logs[existingLogIndex].timeOut) {
        playErrorBuzz();
        Swal.fire({
          title: 'مسجل مسبقاً',
          text: `تم تسجيل الانصراف لهذا اليوم سابقاً في تمام الساعة ${logs[existingLogIndex].timeOut}.`,
          icon: 'info',
          confirmButtonColor: '#00f2fe',
          background: '#0b1329',
          color: '#f8fafc',
        });
        return;
      }

      // Update existing record
      setLogs((prev) => {
        const updated = [...prev];
        updated[existingLogIndex] = {
          ...updated[existingLogIndex],
          timeOut: nowTimeStr,
          notes: `${updated[existingLogIndex].notes} | تم تسجيل الانصراف: ${nowTimeStr}`,
        };
        return updated;
      });

      playSuccessChime();

      Swal.fire({
        title: 'تم تسجيل الانصراف بنجاح 👋',
        html: `
          <div class="text-right space-y-2 text-sm">
            <p><strong class="text-cyan-300">الموظف:</strong> ${currentEmployee.name}</p>
            <p><strong class="text-cyan-300">وقت الانصراف:</strong> <span class="font-mono">${nowTimeStr}</span></p>
            <p><strong class="text-cyan-300">الموقع الجغرافي:</strong> داخل النطاق المعتمد (${distanceMeters}م)</p>
            <p class="text-emerald-400 font-bold mt-2">رافقتكم السلامة ونراكم غداً بإذن الله!</p>
          </div>
        `,
        icon: 'success',
        confirmButtonColor: '#00f2fe',
        background: '#0b1329',
        color: '#f8fafc',
      });
    }
  };

  // Admin: Save employee (Create / Update)
  const handleSaveEmployee = (emp: Employee) => {
    setEmployees((prev) => {
      const idx = prev.findIndex((e) => e.id === emp.id);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = emp;
        return updated;
      }
      return [emp, ...prev];
    });
  };

  // Admin: Delete employee
  const handleDeleteEmployee = (empId: string) => {
    setEmployees((prev) => prev.filter((e) => e.id !== empId));
    setLogs((prev) => prev.filter((l) => l.empId !== empId));
    if (currentEmpId === empId && employees.length > 1) {
      const remaining = employees.filter((e) => e.id !== empId);
      setCurrentEmpId(remaining[0].id);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-between bg-[#070b14] text-slate-100 selection:bg-cyan-500 selection:text-slate-950 font-sans">
      {/* Top Navigation Header */}
      <Header
        currentRole={currentRole}
        onRoleChange={setCurrentRole}
        gpsActive={gpsActive}
        gpsCoords={userCoords}
        gpsInfo={gpsInfo}
        isLoadingGps={isLoadingGps}
        onRefreshGps={() => handleRefreshRealGps(false)}
      />

      {/* Main Container View */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 flex-1 w-full">
        {currentRole === 'employee' ? (
          <EmployeePortal
            employees={employees}
            currentEmployee={currentEmployee}
            onSelectEmployee={handleSelectEmployee}
            userCoords={userCoords}
            distanceMeters={distanceMeters}
            isInsideGeofence={isInsideGeofence}
            gpsInfo={gpsInfo}
            onRefreshRealGps={() => handleRefreshRealGps(false)}
            onSetCurrentLocationAsWorkplace={handleSetCurrentLocationAsWorkplace}
            onUpdateEmployeeRadius={handleUpdateEmployeeRadius}
            onSimulateInside={handleSimulateInside}
            onSimulateOutside={handleSimulateOutside}
            isSimulatedLocation={isSimulatedLocation}
            isLiveTracking={isLiveTracking}
            onToggleLiveTracking={handleToggleLiveTracking}
            isLoadingGps={isLoadingGps}
            onPunch={handlePunch}
            logs={logs}
          />
        ) : (
          <AdminDashboard
            employees={employees}
            logs={logs}
            onSaveEmployee={handleSaveEmployee}
            onDeleteEmployee={handleDeleteEmployee}
            currentGps={userCoords}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="glass-panel border-t border-slate-800/80 py-4 px-4 sm:px-8 text-center text-xs text-slate-400 no-print">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center space-x-2 space-x-reverse text-slate-400">
            <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
            <span>نظام بصمة الوجه والـ GPS الذكي (BIO-GPS VISION)</span>
          </div>
          <div className="text-[11px] text-slate-500 font-medium">
            جميع الحقوق محفوظة © {new Date().getFullYear()} · تقنية التحقق البيومتري المتقدم ومكافحة الانتحال
          </div>
        </div>
      </footer>
    </div>
  );
}
