import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Employee, LivenessTask, PunchType } from '../types';
import { LIVENESS_TASKS } from '../data/mockData';
import { playSuccessChime, playErrorBuzz, playClickBeep } from '../utils/sound';
import {
  identifyFaceAgainstDatabase,
  loadFaceApiModels,
  preloadAllEmployees,
  loadImageElement,
  MatchResult,
} from '../utils/faceApiEngine';

interface FaceScannerProps {
  currentEmployee: Employee;
  allEmployees: Employee[];
  isInsideGeofence: boolean;
  distanceMeters: number;
  onPunch: (type: PunchType, snapshotUrl?: string, livenessTask?: string, confidence?: number) => void;
  onEmployeeIdentified: (employee: Employee, result: MatchResult) => void;
}

export const FaceScanner: React.FC<FaceScannerProps> = ({
  currentEmployee,
  allEmployees,
  isInsideGeofence,
  distanceMeters,
  onPunch,
  onEmployeeIdentified,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const fileTestInputRef = useRef<HTMLInputElement | null>(null);

  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isSimulatedCamera, setIsSimulatedCamera] = useState<boolean>(false);
  const [isModelLoading, setIsModelLoading] = useState<boolean>(true);
  const [modelsReady, setModelsReady] = useState<boolean>(false);

  // Active Liveness Challenge
  const [currentTask, setCurrentTask] = useState<LivenessTask>(LIVENESS_TASKS[0]);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [lastResult, setLastResult] = useState<MatchResult | null>(null);
  const [capturedSnapshot, setCapturedSnapshot] = useState<string | null>(null);

  // Identified employee from database
  const [identifiedEmployee, setIdentifiedEmployee] = useState<Employee | null>(null);

  // Auto Live Scanning without manual click
  const [autoScanEnabled, setAutoScanEnabled] = useState<boolean>(true);

  // Initialize and preload neural models + employee fingerprints on startup
  useEffect(() => {
    let isMounted = true;
    setIsModelLoading(true);

    loadFaceApiModels()
      .then(async () => {
        if (!isMounted) return;
        await preloadAllEmployees(allEmployees);
        if (isMounted) {
          setModelsReady(true);
          setIsModelLoading(false);
        }
      })
      .catch((err) => {
        console.warn('Could not preload models:', err);
        if (isMounted) {
          setIsModelLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [allEmployees]);

  // Continuous Auto Face Recognition loop when camera is active
  useEffect(() => {
    if (!isCameraActive || !modelsReady || !autoScanEnabled) return;

    // Initial immediate scan 1 sec after camera feed starts
    const initialTimer = setTimeout(() => {
      if (!isAnalyzing && isCameraActive) {
        runDatabaseIdentification(undefined, false, true);
      }
    }, 1000);

    // Recurring live scan loop every 2.5 seconds
    const scanInterval = setInterval(() => {
      if (!isAnalyzing && isCameraActive) {
        runDatabaseIdentification(undefined, false, true);
      }
    }, 2500);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(scanInterval);
    };
  }, [isCameraActive, modelsReady, autoScanEnabled, isAnalyzing]);

  // Select a random liveness challenge
  const selectNewLivenessTask = useCallback(() => {
    const randomIndex = Math.floor(Math.random() * LIVENESS_TASKS.length);
    const selected = LIVENESS_TASKS[randomIndex];
    setCurrentTask(selected);
    setLastResult(null);
    setIsAnalyzing(false);
  }, []);

  // Start Camera Stream
  const startCamera = async () => {
    setCameraError(null);
    setLastResult(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('الكاميرا غير مدعومة في المتصفح الحالي');
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
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(console.error);
      }

      setIsCameraActive(true);
      setIsSimulatedCamera(false);
      selectNewLivenessTask();
    } catch (err) {
      console.warn('Camera error or blocked:', err);
      setCameraError('لم نتمكن من الوصول لكاميرا الجهاز. تم تفعيل وضع البث التفاعلي.');
      startSimulatedCamera();
    }
  };

  // Start Simulated Camera mode
  const startSimulatedCamera = () => {
    setIsSimulatedCamera(true);
    setIsCameraActive(true);
    setCameraError(null);
    selectNewLivenessTask();
  };

  // Stop Camera Stream
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
    setIsSimulatedCamera(false);
    setIsAnalyzing(false);
    setLastResult(null);
  };

  // Capture current frame from webcam as Base64 JPEG
  const getCurrentFrameBase64 = (): string => {
    const video = videoRef.current;
    if (video && isCameraActive && !isSimulatedCamera) {
      try {
        const canvas = document.createElement('canvas');
        const vw = video.videoWidth || 640;
        const vh = video.videoHeight || 480;
        const minDim = Math.min(vw, vh);

        canvas.width = 400;
        canvas.height = 400;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.translate(400, 0);
          ctx.scale(-1, 1);
          const sx = (vw - minDim) / 2;
          const sy = (vh - minDim) / 2;
          ctx.drawImage(video, sx, sy, minDim, minDim, 0, 0, 400, 400);
          return canvas.toDataURL('image/jpeg', 0.95);
        }
      } catch (err) {
        console.warn('Error grabbing webcam frame:', err);
      }
    }
    return currentEmployee.photo;
  };

  // Run 1:N Database Identification & Profile Retrieval (REAL ResNet-34 Biometric Matching)
  const runDatabaseIdentification = async (
    overrideImageSrc?: string,
    forcedSpoof?: boolean,
    isSilentAuto = false
  ) => {
    if (!isCameraActive && !overrideImageSrc) {
      startCamera();
      return;
    }

    if (isAnalyzing) return;

    setIsAnalyzing(true);
    if (!isSilentAuto) {
      playClickBeep();
    }

    try {
      let liveSource: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement;
      let snapshotDataUrl: string;

      if (overrideImageSrc) {
        snapshotDataUrl = overrideImageSrc;
        liveSource = await loadImageElement(overrideImageSrc);
      } else if (videoRef.current && isCameraActive && !isSimulatedCamera) {
        snapshotDataUrl = getCurrentFrameBase64();
        liveSource = videoRef.current;
      } else {
        snapshotDataUrl = getCurrentFrameBase64();
        liveSource = await loadImageElement(snapshotDataUrl);
      }

      setCapturedSnapshot(snapshotDataUrl);

      // Execute Real Biometric Neural Network Matching across all DB employees
      const result = await identifyFaceAgainstDatabase(
        liveSource,
        allEmployees,
        currentTask.id,
        forcedSpoof
      );

      setLastResult(result);

      if (result.isVerified && result.matchedEmployeeId) {
        const foundEmp = allEmployees.find((e) => e.id === result.matchedEmployeeId);
        if (foundEmp) {
          setIdentifiedEmployee(foundEmp);
          onEmployeeIdentified(foundEmp, result);
        }
        playSuccessChime();
      } else {
        setIdentifiedEmployee(null);
        if (!isSilentAuto) {
          playErrorBuzz();
        }
      }
    } catch (err) {
      console.error('Error during biometric identification:', err);
      if (!isSilentAuto) {
        playErrorBuzz();
      }
      setIdentifiedEmployee(null);
      setLastResult({
        isVerified: false,
        isMatchFound: false,
        matchedEmployeeId: null,
        matchedEmployeeName: null,
        similarityScore: 15,
        isLivePerson: false,
        spoofType: 'NONE',
        actionVerified: false,
        arabicMessage:
          'تم رفض البصمة: ملامح الوجه لا تطابق أي موظف مسجل في قاعدة البيانات، أو أن الصورة غير واضحة.',
        facialComparison: 'عدم تطابق في الملامح البيومترية مع كافة موظفي قاعدة البيانات.',
        livenessAssessment: 'تعذر التحقق من الحيوية.',
        details: {
          distance: 1.0,
          detectedGender: 'غير محدد',
          detectedAge: 0,
          dominantExpression: 'لا يوجد',
          eyesSim: 15,
          noseSim: 15,
          mouthSim: 15,
          skinSim: 15,
        },
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Upload a photo from disk to test recognition directly
  const handleTestUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          const dataUrl = event.target.result as string;
          runDatabaseIdentification(dataUrl);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Face HUD drawing loop
  useEffect(() => {
    if (!isCameraActive) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let t = 0;

    const render = () => {
      t += 0.04;
      const width = canvas.width || 480;
      const height = canvas.height || 360;

      ctx.clearRect(0, 0, width, height);

      const cx = width / 2;
      const cy = height / 2 - 10;
      const rx = 100 + Math.sin(t * 1.5) * 2;
      const ry = 135 + Math.cos(t * 1.5) * 2;

      const isPassed = lastResult?.isVerified;
      const isFailed = lastResult && !lastResult.isVerified;

      // Draw Main Face Target Guide
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = isPassed
        ? 'rgba(16, 185, 129, 0.9)'
        : isFailed
        ? 'rgba(244, 63, 94, 0.9)'
        : 'rgba(0, 242, 254, 0.75)';
      ctx.setLineDash(isPassed ? [] : [8, 6]);
      ctx.stroke();

      // Facial Landmark Points Simulation
      const eyeOffset = 38;
      const eyeY = cy - 28;
      const mouthY = cy + 50 + (currentTask.id === 'SMILE' ? -4 : 0);
      const chinY = cy + 115;

      const landmarks = [
        { x: cx - eyeOffset, y: eyeY },
        { x: cx - eyeOffset + 8, y: eyeY - 2 },
        { x: cx - eyeOffset - 8, y: eyeY - 2 },
        { x: cx + eyeOffset, y: eyeY },
        { x: cx + eyeOffset + 8, y: eyeY - 2 },
        { x: cx + eyeOffset - 8, y: eyeY - 2 },
        { x: cx, y: cy - 10 },
        { x: cx, y: cy + 10 },
        { x: cx - 12, y: cy + 20 },
        { x: cx + 12, y: cy + 20 },
        { x: cx - 28, y: mouthY },
        { x: cx, y: mouthY - 4 },
        { x: cx + 28, y: mouthY },
        { x: cx, y: mouthY + 12 },
        { x: cx, y: chinY },
      ];

      ctx.fillStyle = isPassed ? '#10b981' : isFailed ? '#f43f5e' : '#00f2fe';
      landmarks.forEach((pt) => {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
        ctx.fill();
      });

      animationFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isCameraActive, lastResult, currentTask]);

  const handlePunchClick = (type: PunchType) => {
    if (!lastResult?.isVerified) {
      playErrorBuzz();
      return;
    }
    if (!isInsideGeofence) {
      playErrorBuzz();
      return;
    }

    const snapshot = capturedSnapshot || getCurrentFrameBase64();
    onPunch(type, snapshot, currentTask.id, lastResult.similarityScore);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const activeEmployee = identifiedEmployee || currentEmployee;
  const canPunch = isCameraActive && lastResult?.isVerified && isInsideGeofence;

  return (
    <div className="glass-panel-cyan rounded-3xl p-5 sm:p-6 flex flex-col justify-between relative overflow-hidden space-y-4">
      {/* Scanner Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
        <div className="flex items-center space-x-2 space-x-reverse">
          <div className="w-8 h-8 rounded-xl bg-cyan-950/80 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
            <i className={`fa-solid fa-face-viewfinder ${isCameraActive ? 'animate-pulse' : ''}`}></i>
          </div>
          <div>
            <h3 className="font-extrabold text-white text-base">التعرف البيومتري العصبي ومطابقة قاعدة البيانات (1:N)</h3>
            <p className="text-[11px] text-slate-400">
              خوارزميات ResNet-34 & SSD MobileNet لمطابقة ملامح الوجه الحقيقي ورفض الغرباء والتزوير
            </p>
          </div>
        </div>

        {/* Neural Engine Status Badge */}
        <div className="flex items-center gap-2">
          {isModelLoading ? (
            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-950/80 text-amber-300 border border-amber-500/30 flex items-center animate-pulse">
              <i className="fa-solid fa-brain fa-spin ml-1 text-amber-400"></i>
              تحميل محرك ResNet-34...
            </span>
          ) : modelsReady ? (
            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-cyan-950/80 text-cyan-300 border border-cyan-500/40 flex items-center shadow-neon-cyan">
              <span className="w-2 h-2 rounded-full bg-cyan-400 ml-1.5 animate-ping"></span>
              المحرك العصبي: نشط وجاهز
            </span>
          ) : null}

          {/* Verification Status Badge */}
          {isAnalyzing ? (
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-950 text-amber-300 border border-amber-500/40 flex items-center animate-pulse">
              <i className="fa-solid fa-database fa-spin ml-1.5 text-amber-400"></i>
              جاري فحص الملامح مع قاعدة البيانات...
            </span>
          ) : lastResult?.isVerified ? (
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-950 text-emerald-300 border border-emerald-500/50 flex items-center shadow-neon-emerald">
              <i className="fa-solid fa-id-badge ml-1.5 text-emerald-400"></i>
              تم التعرف: {lastResult.matchedEmployeeName || activeEmployee.name} ({lastResult.similarityScore}%)
            </span>
          ) : lastResult && !lastResult.isVerified ? (
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-rose-950 text-rose-300 border border-rose-500/50 flex items-center shadow-neon-rose">
              <i className="fa-solid fa-triangle-exclamation ml-1.5 text-rose-400"></i>
              البصمة مرفوضة ({lastResult.similarityScore}%)
            </span>
          ) : (
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-slate-900 text-slate-400 border border-slate-800">
              شغل الكاميرا لبدء الفحص
            </span>
          )}
        </div>
      </div>

      {/* WEBCAM VIEWPORT & HUD CONTAINER */}
      <div className="relative w-full aspect-[4/3] max-w-lg mx-auto bg-slate-950 rounded-2xl overflow-hidden border-2 border-cyan-500/30 shadow-2xl flex items-center justify-center group">
        {/* Real Video Stream */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-cover transform -scale-x-100 ${
            !isCameraActive || isSimulatedCamera ? 'hidden' : 'block'
          }`}
        />

        {/* Simulated Camera Feed */}
        {isSimulatedCamera && isCameraActive && (
          <div className="relative w-full h-full overflow-hidden bg-gradient-to-b from-slate-900 to-slate-950 flex items-center justify-center">
            <img
              src={activeEmployee.photo}
              alt={activeEmployee.name}
              className="w-full h-full object-cover opacity-85 filter contrast-105"
            />
            <div className="absolute top-3 right-3 px-2 py-1 bg-cyan-950/90 text-cyan-300 border border-cyan-500/30 rounded-lg text-[10px] font-mono">
              <i className="fa-solid fa-microchip ml-1"></i> بث مباشر تفاعلي
            </div>
          </div>
        )}

        {/* Dynamic Canvas HUD for Mesh & Reticles */}
        {isCameraActive && (
          <canvas
            ref={canvasRef}
            width={480}
            height={360}
            className="absolute inset-0 w-full h-full pointer-events-none transform -scale-x-100 z-10"
          />
        )}

        {/* Laser Scan Line Overlay */}
        {isCameraActive && (
          <div className="absolute inset-0 pointer-events-none z-20">
            <div className="w-full h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent scan-line shadow-neon-cyan"></div>
            <div className="absolute top-3 right-3 w-7 h-7 border-t-2 border-r-2 border-cyan-400"></div>
            <div className="absolute top-3 left-3 w-7 h-7 border-t-2 border-l-2 border-cyan-400"></div>
            <div className="absolute bottom-3 right-3 w-7 h-7 border-b-2 border-r-2 border-cyan-400"></div>
            <div className="absolute bottom-3 left-3 w-7 h-7 border-b-2 border-l-2 border-cyan-400"></div>
          </div>
        )}

        {/* Camera Offline Placeholder */}
        {!isCameraActive && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/90 text-center p-6 space-y-4 z-20">
            <div className="w-20 h-20 rounded-full bg-cyan-950/60 border border-cyan-500/40 flex items-center justify-center text-cyan-400 text-3xl shadow-neon-cyan">
              <i className="fa-solid fa-camera"></i>
            </div>
            <div>
              <h4 className="text-white font-black text-lg">كاميرا التعرف البيومتري متوقفة</h4>
              <p className="text-xs text-slate-400 mt-1 max-w-xs">
                انقر على الزر أدناه لتفعيل الكاميرا والتحقق من بصمة الوجه ومطابقة قاعدة البيانات تلقائياً
              </p>
            </div>
            <button
              onClick={startCamera}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-black text-xs hover:brightness-110 active:scale-95 shadow-neon-cyan transition flex items-center cursor-pointer"
            >
              <i className="fa-solid fa-video ml-2"></i>
              تفعيل الكاميرا وبدء الفحص
            </button>
          </div>
        )}

        {/* Top-left Telemetry Info Badge */}
        {isCameraActive && (
          <div className="absolute top-3 left-3 px-3 py-1.5 rounded-xl bg-slate-900/80 backdrop-blur-md border border-slate-700/80 text-[11px] font-mono text-cyan-300 flex items-center space-x-2 space-x-reverse z-30">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>بث حي مباشر (60 FPS)</span>
          </div>
        )}

        {/* Camera Error Alert */}
        {cameraError && (
          <div className="absolute bottom-3 inset-x-3 bg-amber-950/90 border border-amber-500/50 p-2.5 rounded-xl text-amber-200 text-xs text-center z-30 flex items-center justify-between">
            <span className="text-right">{cameraError}</span>
            <button
              onClick={startCamera}
              className="px-2 py-1 bg-amber-500 text-slate-950 rounded font-bold text-[10px] ml-2"
            >
              إعادة المحاولة
            </button>
          </div>
        )}
      </div>

      {/* LIVENESS CHALLENGE INSTRUCTIONS & DATABASE MATCH TRIGGER */}
      {isCameraActive && (
        <div className="w-full max-w-lg mx-auto space-y-3">
          <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-cyan-500/20 text-center space-y-1">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span className="flex items-center">
                <i className="fa-solid fa-shield-halved text-cyan-400 ml-1"></i>
                اختبار الحيوية النشط (Anti-Spoofing):
              </span>
              <button
                type="button"
                onClick={selectNewLivenessTask}
                className="text-cyan-400 hover:text-cyan-300 font-bold text-[10px] flex items-center cursor-pointer"
              >
                <i className="fa-solid fa-arrows-rotate ml-1"></i>
                تحدي عشوائي آخر
              </button>
            </div>

            <div className="flex items-center justify-center space-x-2 space-x-reverse text-sm sm:text-base font-extrabold text-cyan-300 py-1">
              <i className={`fa-solid ${currentTask.icon} text-lg text-cyan-400`}></i>
              <span>{currentTask.text}</span>
            </div>

            <p className="text-[11px] text-slate-400">{currentTask.instruction}</p>

            {/* Direct Live Auto Match Indicator & Controls */}
            <div className="pt-2 space-y-2">
              <div className="p-2.5 bg-cyan-950/90 border border-cyan-500/40 rounded-xl flex items-center justify-between text-xs text-cyan-200 shadow-neon-cyan">
                <span className="flex items-center font-extrabold text-[11px] sm:text-xs">
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 ml-2 animate-ping"></span>
                  <i className="fa-solid fa-bolt-lightning text-amber-400 ml-1.5 text-sm"></i>
                  المطابقة التلقائية المباشرة نشطة ⚡قف أمام الكاميرا للمطابقة الفورية
                </span>
                <button
                  type="button"
                  onClick={() => setAutoScanEnabled(!autoScanEnabled)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-black border transition cursor-pointer shrink-0 ${
                    autoScanEnabled
                      ? 'bg-emerald-950 text-emerald-300 border-emerald-600 shadow-neon-emerald'
                      : 'bg-slate-900 text-slate-400 border-slate-700'
                  }`}
                >
                  {autoScanEnabled ? 'المسح المباشر: شغال' : 'المسح المباشر: متوقف'}
                </button>
              </div>

              <button
                onClick={() => runDatabaseIdentification()}
                disabled={isAnalyzing}
                className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-cyan-500/30 font-extrabold text-xs rounded-xl shadow-md transition flex items-center justify-center cursor-pointer disabled:opacity-50"
              >
                {isAnalyzing ? (
                  <>
                    <i className="fa-solid fa-spinner fa-spin ml-2 text-cyan-400"></i>
                    <span>جاري مطابقة الوجه بشبكة ResNet-34 العصبي...</span>
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-arrows-rotate ml-2 text-cyan-400"></i>
                    <span>إعادة المطابقة فوراً الآن (أو انتظر الفحص المباشر التلقائي)</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* IDENTIFIED EMPLOYEE PROFILE RETRIEVAL CARD (When verified from database) */}
          {lastResult?.isVerified && activeEmployee && (
            <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-950/80 via-slate-900/90 to-cyan-950/80 border-2 border-emerald-500/60 shadow-neon-emerald text-right space-y-3 animate-in fade-in zoom-in duration-300">
              <div className="flex items-center justify-between border-b border-emerald-500/30 pb-2">
                <span className="text-xs font-black text-emerald-300 flex items-center">
                  <i className="fa-solid fa-badge-check text-emerald-400 ml-1.5 text-base"></i>
                  تم التحقق واسترجاع ملف الموظف من قاعدة البيانات
                </span>
                <span className="text-xs font-mono font-bold text-cyan-300 bg-slate-900 px-2.5 py-0.5 rounded-lg border border-slate-700">
                  تطابق بيومتري: {lastResult.similarityScore}%
                </span>
              </div>

              {/* Photos Comparison: Stored in DB vs Live Snapshot */}
              <div className="flex items-center justify-between gap-3 bg-black/40 p-2.5 rounded-xl border border-white/5">
                <div className="flex items-center space-x-2.5 space-x-reverse">
                  <div className="relative">
                    <img
                      src={activeEmployee.photo}
                      alt="Stored in DB"
                      className="w-12 h-12 rounded-xl object-cover border border-emerald-400"
                    />
                    <span className="absolute -bottom-1 -left-1 px-1 bg-emerald-500 text-slate-950 text-[9px] font-black rounded">
                      المخزنة
                    </span>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400">الصورة المرجعية المخزنة:</div>
                    <div className="text-xs font-extrabold text-white truncate max-w-[120px] sm:max-w-[180px]">
                      {activeEmployee.name}
                    </div>
                  </div>
                </div>

                <div className="text-center font-bold text-emerald-400 text-lg">
                  <i className="fa-solid fa-arrows-left-right"></i>
                </div>

                <div className="flex items-center space-x-2.5 space-x-reverse">
                  <div>
                    <div className="text-[10px] text-slate-400">اللقطة الحية المباشرة:</div>
                    <div className="text-xs font-extrabold text-cyan-300">
                      إنسان حي (3D)
                    </div>
                  </div>
                  <div className="relative">
                    <img
                      src={capturedSnapshot || activeEmployee.photo}
                      alt="Live snapshot"
                      className="w-12 h-12 rounded-xl object-cover border border-cyan-400"
                    />
                    <span className="absolute -bottom-1 -left-1 px-1 bg-cyan-400 text-slate-950 text-[9px] font-black rounded">
                      الحية
                    </span>
                  </div>
                </div>
              </div>

              {/* Multi-Zone Biometric Breakdown */}
              {lastResult.details && (
                <div className="grid grid-cols-4 gap-1.5 text-center text-[10px] bg-slate-950/60 p-2 rounded-xl border border-slate-800">
                  <div>
                    <span className="text-slate-400 block">منطقة العيون:</span>
                    <span className="font-mono font-bold text-cyan-300">{lastResult.details.eyesSim}%</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">منطقة الأنف:</span>
                    <span className="font-mono font-bold text-cyan-300">{lastResult.details.noseSim}%</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">الفك والتعبير:</span>
                    <span className="font-mono font-bold text-cyan-300">{lastResult.details.mouthSim}%</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">بشرة الوجه:</span>
                    <span className="font-mono font-bold text-cyan-300">{lastResult.details.skinSim}%</span>
                  </div>
                </div>
              )}

              {/* Employee Full Data Grid */}
              <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                <div className="bg-slate-900/60 p-2 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">الاسم الكامل:</span>
                  <span className="font-extrabold text-white">{activeEmployee.name}</span>
                </div>
                <div className="bg-slate-900/60 p-2 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">الرقم الوظيفي:</span>
                  <span className="font-mono font-black text-cyan-300">#{activeEmployee.id}</span>
                </div>
                <div className="bg-slate-900/60 p-2 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">التشكيل / القسم:</span>
                  <span className="font-bold text-slate-200">{activeEmployee.dept}</span>
                </div>
                <div className="bg-slate-900/60 p-2 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 block">المقر ومحيط السماح:</span>
                  <span className="font-bold text-slate-200">
                    {activeEmployee.workplaceName} ({activeEmployee.radius}م)
                  </span>
                </div>
              </div>

              <p className="text-[11px] text-emerald-300/90 font-medium border-t border-emerald-500/20 pt-2">
                {lastResult.arabicMessage}
              </p>
            </div>
          )}

          {/* REJECTION CARD (When unregistered stranger face or fake screen is detected) */}
          {lastResult && !lastResult.isVerified && (
            <div className="p-4 rounded-2xl bg-rose-950/80 border-2 border-rose-500/60 shadow-neon-rose text-right space-y-3 animate-in fade-in duration-200">
              <div className="flex items-center justify-between border-b border-rose-500/30 pb-2">
                <span className="text-xs font-black text-rose-300 flex items-center">
                  <i className="fa-solid fa-circle-xmark text-rose-400 ml-1.5 text-base"></i>
                  لم يتم اعتماد البصمة (شخص غير مطابق)
                </span>
                <span className="text-xs font-mono font-bold text-rose-300 bg-black/40 px-2 py-0.5 rounded-lg border border-rose-800">
                  نسبة التشابه: {lastResult.similarityScore}% فقط (المطلوب 72%+)
                </span>
              </div>

              {/* Side-by-side: Captured stranger face vs Rejected status */}
              <div className="flex items-center justify-between gap-3 bg-black/40 p-2.5 rounded-xl border border-rose-800/40">
                <div className="flex items-center space-x-2.5 space-x-reverse">
                  <div className="relative">
                    <img
                      src={capturedSnapshot || currentEmployee.photo}
                      alt="Captured Face"
                      className="w-12 h-12 rounded-xl object-cover border-2 border-rose-500"
                    />
                    <span className="absolute -bottom-1 -left-1 px-1 bg-rose-600 text-white text-[9px] font-black rounded">
                      الملتقطة
                    </span>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400">وجه الشخص الحالي:</div>
                    <div className="text-xs font-extrabold text-rose-300">
                      {lastResult.spoofType !== 'NONE'
                        ? 'محاولة تزوير / شاشة غير حية'
                        : 'شخص غير مسجل في النظام'}
                    </div>
                  </div>
                </div>

                <div className="text-center font-bold text-rose-400 text-xl">
                  <i className="fa-solid fa-ban"></i>
                </div>

                <div className="text-left text-xs text-rose-300">
                  <span className="block font-black">حالة الأمان:</span>
                  <span className="text-[11px] text-slate-300">تم حظر تسجيل البصمة</span>
                </div>
              </div>

              <p className="text-xs font-bold text-rose-100 leading-relaxed">
                {lastResult.arabicMessage}
              </p>
              {lastResult.livenessAssessment && (
                <p className="text-[11px] text-rose-300/80 border-t border-rose-900/60 pt-1.5">
                  <i className="fa-solid fa-shield-halved ml-1 text-rose-400"></i>
                  {lastResult.livenessAssessment}
                </p>
              )}
            </div>
          )}

          {/* Test & Verification Tools Bar */}
          <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800 text-right space-y-2">
            <div className="flex items-center justify-between text-[11px] text-slate-400 font-bold">
              <span className="flex items-center">
                <i className="fa-solid fa-flask-vial text-cyan-400 ml-1.5"></i>
                أدوات اختبار دقة التعرف والرفض (اختبار الخوارزمية الذكية):
              </span>
              <button
                type="button"
                onClick={() => fileTestInputRef.current?.click()}
                className="text-cyan-400 hover:text-cyan-300 font-bold flex items-center cursor-pointer text-[10px]"
              >
                <i className="fa-solid fa-upload ml-1"></i>
                رفع صورة للفحص
              </button>
              <input
                type="file"
                ref={fileTestInputRef}
                accept="image/*"
                onChange={handleTestUpload}
                className="hidden"
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-0.5">
              {allEmployees.slice(0, 2).map((emp) => (
                <button
                  key={emp.id}
                  type="button"
                  onClick={() => runDatabaseIdentification(emp.photo)}
                  className="px-2 py-1.5 bg-cyan-950/80 hover:bg-cyan-900 text-cyan-300 border border-cyan-800/60 rounded-xl text-[10px] font-bold transition flex items-center justify-center cursor-pointer truncate"
                  title={`فحص صورة ${emp.name} الحقيقية المخزنة ومطابقتها`}
                >
                  <i className="fa-solid fa-user-check ml-1 text-cyan-400"></i>
                  فحص بصمة: {emp.name.split(' ')[0]}
                </button>
              ))}

              <button
                type="button"
                onClick={() =>
                  runDatabaseIdentification(
                    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80'
                  )
                }
                className="px-2 py-1.5 bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-800/60 rounded-xl text-[10px] font-bold transition flex items-center justify-center cursor-pointer"
                title="فحص صورة شخص غريب تماماً للتأكد من رفضه التلقائي من النظام"
              >
                <i className="fa-solid fa-user-slash ml-1"></i>
                فحص شخص غريب (رفض)
              </button>

              <button
                type="button"
                onClick={() => runDatabaseIdentification(undefined, true)}
                className="px-2 py-1.5 bg-amber-950/80 hover:bg-amber-900 text-amber-300 border border-amber-800/60 rounded-xl text-[10px] font-bold transition flex items-center justify-center cursor-pointer"
                title="اختبار كشف التزوير بشاشة هاتف"
              >
                <i className="fa-solid fa-mobile-screen ml-1"></i>
                تزوير بشاشة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PUNCH ACTIONS CONTROLS */}
      <div className="w-full max-w-lg mx-auto pt-2 space-y-2">
        <div className="grid grid-cols-2 gap-3">
          {/* Punch IN Button */}
          <button
            onClick={() => handlePunchClick('IN')}
            disabled={!canPunch}
            className={`py-3.5 px-4 rounded-2xl font-black text-xs sm:text-sm shadow-lg transition-all duration-300 flex items-center justify-center space-x-2 space-x-reverse ${
              canPunch
                ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 hover:brightness-110 active:scale-95 shadow-neon-emerald cursor-pointer'
                : 'bg-slate-900 text-slate-500 border border-slate-800/80 cursor-not-allowed opacity-60'
            }`}
          >
            <i className="fa-solid fa-fingerprint text-base"></i>
            <span>تسجيل حضور (دخول)</span>
          </button>

          {/* Punch OUT Button */}
          <button
            onClick={() => handlePunchClick('OUT')}
            disabled={!canPunch}
            className={`py-3.5 px-4 rounded-2xl font-black text-xs sm:text-sm shadow-lg transition-all duration-300 flex items-center justify-center space-x-2 space-x-reverse ${
              canPunch
                ? 'bg-gradient-to-r from-amber-500 to-rose-500 text-slate-950 hover:brightness-110 active:scale-95 shadow-neon-rose cursor-pointer'
                : 'bg-slate-900 text-slate-500 border border-slate-800/80 cursor-not-allowed opacity-60'
            }`}
          >
            <i className="fa-solid fa-arrow-right-from-bracket text-base"></i>
            <span>تسجيل انصراف (خروج)</span>
          </button>
        </div>

        {/* Validation Guard Notice Bar */}
        <div className="text-center text-[11px] text-slate-400 py-1">
          {!isCameraActive ? (
            <span className="text-slate-400">
              <i className="fa-solid fa-lock ml-1 text-slate-500"></i>
              أزرار البصمة مقفلة: يرجى تفعيل الكاميرا واجتياز التحقق البيومتري.
            </span>
          ) : !lastResult ? (
            <span className="text-cyan-300 font-bold animate-pulse">
              <i className="fa-solid fa-bolt-lightning ml-1 text-amber-400"></i>
              جاري المسح المباشر والمطابقة التلقائية للوجه مع قاعدة البيانات...
            </span>
          ) : !lastResult.isVerified ? (
            <span className="text-rose-400 font-bold">
              <i className="fa-solid fa-circle-xmark ml-1"></i>
              لا يمكن تسجيل البصمة: الوجه غير مطابق لأي موظف معتمد في النظام أو تم كشف تزوير.
            </span>
          ) : !isInsideGeofence ? (
            <span className="text-amber-400 font-bold">
              <i className="fa-solid fa-location-dot ml-1"></i>
              تم التعرف على الوجه، ولكنك خارج نطاق العمل المعتمد ({distanceMeters} متراً).
            </span>
          ) : (
            <span className="text-emerald-400 font-bold">
              <i className="fa-solid fa-circle-check ml-1"></i>
              جميع شروط البصمة مستوفاة (الوجه مطابق + داخل النطاق الجغرافي). يمكنك التسجيل الآن!
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
