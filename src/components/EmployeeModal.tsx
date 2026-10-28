import React, { useState, useEffect, useRef } from 'react';
import { Employee } from '../types';
import { playClickBeep, playSuccessChime } from '../utils/sound';
import { getRealGeolocation } from '../utils/geo';
import Swal from 'sweetalert2';

interface EmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (employee: Employee) => void;
  editingEmployee?: Employee | null;
  currentGps: { lat: number; lng: number };
}

// Preset reference photos available for instant selection
const PRESET_PHOTOS = [
  { name: 'أحمد', url: '/src/assets/images/emp_ahmed_it_1793123015978.jpg' },
  { name: 'فاطمة', url: '/src/assets/images/emp_fatima_hr_1793123016580.jpg' },
  { name: 'كرار', url: '/src/assets/images/emp_karrar_finance_1793123017158.jpg' },
  { name: 'سارة', url: '/src/assets/images/emp_sara_ops_1793123016988.jpg' },
];

export const EmployeeModal: React.FC<EmployeeModalProps> = ({
  isOpen,
  onClose,
  onSave,
  editingEmployee,
  currentGps,
}) => {
  const [name, setName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [dept, setDept] = useState('قسم تكنولوجيا المعلومات');
  const [id, setId] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [workplaceName, setWorkplaceName] = useState('المقر الرئيسي - مبنى الإدارة');
  const [lat, setLat] = useState(currentGps.lat);
  const [lng, setLng] = useState(currentGps.lng);
  const [radius, setRadius] = useState(100);
  const [shiftStart, setShiftStart] = useState('08:00');
  const [shiftEnd, setShiftEnd] = useState('16:00');
  const [photo, setPhoto] = useState('/src/assets/images/emp_ahmed_it_1793123015978.jpg');
  const [photoCapturedSuccess, setPhotoCapturedSuccess] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isFetchingRealGps, setIsFetchingRealGps] = useState(false);

  // Real GPS Location acquisition for HQ setting
  const handleSetRealLocationAsHQ = async () => {
    playClickBeep();
    setIsFetchingRealGps(true);
    try {
      const loc = await getRealGeolocation();
      setLat(loc.lat);
      setLng(loc.lng);
      if (loc.address) {
        setWorkplaceName(loc.address);
      } else {
        setWorkplaceName(`المقر الحالي المباشر (${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)})`);
      }
      playSuccessChime();

      Swal.fire({
        title: 'تم قراءة موقعك الفعلي بنجاح',
        html: `
          <div class="text-right text-xs space-y-2 text-slate-300">
            <p class="font-mono text-cyan-300">خط العرض (Latitude): <b>${loc.lat.toFixed(6)}</b></p>
            <p class="font-mono text-cyan-300">خط الطول (Longitude): <b>${loc.lng.toFixed(6)}</b></p>
            ${
              loc.address
                ? `<div class="bg-slate-900/90 p-2.5 rounded-xl border border-slate-800 text-cyan-200 mt-2">
                    <div class="text-[10px] text-slate-400">العنوان الجغرافي الحقيقي:</div>
                    <b>${loc.address}</b>
                  </div>`
                : ''
            }
            <div class="text-[11px] text-slate-400 pt-1">
              مصدر الإشارة: <b class="text-emerald-400">${
                loc.source === 'gps'
                  ? 'أقمار صناعية (GPS عالي الدقة)'
                  : loc.source === 'network'
                  ? 'شبكة الهاتف المحمول و Wi-Fi'
                  : 'تحديد موقع عبر IP'
              }</b> (دقة ±${loc.accuracy || 10}m)
            </div>
          </div>
        `,
        icon: 'success',
        confirmButtonColor: '#00f2fe',
        background: '#0b1329',
        color: '#f8fafc',
      });
    } catch (err) {
      console.warn('Failed to fetch real location inside modal:', err);
      setLat(currentGps.lat);
      setLng(currentGps.lng);
      Swal.fire({
        title: 'تنبيه تعذر جلب الموقع الفعلي',
        text: 'تم تعيين موقع النظام الحالي بدلاً من ذلك. يرجى التأكد من السماح بالوصول للموقع في إعدادات المتصفح.',
        icon: 'warning',
        confirmButtonColor: '#00f2fe',
        background: '#0b1329',
        color: '#f8fafc',
      });
    } finally {
      setIsFetchingRealGps(false);
    }
  };

  // Webcam snapshot inside modal
  const [isCameraActive, setIsCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editingEmployee) {
      setName(editingEmployee.name);
      setJobTitle(editingEmployee.jobTitle);
      setDept(editingEmployee.dept);
      setId(editingEmployee.id);
      setNationalId(editingEmployee.nationalId || '');
      setWorkplaceName(editingEmployee.workplaceName);
      setLat(editingEmployee.lat);
      setLng(editingEmployee.lng);
      setRadius(editingEmployee.radius);
      setShiftStart(editingEmployee.shiftStart);
      setShiftEnd(editingEmployee.shiftEnd);
      setPhoto(editingEmployee.photo || '/src/assets/images/emp_ahmed_it_1793123015978.jpg');
      setPhotoCapturedSuccess(false);
      setCameraError(null);
    } else {
      setName('');
      setJobTitle('');
      setDept('قسم تكنولوجيا المعلومات');
      setId(`EMP-${Math.floor(100 + Math.random() * 900)}`);
      setNationalId('');
      setWorkplaceName('المقر الرئيسي - مبنى الابتكار');
      setLat(currentGps.lat);
      setLng(currentGps.lng);
      setRadius(100);
      setShiftStart('08:00');
      setShiftEnd('16:00');
      setPhoto('/src/assets/images/emp_ahmed_it_1793123015978.jpg');
      setPhotoCapturedSuccess(false);
      setCameraError(null);
    }
  }, [editingEmployee, currentGps, isOpen]);

  // Clean stop of video tracks
  const stopCameraSnap = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  };

  const startCameraSnap = async () => {
    setCameraError(null);
    setPhotoCapturedSuccess(false);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('خدمة الكاميرا غير مدعومة في المتصفح');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
        },
        audio: false,
      });

      streamRef.current = stream;
      setIsCameraActive(true);

      // Attach stream to video element
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(console.error);
      }
    } catch (err) {
      console.warn('Camera error in modal:', err);
      setCameraError('تعذر الوصول لكاميرا الجهاز. يمكنك رفع صورة من جهازك أو اختيار بصمة جاهزة.');
      setIsCameraActive(false);
    }
  };

  // Re-attach video stream if needed when camera state turns true
  useEffect(() => {
    if (isCameraActive && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(console.error);
    }
  }, [isCameraActive]);

  // Take Snapshot from video element
  const takeSnapshot = () => {
    const video = videoRef.current;
    if (!video) return;

    try {
      const canvas = document.createElement('canvas');
      const vw = video.videoWidth || 480;
      const vh = video.videoHeight || 480;
      const minDim = Math.min(vw, vh);

      canvas.width = 400;
      canvas.height = 400;
      const ctx = canvas.getContext('2d');

      if (ctx) {
        // Mirror the image horizontally to match what the user sees in the webcam
        ctx.translate(400, 0);
        ctx.scale(-1, 1);

        const sx = (vw - minDim) / 2;
        const sy = (vh - minDim) / 2;
        ctx.drawImage(video, sx, sy, minDim, minDim, 0, 0, 400, 400);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
        if (dataUrl && dataUrl.length > 50) {
          setPhoto(dataUrl);
          setPhotoCapturedSuccess(true);
          playSuccessChime();
        }
      }
    } catch (err) {
      console.error('Error capturing snapshot:', err);
    }

    stopCameraSnap();
  };

  // Handle uploading image from user device
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setPhoto(event.target.result as string);
          setPhotoCapturedSuccess(true);
          stopCameraSnap();
          playSuccessChime();
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSelectPreset = (url: string) => {
    playClickBeep();
    setPhoto(url);
    setPhotoCapturedSuccess(true);
    stopCameraSnap();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const employeeData: Employee = {
      id: id || `EMP-${Date.now().toString().slice(-4)}`,
      name,
      jobTitle: jobTitle || 'موظف',
      dept,
      nationalId,
      workplaceName,
      lat: Number(lat),
      lng: Number(lng),
      radius: Number(radius),
      shiftStart,
      shiftEnd,
      photo: photo || '/src/assets/images/emp_ahmed_it_1793123015978.jpg',
      enrolledAt: editingEmployee?.enrolledAt || new Date().toISOString().split('T')[0],
    };

    stopCameraSnap();
    onSave(employeeData);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto no-print">
      <div className="glass-panel-cyan rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden border border-cyan-500/40 my-8">
        
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-900/90 border-b border-slate-800 flex justify-between items-center">
          <div className="flex items-center space-x-2 space-x-reverse">
            <div className="w-8 h-8 rounded-xl bg-cyan-950/80 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
              <i className="fa-solid fa-id-card-clip text-base"></i>
            </div>
            <h3 className="font-extrabold text-white text-base">
              {editingEmployee ? 'تعديل بيانات الموظف والبصمة المرجعية' : 'تسجيل موظف جديد وحفظ بصمة الوجه'}
            </h3>
          </div>
          <button
            onClick={() => {
              stopCameraSnap();
              onClose();
            }}
            className="text-slate-400 hover:text-white transition p-1 cursor-pointer"
          >
            <i className="fa-solid fa-xmark text-lg"></i>
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-5 max-h-[82vh] overflow-y-auto custom-scroll text-right">
          
          {/* Biometric Face Photo Enrollment Box */}
          <div className="p-4 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-900 pb-2">
              <span className="text-xs font-bold text-cyan-300 flex items-center">
                <i className="fa-solid fa-face-viewfinder text-cyan-400 ml-1.5 text-sm"></i>
                صورة بصمة الوجه المرجعية (Biometric Face Descriptor)
              </span>
              {photoCapturedSuccess && (
                <span className="text-[11px] font-bold text-emerald-400 flex items-center bg-emerald-950/80 px-2.5 py-0.5 rounded-full border border-emerald-800">
                  <i className="fa-solid fa-circle-check ml-1"></i> تم التقاط واعتماد الصورة
                </span>
              )}
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-5 pt-1">
              {/* Photo / Camera Viewport (Always in DOM) */}
              <div className="relative w-36 h-36 rounded-2xl overflow-hidden border-2 border-cyan-400/50 bg-slate-900 shrink-0 shadow-neon-cyan flex items-center justify-center">
                
                {/* Real Video Element (always mounted to prevent null ref) */}
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover transform -scale-x-100 ${
                    isCameraActive ? 'block' : 'hidden'
                  }`}
                />

                {/* Displayed Photo when camera is inactive */}
                {!isCameraActive && (
                  <img
                    src={photo || '/src/assets/images/emp_ahmed_it_1793123015978.jpg'}
                    alt="Face descriptor reference"
                    className="w-full h-full object-cover"
                  />
                )}

                {/* Scanner reticle overlay during camera */}
                {isCameraActive && (
                  <div className="absolute inset-0 pointer-events-none border-2 border-cyan-400/60 rounded-2xl">
                    <div className="w-full h-0.5 bg-cyan-400 scan-line"></div>
                    <div className="absolute inset-2 border border-dashed border-cyan-400/40 rounded-full"></div>
                  </div>
                )}
              </div>

              {/* Action Buttons & Guidance */}
              <div className="flex-1 space-y-2.5 text-center sm:text-right">
                <p className="text-xs text-slate-300 font-medium">
                  التقط صورة واضحة للوجه عبر الكاميرا أو ارفع صورة شخصية لحفظ الخصائص البيومترية للموظف.
                </p>

                {cameraError && (
                  <div className="text-[11px] text-amber-300 bg-amber-950/60 p-2 rounded-xl border border-amber-800">
                    <i className="fa-solid fa-triangle-exclamation ml-1"></i>
                    {cameraError}
                  </div>
                )}

                <div className="flex flex-wrap gap-2 pt-1 justify-center sm:justify-start">
                  {isCameraActive ? (
                    <>
                      <button
                        type="button"
                        onClick={takeSnapshot}
                        className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 text-xs font-black rounded-xl shadow-neon-emerald hover:brightness-110 active:scale-95 transition flex items-center cursor-pointer"
                      >
                        <i className="fa-solid fa-camera ml-1.5"></i>
                        التقاط الصورة الآن
                      </button>
                      <button
                        type="button"
                        onClick={stopCameraSnap}
                        className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition cursor-pointer"
                      >
                        إلغاء
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={startCameraSnap}
                        className="px-4 py-2 bg-gradient-to-r from-cyan-400 to-sky-500 text-slate-950 text-xs font-black rounded-xl shadow-neon-cyan hover:brightness-110 active:scale-95 transition flex items-center cursor-pointer"
                      >
                        <i className="fa-solid fa-camera ml-1.5"></i>
                        فتح الكاميرا للالتقاط
                      </button>

                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-slate-700 text-xs font-bold rounded-xl transition flex items-center cursor-pointer"
                      >
                        <i className="fa-solid fa-upload ml-1.5"></i>
                        رفع صورة من الجهاز
                      </button>
                      <input
                        type="file"
                        ref={fileInputRef}
                        accept="image/*"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                    </>
                  )}
                </div>

                {/* Preset Avatars Bar */}
                <div className="pt-1.5 flex flex-wrap items-center gap-1.5 justify-center sm:justify-start">
                  <span className="text-[10px] text-slate-400 ml-1">أو اختر بصمة جاهزة:</span>
                  {PRESET_PHOTOS.map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => handleSelectPreset(preset.url)}
                      className={`relative w-7 h-7 rounded-lg overflow-hidden border transition cursor-pointer ${
                        photo === preset.url
                          ? 'border-cyan-400 ring-2 ring-cyan-400/50 scale-105'
                          : 'border-slate-700 hover:border-slate-500 opacity-70 hover:opacity-100'
                      }`}
                      title={preset.name}
                    >
                      <img src={preset.url} alt={preset.name} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>

              </div>
            </div>
          </div>

          {/* Basic Employee Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                الاسم الكامل للموظف <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثال: أحمد محمود التميمي"
                className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-xl p-2.5 focus:ring-2 focus:ring-cyan-400 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                المسمى الوظيفي
              </label>
              <input
                type="text"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="مثال: مهندس برمجيات أول"
                className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-xl p-2.5 focus:ring-2 focus:ring-cyan-400 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                الرقم الوظيفي (كود الموظف) <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                value={id}
                onChange={(e) => setId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 text-cyan-300 font-mono font-bold text-xs rounded-xl p-2.5 focus:ring-2 focus:ring-cyan-400 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                التشكيل / القسم الإداري
              </label>
              <select
                value={dept}
                onChange={(e) => setDept(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-xl p-2.5 focus:ring-2 focus:ring-cyan-400 outline-none"
              >
                <option value="قسم تكنولوجيا المعلومات">قسم تكنولوجيا المعلومات</option>
                <option value="إدارة الموارد البشرية">إدارة الموارد البشرية</option>
                <option value="الدائرة المالية">الدائرة المالية</option>
                <option value="قسم العمليات واللوجستيات">قسم العمليات واللوجستيات</option>
                <option value="الشؤون القانونية">الشؤون القانونية</option>
                <option value="خدمة العملاء والدعم">خدمة العملاء والدعم</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                بداية وقت الدوام الرسمي
              </label>
              <input
                type="time"
                value={shiftStart}
                onChange={(e) => setShiftStart(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-xl p-2.5 font-mono outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                نهاية وقت الدوام الرسمي
              </label>
              <input
                type="time"
                value={shiftEnd}
                onChange={(e) => setShiftEnd(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-xl p-2.5 font-mono outline-none"
              />
            </div>
          </div>

          {/* Workplace & Geofence GPS Configuration */}
          <div className="border-t border-slate-800 pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-cyan-400">
                  إعدادات النطاق الجغرافي للموظف (GPS Geofence)
                </h4>
                <p className="text-[11px] text-slate-400">
                  تحديد إحداثيات مقر العمل ونصف قطر السماح بالأمتار
                </p>
              </div>

              <button
                type="button"
                disabled={isFetchingRealGps}
                onClick={handleSetRealLocationAsHQ}
                className="text-[11px] text-emerald-300 font-bold bg-emerald-950/80 px-3 py-1.5 rounded-xl border border-emerald-700/60 hover:bg-emerald-900 transition flex items-center cursor-pointer disabled:opacity-50"
              >
                {isFetchingRealGps ? (
                  <>
                    <i className="fa-solid fa-spinner fa-spin ml-1 text-emerald-400"></i>
                    جاري التقاط الـ GPS الفعلي...
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-location-crosshairs ml-1 text-emerald-400"></i>
                    تعيين موقعي الحالي كمقر
                  </>
                )}
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                اسم المقر أو المبنى المحدد
              </label>
              <input
                type="text"
                value={workplaceName}
                onChange={(e) => setWorkplaceName(e.target.value)}
                placeholder="مثال: المقر الرئيسي - مبنى الإدارة"
                className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-xl p-2.5 focus:ring-2 focus:ring-cyan-400 outline-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  خط العرض (Latitude)
                </label>
                <input
                  type="number"
                  step="any"
                  required
                  value={lat}
                  onChange={(e) => setLat(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-xl p-2.5 font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  خط الطول (Longitude)
                </label>
                <input
                  type="number"
                  step="any"
                  required
                  value={lng}
                  onChange={(e) => setLng(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-xl p-2.5 font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  نطاق السماح (بالأمتار)
                </label>
                <input
                  type="number"
                  min="20"
                  max="5000"
                  required
                  value={radius}
                  onChange={(e) => setRadius(parseInt(e.target.value) || 100)}
                  className="w-full bg-slate-950 border border-slate-700 text-cyan-300 text-xs rounded-xl p-2.5 font-mono font-bold"
                />
              </div>
            </div>
          </div>

          {/* Footer Buttons */}
          <div className="pt-4 flex items-center justify-end space-x-3 space-x-reverse border-t border-slate-800">
            <button
              type="button"
              onClick={() => {
                stopCameraSnap();
                onClose();
              }}
              className="px-5 py-2.5 text-xs font-bold text-slate-400 hover:text-white transition cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 text-xs font-black text-slate-950 bg-gradient-to-r from-cyan-400 to-sky-500 rounded-xl shadow-neon-cyan hover:brightness-110 active:scale-95 transition cursor-pointer"
            >
              <i className="fa-solid fa-floppy-disk ml-1.5"></i>
              حفظ بيانات الموظف والبصمة
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
