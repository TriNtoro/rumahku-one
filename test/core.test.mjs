import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const C = createRequire(import.meta.url)('../core.js');

test('fmtIDR: rupiah utuh, tidak bergantung ICU', () => {
  assert.equal(C.fmtIDR(1500), 'Rp 1.500');
  assert.equal(C.fmtIDR(0), 'Rp 0');
  assert.equal(C.fmtIDR(-1250000), '-Rp 1.250.000');
  assert.throws(() => C.fmtIDR(1.5));
});
test('parseAmount: terima format Indonesia, tolak desimal/sampah', () => {
  assert.equal(C.parseAmount('1.500.000'), 1500000);
  assert.equal(C.parseAmount('Rp 25.000'), 25000);
  assert.equal(C.parseAmount('1500'), 1500);
  assert.equal(C.parseAmount('12,50'), null);
  assert.equal(C.parseAmount('abc'), null);
  assert.equal(C.parseAmount(''), null);
  assert.equal(C.parseAmount('99999999999999999999'), null);
});
test('tanggal: akhir bulan & anchor 31', () => {
  assert.equal(C.addMonths('2026-01-31', 1, 31), '2026-02-28');
  assert.equal(C.addMonths('2026-02-28', 1, 31), '2026-03-31');
  assert.equal(C.addMonths('2024-01-31', 1, 31), '2024-02-29');
  assert.equal(C.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(C.nextDate('2026-02-28', 'yearly', 28), '2027-02-28');
});
test('completeTask: berulang memajukan due, melompati yang terlewat; sekali jadi selesai', () => {
  const t = { id: 'a', title: 'x', due: '2026-11-01', repeat: 'weekly' };
  const r = C.completeTask(t, '2026-11-14');
  assert.equal(r.due, '2026-11-15');
  assert.equal(r.done, false);
  assert.deepEqual(r.doneLog, ['2026-11-14']);
  const o = C.completeTask({ id: 'b', title: 'y', due: '2026-11-14', repeat: 'none' }, '2026-11-14');
  assert.equal(o.done, true);
  const m = C.completeTask({ id: 'c', due: '2026-01-31', repeat: 'monthly' }, '2026-01-31');
  assert.equal(m.due, '2026-02-28');
  assert.equal(C.completeTask(m, '2026-02-28').due, '2026-03-31');
});
test('expandEvent: half-open, skip, until, batas', () => {
  const ev = { date: '2026-11-01', repeat: 'daily' };
  assert.deepEqual(C.expandEvent(ev, '2026-11-03', '2026-11-06'), ['2026-11-03', '2026-11-04', '2026-11-05']);
  assert.deepEqual(C.expandEvent({ ...ev, skip: ['2026-11-04'] }, '2026-11-03', '2026-11-06'), ['2026-11-03', '2026-11-05']);
  assert.deepEqual(C.expandEvent({ ...ev, until: '2026-11-04' }, '2026-11-03', '2026-11-30'), ['2026-11-03', '2026-11-04']);
  assert.equal(C.expandEvent(ev, '2020-01-01', '2040-01-01').length, 1000);
  assert.deepEqual(C.expandEvent({ date: '2026-11-05', repeat: 'none' }, '2026-11-05', '2026-11-06'), ['2026-11-05']);
  assert.deepEqual(C.expandEvent({ date: '2026-11-06', repeat: 'none' }, '2026-11-05', '2026-11-06'), []);
});
const accs = [{ id: 'k', opening: 100000 }, { id: 'b', opening: 0 }];
test('transfer tidak mengubah kekayaan bersih & tidak masuk laporan', () => {
  const before = C.netWorth(accs, []);
  const txs = [{ id: '1', kind: 'transfer', acc: 'k', to: 'b', amount: 40000, date: '2026-11-02' }];
  assert.equal(C.netWorth(accs, txs), before);
  const bal = C.balances(accs, txs);
  assert.equal(bal.k, 60000); assert.equal(bal.b, 40000);
  const r = C.monthReport(txs, '2026-11');
  assert.equal(r.income, 0); assert.equal(r.expense, 0);
});
test('void = seolah transaksi tak ada; pemasukan/pengeluaran benar', () => {
  const txs = [
    { id: '1', kind: 'income', acc: 'k', amount: 500000, date: '2026-11-01' },
    { id: '2', kind: 'expense', acc: 'k', amount: 120000, date: '2026-11-03', cat: 'Makan' },
    { id: '3', kind: 'expense', acc: 'k', amount: 80000, date: '2026-11-04', cat: 'Makan', void: true },
  ];
  assert.equal(C.balances(accs, txs).k, 100000 + 500000 - 120000);
  const r = C.monthReport(txs, '2026-11');
  assert.equal(r.expense, 120000); assert.equal(r.byCat.Makan, 120000);
  const bs = C.budgetStatus([{ id: 'b1', cat: 'Makan', limit: 150000 }], r)[0];
  assert.equal(bs.pct, 80); assert.equal(bs.level, 'warn');
  assert.equal(C.budgetStatus([{ id: 'b', cat: 'Makan', limit: 100000 }], r)[0].level, 'over');
});
test('transaksi tidak bisa dihapus lewat remove', () => {
  const s = C.emptyStore();
  const t = C.put(s, 'tx', { kind: 'expense', acc: 'k', amount: 1, date: '2026-11-01' });
  assert.throws(() => C.remove(s, t.id));
  const tk = C.put(s, 'task', { title: 'a' });
  C.remove(s, tk.id);
  assert.equal(C.list(s, 'task').length, 0);
});
test('merge: terbaru menang per rekaman, komutatif, tombstone & void bertahan', () => {
  const a = C.emptyStore(), b = C.emptyStore();
  C.put(a, 'task', { id: 't1', title: 'lama' }, '2026-11-01T00:00:00Z');
  C.put(b, 'task', { id: 't1', title: 'baru' }, '2026-11-02T00:00:00Z');
  C.put(a, 'task', { id: 't2', title: 'hanya A' }, '2026-11-01T00:00:00Z');
  C.put(b, 'task', { id: 't3', title: 'dihapus di B' }, '2026-11-01T00:00:00Z');
  C.put(a, 'task', { id: 't3', title: 'dihapus di B' }, '2026-11-01T00:00:00Z');
  C.remove(b, 't3', '2026-11-03T00:00:00Z');
  const m1 = C.mergeStores(a, b), m2 = C.mergeStores(b, a);
  assert.deepEqual(m1, m2);
  assert.equal(m1.rec.t1.title, 'baru');
  assert.equal(C.list(m1, 'task').map((x) => x.id).sort().join(), 't1,t2');
  // void tidak hidup lagi walau sisi lain lebih baru tanpa void
  const x = C.emptyStore(), y = C.emptyStore();
  C.put(x, 'tx', { id: 'v', kind: 'expense', acc: 'k', amount: 5, date: '2026-11-01', void: true }, '2026-11-01T00:00:00Z');
  C.put(y, 'tx', { id: 'v', kind: 'expense', acc: 'k', amount: 5, date: '2026-11-01' }, '2026-11-09T00:00:00Z');
  assert.equal(C.mergeStores(x, y).rec.v.void, true);
  assert.equal(C.mergeStores(y, x).rec.v.void, true);
});
test('streak kebiasaan', () => {
  assert.equal(C.streak(['2026-11-12', '2026-11-13', '2026-11-14'], '2026-11-14'), 3);
  assert.equal(C.streak(['2026-11-12', '2026-11-13'], '2026-11-14'), 2);
  assert.equal(C.streak(['2026-11-10'], '2026-11-14'), 0);
});
test('garansi & servis jatuh tempo', () => {
  const a = [{ id: '1', warrantyUntil: '2026-11-20' }, { id: '2', warrantyUntil: '2027-05-01' }, { id: '3', warrantyUntil: '2026-10-01' }, { id: '4', nextService: '2026-11-10' }];
  assert.deepEqual(C.warrantySoon(a, '2026-11-14', 30).map((x) => x.id), ['1']);
  assert.deepEqual(C.serviceDue(a, '2026-11-14').map((x) => x.id), ['4']);
});
test('validStore menolak bentuk salah (impor backup)', () => {
  assert.equal(C.validStore({ v: 1, rec: {} }), true);
  assert.equal(C.validStore({ v: 2, rec: {} }), false);
  assert.equal(C.validStore(null), false);
  assert.equal(C.validStore({ v: 1, rec: [] }), false);
});

// ---------- Rumah ----------
test('countdown & urgency', () => {
  assert.equal(C.daysBetween('2026-11-14', '2027-02-16'), 94);
  assert.equal(C.countdown(94), '3 bulan lagi');
  assert.equal(C.countdown(40), '40 hari lagi');
  assert.equal(C.countdown(1), 'Besok');
  assert.equal(C.countdown(0), 'Hari ini');
  assert.equal(C.countdown(-3), 'Terlambat 3 hari');
  assert.equal(C.urgency(-1), 'late'); assert.equal(C.urgency(5), 'soon'); assert.equal(C.urgency(30), 'ok');
});
test('interval label & jadwal dari tanggal selesai', () => {
  assert.equal(C.intervalLabel({ every: 12, unit: 'month' }), 'tiap tahun');
  assert.equal(C.intervalLabel({ every: 3, unit: 'month' }), 'tiap 3 bulan');
  assert.equal(C.intervalLabel({ every: 24, unit: 'month' }), 'tiap 2 tahun');
  assert.equal(C.intervalLabel({ every: 14, unit: 'day' }), 'tiap 2 minggu');
  assert.equal(C.intervalLabel({ every: 10, unit: 'day' }), 'tiap 10 hari');
  assert.equal(C.planNext({ every: 3, unit: 'month' }, '2026-11-30'), '2027-02-28');
  assert.equal(C.planNext({ every: 14, unit: 'day' }, '2026-11-14'), '2026-11-28');
  // terlambat 2 bulan lalu dikerjakan hari ini -> hitung dari hari ini, bukan dari due lama
  assert.equal(C.completePlan({ every: 6, unit: 'month', nextDue: '2026-09-01' }, '2026-11-14').nextDue, '2027-05-14');
});
test('tagihan: periode, tanggal 31, sudah dibayar, menunggak', () => {
  assert.equal(C.dueInMonth('2026-02', 31), '2026-02-28');
  const b = { dueDay: 20, paidYM: '2026-10' };
  assert.equal(C.billNext(b, '2026-11-14'), '2026-11-20');
  assert.equal(C.billNext({ dueDay: 20, paidYM: '2026-11' }, '2026-11-14'), '2026-12-20');
  assert.equal(C.billNext({ dueDay: 5, paidYM: '2026-10' }, '2026-11-14'), '2026-11-05'); // lewat & belum bayar -> terlambat
  assert.equal(C.billNext({ dueDay: 5 }, '2026-11-14'), '2026-11-05');
  assert.equal(C.billNext({ dueDay: 31, paidYM: '2026-11' }, '2026-11-14'), '2026-12-31');
});
test('stok menipis', () => {
  const r = C.lowStock([{ qty: 1, min: 2 }, { qty: 5, min: 2 }, { qty: 0, min: 0 }, { qty: 2, min: 2 }]);
  assert.equal(r.length, 2);
});
test('homeAttention: urut, ambang, tidak menyertakan yang jauh', () => {
  const s = C.emptyStore(), T = '2026-11-14';
  C.put(s, 'plan', { name: 'Servis AC', group: 'rumah', every: 3, unit: 'month', nextDue: '2026-11-10' });
  C.put(s, 'plan', { name: 'Kuras toren', group: 'rumah', every: 6, unit: 'month', nextDue: '2027-03-01' });
  C.put(s, 'plan', { name: 'Ganti oli', group: 'kendaraan', every: 2, unit: 'month', nextDue: '2026-11-20' });
  C.put(s, 'bill', { name: 'Listrik', dueDay: 15, paidYM: '2026-10' });
  C.put(s, 'bill', { name: 'Internet', dueDay: 10, paidYM: '2026-11' });
  C.put(s, 'asset', { name: 'Kulkas', warrantyUntil: '2026-12-01' });
  C.put(s, 'veh', { id: 'v1', name: 'Motor', odometer: 12300, pajakDue: '2026-11-30' });
  C.put(s, 'plan', { name: 'Ganti oli motor', group: 'kendaraan', vehicleId: 'v1', every: 6, unit: 'month', nextDue: '2027-05-01', nextKm: 12600 });
  C.put(s, 'plan', { name: 'Servis besar', group: 'kendaraan', vehicleId: 'v1', every: 12, unit: 'month', nextDue: '2027-11-01', nextKm: 20000 });
  C.put(s, 'doc', { title: 'Polis rumah', expiry: '2027-06-01' });
  C.put(s, 'inv', { name: 'Gas LPG', qty: 0, min: 1 });
  const a = C.homeAttention(s, T);
  const names = a.map((x) => x.text);
  assert.equal(a[0].text, 'Servis AC'); assert.equal(a[0].level, 'late');
  assert.ok(names.includes('Tagihan Listrik') && names.includes('Ganti oli'));
  assert.ok(names.includes('Gas LPG hampir habis'));
  assert.ok(names.includes('Pajak Motor'));
  assert.ok(names.includes('Ganti oli motor (Motor) 300 km lagi'));
  assert.ok(!names.some((n) => n.startsWith('Servis besar')));
  assert.ok(!names.includes('Kuras toren')); assert.ok(!names.includes('Polis rumah kedaluwarsa'));
  assert.ok(!names.includes('Tagihan Internet')); // internet baru jatuh tempo Des 10 -> >7 hari
  for (let i = 1; i < a.length; i++) assert.ok(a[i - 1].n <= a[i].n);
});

test('kmLeft', () => {
  assert.equal(C.kmLeft({ nextKm: 12600 }, 12300), 300);
  assert.equal(C.kmLeft({ nextKm: 12600 }, 12700), -100);
  assert.equal(C.kmLeft({}, 12300), null);
  assert.equal(C.kmLeft({ nextKm: 100 }, null), null);
});

// ---------- v0.3 ----------
test('greeting menurut jam', () => {
  assert.equal(C.greeting(7), 'Selamat pagi'); assert.equal(C.greeting(12), 'Selamat siang');
  assert.equal(C.greeting(16), 'Selamat sore'); assert.equal(C.greeting(21), 'Selamat malam'); assert.equal(C.greeting(2), 'Selamat malam');
});
test('routineTimes: tiap jam dari-sampai, satu kali, dan batas', () => {
  assert.deepEqual(C.routineTimes({ from: '08:00', to: '11:00', everyMin: 60 }), ['08:00', '09:00', '10:00', '11:00']);
  assert.deepEqual(C.routineTimes({ from: '07:30' }), ['07:30']);
  assert.deepEqual(C.routineTimes({ from: 'xx' }), []);
  assert.equal(C.routineTimes({ from: '00:00', to: '23:59', everyMin: 5 }).length, 48);
});
test('routineDue: mengingatkan sesuai laju, tidak dua kali, berhenti bila target tercapai', () => {
  const r = { id: 'r', target: 8, from: '08:00', to: '15:00', everyMin: 60 }; // 8 slot
  const fired = new Set();
  const d1 = C.routineDue(r, '2026-11-14', 8 * 60 + 2, 0, fired);
  assert.equal(d1.time, '08:00'); fired.add(d1.key);
  assert.equal(C.routineDue(r, '2026-11-14', 8 * 60 + 3, 0, fired), null, 'tidak diulang');
  assert.equal(C.routineDue(r, '2026-11-14', 9 * 60 + 1, 2, fired), null, 'sudah sesuai laju (2 >= 2)');
  assert.equal(C.routineDue(r, '2026-11-14', 9 * 60 + 1, 1, fired).expected, 2);
  assert.equal(C.routineDue(r, '2026-11-14', 9 * 60 + 40, 0, fired), null, 'lewat batas toleransi 20 menit');
  assert.equal(C.routineDue(r, '2026-11-14', 12 * 60, 8, fired), null, 'target tercapai');
  assert.equal(C.routineDue(Object.assign({}, r, { paused: true }), '2026-11-14', 9 * 60, 0, fired), null);
});
test('routineActiveOn & routineDone', () => {
  const r = { days: [1, 2, 3, 4, 5] }; // 2026-11-14 = Sabtu
  assert.equal(C.routineActiveOn(r, '2026-11-14'), false); assert.equal(C.routineActiveOn(r, '2026-11-16'), true);
  assert.equal(C.routineActiveOn({}, '2026-11-14'), true);
  const logs = [{ routineId: 'a', date: '2026-11-14', n: 2 }, { routineId: 'a', date: '2026-11-14', n: 1 }, { routineId: 'b', date: '2026-11-14', n: 5 }, { routineId: 'a', date: '2026-11-13', n: 9 }];
  assert.equal(C.routineDone(logs, 'a', '2026-11-14'), 3);
});
test('fireAt/inWindow: pengingat sebelum jam tugas', () => {
  const at = C.fireAt('2026-11-14', '09:00', 30);
  assert.equal(new Date(at).getHours(), 8); assert.equal(new Date(at).getMinutes(), 30);
  assert.equal(C.inWindow(at + 60000, at), true); assert.equal(C.inWindow(at - 1, at), false); assert.equal(C.inWindow(at + 31 * 60000, at), false);
  assert.equal(C.fireAt('2026-11-14', '', 0), null);
});
test('maskId & ageOn', () => {
  assert.equal(C.maskId('3201 0101 9001 0002'), '3201••••••••0002'); assert.equal(C.maskId('1234'), '••••'); assert.equal(C.maskId(''), '••••');
  assert.equal(C.ageOn('1990-11-15', '2026-11-14'), 35); assert.equal(C.ageOn('1990-11-14', '2026-11-14'), 36); assert.equal(C.ageOn('', '2026-11-14'), null);
});
test('buildICS: CRLF, escape, VALARM, RRULE', () => {
  const ics = C.buildICS([{ uid: 'x1', title: 'Minum, air; sekarang', date: '2026-11-15', time: '08:00', rrule: 'FREQ=DAILY', alarmMin: 10 }], '2026-11-14T01:02:03.000Z');
  assert.ok(ics.includes('\r\n') && !/[^\r]\n/.test(ics));
  assert.ok(ics.includes('SUMMARY:Minum\\, air\\; sekarang')); assert.ok(ics.includes('TRIGGER:-PT10M')); assert.ok(ics.includes('RRULE:FREQ=DAILY'));
  assert.ok(ics.includes('DTSTART:20261115T080000')); assert.ok(ics.startsWith('BEGIN:VCALENDAR') && ics.trim().endsWith('END:VCALENDAR'));
  assert.equal(C.buildICS([{ uid: 'y', title: 't', date: '2026-11-15', time: 'bad' }]).includes('VEVENT'), false);
  const rs = C.routineICS({ id: 'r', name: 'Obat', from: '07:00', days: [1, 3] }, '2026-11-15');
  assert.equal(rs.length, 1); assert.equal(rs[0].rrule, 'FREQ=WEEKLY;BYDAY=MO,WE');
});
test('waNumber: normalisasi nomor Indonesia', () => {
  assert.equal(C.waNumber('0812-3456-7890'), '6281234567890'); assert.equal(C.waNumber('+62 812 3456 7890'), '6281234567890');
  assert.equal(C.waNumber('81234567890'), '6281234567890'); assert.equal(C.waNumber('119'), ''); assert.equal(C.waNumber(''), '');
  assert.equal(C.waNumber('+1 415 555 0100'), '14155550100');
});
test('data contoh yang diubah pengguna tidak lagi bertanda demo', () => {
  const st = C.emptyStore(); const r = C.put(st, 'plan', { name: 'Servis AC', demo: true });
  assert.equal(st.rec[r.id].demo, true);
  C.put(st, 'plan', { id: r.id, name: 'Servis AC ruang tamu' });
  assert.equal(st.rec[r.id].demo, undefined);
  const r2 = C.put(st, 'plan', { name: 'Lain', demo: true }); C.put(st, 'plan', { id: r2.id, demo: true });
  assert.equal(st.rec[r2.id].demo, true);
});
test('calendarItems: ulang tahun (anggota & profil), tagihan, perawatan, pajak, garansi, dokumen', () => {
  const st = C.emptyStore();
  C.put(st, 'profile', { id: 'profile', name: 'Illa', nick: 'Illa', birth: '1985-11-20' });
  C.put(st, 'person', { name: 'Siti Aminah', nick: 'Siti', birth: '1990-02-29' });
  C.put(st, 'bill', { name: 'Listrik', dueDay: 31, amountEst: 450000 });
  C.put(st, 'plan', { name: 'Servis AC', nextDue: '2026-11-18' });
  C.put(st, 'veh', { name: 'Beat', pajakDue: '2026-11-25', stnkDue: '' });
  C.put(st, 'asset', { name: 'Kulkas', warrantyUntil: '2026-11-30' });
  C.put(st, 'doc', { title: 'Polis', expiry: '2026-11-22' });
  const nov = C.calendarItems(st, '2026-11-01', '2026-12-01');
  const by = (k) => nov.filter((x) => x.kind === k);
  assert.equal(by('birthday').length, 1); assert.equal(by('birthday')[0].date, '2026-11-20'); assert.match(by('birthday')[0].title, /Illa/); assert.equal(by('birthday')[0].sub, 'ke-41');
  assert.equal(by('bill')[0].date, '2026-11-30', 'tanggal 31 di bulan 30 hari -> akhir bulan');
  assert.equal(by('plan')[0].date, '2026-11-18'); assert.equal(by('veh').length, 1); assert.equal(by('asset')[0].date, '2026-11-30'); assert.equal(by('doc')[0].date, '2026-11-22');
  const feb = C.calendarItems(st, '2027-02-01', '2027-03-01');
  assert.equal(feb.filter((x) => x.kind === 'birthday')[0].date, '2027-02-28', '29 Feb -> 28 Feb di tahun biasa');
  assert.equal(C.calendarItems(st, '2026-12-01', '2026-12-02').length, 0 + C.calendarItems(st, '2026-12-01', '2026-12-02').filter((x) => x.kind === 'bill').length);
});
test('IMT & kategori Kemenkes RI', () => {
  assert.equal(C.bmi(58, 158), 23.2); assert.equal(C.bmi(0, 170), null); assert.equal(C.bmi(70, 0), null);
  const k = (b) => C.bmiCategory(b).key;
  assert.equal(k(16.9), 'sangat-kurus'); assert.equal(k(17), 'kurus'); assert.equal(k(18.4), 'kurus');
  assert.equal(k(18.5), 'normal'); assert.equal(k(25), 'normal'); assert.equal(k(25.1), 'gemuk'); assert.equal(k(27), 'gemuk');
  assert.equal(k(27.1), 'obesitas'); assert.equal(C.bmiCategory(null), null);
});
test('rentang berat normal, lingkar perut, deret & laju berat', () => {
  assert.deepEqual(C.healthyRange(170), { min: 53.5, max: 72.3 });
  assert.equal(C.waistRisk('L', 90), true); assert.equal(C.waistRisk('L', 89), false); assert.equal(C.waistRisk('P', 80), true); assert.equal(C.waistRisk('P', 79.9), false); assert.equal(C.waistRisk('', 100), null);
  const ser = C.weightSeries([{ date: '2026-11-02', kg: 80 }, { date: '2026-11-01', kg: 81 }, { date: '2026-11-02', kg: 79.5 }, { date: '2026-11-03', kg: 0 }]);
  assert.deepEqual(ser, [{ date: '2026-11-01', kg: 81 }, { date: '2026-11-02', kg: 79.5 }]);
  const pts = []; for (let i = 0; i < 8; i++) pts.push({ date: C.addDays('2026-11-01', i), kg: 90 - i * 0.1 }); // turun 0.1 kg/hari = 0.7 kg/minggu
  assert.equal(C.weeklyRate(pts, '2026-11-08', 14), -0.7); assert.equal(C.weeklyRate(pts.slice(0, 2), '2026-11-08', 14), null);
});
test('topSlices menggabungkan sisa & persen', () => {
  const s = C.topSlices({ Gaji: 6500000, Bisnis: 1000000, Invest: 60000, A: 50000, B: 40000 }, 4);
  assert.equal(s.length, 4); assert.equal(s[0].name, 'Gaji'); assert.equal(s[3].name, 'Lainnya (gabungan)'); assert.equal(s[3].amount, 90000);
  assert.equal(Math.round(s.reduce((a, x) => a + x.pct, 0)), 100); assert.deepEqual(C.topSlices({}, 4), []);
});
test('monthReport.bySrc, dailyCum, netWorthAt, assetsDebt (transfer tak dihitung)', () => {
  const accs = [{ id: 'a', opening: 1000 }, { id: 'k', opening: -500 }];
  const txs = [{ kind: 'income', amount: 300, acc: 'a', cat: 'Gaji', date: '2026-11-02' }, { kind: 'expense', amount: 100, acc: 'a', cat: 'Makan', date: '2026-11-03' }, { kind: 'transfer', amount: 200, acc: 'a', to: 'k', date: '2026-11-03' }, { kind: 'expense', amount: 50, acc: 'a', cat: 'X', date: '2026-11-04', void: true }, { kind: 'income', amount: 10, acc: 'a', cat: 'Gaji', date: '2026-12-01' }];
  const r = C.monthReport(txs, '2026-11'); assert.deepEqual(r.bySrc, { Gaji: 300 }); assert.equal(r.expense, 100);
  const d = C.dailyCum(txs, '2026-11', 4); assert.deepEqual(d.inc, [0, 300, 300, 300]); assert.deepEqual(d.exp, [0, 0, 100, 100]);
  assert.equal(C.netWorthAt(accs, txs, '2026-11-02'), 500 + 300); assert.equal(C.netWorthAt(accs, txs, '2026-11-30'), 500 + 300 - 100);
  assert.deepEqual(C.assetsDebt(accs, txs), { assets: 1000 + 300 - 100 - 200 + 10, debt: 300 });
});
test('avgMonthly: hanya bulan berdata', () => {
  const txs = [{ kind: 'income', amount: 600, acc: 'a', date: '2026-09-01' }, { kind: 'expense', amount: 300, acc: 'a', date: '2026-09-02' }, { kind: 'income', amount: 1000, acc: 'a', date: '2026-11-01' }, { kind: 'expense', amount: 500, acc: 'a', date: '2026-11-05' }];
  assert.deepEqual(C.avgMonthly(txs, '2026-11', 3), { income: 800, expense: 400, months: 2 }); assert.equal(C.avgMonthly([], '2026-11', 3).months, 0);
});
test('healthLevel per mode', () => {
  const b = { mode: 'pekerja', netWorth: 1, avgIncome: 10, avgExpense: 5, emergency: 0, debtPay: 0, hasData: true };
  assert.equal(C.healthLevel({ ...b, hasData: false }).level, null);
  assert.equal(C.healthLevel({ ...b, netWorth: -1 }).level, 0);
  assert.equal(C.healthLevel({ ...b, avgExpense: 11 }).level, 1);
  assert.equal(C.healthLevel({ ...b, emergency: 4 }).level, 2);            // < 1 bulan
  assert.equal(C.healthLevel({ ...b, emergency: 10, debtPay: 4 }).level, 2); // cicilan > 30%
  assert.equal(C.healthLevel({ ...b, emergency: 10, saveRate: 0 }).level, 3);  // 2 bulan (<3)
  assert.equal(C.healthLevel({ ...b, emergency: 15 }).level, 4);           // 3 bulan, tabung 50%
  assert.equal(C.healthLevel({ ...b, emergency: 30 }).level, 5);           // 6 bulan, tabung 50%
  assert.equal(C.healthLevel({ ...b, avgExpense: 9, emergency: 54 }).level, 4); // tabung 10% <20%
  assert.equal(C.healthLevel({ ...b, mode: 'keluarga', emergency: 15 }).level, 3); // 3 bln <6
  assert.equal(C.healthLevel({ ...b, mode: 'pelajar', emergency: 15 }).level, 5);  // 3 bln >=3
});
test('goalProgress & budgetPace', () => {
  const g = C.goalProgress({ target: 18000000, date: '2027-11-15' }, 10600000, '2026-11-15');
  assert.equal(g.pct, 58.8); assert.equal(g.left, 7400000); assert.equal(g.months, 12); assert.equal(g.perMonth, 616667); assert.equal(g.status, 'jalan');
  assert.equal(C.goalProgress({ target: 100 }, 100, '2026-11-15').status, 'tercapai');
  assert.equal(C.goalProgress({ target: 100, date: '2026-11-01' }, 10, '2026-11-15').status, 'terlambat');
  const p = C.budgetPace(2300000, 1120000, '2026-11', '2026-11-15');
  assert.equal(p.dim, 30); assert.equal(p.expectedPct, 50); assert.equal(p.pct, 48); assert.equal(p.daysLeft, 16); assert.equal(p.perDay, 73750); assert.equal(p.ahead, false);
  assert.equal(C.budgetPace(100, 90, '2026-11', '2026-11-05').ahead, true); assert.equal(C.budgetPace(100, 50, '2026-10', '2026-11-15').expectedPct, 100);
});
