import React, { useState, useRef, useEffect } from 'react';
import { Officer } from '../types';
import {
  Users,
  Plus,
  Phone,
  Mail,
  Edit2,
  Trash2,
  X,
  Save,
  Building2,
  ChevronUp,
  ChevronDown,
  Zap,
  CheckCircle2,
  Loader2,
  AlertCircle
} from 'lucide-react';

interface PegawaiPageProps {
  officers: Officer[];
  onSaveOfficer: (officer: Officer) => Promise<{ syncedToCloud: boolean; error?: string } | void>;
  onSaveOfficersBatch?: (officers: Officer[]) => Promise<boolean>;
  onDeleteOfficer: (id: string) => Promise<void>;
}

const FALLBACK_AVATAR =
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80';

export const PegawaiPage: React.FC<PegawaiPageProps> = ({
  officers,
  onSaveOfficer,
  onSaveOfficersBatch,
  onDeleteOfficer
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isNewOfficer, setIsNewOfficer] = useState(false);
  const [editingOfficer, setEditingOfficer] = useState<Officer | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [liveModalSync, setLiveModalSync] = useState(true);

  // Instant inline quick-edit mode on cards
  const [isQuickEditMode, setIsQuickEditMode] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Live sync status indicator
  const [syncState, setSyncState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [syncMessage, setSyncMessage] = useState<string>('');
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const statusClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const timers = debounceTimers.current;
    return () => {
      Object.values(timers).forEach(clearTimeout);
      if (statusClearTimer.current) clearTimeout(statusClearTimer.current);
    };
  }, []);

  const showSyncFeedback = (state: 'saving' | 'saved' | 'error', message: string) => {
    setSyncState(state);
    setSyncMessage(message);
    if (statusClearTimer.current) clearTimeout(statusClearTimer.current);
    if (state === 'saved') {
      statusClearTimer.current = setTimeout(() => {
        setSyncState('idle');
        setSyncMessage('');
      }, 3000);
    }
  };

  const commitInstantOfficer = async (updatedOfficer: Officer, immediate = false) => {
    const key = updatedOfficer.id;
    if (debounceTimers.current[key]) {
      clearTimeout(debounceTimers.current[key]);
    }

    if (immediate) {
      showSyncFeedback('saving', 'Menyimpan perubahan serta-merta...');
      const res = await onSaveOfficer(updatedOfficer);
      if (res && res.error) {
        showSyncFeedback('error', `Disimpan secara lokal (Supabase: ${res.error})`);
      } else {
        showSyncFeedback('saved', 'Disimpan serta-merta ke Portal & Supabase');
      }
      return;
    }

    // Immediate optimistic React state update first, debounce only cloud upsert slightly if typing fast
    showSyncFeedback('saving', 'Mengemas kini serta-merta...');
    debounceTimers.current[key] = setTimeout(async () => {
      const res = await onSaveOfficer(updatedOfficer);
      if (res && res.error) {
        showSyncFeedback('error', `Disimpan lokal (Ralat Supabase: ${res.error})`);
      } else {
        showSyncFeedback('saved', 'Disimpan serta-merta ke Portal & Supabase');
      }
    }, 300);
  };

  const handleOpenAddModal = () => {
    setIsNewOfficer(true);
    setEditingOfficer({
      id: 'off-' + Date.now(),
      name: '',
      designation: '',
      roleDescription: '',
      grade: 'DG44',
      sector: 'Unit Pendidikan Islam, PPD Penampang',
      phone: '088-712892',
      email: '',
      avatarUrl: FALLBACK_AVATAR,
      order: officers.length + 1
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (off: Officer) => {
    setIsNewOfficer(false);
    setEditingOfficer({ ...off });
    setIsModalOpen(true);
  };

  const handleModalFieldChange = (patch: Partial<Officer>) => {
    if (!editingOfficer) return;
    const updated = { ...editingOfficer, ...patch };
    setEditingOfficer(updated);
    if (!isNewOfficer && liveModalSync) {
      commitInstantOfficer(updated, false);
    }
  };

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOfficer) return;
    if (!editingOfficer.name.trim() && !editingOfficer.designation.trim()) return;

    setIsSaving(true);
    await commitInstantOfficer(editingOfficer, true);
    setIsSaving(false);
    setIsModalOpen(false);
    setEditingOfficer(null);
  };

  const handleQuickFieldChange = (officer: Officer, patch: Partial<Officer>, immediate = false) => {
    const updated = { ...officer, ...patch };
    commitInstantOfficer(updated, immediate);
  };

  const handleMoveOrder = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= officers.length) return;

    const reordered = [...officers];
    const currentItem = { ...reordered[index] };
    const swapItem = { ...reordered[targetIndex] };

    const currentOrder = currentItem.order || index + 1;
    const swapOrder = swapItem.order || targetIndex + 1;

    currentItem.order = swapOrder === currentOrder ? targetIndex + 1 : swapOrder;
    swapItem.order = swapOrder === currentOrder ? index + 1 : currentOrder;

    reordered[index] = swapItem;
    reordered[targetIndex] = currentItem;

    showSyncFeedback('saving', 'Mengemas kini susunan serta-merta...');
    if (onSaveOfficersBatch) {
      const ok = await onSaveOfficersBatch(reordered);
      if (ok) {
        showSyncFeedback('saved', 'Susunan pegawai dikemas kini serta-merta');
      } else {
        showSyncFeedback('error', 'Susunan dikemas kini secara lokal');
      }
    } else {
      await onSaveOfficer(currentItem);
      await onSaveOfficer(swapItem);
      showSyncFeedback('saved', 'Susunan pegawai dikemas kini serta-merta');
    }
  };

  const handleConfirmDelete = async (id: string) => {
    setConfirmDeleteId(null);
    showSyncFeedback('saving', 'Memadam profil pegawai...');
    await onDeleteOfficer(id);
    showSyncFeedback('saved', 'Profil pegawai dipadam serta-merta');
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Header Banner */}
      <div className="apple-card rounded-3xl p-6 sm:p-8">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-orange-100 text-orange-600">
                <Users className="w-5 h-5" />
              </span>
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900">
                Barisan Pegawai Unit Pendidikan Islam PPD Penampang
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-slate-500">
              Direktori kepimpinan, carta organisasi, dan senarai pegawai. Sebarang suntingan dikemas kini serta-merta ke Portal &amp; Supabase.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 self-start lg:self-auto">
            <button
              type="button"
              onClick={() => setIsQuickEditMode((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                isQuickEditMode
                  ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                  : 'bg-white text-slate-700 border-slate-200 hover:border-blue-400 hover:text-blue-700'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>
                {isQuickEditMode ? 'Mod Sunting Serta-Merta: AKTIF' : 'Sunting Terus di Kad'}
              </span>
            </button>

            <button
              onClick={handleOpenAddModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-linear-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white shadow-xs cursor-pointer transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Pegawai</span>
            </button>
          </div>
        </div>

        {/* Status Bar Serta-Merta */}
        {(syncState !== 'idle' || isQuickEditMode) && (
          <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 text-slate-600">
              <Zap className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span>
                {isQuickEditMode
                  ? 'Mod Sunting Serta-Merta aktif: Ubah terus mana-mana maklumat di kad — disimpan automatik tanpa perlu tekan butang lain.'
                  : 'Tetapan kemas kini serta-merta aktif untuk suntingan dan susunan pegawai.'}
              </span>
            </div>

            {syncState !== 'idle' && (
              <div
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg font-semibold ${
                  syncState === 'saving'
                    ? 'bg-blue-50 text-blue-700'
                    : syncState === 'saved'
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-amber-50 text-amber-700'
                }`}
              >
                {syncState === 'saving' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {syncState === 'saved' && <CheckCircle2 className="w-3.5 h-3.5" />}
                {syncState === 'error' && <AlertCircle className="w-3.5 h-3.5" />}
                <span>{syncMessage}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Leadership Directory Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {officers.map((officer, index) => {
          const displayName = officer.name?.trim() || '(Nama belum diisi)';
          const displayEmail = officer.email?.trim() || '-';

          return (
            <div
              key={officer.id}
              className={`apple-card rounded-3xl p-6 flex flex-col justify-between transition-all group relative overflow-hidden ${
                isQuickEditMode
                  ? 'ring-2 ring-blue-500/20 border-blue-200'
                  : 'hover:border-orange-300'
              }`}
            >
              {/* Top Accent Strip */}
              <div
                className={`absolute top-0 left-0 right-0 h-1.5 transition-opacity ${
                  isQuickEditMode
                    ? 'bg-linear-to-r from-blue-600 to-sky-500 opacity-100'
                    : 'bg-linear-to-r from-orange-500 to-amber-500 opacity-80 group-hover:opacity-100'
                }`}
              ></div>

              {isQuickEditMode ? (
                /* MODE SUNTING TERUS SERTA-MERTA */
                <div className="space-y-3 text-xs">
                  <div className="flex items-center gap-3">
                    <img
                      src={officer.avatarUrl || FALLBACK_AVATAR}
                      alt={displayName}
                      className="w-14 h-14 rounded-2xl object-cover border-2 border-slate-100 shrink-0"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = FALLBACK_AVATAR;
                      }}
                    />
                    <div className="flex-1 space-y-1.5 min-w-0">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          defaultValue={officer.grade}
                          key={`grade-${officer.id}-${officer.grade}`}
                          onBlur={(e) => {
                            if (e.target.value !== officer.grade) {
                              handleQuickFieldChange(officer, { grade: e.target.value }, true);
                            }
                          }}
                          onChange={(e) =>
                            handleQuickFieldChange(officer, { grade: e.target.value }, false)
                          }
                          placeholder="Gred (cth: DG48)"
                          className="w-24 px-2 py-1 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white font-bold text-orange-800 uppercase text-[11px]"
                        />
                        <span className="text-[10px] text-blue-600 font-semibold">Auto-Simpan</span>
                      </div>
                      <input
                        type="text"
                        defaultValue={officer.name}
                        key={`name-${officer.id}-${officer.name}`}
                        onBlur={(e) => {
                          if (e.target.value !== officer.name) {
                            handleQuickFieldChange(officer, { name: e.target.value }, true);
                          }
                        }}
                        onChange={(e) =>
                          handleQuickFieldChange(officer, { name: e.target.value }, false)
                        }
                        placeholder="Nama Penuh Pegawai"
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white font-bold text-slate-900"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">
                      Jawatan Rasmi
                    </label>
                    <input
                      type="text"
                      defaultValue={officer.designation}
                      key={`desig-${officer.id}-${officer.designation}`}
                      onBlur={(e) => {
                        if (e.target.value !== officer.designation) {
                          handleQuickFieldChange(officer, { designation: e.target.value }, true);
                        }
                      }}
                      onChange={(e) =>
                        handleQuickFieldChange(officer, { designation: e.target.value }, false)
                      }
                      placeholder="Jawatan Rasmi"
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white font-semibold text-orange-700"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">
                      Bidang Tugas
                    </label>
                    <textarea
                      rows={2}
                      defaultValue={officer.roleDescription}
                      key={`role-${officer.id}-${officer.roleDescription}`}
                      onBlur={(e) => {
                        if (e.target.value !== officer.roleDescription) {
                          handleQuickFieldChange(officer, { roleDescription: e.target.value }, true);
                        }
                      }}
                      onChange={(e) =>
                        handleQuickFieldChange(officer, { roleDescription: e.target.value }, false)
                      }
                      placeholder="Ringkasan bidang tugas..."
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white text-slate-700"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">
                        Telefon
                      </label>
                      <input
                        type="text"
                        defaultValue={officer.phone}
                        key={`phone-${officer.id}-${officer.phone}`}
                        onBlur={(e) => {
                          if (e.target.value !== officer.phone) {
                            handleQuickFieldChange(officer, { phone: e.target.value }, true);
                          }
                        }}
                        onChange={(e) =>
                          handleQuickFieldChange(officer, { phone: e.target.value }, false)
                        }
                        placeholder="088-712890"
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">
                        Emel
                      </label>
                      <input
                        type="email"
                        defaultValue={officer.email}
                        key={`email-${officer.id}-${officer.email}`}
                        onBlur={(e) => {
                          if (e.target.value !== officer.email) {
                            handleQuickFieldChange(officer, { email: e.target.value }, true);
                          }
                        }}
                        onChange={(e) =>
                          handleQuickFieldChange(officer, { email: e.target.value }, false)
                        }
                        placeholder="nama@moe.gov.my"
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">
                      Sektor / Sekolah
                    </label>
                    <input
                      type="text"
                      defaultValue={officer.sector}
                      key={`sector-${officer.id}-${officer.sector}`}
                      onBlur={(e) => {
                        if (e.target.value !== officer.sector) {
                          handleQuickFieldChange(officer, { sector: e.target.value }, true);
                        }
                      }}
                      onChange={(e) =>
                        handleQuickFieldChange(officer, { sector: e.target.value }, false)
                      }
                      placeholder="Pejabat Pendidikan Daerah Penampang"
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white text-slate-600"
                    />
                  </div>
                </div>
              ) : (
                /* PAPARAN KAD BIASA */
                <div className="space-y-4">
                  <div className="flex items-start gap-4">
                    <div className="relative shrink-0">
                      <img
                        src={officer.avatarUrl || FALLBACK_AVATAR}
                        alt={displayName}
                        className="w-16 h-16 rounded-2xl object-cover border-2 border-slate-100 shadow-xs group-hover:scale-105 transition-transform"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = FALLBACK_AVATAR;
                        }}
                      />
                      <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-blue-900 text-white text-[10px] font-bold flex items-center justify-center border border-white">
                        {index + 1}
                      </span>
                    </div>

                    <div className="min-w-0 flex-1">
                      <span className="inline-block px-2 py-0.5 rounded-md bg-orange-100 text-orange-800 text-[10px] font-bold uppercase tracking-wider mb-1">
                        Gred {officer.grade || '-'}
                      </span>
                      <h3
                        className={`text-sm font-bold leading-snug transition-colors ${
                          officer.name?.trim()
                            ? 'text-slate-900 group-hover:text-orange-600'
                            : 'text-slate-400 italic'
                        }`}
                      >
                        {displayName}
                      </h3>
                      <p className="text-xs font-semibold text-orange-600 mt-0.5">
                        {officer.designation}
                      </p>
                    </div>
                  </div>

                  <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 text-xs text-slate-600 leading-relaxed">
                    <p className="line-clamp-3">{officer.roleDescription || '-'}</p>
                  </div>

                  <div className="space-y-1.5 text-xs text-slate-600 pt-1">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate text-slate-500">{officer.sector || '-'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                      {officer.phone?.trim() ? (
                        <a
                          href={`tel:${officer.phone.split('/')[0].trim()}`}
                          className="font-mono text-slate-800 hover:text-orange-600 transition-colors"
                        >
                          {officer.phone}
                        </a>
                      ) : (
                        <span className="font-mono text-slate-400">-</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                      {officer.email?.trim() ? (
                        <a
                          href={`mailto:${officer.email}`}
                          className="text-slate-800 hover:text-orange-600 truncate transition-colors"
                        >
                          {officer.email}
                        </a>
                      ) : (
                        <span className="text-slate-400">{displayEmail}</span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Action buttons + Quick Reorder */}
              <div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-100 text-xs">
                <div className="flex items-center gap-1">
                  <span className="text-[11px] text-slate-400 font-mono mr-1">
                    Susunan #{officer.order || index + 1}
                  </span>
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => handleMoveOrder(index, 'up')}
                    className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-30 disabled:pointer-events-none rounded-md transition-colors cursor-pointer"
                    title="Naikkan Susunan"
                  >
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={index === officers.length - 1}
                    onClick={() => handleMoveOrder(index, 'down')}
                    className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-30 disabled:pointer-events-none rounded-md transition-colors cursor-pointer"
                    title="Turunkan Susunan"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </div>

                {confirmDeleteId === officer.id ? (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleConfirmDelete(officer.id)}
                      className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold text-[11px] cursor-pointer"
                    >
                      Ya, Padam
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold text-[11px] cursor-pointer"
                    >
                      Batal
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleOpenEditModal(officer)}
                      className="p-1.5 text-slate-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors cursor-pointer"
                      title="Sunting Pegawai (Modal Penuh)"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(officer.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                      title="Padam Pegawai"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal Add / Edit Officer */}
      {isModalOpen && editingOfficer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <form
            onSubmit={handleSaveForm}
            className="apple-card bg-white rounded-3xl max-w-xl w-full p-6 sm:p-7 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {isNewOfficer ? 'Tambah Pegawai Baharu' : 'Sunting Profil Pegawai'}
                </h3>
                {!isNewOfficer && (
                  <p className="text-[11px] text-slate-500">
                    Perubahan dipaparkan pada portal dan disimpan ke Supabase secara serta-merta.
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Live Card Preview & Instant Sync Toggle */}
            <div className="rounded-2xl bg-slate-50 border border-slate-200/80 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Pratonton Langsung
                </span>
                {!isNewOfficer && (
                  <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-blue-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={liveModalSync}
                      onChange={(e) => setLiveModalSync(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span>Kemas kini serta-merta semasa menaip</span>
                  </label>
                )}
              </div>

              <div className="flex items-center gap-3 bg-white p-2.5 rounded-xl border border-slate-100">
                <img
                  src={editingOfficer.avatarUrl || FALLBACK_AVATAR}
                  alt={editingOfficer.name || 'Pegawai'}
                  className="w-11 h-11 rounded-full object-cover border border-slate-200 shrink-0"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = FALLBACK_AVATAR;
                  }}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-slate-900 truncate">
                    {editingOfficer.name?.trim() || '(Nama Pegawai)'}
                  </p>
                  <p className="text-[11px] text-orange-600 font-medium truncate">
                    {editingOfficer.designation?.trim() || '(Jawatan Rasmi)'}
                  </p>
                  <p className="text-[10px] text-slate-400 truncate">
                    Gred {editingOfficer.grade || '-'} • {editingOfficer.phone || '-'}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">Nama Penuh &amp; Gelaran</label>
                <input
                  type="text"
                  value={editingOfficer.name}
                  onChange={(e) => handleModalFieldChange({ name: e.target.value })}
                  placeholder="Contoh: Ustazah Anicca @ Anisah binti Albe"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Jawatan Rasmi</label>
                  <input
                    type="text"
                    value={editingOfficer.designation}
                    onChange={(e) => handleModalFieldChange({ designation: e.target.value })}
                    placeholder="Contoh: Pegawai Pendidikan Daerah Penampang"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Gred Jawatan</label>
                  <input
                    type="text"
                    value={editingOfficer.grade}
                    onChange={(e) => handleModalFieldChange({ grade: e.target.value })}
                    placeholder="Contoh: DG48"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Bidang Tugas &amp; Peranan</label>
                <textarea
                  rows={3}
                  value={editingOfficer.roleDescription}
                  onChange={(e) => handleModalFieldChange({ roleDescription: e.target.value })}
                  placeholder="Huraian ringkas bidang kuasa dan fokus tugas pegawai..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">No. Telefon</label>
                  <input
                    type="text"
                    value={editingOfficer.phone}
                    onChange={(e) => handleModalFieldChange({ phone: e.target.value })}
                    placeholder="Contoh: 088-712890"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Emel Rasmi KPM</label>
                  <input
                    type="email"
                    value={editingOfficer.email}
                    onChange={(e) => handleModalFieldChange({ email: e.target.value })}
                    placeholder="nama@moe.gov.my"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">URL Gambar Profil</label>
                <input
                  type="url"
                  value={editingOfficer.avatarUrl}
                  onChange={(e) => handleModalFieldChange({ avatarUrl: e.target.value })}
                  placeholder="https://..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Sektor / Unit</label>
                  <input
                    type="text"
                    value={editingOfficer.sector}
                    onChange={(e) => handleModalFieldChange({ sector: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Susunan Keutamaan</label>
                  <input
                    type="number"
                    min="1"
                    value={editingOfficer.order}
                    onChange={(e) =>
                      handleModalFieldChange({ order: parseInt(e.target.value) || 1 })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white font-mono text-center"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer"
              >
                Tutup
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-5 py-2 rounded-xl text-xs font-semibold bg-orange-500 text-white hover:bg-orange-600 flex items-center gap-1.5 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>{isSaving ? 'Menyimpan...' : 'Simpan & Selesai'}</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
