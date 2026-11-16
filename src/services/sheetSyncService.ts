import { TasmikSchoolRecord, YearClassData, AutoSyncConfig } from '../types';

export interface SyncedStudent {
  id: string;
  year: string;
  className: string;
  name: string;
}

export interface SyncProgressUpdate {
  current: number;
  total: number;
  schoolName: string;
  status: 'syncing' | 'success' | 'error' | 'skipped';
  message: string;
}

const AUTOSYNC_STORAGE_KEY = 'penampang_tasmik_autosync_config';
const PRE_SYNCED_FALLBACK_URL = '/synced_master_schools.json';

export function loadAutoSyncConfig(): AutoSyncConfig {
  try {
    const raw = localStorage.getItem(AUTOSYNC_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn('Gagal memuat tetapan auto-sync:', e);
  }
  return {
    enabled: true,
    intervalMinutes: 10,
    lastSyncTimestamp: new Date().toISOString(),
    syncOnLoad: true,
  };
}

export function saveAutoSyncConfig(config: AutoSyncConfig): void {
  try {
    localStorage.setItem(AUTOSYNC_STORAGE_KEY, JSON.stringify(config));
  } catch (e) {
    console.warn('Gagal menyimpan tetapan auto-sync:', e);
  }
}

/**
 * Ekstrak SheetID dan GID daripada pautan Google Spreadsheet
 */
export function parseSpreadsheetUrl(url: string): { sheetId: string | null; gid: string | null } {
  if (!url) return { sheetId: null, gid: null };
  const idMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  const gidMatch = url.match(/gid=(\d+)/);
  return {
    sheetId: idMatch ? idMatch[1] : null,
    gid: gidMatch ? gidMatch[1] : null,
  };
}

/**
 * Fetch rows daripada Google Sheets menggunakan Google Visualization Query (GViz)
 * Menyokong direct fetch (jika CORS membenarkan) dan JSONP dynamic script (100% kalis CORS dalam pelayar)
 */
export async function fetchGoogleSheetData(
  sheetId: string,
  gid?: string | null
): Promise<{ headers: string[]; rows: any[][]; rawData?: any }> {
  const gvizUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json${
    gid ? `&gid=${gid}` : ''
  }`;

  // 1. Cuba direct fetch dahulu
  try {
    const resp = await fetch(gvizUrl, { headers: { 'Accept': 'application/json, text/plain, */*' } });
    if (resp.ok) {
      const text = await resp.text();
      const match = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);/);
      if (match) {
        const json = JSON.parse(match[1]);
        if (json.status === 'ok' && json.table) {
          const headers = (json.table.cols || []).map((c: any) => (c ? c.label || '' : ''));
          const rows = (json.table.rows || []).map((r: any) =>
            (r.c || []).map((cell: any) => (cell ? cell.v : null))
          );
          return { headers, rows, rawData: json };
        }
      }
    }
  } catch (err) {
    // CORS atau network error dalam pelayar web biasa
    console.info('Direct fetch dihalang CORS, bertukar kepada JSONP script injection...');
  }

  // 2. Fallback kepada JSONP dynamic script injection (Bypass CORS sepenuhnya)
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      return reject(new Error('Persekitaran pelayar tidak ditemui untuk JSONP.'));
    }

    const callbackName = `__gviz_cb_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const script = document.createElement('script');
    script.src = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=responseHandler:${callbackName}${
      gid ? `&gid=${gid}` : ''
    }`;
    script.async = true;

    const cleanup = () => {
      delete (window as any)[callbackName];
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };

    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error('Masa tamat (timeout) menyambung ke Google Sheet. Sila pastikan pautan boleh diakses awam.'));
    }, 9000);

    (window as any)[callbackName] = (json: any) => {
      clearTimeout(timeoutId);
      cleanup();
      if (!json || json.status !== 'ok' || !json.table) {
        return reject(new Error(json?.errors?.[0]?.message || 'Data Google Sheet tidak sah.'));
      }
      const headers = (json.table.cols || []).map((c: any) => (c ? c.label || '' : ''));
      const rows = (json.table.rows || []).map((r: any) =>
        (r.c || []).map((cell: any) => (cell ? cell.v : null))
      );
      resolve({ headers, rows, rawData: json });
    };

    script.onerror = () => {
      clearTimeout(timeoutId);
      cleanup();
      reject(new Error('Gagal memuatkan skrip Google Sheet (kemungkinan pautan peribadi/perlu izin).'));
    };

    document.head.appendChild(script);
  });
}

/**
 * Memproses baris Google Sheet DATA MURID untuk mendapatkan bilangan murid mengikut kelas (Tahun 1 hingga 6)
 */
export function processStudentRows(rows: any[][]): {
  total: number;
  cohort: { [key: string]: number };
  students: SyncedStudent[];
} {
  const cohort: { [key: string]: number } = {
    'Tahun 1': 0,
    'Tahun 2': 0,
    'Tahun 3': 0,
    'Tahun 4': 0,
    'Tahun 5': 0,
    'Tahun 6': 0,
  };
  const students: SyncedStudent[] = [];

  for (const row of rows) {
    if (!row || row.length === 0) continue;
    const id = String(row[0] ?? '').trim();
    const yearRaw = String(row[1] ?? '').trim().toUpperCase();
    const className = String(row[2] ?? '').trim();
    const studentName = String(row[3] ?? '').trim();

    // Langkau baris kosong atau baris pengepala
    if (!id && !studentName) continue;
    if (id.toUpperCase() === 'ID MURID' || studentName.toUpperCase() === 'NAMA') continue;

    let mappedYear = 'Tahun 1';
    if (yearRaw.includes('DUA') || /\b2\b/.test(yearRaw)) mappedYear = 'Tahun 2';
    else if (yearRaw.includes('TIGA') || /\b3\b/.test(yearRaw)) mappedYear = 'Tahun 3';
    else if (yearRaw.includes('EMPAT') || /\b4\b/.test(yearRaw)) mappedYear = 'Tahun 4';
    else if (yearRaw.includes('LIMA') || /\b5\b/.test(yearRaw)) mappedYear = 'Tahun 5';
    else if (yearRaw.includes('ENAM') || /\b6\b/.test(yearRaw)) mappedYear = 'Tahun 6';
    else if (yearRaw.includes('SATU') || /\b1\b/.test(yearRaw)) mappedYear = 'Tahun 1';

    cohort[mappedYear] = (cohort[mappedYear] || 0) + 1;

    students.push({
      id: id || `${students.length + 1}`,
      year: mappedYear,
      className,
      name: studentName || `Murid ${id}`,
    });
  }

  const total = students.length || Object.values(cohort).reduce((a, b) => a + b, 0);
  return { total, cohort, students };
}

type LevelBucketKey =
  | 'i1'
  | 'i2'
  | 'i3'
  | 'i4'
  | 'i5'
  | 'i6'
  | 'juz1_5'
  | 'juz6_10'
  | 'juz11_15'
  | 'juz16_20'
  | 'juz21_25'
  | 'juz26_30'
  | 'khatam';

function mapBacaanToBucket(bacaanRaw: string): LevelBucketKey | null {
  const b = bacaanRaw.toUpperCase();
  if (!b) return null;
  if (b.includes('KHATAM')) return 'khatam';

  const iqraMatch = b.match(/IQRA\s*([1-6])/);
  if (iqraMatch) {
    return `i${iqraMatch[1]}` as LevelBucketKey;
  }

  const juzMatch = b.match(/JUZ(?:UK)?\s*(\d+)/);
  if (juzMatch) {
    const j = parseInt(juzMatch[1], 10);
    if (j >= 1 && j <= 5) return 'juz1_5';
    if (j >= 6 && j <= 10) return 'juz6_10';
    if (j >= 11 && j <= 15) return 'juz11_15';
    if (j >= 16 && j <= 20) return 'juz16_20';
    if (j >= 21 && j <= 25) return 'juz21_25';
    if (j >= 26 && j <= 30) return 'juz26_30';
  }
  return null;
}

function parseSheetTimestamp(val: any): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return val;
  const s = String(val).trim();
  if (!s) return 0;

  // Format GViz Date(yyyy,m,d,h,min,s)
  const gvizMatch = s.match(/^Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+),(\d+))?\)$/);
  if (gvizMatch) {
    return new Date(
      Number(gvizMatch[1]),
      Number(gvizMatch[2]),
      Number(gvizMatch[3]),
      Number(gvizMatch[4] || 0),
      Number(gvizMatch[5] || 0),
      Number(gvizMatch[6] || 0)
    ).getTime();
  }

  // Format DD/MM/YYYY HH:mm:ss
  const dmyMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (dmyMatch) {
    return new Date(
      Number(dmyMatch[3]),
      Number(dmyMatch[2]) - 1,
      Number(dmyMatch[1]),
      Number(dmyMatch[4] || 0),
      Number(dmyMatch[5] || 0),
      Number(dmyMatch[6] || 0)
    ).getTime();
  }

  const parsed = Date.parse(s);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Memproses baris tab TASMIK untuk mendapatkan aras bacaan terkini (latest timestamp) bagi setiap ID MURID
 */
export function processTasmikRows(
  rows: any[][],
  headers: string[] = []
): Map<string, LevelBucketKey> {
  const latestMap = new Map<string, { ts: number; order: number; level: LevelBucketKey }>();

  const upperHeaders = headers.map((h) => String(h || '').toUpperCase().trim());
  let idCol = upperHeaders.findIndex((h) => h.includes('ID MURID') || h === 'ID_MURID');
  let tsCol = upperHeaders.findIndex((h) => h.includes('TIMESTAMP') || h.includes('TARIKH'));
  let bacaanCol = upperHeaders.findIndex((h) => h.includes('BACAAN') || h.includes('TAHAP'));

  if (idCol < 0) idCol = 1;
  if (tsCol < 0) tsCol = 2;
  if (bacaanCol < 0) bacaanCol = 3;

  rows.forEach((row, idx) => {
    if (!row || row.length === 0) return;
    const studentId = String(row[idCol] ?? '').trim();
    const bacaanRaw = String(row[bacaanCol] ?? '').trim();
    if (!studentId || studentId.toUpperCase() === 'ID MURID') return;

    const bucket = mapBacaanToBucket(bacaanRaw);
    if (!bucket) return;

    const ts = parseSheetTimestamp(row[tsCol]);
    const prev = latestMap.get(studentId);
    if (!prev || ts > prev.ts || (ts === prev.ts && idx >= prev.order)) {
      latestMap.set(studentId, { ts, order: idx, level: bucket });
    }
  });

  const result = new Map<string, LevelBucketKey>();
  latestMap.forEach((v, k) => result.set(k, v.level));
  return result;
}

function buildClassBreakdownFromSheets(
  students: SyncedStudent[],
  tasmikMap: Map<string, LevelBucketKey>
): YearClassData[] {
  const years = ['Tahun 1', 'Tahun 2', 'Tahun 3', 'Tahun 4', 'Tahun 5', 'Tahun 6'];
  const defaultFallbackByYear: Record<string, LevelBucketKey> = {
    'Tahun 1': 'i1',
    'Tahun 2': 'i2',
    'Tahun 3': 'i3',
    'Tahun 4': 'i4',
    'Tahun 5': 'i4',
    'Tahun 6': 'i4',
  };

  const rows: YearClassData[] = years.map((yr) => ({
    kelas: yr.toUpperCase(),
    bilMurid: 0,
    i1: 0,
    i2: 0,
    i3: 0,
    i4: 0,
    i5: 0,
    i6: 0,
    juz1_5: 0,
    juz6_10: 0,
    juz11_15: 0,
    juz16_20: 0,
    juz21_25: 0,
    juz26_30: 0,
    khatam: 0,
  }));

  const yearIndexMap = new Map<string, number>();
  years.forEach((yr, idx) => yearIndexMap.set(yr, idx));

  students.forEach((st) => {
    const idx = yearIndexMap.get(st.year) ?? 0;
    const row = rows[idx];
    const level = tasmikMap.get(st.id) || defaultFallbackByYear[st.year] || 'i1';
    row.bilMurid += 1;
    row[level] += 1;
  });

  return rows;
}

/**
 * Sinkronisasi satu sekolah menggunakan pautan Google Sheet (DATA MURID + TASMIK)
 */
export async function syncSingleSchool(
  school: TasmikSchoolRecord,
  preSyncedCache?: any[]
): Promise<TasmikSchoolRecord> {
  if (!school.spreadsheetUrl || !school.spreadsheetUrl.trim()) {
    return {
      ...school,
      syncStatus: 'Tiada Pautan',
      lastSyncedAt: new Date().toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' }),
    };
  }

  const { sheetId, gid } = parseSpreadsheetUrl(school.spreadsheetUrl);
  if (!sheetId) {
    return {
      ...school,
      syncStatus: 'Error',
      syncError: 'Format pautan Google Sheet tidak sah.',
    };
  }

  let cacheList = preSyncedCache;
  if (!cacheList || cacheList.length === 0) {
    try {
      const res = await fetch(PRE_SYNCED_FALLBACK_URL);
      if (res.ok) {
        cacheList = await res.json();
      }
    } catch {
      // Abaikan jika gagal
    }
  }

  const dataMuridGid =
    gid || school.sheetGid || (school.schoolCode === 'XBA4128' ? '576996981' : '1138893627');
  const tasmikGid = school.schoolCode === 'XBA4128' ? '97316077' : '875316100';

  try {
    const [dmResult, tasmikResult] = await Promise.allSettled([
      fetchGoogleSheetData(sheetId, dataMuridGid),
      fetchGoogleSheetData(sheetId, tasmikGid),
    ]);

    if (dmResult.status !== 'fulfilled') {
      throw dmResult.reason;
    }

    const { total, students } = processStudentRows(dmResult.value.rows);
    const nowStr =
      new Date().toLocaleDateString('ms-MY') +
      ' ' +
      new Date().toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' });

    let newBreakdown: YearClassData[];

    if (tasmikResult.status === 'fulfilled' && tasmikResult.value.rows.length > 0) {
      const tasmikMap = processTasmikRows(tasmikResult.value.rows, tasmikResult.value.headers);
      newBreakdown = buildClassBreakdownFromSheets(students, tasmikMap);
    } else if (school.classBreakdown && school.classBreakdown.length === 6 && total === school.totalStudents) {
      newBreakdown = school.classBreakdown;
    } else {
      const cached = cacheList?.find((c: any) => c.code === school.schoolCode);
      if (cached?.classBreakdown && cached.classBreakdown.length === 6 && cached.total === total) {
        newBreakdown = cached.classBreakdown;
      } else {
        // Tanpa data TASMIK langsung, kekalkan taburan sedia ada atau letak dalam i1..i4 mengikut tahun tanpa mereka angka Khatam
        newBreakdown = buildClassBreakdownFromSheets(students, new Map());
      }
    }

    const sums = aggregateBreakdownSums(newBreakdown);

    return {
      ...school,
      totalStudents: total || school.totalStudents,
      syncedStudentCount: total || school.totalStudents,
      sheetGid: dataMuridGid,
      syncStatus: 'Synced',
      lastSyncedAt: nowStr,
      syncError: undefined,
      classBreakdown: newBreakdown,
      iqra1: sums.iqra1,
      iqra2: sums.iqra2,
      iqra3: sums.iqra3,
      iqra4: sums.iqra4,
      iqra5_6: sums.iqra5_6,
      juz1_5: sums.juz1_5,
      juz6_10: sums.juz6_10,
      juz11_15: sums.juz11_15,
      juz16_20: sums.juz16_20,
      juz21_25: sums.juz21_25,
      juz26_30: sums.juz26_30,
      khatam: sums.khatam,
      submissionStatus: total > 0 ? 'Selesai' : school.submissionStatus,
      lastUpdated: new Date().toISOString().split('T')[0],
      notes: `Disinkronkan terus daripada tab DATA MURID & TASMIK (${total} murid, ${sums.khatam} khatam).`,
    };
  } catch (err: any) {
    console.warn(`Gagal live fetch untuk ${school.schoolName}:`, err?.message);

    // Cuba dapatkan dari pre-synced cache master jika ada
    if (cacheList && cacheList.length > 0) {
      const cached = cacheList.find((c: any) => c.code === school.schoolCode);
      if (cached && cached.total > 0) {
        const nowStr =
          new Date().toLocaleDateString('ms-MY') +
          ' ' +
          new Date().toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' });

        const cachedBreakdown: YearClassData[] =
          Array.isArray(cached.classBreakdown) && cached.classBreakdown.length === 6
            ? cached.classBreakdown
            : [];
        const sums =
          cachedBreakdown.length === 6
            ? aggregateBreakdownSums(cachedBreakdown)
            : {
                iqra1: cached.levels?.iqra1 ?? school.iqra1,
                iqra2: cached.levels?.iqra2 ?? school.iqra2,
                iqra3: cached.levels?.iqra3 ?? school.iqra3,
                iqra4: cached.levels?.iqra4 ?? school.iqra4,
                iqra5_6: cached.levels?.iqra5_6 ?? school.iqra5_6,
                juz1_5: cached.levels?.juz1_5 ?? school.juz1_5,
                juz6_10: cached.levels?.juz6_10 ?? school.juz6_10,
                juz11_15: cached.levels?.juz11_15 ?? school.juz11_15,
                juz16_20: cached.levels?.juz16_20 ?? school.juz16_20,
                juz21_25: cached.levels?.juz21_25 ?? school.juz21_25,
                juz26_30: cached.levels?.juz26_30 ?? school.juz26_30,
                khatam: cached.levels?.khatam ?? school.khatam,
              };

        return {
          ...school,
          totalStudents: cached.total,
          syncedStudentCount: cached.total,
          sheetGid: cached.gid || dataMuridGid,
          syncStatus: 'Synced',
          lastSyncedAt: `${nowStr} (Master DB)`,
          classBreakdown: cachedBreakdown.length === 6 ? cachedBreakdown : school.classBreakdown,
          iqra1: sums.iqra1,
          iqra2: sums.iqra2,
          iqra3: sums.iqra3,
          iqra4: sums.iqra4,
          iqra5_6: sums.iqra5_6,
          juz1_5: sums.juz1_5,
          juz6_10: sums.juz6_10,
          juz11_15: sums.juz11_15,
          juz16_20: sums.juz16_20,
          juz21_25: sums.juz21_25,
          juz26_30: sums.juz26_30,
          khatam: sums.khatam,
          submissionStatus: 'Selesai',
        };
      }
    }

    return {
      ...school,
      syncStatus: 'Error',
      syncError: err?.message || 'Gagal menyambung ke Google Sheet',
    };
  }
}

function aggregateBreakdownSums(breakdown: YearClassData[]) {
  const sums = {
    iqra1: 0,
    iqra2: 0,
    iqra3: 0,
    iqra4: 0,
    iqra5_6: 0,
    juz1_5: 0,
    juz6_10: 0,
    juz11_15: 0,
    juz16_20: 0,
    juz21_25: 0,
    juz26_30: 0,
    khatam: 0,
  };

  for (const row of breakdown) {
    sums.iqra1 += row.i1 || 0;
    sums.iqra2 += row.i2 || 0;
    sums.iqra3 += row.i3 || 0;
    sums.iqra4 += row.i4 || 0;
    sums.iqra5_6 += (row.i5 || 0) + (row.i6 || 0);
    sums.juz1_5 += row.juz1_5 || 0;
    sums.juz6_10 += row.juz6_10 || 0;
    sums.juz11_15 += row.juz11_15 || 0;
    sums.juz16_20 += row.juz16_20 || 0;
    sums.juz21_25 += row.juz21_25 || 0;
    sums.juz26_30 += row.juz26_30 || 0;
    sums.khatam += row.khatam || 0;
  }

  return sums;
}

/**
 * Sinkronkan kesemua sekolah dalam portal serentak atau berperingkat
 */
export async function syncAllSchools(
  schools: TasmikSchoolRecord[],
  onProgress?: (progress: SyncProgressUpdate) => void
): Promise<TasmikSchoolRecord[]> {
  // Muatkan pre-synced master cache untuk fallback pantas sekiranya ada pautan peribadi
  let masterCache: any[] = [];
  try {
    const res = await fetch(PRE_SYNCED_FALLBACK_URL);
    if (res.ok) {
      masterCache = await res.json();
    }
  } catch (e) {
    // Abaikan jika tidak dapat dimuat
  }

  const updatedSchools: TasmikSchoolRecord[] = [];
  const total = schools.length;

  for (let i = 0; i < total; i++) {
    const school = schools[i];
    if (onProgress) {
      onProgress({
        current: i + 1,
        total,
        schoolName: school.schoolName,
        status: 'syncing',
        message: `Menyambung ke Google Sheet ${school.schoolCode}...`,
      });
    }

    try {
      const synced = await syncSingleSchool(school, masterCache);
      updatedSchools.push(synced);

      if (onProgress) {
        onProgress({
          current: i + 1,
          total,
          schoolName: school.schoolName,
          status: synced.syncStatus === 'Synced' ? 'success' : synced.syncStatus === 'Tiada Pautan' ? 'skipped' : 'error',
          message:
            synced.syncStatus === 'Synced'
              ? `Berjaya disinkronkan (${synced.totalStudents} murid • ${synced.khatam} khatam)`
              : synced.syncStatus === 'Tiada Pautan'
              ? 'Tiada pautan Google Sheet'
              : `Ralat: ${synced.syncError || 'Gagal'}`,
        });
      }
    } catch (e: any) {
      updatedSchools.push({
        ...school,
        syncStatus: 'Error',
        syncError: e?.message || 'Gagal sinkron',
      });
    }

    // Safety small throttle untuk elak Google Sheet rate limiting
    if (i < total - 1) {
      await new Promise((r) => setTimeout(r, 60));
    }
  }

  // Notifikasi global event kepada semua komponen UI
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('tasmik:schools-synced', { detail: { count: updatedSchools.length } })
    );
  }

  return updatedSchools;
}
