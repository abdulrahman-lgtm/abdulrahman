export interface Employee {
  id: string;
  name: string;
  jobTitle: string;
  dept: string;
  nationalId: string;
  workplaceName: string;
  lat: number;
  lng: number;
  radius: number; // in meters
  shiftStart: string; // "08:00"
  shiftEnd: string; // "16:00"
  photo: string;
  enrolledAt: string;
}

export type PunchType = 'IN' | 'OUT';

export type AttendanceStatus = 'PRESENT' | 'LATE' | 'ABSENT' | 'DEVIATION';

export interface AttendanceRecord {
  id: string;
  empId: string;
  empName: string;
  dept: string;
  date: string; // YYYY-MM-DD
  timeIn?: string;
  timeOut?: string;
  userLat: number;
  userLng: number;
  workplaceLat: number;
  workplaceLng: number;
  distanceMeters: number;
  isGeofenceValid: boolean;
  livenessPassed: boolean;
  livenessTask: string;
  confidenceScore: number;
  status: AttendanceStatus;
  notes: string;
  snapshot?: string;
}

export interface LivenessTask {
  id: string;
  text: string;
  instruction: string;
  icon: string;
  durationMs: number;
}

export interface GpsLocationInfo {
  lat: number;
  lng: number;
  accuracy: number;
  altitude?: number | null;
  speed?: number | null;
  source: 'gps' | 'network' | 'ip' | 'simulated';
  address?: string;
  city?: string;
  country?: string;
  timestamp: number;
}
