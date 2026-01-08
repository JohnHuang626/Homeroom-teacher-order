import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  RotateCw,
  Trash2,
  CalendarDays,
  CalendarPlus,
  ArrowRight,
  BarChart3,
  ArrowUpCircle,
  ArrowDownCircle,
  AlertCircle,
  Settings,
  X,
  RefreshCcw,
  UserMinus,
  Plus,
  Clock,
  History as HistoryIcon,
  GripVertical,
  CheckCircle2,
  Wifi,
  WifiOff,
} from 'lucide-react';

// --- Firebase Imports ---
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import {
  getFirestore,
  doc,
  collection,
  setDoc,
  addDoc,
  deleteDoc,
  updateDoc,
  onSnapshot,
  query,
  serverTimestamp,
} from 'firebase/firestore';

// --- Firebase Configuration ---
const firebaseConfig = {
  apiKey: 'AIzaSyAJ3km2zXugbilRHGkEqfBOuOItvhkJMhI',
  authDomain: 'homeroom-teacher-order.firebaseapp.com',
  projectId: 'homeroom-teacher-order',
  storageBucket: 'homeroom-teacher-order.firebasestorage.app',
  messagingSenderId: '782002092074',
  appId: '1:782002092074:web:293eb99f896b904cf4eb53',
};

// 初始化 Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// 設定固定的 App ID
const appId = 'school-rotation-system';

