/* Oemahku Lite — ekspor Excel (.xlsx) dan PDF tanpa pustaka luar.
   UMD: window.Exp di browser, module.exports di Node (untuk tes).
   Aturan: nomor identitas (KTP/NPWP/KK/SIM) TIDAK pernah diekspor; foto tidak diekspor. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Exp = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- data: lembar kerja ----------
  // sheet = { name, cols: [{ h: 'Judul', t: 's'|'n'|'m' }], rows: [[...]], note? }   (n = angka, m = rupiah)
  const KIND = { income: 'Pemasukan', expense: 'Pengeluaran', transfer: 'Transfer' };
  const ACC_TYPE = { kas: 'Kas', bank: 'Bank', ewallet: 'E-wallet', kartu: 'Kartu kredit', invest: 'Investasi' };
  const VEH = { motor: 'Motor', mobil: 'Mobil', motor_ev: 'Motor listrik', mobil_ev: 'Mobil listrik', lain: 'Lainnya' };
  const UNIT = { day: 'hari', week: 'minggu', month: 'bulan', year: 'tahun' };
  const GROUP = { rumah: 'Rumah', kendaraan: 'Kendaraan', elektronik: 'Elektronik' };

  const S = (h) => ({ h, t: 's' }), M = (h) => ({ h, t: 'm' }), N = (h) => ({ h, t: 'n' });
  const BILL_CAT = { kpr: 'KPR Rumah', angsuran_rumah: 'Angsuran Rumah / KPR', kendaraan: 'Cicilan Kendaraan', haji: 'Angsuran Haji', umrah: 'Angsuran Umrah', arisan: 'Arisan', elektronik: 'Cicilan Elektronik', pinjaman: 'Cicilan Pinjaman', asuransi: 'Asuransi', pendidikan: 'Biaya Pendidikan', internet: 'Internet & Telepon', utilitas: 'Listrik & Air', lingkungan: 'Iuran Lingkungan', langganan: 'Langganan Bulanan', lainnya: 'Tagihan Lainnya' };
  const billCat = (b) => BILL_CAT[b.cat] || (b.kind === 'cicilan' ? 'Cicilan' : b.kind === 'wajib' ? 'Kewajiban tetap' : 'Tagihan');
  const sortBy = (arr, f) => arr.slice().sort((a, b) => (f(a) < f(b) ? -1 : f(a) > f(b) ? 1 : 0));

  // opts: { ym:'2026-11', allTx:bool, scope:'all'|'uang'|'rumah', today:'YYYY-MM-DD' }
  function sets(C, store, opts) {
    const o = opts || {}, today = o.today || C.today(), ym = o.ym || today.slice(0, 7), scope = o.scope || 'all';
    const L = (t) => C.list(store, t), out = [];
    const accs = L('acc'), txs = L('tx'), bal = C.balances(accs, txs), accName = {};
    accs.forEach((a) => { accName[a.id] = a.name; });

    if (scope === 'all' || scope === 'uang') {
      const rep = C.monthReport(txs, ym), ad = C.assetsDebt(accs, txs);
      out.push({ name: 'Ringkasan uang', cols: [S('Keterangan'), M('Jumlah')], rows: [
        ['Periode ' + ym + ' — pemasukan', rep.income], ['Periode ' + ym + ' — pengeluaran', rep.expense], ['Periode ' + ym + ' — selisih', rep.income - rep.expense],
        ['Total aset (akun bersaldo positif)', ad.assets], ['Total utang (akun bersaldo negatif)', ad.debt], ['Kekayaan bersih (semua akun)', ad.assets - ad.debt]],
      note: 'Transfer antar akun tidak dihitung sebagai pemasukan/pengeluaran.' });
      const cats = Object.keys(rep.byCat).sort((a, b) => rep.byCat[b] - rep.byCat[a]);
      if (cats.length) out.push({ name: 'Pengeluaran per kategori', cols: [S('Kategori'), M('Jumlah'), N('% dari total')], rows: cats.map((c) => [c, rep.byCat[c], rep.expense ? Math.round((rep.byCat[c] * 1000) / rep.expense) / 10 : 0]), note: 'Periode ' + ym });
      const srcs = Object.keys(rep.bySrc).sort((a, b) => rep.bySrc[b] - rep.bySrc[a]);
      if (srcs.length) out.push({ name: 'Pemasukan per sumber', cols: [S('Sumber dana'), M('Jumlah'), N('% dari total')], rows: srcs.map((c) => [c, rep.bySrc[c], rep.income ? Math.round((rep.bySrc[c] * 1000) / rep.income) / 10 : 0]), note: 'Periode ' + ym });
      const tx = sortBy(txs.filter((t) => o.allTx || (t.date || '').slice(0, 7) === ym), (t) => (t.date || '') + (t._u || '')).reverse();
      out.push({ name: 'Transaksi', cols: [S('Tanggal'), S('Jenis'), S('Kategori / sumber'), S('Dari akun'), S('Ke akun'), M('Jumlah'), S('Catatan'), S('Status')],
        rows: tx.map((t) => [t.date || '', KIND[t.kind] || t.kind, t.cat || '', accName[t.acc] || '', t.kind === 'transfer' ? (accName[t.to] || '') : '', t.amount || 0, t.note || '', t.void ? 'Dibatalkan (void)' : 'Aktif']),
        note: o.allTx ? 'Semua periode' : 'Periode ' + ym });
      out.push({ name: 'Akun', cols: [S('Nama'), S('Tipe'), M('Saldo awal'), M('Saldo sekarang'), S('Dana darurat')], rows: sortBy(accs, (a) => a.name || '').map((a) => [a.name, ACC_TYPE[a.type] || a.type || '', a.opening || 0, bal[a.id] || 0, a.emergency ? 'Ya' : '']) });
      const bs = C.budgetStatus(L('budget'), C.monthReport(txs, ym));
      if (bs.length) out.push({ name: 'Anggaran', cols: [S('Kategori'), M('Batas'), M('Terpakai'), N('% terpakai')], rows: bs.map((b) => [b.cat, b.limit, b.spent, b.pct]), note: 'Periode ' + ym });
      const bills = L('bill');
      if (bills.length) out.push({ name: 'Tagihan & kewajiban', cols: [S('Nama'), S('Kategori'), S('Jenis'), M('Nominal'), M('Nominal angsuran'), N('Angsuran ke'), N('Tenor'), N('Sisa angsuran'), N('Tgl jatuh tempo'), S('Sudah dibayar bulan ' + ym)], rows: sortBy(bills, (b) => +b.dueDay || 0).map((b) => { const st = C.installmentInfo ? C.installmentInfo(b) : { active: false }; return [b.name, billCat(b), b.kind || 'tagihan', b.amountEst || 0, b.installmentAmount || b.amountEst || 0, st.active && st.no != null ? st.no : '', st.active && st.count != null ? st.count : '', st.active && st.remaining != null ? st.remaining : '', +b.dueDay || 0, b.paidYM === ym ? 'Ya' : 'Belum']; }), note: 'Progres angsuran dihitung dari nomor angsuran dan tenor pada template.' });
      const gc = L('gc');
      const goals = L('goal');
      if (goals.length) out.push({ name: 'Tujuan keuangan', cols: [S('Tujuan'), M('Target'), M('Terkumpul'), N('% tercapai'), S('Tenggat'), S('Status')], rows: goals.map((g) => {
        const saved = (g.accId ? Math.max(0, bal[g.accId] || 0) : 0) + gc.filter((x) => x.goalId === g.id).reduce((s, x) => s + (x.amount || 0), 0), p = C.goalProgress(g, saved, today);
        return [g.name, g.target || 0, saved, p.pct, g.date || '', p.status];
      }) });
    }

    if (scope === 'all' || scope === 'rumah') {
      const vehs = L('veh'), vName = {}; vehs.forEach((v) => { vName[v.id] = v.name; });
      const plans = sortBy(L('plan'), (p) => p.nextDue || '9999');
      if (plans.length) out.push({ name: 'Perawatan', cols: [S('Perawatan'), S('Kelompok'), S('Kendaraan'), S('Setiap'), S('Jatuh tempo'), S('Terakhir'), M('Perkiraan biaya')], rows: plans.map((p) => [p.name, GROUP[p.group] || p.group || '', vName[p.vehicleId] || '', (p.every || '') + ' ' + (UNIT[p.unit] || p.unit || '') + (p.kmEvery ? ' / ' + p.kmEvery + ' km' : ''), p.nextDue || '', p.lastDone || '', p.cost || 0]) });
      if (vehs.length) out.push({ name: 'Kendaraan', cols: [S('Nama'), S('Jenis'), S('Plat'), N('Tahun'), N('Odometer (km)'), S('Pajak jatuh tempo'), S('STNK jatuh tempo')], rows: vehs.map((v) => [v.name, VEH[v.kind] || v.kind || '', v.plate || '', +v.year || '', v.odometer === '' || v.odometer == null ? '' : +v.odometer, v.pajakDue || '', v.stnkDue || '']) });
      const assets = L('asset');
      if (assets.length) out.push({ name: 'Aset & garansi', cols: [S('Nama'), S('Kategori'), M('Harga'), S('Garansi sampai'), S('Lokasi')], rows: assets.map((a) => [a.name, a.cat || '', a.price || 0, a.warrantyUntil || '', a.place || '']) });
      const inv = L('inv');
      if (inv.length) out.push({ name: 'Stok rumah', cols: [S('Barang'), N('Jumlah'), S('Satuan'), N('Batas minimum'), S('Kedaluwarsa'), S('Lokasi')], rows: inv.map((i) => [i.name, +i.qty || 0, i.unit || '', +i.min || 0, i.expiry || '', i.place || '']) });
      const docs = L('doc');
      if (docs.length) out.push({ name: 'Dokumen penting', cols: [S('Dokumen'), S('Kelompok'), S('Berlaku sampai')], rows: sortBy(docs, (d) => d.expiry || '9999').map((d) => [d.title, ({ personal: 'Personal', aset: 'Properti/Aset', karier: 'Pendidikan/Karier' })[d.cat] || 'Lainnya', d.expiry || '']), note: 'Hanya judul & tanggal berlaku; nomor, lokasi simpan, catatan, dan foto tidak diekspor.' });
      const cts = L('contact');
      if (cts.length) out.push({ name: 'Kontak penting', cols: [S('Nama'), S('Peran'), S('Telepon'), S('Darurat')], rows: sortBy(cts, (c) => c.name || '').map((c) => [c.name, c.role || '', c.phone || '', c.emergency ? 'Ya' : '']) });
      const wt = C.weightSeries(L('wt'));
      if (wt.length) out.push({ name: 'Berat badan', cols: [S('Tanggal'), N('Berat (kg)')], rows: wt.map((w) => [w.date, w.kg]) });
    }
    return out;
  }

  // ---------- XLSX (zip tanpa kompresi, ditulis sendiri) ----------
  const CRC = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  const enc = (s) => new TextEncoder().encode(s);
  function zip(files) { // files: [{name, data:Uint8Array}]
    const parts = [], cen = []; let off = 0;
    const u16 = (v) => [v & 255, (v >>> 8) & 255], u32 = (v) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
    files.forEach((f) => {
      const nm = enc(f.name), crc = crc32(f.data), sz = f.data.length;
      const lh = Uint8Array.from([].concat(u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(crc), u32(sz), u32(sz), u16(nm.length), u16(0)));
      parts.push(lh, nm, f.data);
      cen.push(Uint8Array.from([].concat(u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(crc), u32(sz), u32(sz), u16(nm.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(off))), nm);
      off += lh.length + nm.length + sz;
    });
    let cl = 0; cen.forEach((c) => { cl += c.length; });
    const end = Uint8Array.from([].concat(u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(cl), u32(off), u16(0)));
    const all = parts.concat(cen, [end]); let tot = 0; all.forEach((p) => { tot += p.length; });
    const out = new Uint8Array(tot); let p = 0; all.forEach((x) => { out.set(x, p); p += x.length; });
    return out;
  }
  const xe = (s) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const colL = (i) => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  function sheetName(n, used) {
    let b = String(n || 'Sheet').replace(/[\[\]:*?\/\\]/g, ' ').trim().slice(0, 31) || 'Sheet', x = b, i = 2;
    while (used.has(x.toLowerCase())) { x = b.slice(0, 28) + ' ' + i++; }
    used.add(x.toLowerCase()); return x;
  }
  function sheetXml(sh) {
    const widths = sh.cols.map((c, i) => { let w = String(c.h).length; sh.rows.forEach((r) => { const v = r[i]; const l = v == null ? 0 : (c.t === 's' ? String(v).length : String(v).length + 3); if (l > w) w = l; }); return Math.min(48, Math.max(8, w + 2)); });
    let x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>';
    widths.forEach((w, i) => { x += '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>'; });
    x += '</cols><sheetData><row r="1">';
    sh.cols.forEach((c, i) => { x += '<c r="' + colL(i) + '1" t="inlineStr" s="1"><is><t>' + xe(c.h) + '</t></is></c>'; });
    x += '</row>';
    sh.rows.forEach((r, ri) => {
      x += '<row r="' + (ri + 2) + '">';
      sh.cols.forEach((c, i) => {
        const v = r[i], ref = colL(i) + (ri + 2);
        if (v === '' || v == null) return;
        if ((c.t === 'm' || c.t === 'n') && typeof v === 'number' && isFinite(v)) x += '<c r="' + ref + '"' + (c.t === 'm' ? ' s="2"' : '') + '><v>' + v + '</v></c>';
        else x += '<c r="' + ref + '" t="inlineStr"><is><t xml:space="preserve">' + xe(v) + '</t></is></c>';
      });
      x += '</row>';
    });
    if (sh.note) x += '<row r="' + (sh.rows.length + 3) + '"><c r="A' + (sh.rows.length + 3) + '" t="inlineStr"><is><t>' + xe(sh.note) + '</t></is></c></row>';
    return x + '</sheetData></worksheet>';
  }
  function xlsx(shs) {
    if (!shs.length) shs = [{ name: 'Kosong', cols: [S('Info')], rows: [['Tidak ada data']] }];
    const used = new Set(), names = shs.map((s) => sheetName(s.name, used)), files = [];
    const ns = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"', hdr = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    files.push({ name: '[Content_Types].xml', data: enc(hdr + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' + shs.map((_, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('') + '</Types>') });
    files.push({ name: '_rels/.rels', data: enc(hdr + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>') });
    files.push({ name: 'xl/workbook.xml', data: enc(hdr + '<workbook ' + ns + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + names.map((n, i) => '<sheet name="' + xe(n) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') + '</sheets></workbook>') });
    files.push({ name: 'xl/_rels/workbook.xml.rels', data: enc(hdr + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + shs.map((_, i) => '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('') + '<Relationship Id="rId' + (shs.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>') });
    files.push({ name: 'xl/styles.xml', data: enc(hdr + '<styleSheet ' + ns + '><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDDEBE4"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>') });
    shs.forEach((s, i) => files.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: enc(sheetXml(s)) }));
    return zip(files);
  }

  // ---------- PDF (teks + tabel, font Helvetica bawaan; emoji dibuang) ----------
  const HW = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
  const WIN = { 0x2013: 0x2D, 0x2014: 0x2D, 0x2018: 0x91, 0x2019: 0x92, 0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2026: 0x85, 0x20AC: 0x80, 0xB7: 0xB7 };
  function clean(s) { // -> string 1 byte per karakter (WinAnsi); karakter yang tak dikenal dibuang
    let o = '';
    for (const ch of String(s == null ? '' : s)) {
      const c = ch.codePointAt(0);
      if (c === 10 || c === 13 || c === 9) o += ' ';
      else if (c >= 32 && c < 127) o += ch;
      else if (WIN[c]) o += String.fromCharCode(WIN[c]);
      else if (c >= 160 && c <= 255) o += ch;
    }
    return o;
  }
  const cw = (c, bold) => { const k = c.charCodeAt(0); return ((k >= 32 && k < 127 ? HW[k - 32] : 556) * (bold ? 1.07 : 1)) / 1000; };
  const tw = (s, size, bold) => { let w = 0; for (let i = 0; i < s.length; i++) w += cw(s[i], bold); return w * size; };
  const pe = (s) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  function wrap(s, size, maxW, bold) {
    const lines = []; let cur = '';
    const push = () => { lines.push(cur); cur = ''; };
    String(s).split(' ').forEach((word) => {
      let w = word;
      while (tw(w, size, bold) > maxW) { // pecah kata terlalu panjang
        let k = 1; while (k < w.length && tw(w.slice(0, k + 1), size, bold) <= maxW) k++;
        if (cur) push(); lines.push(w.slice(0, k)); w = w.slice(k);
      }
      const t = cur ? cur + ' ' + w : w;
      if (tw(t, size, bold) <= maxW) cur = t; else { if (cur) push(); cur = w; }
    });
    if (cur || !lines.length) push();
    return lines;
  }
  const rp = (n) => (n < 0 ? '-Rp ' : 'Rp ') + String(Math.abs(Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const cellText = (c, v) => (v === '' || v == null) ? '' : (c.t === 'm' && typeof v === 'number' ? rp(v) : c.t === 'n' && typeof v === 'number' ? String(v).replace('.', ',') : String(v));

  function pdf(title, subtitle, shs) {
    const PW = 595.28, PH = 841.89, MX = 36, MT = 44, MB = 44, W = PW - 2 * MX, FS = 8, LH = 10, PAD = 3;
    const pages = []; let cur = null, y = 0;
    const np = () => { cur = []; pages.push(cur); y = PH - MT; };
    const text = (x, yy, s, size, bold, right, w) => { s = clean(s); if (!s) return; const xx = right ? x + w - tw(s, size, bold) : x; cur.push('BT /' + (bold ? 'F2' : 'F1') + ' ' + size + ' Tf ' + xx.toFixed(2) + ' ' + yy.toFixed(2) + ' Td (' + pe(s) + ') Tj ET'); };
    np();
    text(MX, y, title, 16, true); y -= 18; text(MX, y, subtitle, 9, false); y -= 12;
    text(MX, y, 'Oemahku Lite oleh Illusix — dibuat dari data di perangkat Anda. Nomor identitas dan foto tidak disertakan.', 7.5, false); y -= 16;
    shs.forEach((sh) => {
      const cols = sh.cols, n = cols.length;
      const nat = cols.map((c, i) => { let m = tw(clean(c.h), FS, true); sh.rows.forEach((r) => { const w = tw(clean(cellText(c, r[i])), FS, false); if (w > m) m = w; }); return m + 2 * PAD + 1; });
      // "water-filling": kolom pendek tetap selebar isinya, kolom panjang yang membungkus
      let lo = 30, hi = 600; for (let it = 0; it < 30; it++) { const T = (lo + hi) / 2; const sm = nat.reduce((a, x) => a + Math.min(x, T), 0); if (sm <= W) lo = T; else hi = T; }
      let cws = nat.map((x) => Math.min(x, lo)); const sum2 = cws.reduce((a, b2) => a + b2, 0);
      if (sum2 < W) { const e = (W - sum2) / n; cws = cws.map((w) => w + e); }
      const headLines = cols.map((c, i) => wrap(clean(c.h), FS, cws[i] - 2 * PAD, true)), hh = Math.max.apply(null, headLines.map((l) => l.length)) * LH + 2 * PAD;
      const drawHead = () => {
        cur.push('0.87 0.92 0.89 rg ' + MX + ' ' + (y - hh).toFixed(2) + ' ' + W.toFixed(2) + ' ' + hh.toFixed(2) + ' re f 0 g');
        let x = MX; cols.forEach((c, i) => { headLines[i].forEach((ln, j) => text(x + PAD, y - PAD - FS - j * LH + 1, ln, FS, true, c.t !== 's', cws[i] - 2 * PAD)); x += cws[i]; });
        y -= hh;
      };
      if (y - 60 < MB) np();
      text(MX, y, sh.name, 11, true); y -= 14; if (sh.note) { text(MX, y, sh.note, 7.5, false); y -= 11; }
      drawHead();
      if (!sh.rows.length) { text(MX + PAD, y - PAD - FS, '(tidak ada data)', FS, false); y -= LH + 2 * PAD; }
      sh.rows.forEach((r) => {
        const lines = cols.map((c, i) => wrap(clean(cellText(c, r[i])), FS, cws[i] - 2 * PAD, false)), rh = Math.max.apply(null, lines.map((l) => l.length)) * LH + 2 * PAD;
        if (y - rh < MB) { np(); drawHead(); }
        let x = MX; cols.forEach((c, i) => { lines[i].forEach((ln, j) => text(x + PAD, y - PAD - FS - j * LH + 1, ln, FS, false, c.t !== 's', cws[i] - 2 * PAD)); x += cws[i]; });
        y -= rh; cur.push('0.8 G 0.3 w ' + MX + ' ' + y.toFixed(2) + ' m ' + (MX + W).toFixed(2) + ' ' + y.toFixed(2) + ' l S 0 G');
      });
      y -= 16;
    });
    // objek PDF
    const objs = []; const add = (s) => { objs.push(s); return objs.length; };
    add('<< /Type /Catalog /Pages 2 0 R >>'); add(null); // 2 = Pages (diisi nanti)
    add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'); add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const kids = [];
    pages.forEach((p, i) => {
      p.push('BT /F1 7.5 Tf ' + (PW / 2 - 30).toFixed(2) + ' 24 Td (' + pe('Halaman ' + (i + 1) + ' / ' + pages.length) + ') Tj ET');
      const body = p.join('\n'), cid = add('<< /Length ' + body.length + ' >>\nstream\n' + body + '\nendstream');
      kids.push(add('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + PW + ' ' + PH + '] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ' + cid + ' 0 R >>'));
    });
    objs[1] = '<< /Type /Pages /Count ' + kids.length + ' /Kids [' + kids.map((k) => k + ' 0 R').join(' ') + '] >>';
    let out = '%PDF-1.4\n', offs = [];
    objs.forEach((o, i) => { offs.push(out.length); out += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
    const xr = out.length; out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n' + offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('') + 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xr + '\n%%EOF';
    const u = new Uint8Array(out.length); for (let i = 0; i < out.length; i++) u[i] = out.charCodeAt(i) & 255; return u;
  }

  return { sets, xlsx, pdf, crc32, zip };
}));
