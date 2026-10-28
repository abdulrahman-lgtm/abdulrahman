import React from 'react';
import { AttendanceRecord, Employee } from '../types';

interface EmployeeLogsProps {
  currentEmployee: Employee;
  logs: AttendanceRecord[];
}

export const EmployeeLogs: React.FC<EmployeeLogsProps> = ({ currentEmployee, logs }) => {
  const employeeLogs = logs.filter((l) => l.empId === currentEmployee.id);

  return (
    <div className="glass-panel p-5 sm:p-6 rounded-3xl flex flex-col justify-between">
      
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2 space-x-reverse">
          <div className="w-8 h-8 rounded-xl bg-cyan-950/80 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
            <i className="fa-solid fa-clock-rotate-left"></i>
          </div>
          <div>
            <h3 className="font-extrabold text-white text-base">سجل بصماتي اليومية</h3>
            <p className="text-[11px] text-slate-400">حركات الحضور والانصراف المسجلة للوجه والـ GPS</p>
          </div>
        </div>
        <span className="text-[11px] text-slate-400 font-mono">
          {employeeLogs.length} حركة مسجلة
        </span>
      </div>

      {/* Table Container */}
      <div className="overflow-y-auto max-h-64 custom-scroll border border-slate-800 rounded-2xl">
        <table className="w-full text-right text-xs">
          <thead className="bg-slate-950/90 text-slate-400 border-b border-slate-800 sticky top-0 z-10">
            <tr>
              <th className="p-3 font-bold">التاريخ</th>
              <th className="p-3 font-bold">وقت الدخول</th>
              <th className="p-3 font-bold">وقت الخروج</th>
              <th className="p-3 font-bold">مسافة الـ GPS</th>
              <th className="p-3 font-bold">بصمة الوجه</th>
              <th className="p-3 font-bold">الحالة</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
            {employeeLogs.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-slate-500">
                  <i className="fa-solid fa-fingerprint text-3xl mb-2 text-slate-600 block"></i>
                  <span>لم يتم تسجيل أي بصمة لهذا الموظف اليوم بعد</span>
                </td>
              </tr>
            ) : (
              employeeLogs.map((log) => {
                const isPresent = log.status === 'PRESENT';
                const isLate = log.status === 'LATE';

                return (
                  <tr key={log.id} className="hover:bg-slate-800/50 transition">
                    <td className="p-3 font-semibold text-slate-300 whitespace-nowrap">
                      {log.date}
                    </td>
                    <td className="p-3 font-mono font-bold text-cyan-300 whitespace-nowrap">
                      {log.timeIn || '--'}
                    </td>
                    <td className="p-3 font-mono text-slate-400 whitespace-nowrap">
                      {log.timeOut || '--'}
                    </td>
                    <td className="p-3 font-mono text-xs whitespace-nowrap">
                      <span className={log.isGeofenceValid ? 'text-emerald-400' : 'text-rose-400'}>
                        {log.distanceMeters} م
                      </span>
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <div className="flex items-center space-x-1.5 space-x-reverse text-emerald-400 font-semibold text-[11px]">
                        <i className="fa-solid fa-face-smile"></i>
                        <span>موثوق ({log.confidenceScore}%)</span>
                      </div>
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      {isPresent ? (
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                          حاضر في الوقت
                        </span>
                      ) : isLate ? (
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-950 text-amber-300 border border-amber-800">
                          متأخر
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-950 text-rose-300 border border-rose-800">
                          غائب
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
};