const App = () => {
  // --- State ---
  const [user, setUser] = useState(null);
  const [teachers, setTeachers] = useState([]);
  const [history, setHistory] = useState([]);
  const [requests, setRequests] = useState([]);

  // 為了避免白畫面，預設為 true，讓 UI 先渲染，連線狀態由 Wifi icon 指示
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isOnline, setIsOnline] = useState(false);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAddingRequest, setIsAddingRequest] = useState(false);

  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    action: () => {},
  });

  const [newTeacher, setNewTeacher] = useState({ name: '', subject: '' });
  const [newRequest, setNewRequest] = useState({
    absentName: '',
    date: new Date().toISOString().split('T')[0],
    substituteId: '',
  });

  // --- 1. Authentication ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (error) {
        console.error('Auth Error:', error);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true); // 認證狀態確定後，顯示主畫面
      setIsOnline(!!currentUser);
    });
    return () => unsubscribe();
  }, []);

  // --- 2. Firestore Listeners ---
  useEffect(() => {
    if (!user) return;

    // A. 監聽老師名單 (roster/list)
    const rosterRef = doc(
      db,
      'artifacts',
      appId,
      'public',
      'data',
      'roster',
      'list'
    );

    const unsubTeachers = onSnapshot(
      rosterRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data && data.teachers && Array.isArray(data.teachers)) {
            setTeachers(data.teachers);
          } else {
            setTeachers([]);
          }
        } else {
          // 預設資料
          const defaultTeachers = [
            {
              id: 't-1',
              name: '王大明',
              subject: '數學',
              totalSubstitutions: 0,
              isAvailable: true,
            },
            {
              id: 't-2',
              name: '李美華',
              subject: '英文',
              totalSubstitutions: 0,
              isAvailable: true,
            },
          ];
          setDoc(rosterRef, { teachers: defaultTeachers });
        }
      },
      (error) => console.error('Teachers sync error:', error)
    );

    // B. 監聽 Requests
    const requestsQuery = query(
      collection(db, 'artifacts', appId, 'public', 'data', 'requests')
    );
    const unsubRequests = onSnapshot(
      requestsQuery,
      (snapshot) => {
        const list = [];
        snapshot.forEach((doc) => list.push({ id: doc.id, ...doc.data() }));
        list.sort((a, b) => {
          const tA = new Date(a.createdAt).getTime();
          const tB = new Date(b.createdAt).getTime();
          return (isNaN(tB) ? 0 : tB) - (isNaN(tA) ? 0 : tA);
        });
        setRequests(list);
      },
      (error) => console.error('Requests sync error:', error)
    );

    // C. 監聽 History
    const historyQuery = query(
      collection(db, 'artifacts', appId, 'public', 'data', 'history')
    );
    const unsubHistory = onSnapshot(
      historyQuery,
      (snapshot) => {
        const list = [];
        snapshot.forEach((doc) => list.push({ id: doc.id, ...doc.data() }));
        list.sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        );
        setHistory(list);
      },
      (error) => console.error('History sync error:', error)
    );

    return () => {
      unsubTeachers();
      unsubRequests();
      unsubHistory();
    };
  }, [user]);

  // --- Helper Functions ---
  const updateRoster = async (newTeacherList) => {
    if (!user) return;
    try {
      const rosterRef = doc(
        db,
        'artifacts',
        appId,
        'public',
        'data',
        'roster',
        'list'
      );
      await setDoc(rosterRef, { teachers: newTeacherList }, { merge: true });
    } catch (e) {
      console.error('更新名單失敗', e);
    }
  };

  const activeRequests = requests.filter(
    (r) => r.status === 'pending' || r.status === 'accepted'
  );
  const busyTeacherIds = useMemo(
    () => new Set(activeRequests.map((r) => r.substituteId)),
    [activeRequests]
  );
  const availableTeachers = teachers.filter((t) => t.isAvailable);
  const nextRecommendedTeacher = useMemo(
    () =>
      availableTeachers.find((t) => !busyTeacherIds.has(t.id)) ||
      availableTeachers[0],
    [availableTeachers, busyTeacherIds]
  );

  const closeConfirmModal = () =>
    setConfirmModal((prev) => ({ ...prev, isOpen: false }));

  // --- Event Handlers ---
  const handleAddTeacher = (e) => {
    e.preventDefault();
    if (!newTeacher.name.trim()) return;

    const teacher = {
      id: `t-${Date.now()}`,
      name: newTeacher.name.trim(),
      subject: newTeacher.subject.trim() || '專任',
      totalSubstitutions: 0,
      isAvailable: true,
    };

    const newList = [teacher, ...teachers];
    updateRoster(newList);
    setNewTeacher({ name: '', subject: '' });
  };

  const handleRemoveTeacher = (id) => {
    setConfirmModal({
      isOpen: true,
      title: '移除老師',
      message: '確定要移除這位老師嗎？這將會同步影響所有使用者的畫面。',
      confirmBtnColor: 'bg-red-500 hover:bg-red-600',
      action: async () => {
        const newList = teachers.filter((t) => t.id !== id);
        await updateRoster(newList);
        closeConfirmModal();
      },
    });
  };

  const handleMove = (index, direction) => {
    const next = [...teachers];
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= next.length) return;
    const temp = next[index];
    next[index] = next[target];
    next[target] = temp;
    updateRoster(next);
  };

  const handleResetCounts = () => {
    setConfirmModal({
      isOpen: true,
      title: '次數歸零',
      message: '確定要將所有人的「代理次數歸零」嗎？此操作不可逆。',
      confirmBtnColor: 'bg-amber-500 hover:bg-amber-600',
      action: async () => {
        const newList = teachers.map((t) => ({
          ...t,
          totalSubstitutions: 0,
          lastSubstitutedDate: undefined,
        }));
        await updateRoster(newList);
        closeConfirmModal();
      },
    });
  };

  const handleClearAll = () => {
    setConfirmModal({
      isOpen: true,
      title: '危險操作：清空所有資料',
      message: '確定要「清空所有資料」嗎？名單將被清空，請謹慎操作。',
      confirmBtnColor: 'bg-red-600 hover:bg-red-700',
      action: async () => {
        await updateRoster([]);
        closeConfirmModal();
      },
    });
  };

  const toggleAvailability = (id) => {
    const newList = teachers.map((t) =>
      t.id === id ? { ...t, isAvailable: !t.isAvailable } : t
    );
    updateRoster(newList);
  };

  const createRequest = async () => {
    if (!user) return;
    const selectedTeacher = teachers.find(
      (t) => t.id === newRequest.substituteId
    );
    if (!newRequest.absentName || !selectedTeacher) return;

    try {
      await addDoc(
        collection(db, 'artifacts', appId, 'public', 'data', 'requests'),
        {
          substituteId: selectedTeacher.id,
          substituteName: selectedTeacher.name,
          absentTeacherName: newRequest.absentName,
          date: newRequest.date,
          status: 'pending',
          createdAt: new Date().toISOString(),
        }
      );
      setIsAddingRequest(false);
      setNewRequest((prev) => ({ ...prev, absentName: '' }));
    } catch (e) {
      console.error('建立任務失敗', e);
    }
  };

  const acceptRequest = async (reqId) => {
    try {
      const reqRef = doc(
        db,
        'artifacts',
        appId,
        'public',
        'data',
        'requests',
        reqId
      );
      await updateDoc(reqRef, { status: 'accepted' });
    } catch (e) {
      console.error('接受任務失敗', e);
    }
  };

  const deleteRequest = async (reqId) => {
    try {
      const reqRef = doc(
        db,
        'artifacts',
        appId,
        'public',
        'data',
        'requests',
        reqId
      );
      await deleteDoc(reqRef);
    } catch (e) {
      console.error('刪除任務失敗', e);
    }
  };

  const confirmCompletion = async (request) => {
    if (!user) return;
    try {
      await addDoc(
        collection(db, 'artifacts', appId, 'public', 'data', 'history'),
        {
          substituteId: request.substituteId,
          substituteName: request.substituteName,
          absentTeacherName: request.absentTeacherName,
          date: request.date,
          timestamp: serverTimestamp(),
        }
      );

      const reqRef = doc(
        db,
        'artifacts',
        appId,
        'public',
        'data',
        'requests',
        request.id
      );
      await deleteDoc(reqRef);

      const currentList = [...teachers];
      const idx = currentList.findIndex((t) => t.id === request.substituteId);
      if (idx !== -1) {
        const teacher = {
          ...currentList[idx],
          totalSubstitutions: currentList[idx].totalSubstitutions + 1,
        };
        currentList.splice(idx, 1);
        currentList.push(teacher);
        await updateRoster(currentList);
      }
    } catch (e) {
      console.error('結案失敗', e);
    }
  };

  if (!isAuthReady) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-slate-400 gap-4">
        <RotateCw className="w-8 h-8 animate-spin text-indigo-500" />
        <p>系統連線中...</p>
        <p className="text-xs text-slate-300">
          如果停留太久，請檢查 Firebase 設定或網路
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-10 font-sans">
      {/* 確認視窗 */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6 transform transition-all scale-100 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 mb-4 text-slate-800">
              <AlertCircle className="w-6 h-6 text-amber-500" />
              <h3 className="text-lg font-bold">{confirmModal.title}</h3>
            </div>
            <p className="text-slate-600 mb-6 text-sm leading-relaxed">
              {confirmModal.message}
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={closeConfirmModal}
                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-600 font-bold text-sm hover:bg-slate-200 transition-colors"
              >
                取消
              </button>
              <button
                onClick={confirmModal.action}
                className={`px-4 py-2 rounded-xl text-white font-bold text-sm shadow-md transition-all active:scale-95 ${
                  confirmModal.confirmBtnColor ||
                  'bg-indigo-600 hover:bg-indigo-700'
                }`}
              >
                確認執行
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 管理中心彈窗 */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-2xl max-h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-5 border-b flex justify-between items-center bg-indigo-50/50">
              <div className="flex items-center gap-3">
                <Settings className="w-6 h-6 text-indigo-600" />
                <h2 className="font-bold text-slate-800 text-lg">
                  名單排序與管理
                </h2>
              </div>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="p-2 hover:bg-slate-200 rounded-full transition-colors"
              >
                <X className="w-6 h-6 text-slate-500" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
              <section className="space-y-4">
                <div className="flex items-center gap-2 text-indigo-600 font-bold border-b pb-2">
                  <Plus className="w-5 h-5" />
                  <h3>新增老師</h3>
                </div>
                <form
                  onSubmit={handleAddTeacher}
                  className="flex flex-col sm:flex-row gap-3 bg-indigo-50/50 p-4 rounded-2xl border border-indigo-100"
                >
                  <div className="flex-1">
                    <input
                      type="text"
                      placeholder="姓名 (例: 王小明)"
                      required
                      className="w-full border border-slate-300 p-3 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white font-bold"
                      value={newTeacher.name}
                      onChange={(e) =>
                        setNewTeacher({ ...newTeacher, name: e.target.value })
                      }
                    />
                  </div>
                  <div className="w-full sm:w-1/3">
                    <input
                      type="text"
                      placeholder="科目 (選填)"
                      className="w-full border border-slate-300 p-3 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                      value={newTeacher.subject}
                      onChange={(e) =>
                        setNewTeacher({
                          ...newTeacher,
                          subject: e.target.value,
                        })
                      }
                    />
                  </div>
                  <button
                    type="submit"
                    className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold text-sm hover:bg-indigo-700 active:scale-95 transition-all shadow-md whitespace-nowrap"
                  >
                    同步至雲端
                  </button>
                </form>

                <div className="space-y-2 pt-2">
                  <div className="flex items-center gap-2 text-slate-500 font-bold text-sm mb-2">
                    <GripVertical className="w-4 h-4" />
                    <h3>目前輪值順序 (拖曳邏輯)</h3>
                  </div>

                  {teachers.length === 0 ? (
                    <div className="p-10 text-center border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50">
                      <p className="text-slate-400 font-bold">
                        目前雲端清單是空的
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {teachers.map((t, i) => (
                        <div
                          key={t.id}
                          className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-indigo-300 transition-colors group"
                        >
                          <div className="flex flex-col gap-1 items-center bg-slate-50 p-1 rounded-lg border border-slate-100">
                            <button
                              type="button"
                              onClick={() => handleMove(i, 'up')}
                              disabled={i === 0}
                              className={`p-1 rounded hover:bg-indigo-100 transition-colors ${
                                i === 0
                                  ? 'text-slate-200 cursor-not-allowed'
                                  : 'text-slate-400 hover:text-indigo-600'
                              }`}
                            >
                              <ArrowUpCircle className="w-6 h-6" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMove(i, 'down')}
                              disabled={i === teachers.length - 1}
                              className={`p-1 rounded hover:bg-indigo-100 transition-colors ${
                                i === teachers.length - 1
                                  ? 'text-slate-200 cursor-not-allowed'
                                  : 'text-slate-400 hover:text-indigo-600'
                              }`}
                            >
                              <ArrowDownCircle className="w-6 h-6" />
                            </button>
                          </div>
                          <div className="flex-1 pl-2">
                            <div className="flex items-center gap-2">
                              <span className="bg-slate-100 text-slate-500 text-xs font-mono px-2 py-0.5 rounded">
                                {i + 1}
                              </span>
                              <span className="font-bold text-slate-800 text-lg">
                                {t.name}
                              </span>
                              <span className="text-xs text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border">
                                {t.subject}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              累計代理: {t.totalSubstitutions} 次
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveTeacher(t.id)}
                            className="p-3 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all active:scale-90"
                            title="刪除此老師"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>

              <section className="mt-8 pt-6 border-t border-slate-100">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" /> 進階雲端選項
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={handleResetCounts}
                    className="flex flex-col items-center justify-center gap-2 p-4 bg-white border border-slate-200 rounded-xl hover:bg-amber-50 hover:border-amber-200 hover:text-amber-700 text-slate-500 transition-all active:scale-95"
                  >
                    <RefreshCcw className="w-6 h-6" />
                    <span className="text-sm font-bold">全域歸零</span>
                  </button>
                  <button
                    onClick={handleClearAll}
                    className="flex flex-col items-center justify-center gap-2 p-4 bg-white border border-slate-200 rounded-xl hover:bg-red-50 hover:border-red-200 hover:text-red-600 text-slate-500 transition-all active:scale-95"
                  >
                    <UserMinus className="w-6 h-6" />
                    <span className="text-sm font-bold">清空名單</span>
                  </button>
                </div>
              </section>
            </div>

            <div className="p-4 bg-slate-50 border-t flex justify-center">
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold text-base hover:bg-indigo-700 active:scale-95 transition-all shadow-lg"
              >
                關閉
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 頁首 */}
      <header className="bg-indigo-700 text-white shadow-xl sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 p-2 rounded-xl">
              <RotateCw className="w-6 h-6" />
            </div>
            <div>
              <h1 className="font-bold text-lg tracking-tight leading-none">
                專任代導輪值系統
              </h1>
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-[10px] opacity-70 font-mono">
                  Cloud Sync Active (JS)
                </p>
                {isOnline ? (
                  <Wifi className="w-3 h-3 text-emerald-300" />
                ) : (
                  <WifiOff className="w-3 h-3 text-red-300" />
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setIsAddingRequest(!isAddingRequest)}
              className="bg-amber-500 hover:bg-amber-600 px-4 py-2 rounded-xl text-sm font-bold active:scale-95 transition-all shadow-lg flex items-center gap-1"
            >
              <Plus className="w-4 h-4" />{' '}
              <span className="hidden sm:inline">申請代理</span>
            </button>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl border border-white/20 active:scale-95 transition-all flex items-center gap-2"
            >
              <Settings className="w-5 h-5" />
              <span className="hidden sm:inline text-sm font-bold">
                管理中心
              </span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 mt-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          {/* 預約表單 */}
          {isAddingRequest && (
            <div className="bg-white p-6 rounded-3xl shadow-2xl border-2 border-amber-400 animate-in fade-in zoom-in-95 duration-200 relative">
              <button
                onClick={() => setIsAddingRequest(false)}
                className="absolute top-4 right-4 p-2 bg-slate-100 rounded-full hover:bg-slate-200"
              >
                <X className="w-4 h-4 text-slate-500" />
              </button>
              <div className="flex items-center gap-2 text-amber-700 font-bold mb-6">
                <CalendarPlus className="w-6 h-6" />
                <h2 className="text-xl">發起新的代理任務</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">
                    請假導師姓名
                  </label>
                  <input
                    type="text"
                    placeholder="例：王老師"
                    className="w-full border p-3.5 rounded-2xl focus:ring-2 focus:ring-amber-500 outline-none bg-slate-50 font-bold"
                    value={newRequest.absentName}
                    onChange={(e) =>
                      setNewRequest({
                        ...newRequest,
                        absentName: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">
                    代理日期
                  </label>
                  <input
                    type="date"
                    className="w-full border p-3.5 rounded-2xl focus:ring-2 focus:ring-amber-500 outline-none bg-slate-50 font-bold"
                    value={newRequest.date}
                    onChange={(e) =>
                      setNewRequest({ ...newRequest, date: e.target.value })
                    }
                  />
                </div>
                <div className="md:col-span-2 space-y-1.5">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">
                    指定代理專任
                  </label>
                  <select
                    className="w-full border p-3.5 rounded-2xl bg-amber-50/50 font-bold text-amber-900 outline-none focus:ring-2 focus:ring-amber-500"
                    value={newRequest.substituteId}
                    onChange={(e) =>
                      setNewRequest({
                        ...newRequest,
                        substituteId: e.target.value,
                      })
                    }
                  >
                    <option value="">請選擇一位專任老師</option>
                    {availableTeachers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.subject}){' '}
                        {t.id === nextRecommendedTeacher?.id
                          ? ' ★ 系統輪值推薦'
                          : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="mt-8 flex justify-end gap-3 pt-6 border-t border-slate-100">
                <button
                  onClick={() => setIsAddingRequest(false)}
                  className="px-6 py-3 rounded-xl bg-slate-100 text-slate-500 font-bold hover:bg-slate-200"
                >
                  取消
                </button>
                <button
                  onClick={createRequest}
                  disabled={!newRequest.absentName || !newRequest.substituteId}
                  className="bg-amber-500 text-white px-10 py-3 rounded-xl font-bold shadow-xl shadow-amber-200 active:scale-95 transition-all hover:bg-amber-600 disabled:opacity-30 disabled:pointer-events-none"
                >
                  確認發起任務
                </button>
              </div>
            </div>
          )}

          {/* 待辦任務 */}
          <section className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-6 py-5 bg-slate-50 border-b flex justify-between items-center">
              <h2 className="font-bold text-slate-700 flex items-center gap-2 text-sm uppercase tracking-widest">
                <CalendarDays className="w-5 h-5 text-indigo-500" />{' '}
                當前待辦任務
              </h2>
              <span className="bg-indigo-600 text-white text-[10px] px-2.5 py-1 rounded-full font-black">
                {activeRequests.length}
              </span>
            </div>
            <div className="p-6">
              {activeRequests.length === 0 ? (
                <p className="text-center py-12 text-slate-300 italic text-sm">
                  目前無任何進行中任務
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {activeRequests.map((req) => (
                    <div
                      key={req.id}
                      className="border border-slate-100 rounded-2xl p-5 bg-white shadow-lg hover:shadow-xl transition-all group"
                    >
                      <div className="flex justify-between items-start mb-4">
                        <span
                          className={`text-[10px] font-black px-3 py-1 rounded-lg border uppercase ${
                            req.status === 'accepted'
                              ? 'border-indigo-200 text-indigo-600 bg-indigo-50'
                              : 'border-amber-200 text-amber-600 bg-amber-50'
                          }`}
                        >
                          {req.status === 'accepted' ? '已對接' : '待對接'}
                        </span>
                        <span className="text-[10px] font-mono font-bold text-slate-400">
                          {req.date}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mb-6 bg-slate-50 p-3 rounded-xl">
                        <div className="flex-1 text-center">
                          <p className="text-[10px] text-slate-400 font-bold mb-1">
                            請假導師
                          </p>
                          <p className="font-bold">{req.absentTeacherName}</p>
                        </div>
                        <ArrowRight className="w-4 h-4 text-indigo-300" />
                        <div className="flex-1 text-center">
                          <p className="text-[10px] text-slate-400 font-bold mb-1">
                            代理專任
                          </p>
                          <p className="font-bold text-indigo-700">
                            {req.substituteName}
                          </p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          onClick={() => deleteRequest(req.id)}
                          className="text-xs py-2.5 border border-slate-200 rounded-xl text-slate-400 font-bold hover:bg-red-50 hover:text-red-500 transition-all"
                        >
                          移除
                        </button>
                        {req.status === 'pending' ? (
                          <button
                            onClick={() => acceptRequest(req.id)}
                            className="text-xs py-2.5 bg-amber-500 text-white rounded-xl font-bold shadow-md hover:bg-amber-600"
                          >
                            接受委託
                          </button>
                        ) : (
                          <button
                            onClick={() => confirmCompletion(req)}
                            className="text-xs py-2.5 bg-indigo-600 text-white rounded-xl font-bold shadow-md hover:bg-indigo-700 flex items-center justify-center gap-1"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" /> 完成結案
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* 輪值清單 */}
          <section className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-6 py-5 bg-slate-50 border-b flex items-center justify-between">
              <h2 className="font-bold text-slate-700 flex items-center gap-2 text-sm uppercase tracking-widest">
                <Users className="w-5 h-5 text-indigo-500" />{' '}
                輪值順序（全體同步）
              </h2>
            </div>
            <div className="p-6 space-y-4">
              {teachers.map((t, i) => {
                const isBusy = busyTeacherIds.has(t.id);
                const isNext = t.id === nextRecommendedTeacher?.id;
                return (
                  <div
                    key={t.id}
                    className={`flex items-center gap-4 p-5 rounded-2xl border transition-all ${
                      isNext && t.isAvailable
                        ? 'bg-indigo-50 border-indigo-200 ring-2 ring-indigo-500 shadow-lg'
                        : 'border-slate-100'
                    } ${
                      !t.isAvailable ? 'opacity-40 bg-slate-100 grayscale' : ''
                    }`}
                  >
                    <div
                      className={`font-mono font-black text-xl w-8 text-center ${
                        t.isAvailable ? 'text-indigo-600' : 'text-slate-400'
                      }`}
                    >
                      {i + 1}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-slate-800 text-lg">
                          {t.name}
                        </p>
                        <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-lg font-black">
                          {t.subject}
                        </span>
                        {isBusy && (
                          <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-lg flex items-center gap-1 font-bold animate-pulse">
                            <Clock className="w-3 h-3" /> 任務中
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">
                        累計代理次數：
                        <span className="text-indigo-600 font-bold">
                          {t.totalSubstitutions}
                        </span>
                      </p>
                    </div>
                    <div className="flex flex-col sm:flex-row items-center gap-3">
                      {isNext && t.isAvailable && (
                        <span className="text-[10px] text-amber-600 font-black tracking-wider bg-amber-50 px-2 py-1 rounded">
                          智慧輪值下一位
                        </span>
                      )}
                      <button
                        onClick={() => toggleAvailability(t.id)}
                        className={`text-[10px] px-5 py-2.5 rounded-xl font-black border transition-all shadow-sm active:scale-95 ${
                          t.isAvailable
                            ? 'bg-white text-slate-400 hover:text-red-500 hover:border-red-200'
                            : 'bg-emerald-600 text-white border-emerald-700'
                        }`}
                      >
                        {t.isAvailable ? '設為公假' : '恢復值勤'}
                      </button>
                    </div>
                  </div>
                );
              })}
              {teachers.length === 0 && (
                <p className="text-center py-16 text-slate-300 italic text-sm">
                  連線中或清單為空...
                </p>
              )}
            </div>
          </section>
        </div>

        {/* 側邊欄 */}
        <div className="space-y-6">
          <section className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
            <h2 className="font-bold text-slate-700 mb-6 text-xs flex items-center gap-2 uppercase tracking-widest">
              <BarChart3 className="w-5 h-5 text-indigo-500" /> 工作量平衡統計
            </h2>
            <div className="space-y-6">
              {teachers.map((t) => {
                const max = Math.max(
                  ...teachers.map((x) => x.totalSubstitutions),
                  1
                );
                const pct = (t.totalSubstitutions / max) * 100;
                return (
                  <div key={t.id}>
                    <div className="flex justify-between text-[11px] font-bold mb-2">
                      <span className="text-slate-600">{t.name}</span>
                      <span className="text-indigo-600 font-mono">
                        {t.totalSubstitutions} 次
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-50">
                      <div
                        className="bg-indigo-500 h-full rounded-full transition-all duration-1000"
                        style={{ width: `${pct}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
            <h2 className="font-bold text-slate-700 mb-5 text-xs flex items-center gap-2 uppercase tracking-widest">
              <HistoryIcon className="w-5 h-5 text-indigo-500" /> 歷史完成紀錄
            </h2>
            <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1 custom-scrollbar">
              {history.length === 0 ? (
                <p className="text-[11px] text-slate-300 text-center italic py-6">
                  目前無紀錄
                </p>
              ) : (
                history.map((h) => (
                  <div
                    key={h.id}
                    className="text-[11px] p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:bg-white hover:shadow-md transition-all"
                  >
                    <div className="flex justify-between font-black text-indigo-600 mb-2">
                      <span>{h.substituteName}</span>
                      <span className="font-mono text-[9px] text-slate-400">
                        {h.date}
                      </span>
                    </div>
                    <p className="text-slate-500">
                      協助{' '}
                      <span className="text-slate-900 font-bold">
                        {h.absentTeacherName}
                      </span>{' '}
                      老師代理導師職
                    </p>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </main>

      <footer className="max-w-6xl mx-auto px-4 mt-16 py-12 border-t border-slate-200 text-center">
        <p className="text-[10px] text-slate-400 font-black tracking-[0.3em] uppercase">
          School Admin Rotation Intelligence • Firebase Cloud v7.2 (JS)
        </p>
      </footer>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
        @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
        .animate-fade-in { animation: fade-in 0.3s ease-out; }
      `}</style>
    </div>
  );
};

export default App;
