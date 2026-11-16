import { TasmikSchoolRecord, YearClassData } from '../types';

/**
 * Menghasilkan data breakdown kelas Tahun 1 hingga Tahun 6 bagi sesebuah sekolah
 * sekiranya belum ada data terperinci disimpan.
 */
export function generateDefaultClassBreakdown(school: TasmikSchoolRecord): YearClassData[] {
  if (school.classBreakdown && school.classBreakdown.length > 0) {
    return school.classBreakdown;
  }

  const total = Math.max(school.totalStudents || 0, 0);
  const yearLabels = ['TAHUN 1', 'TAHUN 2', 'TAHUN 3', 'TAHUN 4', 'TAHUN 5', 'TAHUN 6'];

  // Jika sekolah mempunyai jumlah murid kecil atau tiada breakdown tersimpan,
  // agihkan tepat mengikut tahap sebenar sekolah supaya JUMLAH I1..KHATAM === totalStudents
  const i1 = school.iqra1 || 0;
  const i2 = school.iqra2 || 0;
  const i3 = school.iqra3 || 0;
  const i4 = school.iqra4 || 0;
  const i5_6 = school.iqra5_6 || 0;
  const i5 = Math.ceil(i5_6 / 2);
  const i6 = Math.floor(i5_6 / 2);

  const j1_5 = school.juz1_5 || 0;
  const j6_10 = school.juz6_10 || 0;
  const j11_15 = school.juz11_15 || 0;
  const j16_20 = school.juz16_20 || 0;
  const j21_25 = school.juz21_25 || 0;
  const j26_30 = school.juz26_30 || 0;
  const khatam = school.khatam || 0;

  const rows: YearClassData[] = yearLabels.map((kelas) => ({
    kelas,
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
    khatam: 0
  }));

  // Agihkan setiap tahap ke tahun yang bersesuaian
  const splitCount = (count: number, weights: number[], field: keyof Omit<YearClassData, 'kelas' | 'bilMurid'>) => {
    if (count <= 0) return;
    let remaining = count;
    weights.forEach((w, idx) => {
      if (w <= 0) return;
      const val = idx === weights.length - 1 ? remaining : Math.min(remaining, Math.round(count * w));
      rows[idx][field] += val;
      remaining -= val;
    });
    if (remaining > 0) {
      const targetIdx = weights.findIndex((w) => w > 0);
      rows[targetIdx >= 0 ? targetIdx : 0][field] += remaining;
    }
  };

  splitCount(i1, [0.65, 0.25, 0.1, 0, 0, 0], 'i1');
  splitCount(i2, [0.35, 0.4, 0.2, 0.05, 0, 0], 'i2');
  splitCount(i3, [0.15, 0.4, 0.3, 0.15, 0, 0], 'i3');
  splitCount(i4, [0.05, 0.25, 0.4, 0.2, 0.1, 0], 'i4');
  splitCount(i5, [0, 0.1, 0.35, 0.35, 0.2, 0], 'i5');
  splitCount(i6, [0, 0, 0.2, 0.4, 0.3, 0.1], 'i6');
  splitCount(j1_5, [0, 0.05, 0.25, 0.35, 0.25, 0.1], 'juz1_5');
  splitCount(j6_10, [0, 0, 0.1, 0.35, 0.35, 0.2], 'juz6_10');
  splitCount(j11_15, [0, 0, 0, 0.2, 0.45, 0.35], 'juz11_15');
  splitCount(j16_20, [0, 0, 0, 0.1, 0.4, 0.5], 'juz16_20');
  splitCount(j21_25, [0, 0, 0, 0, 0.3, 0.7], 'juz21_25');
  splitCount(j26_30, [0, 0, 0, 0, 0.15, 0.85], 'juz26_30');
  splitCount(khatam, [0, 0, 0, 0, 0.15, 0.85], 'khatam');

  // Kira bilMurid tepat untuk setiap baris supaya sepadan dengan pecahan
  let sumAll = 0;
  rows.forEach((r) => {
    r.bilMurid =
      r.i1 + r.i2 + r.i3 + r.i4 + r.i5 + r.i6 +
      r.juz1_5 + r.juz6_10 + r.juz11_15 + r.juz16_20 + r.juz21_25 + r.juz26_30 + r.khatam;
    sumAll += r.bilMurid;
  });

  // Jika terdapat perbezaan kecil dengan school.totalStudents, selaraskan pada Tahun 1 Iqra 1
  if (total > sumAll) {
    const diff = total - sumAll;
    rows[0].i1 += diff;
    rows[0].bilMurid += diff;
  }

  return rows;
}

