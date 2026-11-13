/* PhysCalc data files: read .csv / .txt / .tsv / .dat, NumPy .npy and .npz into columns of numbers,
 * and keep them in the browser (IndexedDB) so they are still there after a reload.
 * No DOM access in the parsers, so they also run under Node for tests.
 *
 * A parsed file is { cols: [{ name, shape: [n] or [rows, cols], data: Float64Array }], notes: [..] }.
 */
(function (g) {
  'use strict';
  var P = g.PhysCalc = g.PhysCalc || {};

  function ident(s, fallback) {
    s = String(s).trim().replace(/[µμ]/g, 'u').replace(/[^\w]+/g, '_').replace(/^_+|_+$/g, '');
    if (!s) s = fallback;
    if (/^\d/.test(s)) s = fallback.replace(/\d+$/, '') + '_' + s;
    return s;
  }
  function uniqueNames(names) {
    var seen = {};
    return names.map(function (n) { var b = n, k = 2; while (seen[n]) n = b + '_' + (k++); seen[n] = true; return n; });
  }

  // ---------- CSV / whitespace- or tab-separated text ----------
  function parseCSV(text) {
    var notes = [];
    var lines = text.replace(/^﻿/, '').split(/\r\n|\n|\r/).filter(function (l) { return l.trim() && !/^\s*(#|%|\/\/)/.test(l); });
    if (!lines.length) throw new Error('the file has no data rows');
    var head = lines.slice(0, 20), sample = head.join('\n');
    // the separator is the first of tab ; , that appears on every line; otherwise columns are split on spaces
    var delim = ['\t', ';', ','].filter(function (d) { return head.every(function (l) { return l.indexOf(d) >= 0; }); })[0] || null;
    var split = delim ? function (l) { return splitQuoted(l, delim); } : function (l) { return l.trim().split(/\s+/); };
    var decimalComma = delim === ';' && /\d,\d/.test(sample) && !/\d\.\d/.test(sample);
    function num(s) {
      s = s.trim().replace(/^"(.*)"$/, '$1'); if (decimalComma) s = s.replace(',', '.');
      if (s === '') return NaN;
      var v = Number(s); return isNaN(v) && /^[-+]?(nan|inf(inity)?)$/i.test(s) ? (/nan/i.test(s) ? NaN : (s[0] === '-' ? -Infinity : Infinity)) : v;
    }
    var rows = lines.map(split);
    var first = rows[0], header = first.some(function (c) { var t = c.trim().replace(/^"(.*)"$/, '$1'); return t !== '' && isNaN(num(t)) && !/^[-+]?(nan|inf)/i.test(t); });
    var ncol = 0; rows.forEach(function (r) { if (r.length > ncol) ncol = r.length; });
    var names = [];
    for (var j = 0; j < ncol; j++) names.push(ident(header && first[j] !== undefined ? first[j].replace(/^\s*"(.*)"\s*$/, '$1') : '', 'c' + (j + 1)));
    names = uniqueNames(names);
    var body = header ? rows.slice(1) : rows, n = body.length, bad = 0;
    if (!n) throw new Error('the file has a header but no data rows');
    var cols = names.map(function (nm) { return { name: nm, shape: [n], data: new Float64Array(n) }; });
    body.forEach(function (r, i) { for (var j = 0; j < ncol; j++) { var v = j < r.length ? num(r[j]) : NaN; if (isNaN(v)) bad++; cols[j].data[i] = v; } });
    // drop columns that hold no numbers at all (labels, timestamps)
    var kept = cols.filter(function (c) { for (var i = 0; i < n; i++) if (!isNaN(c.data[i])) return true; return false; });
    if (kept.length < cols.length) notes.push((cols.length - kept.length) + ' text column' + (cols.length - kept.length > 1 ? 's' : '') + ' skipped');
    if (!kept.length) throw new Error('no numeric columns found');
    var stillBad = 0; kept.forEach(function (c) { for (var i = 0; i < n; i++) if (isNaN(c.data[i])) stillBad++; });
    if (stillBad) notes.push(stillBad + ' empty or non-numeric cell' + (stillBad > 1 ? 's' : '') + ' read as NaN');
    return { cols: kept, notes: notes };
  }
  function splitQuoted(line, d) {
    if (line.indexOf('"') < 0) return line.split(d);
    var out = [], cur = '', q = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
      else if (ch === d && !q) { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur); return out;
  }

  // ---------- NumPy .npy ----------
  function parseNPYArray(buf) {      // -> { shape, data: Float64Array (C order) }
    var u8 = new Uint8Array(buf), dv = new DataView(buf instanceof ArrayBuffer ? buf : buf.buffer, buf.byteOffset || 0, buf.byteLength);
    if (u8.length < 10 || u8[0] !== 0x93 || String.fromCharCode(u8[1], u8[2], u8[3], u8[4], u8[5]) !== 'NUMPY') throw new Error('not a NumPy .npy file');
    var major = u8[6], hlen = major >= 2 ? dv.getUint32(8, true) : dv.getUint16(8, true), hstart = major >= 2 ? 12 : 10;
    var header = ''; for (var i = 0; i < hlen; i++) header += String.fromCharCode(u8[hstart + i]);
    var dm = /'descr'\s*:\s*'([^']*)'/.exec(header), sm = /'shape'\s*:\s*\(([^)]*)\)/.exec(header), fortran = /'fortran_order'\s*:\s*True/.test(header);
    if (!dm) throw new Error('structured arrays (several named fields) are not supported — save plain numeric arrays');
    if (!sm) throw new Error('could not read the array shape');
    var descr = dm[1], shape = sm[1].split(',').map(function (s) { return s.trim(); }).filter(Boolean).map(Number);
    var t = /^([<>|=])([fiub])(\d+)$/.exec(descr);
    if (!t) throw new Error(/^[<>|=]c/.test(descr) ? 'complex arrays are not supported — save the real and imaginary parts separately' : 'data type ' + descr + ' is not numeric');
    var little = t[1] !== '>', kind = t[2], size = +t[3], n = shape.reduce(function (a, b) { return a * b; }, 1), off = hstart + hlen;
    if (off + n * size > dv.byteLength) throw new Error('the file is shorter than its header says');
    var read = { f8: 'getFloat64', f4: 'getFloat32', f2: null, i1: 'getInt8', i2: 'getInt16', i4: 'getInt32', i8: 'getBigInt64', u1: 'getUint8', u2: 'getUint16', u4: 'getUint32', u8: 'getBigUint64', b1: 'getUint8' }[kind + size];
    if (!read) throw new Error('data type ' + descr + ' is not supported');
    var raw = new Float64Array(n);
    for (var k = 0; k < n; k++) raw[k] = Number(dv[read](off + k * size, little));
    if (fortran && shape.length === 2) {                // column-major on disk -> row-major
      var r = shape[0], c = shape[1], fixed = new Float64Array(n);
      for (var a = 0; a < r; a++) for (var b = 0; b < c; b++) fixed[a * c + b] = raw[b * r + a];
      raw = fixed;
    }
    return { shape: shape, data: raw };
  }
  // one array -> columns: 1-D as is; 2-D as the whole array plus one column per column (when there are few)
  function arrayToCols(name, arr, colPrefix, notes) {
    var sh = arr.shape;
    if (sh.length === 0) return [{ name: name, shape: [1], data: arr.data }];
    if (sh.length === 1) return [{ name: name, shape: sh, data: arr.data }];
    if (sh.length > 2) { notes.push(name + ': ' + sh.join('×') + ' array skipped (only 1-D and 2-D arrays are supported)'); return []; }
    var out = [{ name: name, shape: sh, data: arr.data }], r = sh[0], c = sh[1];
    if (c <= 12 && r > 1) for (var j = 0; j < c; j++) {
      var col = new Float64Array(r); for (var i = 0; i < r; i++) col[i] = arr.data[i * c + j];
      out.push({ name: colPrefix + (j + 1), shape: [r], data: col });
    }
    return out;
  }
  function parseNPY(buf) {
    var notes = [], cols = arrayToCols('data', parseNPYArray(buf), 'c', notes);
    if (!cols.length) throw new Error(notes[0] || 'empty array');
    return { cols: cols, notes: notes };
  }

  // ---------- NumPy .npz (a zip of .npy files; np.savez and np.savez_compressed) ----------
  function inflateRaw(bytes) {
    if (typeof DecompressionStream === 'undefined') return Promise.reject(new Error('this browser cannot read compressed .npz files — save with np.savez (not savez_compressed)'));
    var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Response(stream).arrayBuffer();
  }
  function parseNPZ(buf) {
    var dv = new DataView(buf), u8 = new Uint8Array(buf), eocd = -1;
    for (var i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('not a .npz (zip) file');
    var count = dv.getUint16(eocd + 10, true), p = dv.getUint32(eocd + 16, true), entries = [];
    if (count === 0xffff || p === 0xffffffff) throw new Error('this .npz is too large (zip64) — save fewer or smaller arrays');
    for (var e = 0; e < count; e++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('damaged .npz file');
      var method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), lho = dv.getUint32(p + 42, true);
      var name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nlen));
      entries.push({ name: name, method: method, csize: csize, lho: lho });
      p += 46 + nlen + xlen + clen;
    }
    var notes = [], cols = [];
    return entries.reduce(function (chain, en) {
      return chain.then(function () {
        if (!/\.npy$/.test(en.name)) return;
        var start = en.lho + 30 + dv.getUint16(en.lho + 26, true) + dv.getUint16(en.lho + 28, true);
        var bytes = u8.subarray(start, start + en.csize);
        var get = en.method === 0 ? Promise.resolve(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)) : en.method === 8 ? inflateRaw(bytes) : Promise.reject(new Error('unsupported zip compression'));
        var key = ident(en.name.replace(/\.npy$/, '').replace(/^.*\//, ''), 'arr' + (cols.length + 1));
        return get.then(function (ab) {
          try { cols = cols.concat(arrayToCols(key, parseNPYArray(ab), key + '_', notes)); }
          catch (err) { notes.push(key + ': skipped (' + err.message + ')'); }
        });
      });
    }, Promise.resolve()).then(function () {
      if (!cols.length) throw new Error(notes[0] || 'no numeric arrays in this .npz');
      var names = uniqueNames(cols.map(function (c) { return c.name; }));
      cols.forEach(function (c, k) { c.name = names[k]; });
      return { cols: cols, notes: notes };
    });
  }

  // any supported file -> Promise of { cols, notes }
  function parseFile(name, buf) {
    try {
      var u8 = new Uint8Array(buf);
      if (/\.npz$/i.test(name) || (u8[0] === 0x50 && u8[1] === 0x4b)) return parseNPZ(buf);
      if (/\.npy$/i.test(name) || u8[0] === 0x93) return Promise.resolve(parseNPY(buf));
      return Promise.resolve(parseCSV(new TextDecoder().decode(u8)));
    } catch (e) { return Promise.reject(e); }
  }

  // ---------- storage in the browser (IndexedDB) ----------
  function db() {
    return new Promise(function (res, rej) {
      if (!g.indexedDB) return rej(new Error('no IndexedDB'));
      var rq = g.indexedDB.open('physcalc-data', 1);
      rq.onupgradeneeded = function () { rq.result.createObjectStore('files', { keyPath: 'name' }); };
      rq.onsuccess = function () { res(rq.result); };
      rq.onerror = function () { rej(rq.error); };
    });
  }
  function tx(mode, fn) {
    return db().then(function (d) {
      return new Promise(function (res, rej) {
        var t = d.transaction('files', mode), out = fn(t.objectStore('files'));
        t.oncomplete = function () { res(out && out.result); d.close(); };
        t.onerror = t.onabort = function () { rej(t.error); d.close(); };
      });
    });
  }
  P.dataFiles = {
    ident: ident, parseCSV: parseCSV, parseNPY: parseNPY, parseNPZ: parseNPZ, parseFile: parseFile,
    loadAll: function () { return tx('readonly', function (s) { return s.getAll(); }); },
    save: function (rec) { return tx('readwrite', function (s) { return s.put(rec); }); },
    remove: function (name) { return tx('readwrite', function (s) { return s.delete(name); }); }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
