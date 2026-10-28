import React, { useState } from 'react';
import { Employee, AttendanceRecord } from '../types';
import { EmployeeModal } from './EmployeeModal';
import { getTodayDateString } from '../utils/date';
import { playClickBeep } from '../utils/sound';
import Swal from 'sweetalert2';

interface AdminDashboardProps {
  employees: Employee[];
  logs: AttendanceRecord[];
  onSaveEmployee: (emp: Employee) => void;
  onDeleteEmployee: (empId: string) => void;
  currentGps: { lat: number; lng: number };
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  employees,
  logs,
  onSaveEmployee,
  onDeleteEmployee,
  currentGps,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'employees' | 'reports'>('overview');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);

  // Reports Filter States
  const todayStr = getTodayDateString();
  const [reportDate, setReportDate] = useState<string>(todayStr);
  const [reportDept, setReportDept] = useState<string>('ALL');
  const [reportStatus, setReportStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Statistics calculation for today
  const todayLogs = logs.filter((l) => l.date === todayStr);
  const totalEmployees = employees.length;
  const presentEmployees = todayLogs.filter((l) => l.status === 'PRESENT').length;
  const lateEmployees = todayLogs.filter((l) => l.status === 'LATE').length;
  const absentEmployees = Math.max(0, totalEmployees - (presentEmployees + lateEmployees));
  const outOfRangeAttempts = logs.filter((l) => !l.isGeofenceValid).length;

  // Handle open modal for new employee
  const handleAddNewEmployee = () => {
    playClickBeep();
    setEditingEmployee(null);
    setIsModalOpen(true);
  };

  // Handle open modal for editing employee
  const handleEditEmployee = (emp: Employee) => {
    playClickBeep();
    setEditingEmployee(emp);
    setIsModalOpen(true);
  };

  // Handle employee delete
  const handleDeleteClick = (emp: Employee) => {
    playClickBeep();
    Swal.fire({
      title: 'هل أنت متأكد من الحذف؟',
      text: `سيتم حذف الموظف "${emp.name}" وبصمة وجهه المرجعية نهائياً من النظام.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#f43f5e',
      cancelButtonColor: '#334155',
      confirmButtonText: 'نعم، احذف',
      cancelButtonText: 'إلغاء',
      background: '#0b1329',
      color: '#f8fafc',
    }).then((result) => {
      if (result.isConfirmed) {
        onDeleteEmployee(emp.id);
        Swal.fire({
          title: 'تم الحذف بنجاح',
          text: 'تمت إزالة سجل الموظف وبصمته من قاعدة البيانات.',
          icon: 'success',
          confirmButtonColor: '#00f2fe',
          background: '#0b1329',
          color: '#f8fafc',
        });
      }
    });
  };

  // Export CSV Handler with UTF-8 BOM for perfect Arabic display in Excel
  const handleExportCSV = () => {
    playClickBeep();
    let csv = '\uFEFFالرقم الوظيفي,اسم الموظف,التشكيل / القسم,التاريخ,وقت الحضور,وقت الانصراف,حالة النطاق الجغرافي,حالة البصمة الحيوية,الحالة العامة\n';

    const filtered = getFilteredReportData();
    filtered.forEach((item) => {
      const statusText =
        item.status === 'PRESENT'
          ? 'حاضر في الوقت'
          : item.status === 'LATE'
          ? 'متأخر'
          : 'غائب';
      const gpsText = item.log ? (item.log.isGeofenceValid ? 'داخل النطاق' : 'خارج النطاق') : '--';
      const bioText = item.log ? `موثوق (${item.log.confidenceScore}%)` : '--';

      csv += `"${item.employee.id}","${item.employee.name}","${item.employee.dept}","${reportDate}","${
        item.log?.timeIn || '--'
      }","${item.log?.timeOut || '--'}","${gpsText}","${bioText}","${statusText}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `تقرير_حضور_بصمة_الوجه_${reportDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filtered data for report table
  const getFilteredReportData = () => {
    return employees
      .filter((emp) => {
        if (reportDept !== 'ALL' && emp.dept !== reportDept) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchName = emp.name.toLowerCase().includes(q);
          const matchCode = emp.id.toLowerCase().includes(q);
          if (!matchName && !matchCode) return false;
        }
        return true;
      })
      .map((employee) => {
        const log = logs.find((l) => l.empId === employee.id && l.date === reportDate);
        let status: 'PRESENT' | 'LATE' | 'ABSENT' = 'ABSENT';
        if (log) {
          status = log.status === 'PRESENT' ? 'PRESENT' : 'LATE';
        }
        return { employee, log, status };
      })
      .filter((item) => {
        if (reportStatus !== 'ALL' && item.status !== reportStatus) return false;
        return true;
      });
  };

  const reportData = getFilteredReportData();
  const allDepts = Array.from(new Set(employees.map((e) => e.dept)));

  return (
    <section className="space-y-6">
      
      {/* Admin Navigation Tabs */}
      <div className="glass-panel p-2 rounded-2xl flex flex-wrap gap-2 border-slate-800 no-print">
        <button
          onClick={() => {
            playClickBeep();
            setActiveTab('overview');
          }}
          className={`px-5 py-2.5 rounded-xl font-bold text-xs transition flex items-center space-x-1.5 space-x-reverse cursor-pointer ${
            activeTab === 'overview'
              ? 'bg-gradient-to-r from-cyan-400 to-sky-500 text-slate-950 shadow-neon-cyan'
              : 'text-slate-300 hover:bg-slate-800/60'
          }`}
        >
          <i className="fa-solid fa-chart-pie ml-1.5"></i>
          <span>لوحة المتابعة والمؤشرات الحية</span>
        </button>

        <button
          onClick={() => {
            playClickBeep();
            setActiveTab('employees');
          }}
          className={`px-5 py-2.5 rounded-xl font-bold text-xs transition flex items-center space-x-1.5 space-x-reverse cursor-pointer ${
            activeTab === 'employees'
              ? 'bg-gradient-to-r from-cyan-400 to-sky-500 text-slate-950 shadow-neon-cyan'
              : 'text-slate-300 hover:bg-slate-800/60'
          }`}
        >
          <i className="fa-solid fa-users-gear ml-1.5"></i>
          <span>إدارة الموظفين والبصمات المرجعية</span>
        </button>

        <button
          onClick={() => {
            playClickBeep();
            setActiveTab('reports');
          }}
          className={`px-5 py-2.5 rounded-xl font-bold text-xs transition flex items-center space-x-1.5 space-x-reverse cursor-pointer ${
            activeTab === 'reports'
              ? 'bg-gradient-to-r from-cyan-400 to-sky-500 text-slate-950 shadow-neon-cyan'
              : 'text-slate-300 hover:bg-slate-800/60'
          }`}
        >
          <i className="fa-solid fa-file-invoice ml-1.5"></i>
          <span>تقارير الحضور والغياب المتقدمة</span>
        </button>
      </div>

      {/* ========================================= */}
      {/* TAB 1: OVERVIEW & LIVE PUNCH MONITOR */}
      {/* ========================================= */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          
          {/* Summary KPI Cards Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5 sm:gap-4">
            
            <div className="glass-panel p-4 sm:p-5 rounded-3xl border-slate-800 flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-bold">إجمالي الموظفين</span>
                <i className="fa-solid fa-users text-cyan-400 text-lg"></i>
              </div>
              <div className="text-2xl sm:text-3xl font-black font-mono text-white tabular-nums">
                {totalEmployees}
              </div>
              <span className="text-[10px] text-cyan-400/80 font-medium mt-1">
                مسجلين ببصمة الوجه
              </span>
            </div>

            <div className="glass-panel p-4 sm:p-5 rounded-3xl border-slate-800 flex flex-col justify-between">
              <div className="flex items-center justify-between text-emerald-400 mb-2">
                <span className="text-xs font-bold">حاضرون في الوقت</span>
                <i className="fa-solid fa-user-check text-lg"></i>
              </div>
              <div className="text-2xl sm:text-3xl font-black font-mono text-emerald-400 tabular-nums">
                {presentEmployees}
              </div>
              <span className="text-[10px] text-emerald-400/80 font-medium mt-1">
                داخل النطاق الجغرافي
              </span>
            </div>

            <div className="glass-panel p-4 sm:p-5 rounded-3xl border-slate-800 flex flex-col justify-between">
              <div className="flex items-center justify-between text-amber-400 mb-2">
                <span className="text-xs font-bold">المتأخرون اليوم</span>
                <i className="fa-solid fa-clock-rotate-left text-lg"></i>
              </div>
              <div className="text-2xl sm:text-3xl font-black font-mono text-amber-400 tabular-nums">
                {lateEmployees}
              </div>
              <span className="text-[10px] text-amber-400/80 font-medium mt-1">
                بعد مواعيد الدوام المحددة
              </span>
            </div>

            <div className="glass-panel p-4 sm:p-5 rounded-3xl border-slate-800 flex flex-col justify-between">
              <div className="flex items-center justify-between text-rose-400 mb-2">
                <span className="text-xs font-bold">المتغيبون اليوم</span>
                <i className="fa-solid fa-user-xmark text-lg"></i>
              </div>
              <div className="text-2xl sm:text-3xl font-black font-mono text-rose-400 tabular-nums">
                {absentEmployees}
              </div>
              <span className="text-[10px] text-rose-400/80 font-medium mt-1">
                لم تسجل لهم حركة حضور
              </span>
            </div>

            <div className="col-span-2 lg:col-span-1 glass-panel p-4 sm:p-5 rounded-3xl border-slate-800 flex flex-col justify-between">
              <div className="flex items-center justify-between text-purple-400 mb-2">
                <span className="text-xs font-bold">تجاوز النطاق الجغرافي</span>
                <i className="fa-solid fa-map-location-dot text-lg"></i>
              </div>
              <div className="text-2xl sm:text-3xl font-black font-mono text-purple-300 tabular-nums">
                {outOfRangeAttempts}
              </div>
              <span className="text-[10px] text-purple-400/80 font-medium mt-1">
                محاولات محجوبة أمنياً
              </span>
            </div>

          </div>

          {/* Live Realtime Logs Stream Table */}
          <div className="glass-panel p-5 sm:p-6 rounded-3xl border-slate-800">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2 space-x-reverse">
                <div className="w-8 h-8 rounded-xl bg-cyan-950/80 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
                  <i className="fa-solid fa-wave-pulse animate-pulse"></i>
                </div>
                <div>
                  <h3 className="font-extrabold text-white text-base">
                    سجل البصمات الحية المرصودة اليوم
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    تدفق بيانات بصمة الوجه والـ GPS ومطابقة الحيوية بالثواني
                  </p>
                </div>
              </div>
              <span className="text-xs font-mono text-cyan-400 bg-slate-900 px-3 py-1 rounded-xl border border-slate-800">
                {todayLogs.length} حركة مسجلة اليوم
              </span>
            </div>

            <div className="overflow-x-auto border border-slate-800 rounded-2xl">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-950/90 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="p-3.5 font-bold">الموظف</th>
                    <th className="p-3.5 font-bold">التشكيل / القسم</th>
                    <th className="p-3.5 font-bold">وقت الدخول</th>
                    <th className="p-3.5 font-bold">وقت الخروج</th>
                    <th className="p-3.5 font-bold">فحص الحيوية</th>
                    <th className="p-3.5 font-bold">مسافة الـ GPS</th>
                    <th className="p-3.5 font-bold">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                  {todayLogs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-500">
                        لم يتم تسجيل حركات حضور وانصراف لليوم بعد
                      </td>
                    </tr>
                  ) : (
                    todayLogs.map((log) => {
                      const emp = employees.find((e) => e.id === log.empId);
                      return (
                        <tr key={log.id} className="hover:bg-slate-800/50 transition">
                          <td className="p-3.5">
                            <div className="flex items-center space-x-3 space-x-reverse">
                              <img
                                src={emp?.photo || '/src/assets/images/emp_ahmed_it_1793123015978.jpg'}
                                alt=""
                                className="w-8 h-8 rounded-xl object-cover border border-cyan-500/40"
                              />
                              <div>
                                <div className="font-extrabold text-white">{log.empName}</div>
                                <div className="text-[10px] font-mono text-slate-400">
                                  #{log.empId}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="p-3.5 text-slate-300">{log.dept}</td>
                          <td className="p-3.5 font-mono font-bold text-cyan-300">
                            {log.timeIn || '--'}
                          </td>
                          <td className="p-3.5 font-mono text-slate-400">
                            {log.timeOut || '--'}
                          </td>
                          <td className="p-3.5">
                            <span className="text-emerald-400 font-semibold flex items-center text-[11px]">
                              <i className="fa-solid fa-face-smile ml-1"></i>
                              موثوق ({log.confidenceScore}%)
                            </span>
                          </td>
                          <td className="p-3.5 font-mono">
                            <span
                              className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                                log.isGeofenceValid
                                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                  : 'bg-rose-950 text-rose-300 border border-rose-800'
                              }`}
                            >
                              {log.distanceMeters} متر
                            </span>
                          </td>
                          <td className="p-3.5">
                            {log.status === 'PRESENT' ? (
                              <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                                حاضر في الوقت
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-950 text-amber-300 border border-amber-800">
                                متأخر
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

        </div>
      )}

      {/* ========================================= */}
      {/* TAB 2: EMPLOYEE MANAGEMENT & ENROLLMENT */}
      {/* ========================================= */}
      {activeTab === 'employees' && (
        <div className="space-y-6">
          
          {/* Actions & Header */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="font-extrabold text-white text-lg">
                إدارة بيانات الموظفين والبصمة المرجعية
              </h3>
              <p className="text-xs text-slate-400">
                تسجيل بصمات الوجه البيومترية، وإحداثيات مقرات العمل ونطاقات الـ GPS
              </p>
            </div>

            <button
              onClick={handleAddNewEmployee}
              className="px-5 py-2.5 bg-gradient-to-r from-cyan-400 to-sky-500 text-slate-950 font-black rounded-xl text-xs shadow-neon-cyan hover:brightness-110 active:scale-95 transition flex items-center cursor-pointer"
            >
              <i className="fa-solid fa-user-plus ml-2"></i>
              إضافة موظف وبصمة جديدة
            </button>
          </div>

          {/* Employee Directory Table */}
          <div className="glass-panel rounded-3xl overflow-hidden border-slate-800">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-950/90 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="p-4 font-bold">بصمة الوجه المرجعية</th>
                    <th className="p-4 font-bold">اسم الموظف</th>
                    <th className="p-4 font-bold">الرقم الوظيفي</th>
                    <th className="p-4 font-bold">التشكيل / القسم</th>
                    <th className="p-4 font-bold">مقر العمل المعتمد</th>
                    <th className="p-4 font-bold">إحداثيات المقر (GPS)</th>
                    <th className="p-4 font-bold">نطاق السماح</th>
                    <th className="p-4 font-bold text-center">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                  {employees.map((emp) => (
                    <tr key={emp.id} className="hover:bg-slate-800/50 transition">
                      <td className="p-4">
                        <img
                          src={emp.photo}
                          alt={emp.name}
                          className="w-11 h-11 rounded-xl object-cover border border-cyan-500/40 shadow-sm"
                        />
                      </td>
                      <td className="p-4">
                        <div className="font-extrabold text-white text-sm">{emp.name}</div>
                        <div className="text-[11px] text-slate-400">{emp.jobTitle}</div>
                      </td>
                      <td className="p-4 font-mono font-bold text-cyan-300">
                        #{emp.id}
                      </td>
                      <td className="p-4 text-slate-300">{emp.dept}</td>
                      <td className="p-4 text-slate-300 max-w-xs truncate">
                        {emp.workplaceName}
                      </td>
                      <td className="p-4 font-mono text-slate-400 text-xs">
                        {emp.lat.toFixed(4)}, {emp.lng.toFixed(4)}
                      </td>
                      <td className="p-4 font-mono font-bold text-cyan-400">
                        {emp.radius} متر
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center space-x-2 space-x-reverse">
                          <button
                            onClick={() => handleEditEmployee(emp)}
                            title="تعديل بيانات وبصمة الموظف"
                            className="p-2 text-cyan-400 hover:text-cyan-200 hover:bg-slate-800 rounded-lg transition cursor-pointer"
                          >
                            <i className="fa-solid fa-pen-to-square"></i>
                          </button>
                          <button
                            onClick={() => handleDeleteClick(emp)}
                            title="حذف الموظف"
                            className="p-2 text-rose-400 hover:text-rose-200 hover:bg-slate-800 rounded-lg transition cursor-pointer"
                          >
                            <i className="fa-solid fa-trash-can"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* ========================================= */}
      {/* TAB 3: ADVANCED REPORTS & EXPORT */}
      {/* ========================================= */}
      {activeTab === 'reports' && (
        <div className="space-y-6">
          
          {/* Filters Bar */}
          <div className="glass-panel p-5 sm:p-6 rounded-3xl space-y-4 no-print border-slate-800">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-extrabold text-white text-base">
                خيارات تصفية وتوليد التقارير المتقدمة
              </h3>
              <span className="text-xs text-slate-400 font-semibold">
                نتائج التقرير: {reportData.length} سجل
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Search */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  بحث باسم أو كود الموظف
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="اكتب للبحث..."
                    className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-xl p-2.5 pl-8 focus:ring-2 focus:ring-cyan-400 outline-none"
                  />
                  <i className="fa-solid fa-magnifying-glass absolute left-3 top-3 text-slate-500 text-xs"></i>
                </div>
              </div>

              {/* Department Filter */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  التشكيل / القسم
                </label>
                <select
                  value={reportDept}
                  onChange={(e) => setReportDept(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-xl p-2.5 focus:ring-2 focus:ring-cyan-400 outline-none cursor-pointer"
                >
                  <option value="ALL">جميع التشكيلات والأقسام</option>
                  {allDepts.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              {/* Status Filter */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  حالة الحضور
                </label>
                <select
                  value={reportStatus}
                  onChange={(e) => setReportStatus(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-xl p-2.5 focus:ring-2 focus:ring-cyan-400 outline-none cursor-pointer"
                >
                  <option value="ALL">الجميع (حاضر، متأخر، غائب)</option>
                  <option value="PRESENT">حاضر في الوقت فقط</option>
                  <option value="LATE">المتأخرين فقط</option>
                  <option value="ABSENT">المتغيبين فقط</option>
                </select>
              </div>

              {/* Date Filter */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  تاريخ التقرير
                </label>
                <input
                  type="date"
                  value={reportDate}
                  onChange={(e) => setReportDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-cyan-300 text-xs rounded-xl p-2 font-mono outline-none cursor-pointer"
                />
              </div>
            </div>

            {/* Print & Export Buttons */}
            <div className="flex flex-wrap items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                onClick={() => {
                  playClickBeep();
                  window.print();
                }}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition flex items-center cursor-pointer"
              >
                <i className="fa-solid fa-print ml-2 text-cyan-400"></i>
                طباعة التقرير (Print View)
              </button>

              <button
                onClick={handleExportCSV}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 rounded-xl text-xs font-black transition flex items-center shadow-neon-emerald cursor-pointer"
              >
                <i className="fa-solid fa-file-csv ml-2"></i>
                تصدير البيانات إلى ملف Excel / CSV
              </button>
            </div>

          </div>

          {/* Printable Report Title (Only shows when printing) */}
          <div className="hidden print-only mb-6 text-center border-b pb-4">
            <h1 className="text-2xl font-black">
              تقرير الحضور والغياب ببصمة الوجه الجغرافية
            </h1>
            <p className="text-sm text-slate-600 mt-1">تاريخ التقرير: {reportDate}</p>
          </div>

          {/* Report Results Table */}
          <div className="glass-panel rounded-3xl overflow-hidden border-slate-800">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-950/90 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="p-3.5 font-bold">الموظف</th>
                    <th className="p-3.5 font-bold">الرقم الوظيفي</th>
                    <th className="p-3.5 font-bold">التشكيل / القسم</th>
                    <th className="p-3.5 font-bold">وقت الدخول</th>
                    <th className="p-3.5 font-bold">وقت الخروج</th>
                    <th className="p-3.5 font-bold">اختبار الحيوية (Liveness)</th>
                    <th className="p-3.5 font-bold">النطاق الجغرافي</th>
                    <th className="p-3.5 font-bold">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                  {reportData.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-slate-500 font-semibold">
                        لا توجد سجلات تطابق الفلتر والخيارات المحددة
                      </td>
                    </tr>
                  ) : (
                    reportData.map((item) => (
                      <tr key={item.employee.id} className="hover:bg-slate-800/50 transition">
                        <td className="p-3.5">
                          <div className="font-extrabold text-white">{item.employee.name}</div>
                          <div className="text-[10px] text-slate-400">{item.employee.jobTitle}</div>
                        </td>
                        <td className="p-3.5 font-mono font-bold text-cyan-300">
                          #{item.employee.id}
                        </td>
                        <td className="p-3.5 text-slate-300">{item.employee.dept}</td>
                        <td className="p-3.5 font-mono font-bold text-cyan-300">
                          {item.log?.timeIn || '--'}
                        </td>
                        <td className="p-3.5 font-mono text-slate-400">
                          {item.log?.timeOut || '--'}
                        </td>
                        <td className="p-3.5 text-xs">
                          {item.log ? (
                            <span className="text-emerald-400 font-bold flex items-center">
                              <i className="fa-solid fa-face-smile ml-1"></i>
                              تم بنجاح ({item.log.confidenceScore}%)
                            </span>
                          ) : (
                            <span className="text-slate-500">لم يتم الاختبار</span>
                          )}
                        </td>
                        <td className="p-3.5 font-mono text-xs">
                          {item.log ? (
                            <span
                              className={
                                item.log.isGeofenceValid ? 'text-emerald-400' : 'text-rose-400'
                              }
                            >
                              {item.log.distanceMeters} م (
                              {item.log.isGeofenceValid ? 'مطابق' : 'مخالف'})
                            </span>
                          ) : (
                            <span className="text-slate-500">--</span>
                          )}
                        </td>
                        <td className="p-3.5">
                          {item.status === 'PRESENT' ? (
                            <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                              حاضر في الوقت
                            </span>
                          ) : item.status === 'LATE' ? (
                            <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-950 text-amber-300 border border-amber-800">
                              متأخر
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-950 text-rose-300 border border-rose-800">
                              غائب
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* Employee Add/Edit Modal */}
      <EmployeeModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={(emp) => {
          onSaveEmployee(emp);
          setIsModalOpen(false);
          Swal.fire({
            title: 'تم الحفظ بنجاح',
            text: `تم حفظ بيانات الموظف "${emp.name}" وبصمة وجهه المرجعية.`,
            icon: 'success',
            confirmButtonColor: '#00f2fe',
            background: '#0b1329',
            color: '#f8fafc',
          });
        }}
        editingEmployee={editingEmployee}
        currentGps={currentGps}
      />

    </section>
  );
};