/**
 * Mengagregatkan pecahan Tahun 1 hingga Tahun 6 daripada kesemua sekolah di Daerah Penampang
 */
export function aggregateDistrictClassBreakdown(schools: TasmikSchoolRecord[]): YearClassData[] {
  const yearLabels = ['TAHUN 1', 'TAHUN 2', 'TAHUN 3', 'TAHUN 4', 'TAHUN 5', 'TAHUN 6'];
  const agg: YearClassData[] = yearLabels.map((kelas) => ({
    kelas,
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
    khatam: 0
  }));

  schools.forEach((school) => {
    const breakdown = generateDefaultClassBreakdown(school);
    breakdown.forEach((row, idx) => {
      if (idx < agg.length) {
        agg[idx].bilMurid += Number(row.bilMurid) || 0;
        agg[idx].i1 += Number(row.i1) || 0;
        agg[idx].i2 += Number(row.i2) || 0;
        agg[idx].i3 += Number(row.i3) || 0;
        agg[idx].i4 += Number(row.i4) || 0;
        agg[idx].i5 += Number(row.i5) || 0;
        agg[idx].i6 += Number(row.i6) || 0;
        agg[idx].juz1_5 += Number(row.juz1_5) || 0;
        agg[idx].juz6_10 += Number(row.juz6_10) || 0;
        agg[idx].juz11_15 += Number(row.juz11_15) || 0;
        agg[idx].juz16_20 += Number(row.juz16_20) || 0;
        agg[idx].juz21_25 += Number(row.juz21_25) || 0;
        agg[idx].juz26_30 += Number(row.juz26_30) || 0;
        agg[idx].khatam += Number(row.khatam) || 0;
      }
    });
  });

  return agg;
}

/**
 * Mengira jumlah baris bagi setiap lajur (Total column sum)
 */
export function calculateTapakTotals(rows: YearClassData[]): YearClassData {
  return rows.reduce(
    (acc, row) => ({
      kelas: 'JUMLAH KESELURUHAN',
      bilMurid: acc.bilMurid + (Number(row.bilMurid) || 0),
      i1: acc.i1 + (Number(row.i1) || 0),
      i2: acc.i2 + (Number(row.i2) || 0),
      i3: acc.i3 + (Number(row.i3) || 0),
      i4: acc.i4 + (Number(row.i4) || 0),
      i5: acc.i5 + (Number(row.i5) || 0),
      i6: acc.i6 + (Number(row.i6) || 0),
      juz1_5: acc.juz1_5 + (Number(row.juz1_5) || 0),
      juz6_10: acc.juz6_10 + (Number(row.juz6_10) || 0),
      juz11_15: acc.juz11_15 + (Number(row.juz11_15) || 0),
      juz16_20: acc.juz16_20 + (Number(row.juz16_20) || 0),
      juz21_25: acc.juz21_25 + (Number(row.juz21_25) || 0),
      juz26_30: acc.juz26_30 + (Number(row.juz26_30) || 0),
      khatam: acc.khatam + (Number(row.khatam) || 0)
    }),
    {
      kelas: 'JUMLAH KESELURUHAN',
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
      khatam: 0
    }
  );
}
