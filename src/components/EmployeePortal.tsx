import React from 'react';
import { Employee, AttendanceRecord, PunchType, GpsLocationInfo } from '../types';
import { FaceScanner } from './FaceScanner';
import { GpsRadar } from './GpsRadar';
import { EmployeeLogs } from './EmployeeLogs';

interface EmployeePortalProps {
  employees: Employee[];
  currentEmployee: Employee;
  onSelectEmployee: (empId: string) => void;
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
  onPunch: (type: PunchType, snapshotUrl?: string, livenessTask?: string, confidence?: number) => void;
  logs: AttendanceRecord[];
}

export const EmployeePortal: React.FC<EmployeePortalProps> = ({
  employees,
  currentEmployee,
  onSelectEmployee,
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
  onPunch,
  logs,
}) => {
  return (
    <section className="space-y-6">
      {/* Employee Profile Header & Interactive Switcher Bar */}
      <div className="glass-panel p-4 sm:p-5 rounded-3xl flex flex-wrap items-center justify-between gap-4 border-r-4 border-r-cyan-400">
        {/* Profile Card */}
        <div className="flex items-center space-x-4 space-x-reverse">
          <div className="relative">
            <img
              src={currentEmployee.photo}
              alt={currentEmployee.name}
              className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl object-cover border-2 border-cyan-400/50 shadow-neon-cyan"
            />
            <span
              className={`absolute -bottom-1 -left-1 w-4 h-4 rounded-full border-2 border-slate-900 ${
                isInsideGeofence ? 'bg-emerald-500' : 'bg-rose-500'
              }`}
              title={isInsideGeofence ? 'الموظف داخل النطاق' : 'الموظف خارج النطاق'}
            ></span>
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-lg bg-cyan-950 text-cyan-300 border border-cyan-800/60">
                {currentEmployee.dept}
              </span>
              <span className="text-xs font-mono text-slate-400 font-bold">
                #{currentEmployee.id}
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-black text-white mt-1">
              {currentEmployee.name}
            </h2>
            <p className="text-xs text-slate-400 font-medium">
              {currentEmployee.jobTitle} · الدوام: {currentEmployee.shiftStart} - {currentEmployee.shiftEnd}
            </p>
          </div>
        </div>

        {/* Quick Employee Switcher (for demoing different users and locations) */}
        <div className="flex items-center space-x-2 space-x-reverse bg-slate-950/80 px-3 py-2 rounded-2xl border border-slate-800">
          <i className="fa-solid fa-users text-cyan-400 text-sm"></i>
          <label className="text-xs text-slate-300 font-bold hidden md:inline">
            تبديل الموظف للتجربة:
          </label>
          <select
            value={currentEmployee.id}
            onChange={(e) => onSelectEmployee(e.target.value)}
            className="text-xs bg-slate-900 border border-slate-700 text-cyan-300 font-bold rounded-xl px-3 py-2 focus:ring-2 focus:ring-cyan-400 outline-none cursor-pointer"
          >
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.name} ({emp.dept})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Grid: Face Scanner & Radar Telemetry */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Biometric Face Scanner & Liveness Detection (7 Cols) */}
        <div className="lg:col-span-7">
          <FaceScanner
            currentEmployee={currentEmployee}
            allEmployees={employees}
            isInsideGeofence={isInsideGeofence}
            distanceMeters={distanceMeters}
            onPunch={onPunch}
            onEmployeeIdentified={(emp) => onSelectEmployee(emp.id)}
          />
        </div>

        {/* Right Column: GPS Geofence Radar & Daily Logs (5 Cols) */}
        <div className="lg:col-span-5 space-y-6">
          <GpsRadar
            currentEmployee={currentEmployee}
            userCoords={userCoords}
            distanceMeters={distanceMeters}
            isInsideGeofence={isInsideGeofence}
            gpsInfo={gpsInfo}
            onRefreshRealGps={onRefreshRealGps}
            onSetCurrentLocationAsWorkplace={onSetCurrentLocationAsWorkplace}
            onUpdateEmployeeRadius={onUpdateEmployeeRadius}
            onSimulateInside={onSimulateInside}
            onSimulateOutside={onSimulateOutside}
            isSimulatedLocation={isSimulatedLocation}
            isLiveTracking={isLiveTracking}
            onToggleLiveTracking={onToggleLiveTracking}
            isLoadingGps={isLoadingGps}
          />

          <EmployeeLogs currentEmployee={currentEmployee} logs={logs} />
        </div>
      </div>
    </section>
  );
};
