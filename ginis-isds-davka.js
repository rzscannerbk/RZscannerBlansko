(async () => {
  /* GINIS – dávkové ověření datových schránek z výzev RZ Scanneru
     Složka s výzvami → firmy do „IČO“, osoby lustrovat v ISDS:
     se schránkou → doplnit „ID DS: …“ a přesunout do „FO datová schránka“,
     bez schránky → „FO bez datové schránky“, chyby zůstávají na místě. */
  if (window.__ginisDavkaBezi) return;
  const SL_DS = 'FO datová schránka', SL_BEZ = 'FO bez datové schránky', SL_PO_DS = 'PO datová schránka', SL_PO_BEZ = 'PO bez datové schránky';
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

  /* ---------- ZIP / DOCX ---------- */
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };

  function zipRead(buf) {
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    let e = buf.length - 22;
    while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw 'soubor není docx';
    const n = dv.getUint16(e + 10, true);
    let p = dv.getUint32(e + 16, true);
    const out = [];
    for (let i = 0; i < n; i++) {
      const flags = dv.getUint16(p + 8, true), method = dv.getUint16(p + 10, true);
      const time = dv.getUint16(p + 12, true), date = dv.getUint16(p + 14, true);
      const crc = dv.getUint32(p + 16, true), csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true);
      const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
      const lho = dv.getUint32(p + 42, true);
      const nameB = buf.slice(p + 46, p + 46 + nlen);
      const start = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
      out.push({ name: new TextDecoder().decode(nameB), nameB, flags: flags & ~8, method, time, date, crc, csize, usize, data: buf.slice(start, start + csize) });
      p += 46 + nlen + xlen + clen;
    }
    return out;
  }
  async function entryText(en) {
    if (en.method === 0) return new TextDecoder().decode(en.data);
    if (en.method === 8) return await new Response(new Blob([en.data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
    throw 'neznámá komprese dokumentu';
  }
  function zipWrite(entries) {
    const parts = [], cen = [];
    let off = 0;
    for (const en of entries) {
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, en.flags, true); lh.setUint16(8, en.method, true);
      lh.setUint16(10, en.time, true); lh.setUint16(12, en.date, true); lh.setUint32(14, en.crc, true);
      lh.setUint32(18, en.data.length, true); lh.setUint32(22, en.usize, true); lh.setUint16(26, en.nameB.length, true); lh.setUint16(28, 0, true);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, en.flags, true); ch.setUint16(10, en.method, true);
      ch.setUint16(12, en.time, true); ch.setUint16(14, en.date, true); ch.setUint32(16, en.crc, true); ch.setUint32(20, en.data.length, true);
      ch.setUint32(24, en.usize, true); ch.setUint16(28, en.nameB.length, true); ch.setUint32(42, off, true);
      parts.push(new Uint8Array(lh.buffer), en.nameB, en.data);
      cen.push(new Uint8Array(ch.buffer), en.nameB);
      off += 30 + en.nameB.length + en.data.length;
    }
    const cenLen = cen.reduce((a, b) => a + b.length, 0);
    const eo = new DataView(new ArrayBuffer(22));
    eo.setUint32(0, 0x06054b50, true); eo.setUint16(8, entries.length, true); eo.setUint16(10, entries.length, true);
    eo.setUint32(12, cenLen, true); eo.setUint32(16, off, true);
    return new Blob([...parts, ...cen, new Uint8Array(eo.buffer)]);
  }

  /* DOCX-START */
  const xmlEsc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  function parseVyzva(xml) {
    const ent = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
    const paras = s => (s.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || [])
      .map(p => ent((p.match(/<w:t(?: [^>]*)?>[^<]*<\/w:t>/g) || []).map(t => t.replace(/<[^>]+>/g, '')).join('')).replace(/\s+/g, ' ').trim());
    const tc = xml.match(/<w:tc>[\s\S]*?<\/w:tc>/);
    if (!tc) throw 'blok adresáta nenalezen';
    const d = {};
    const lines = paras(tc[0]).filter(l => {
      if (!l) return false;
      const ds = /^ID\s?DS:?\s*(\S+)/i.exec(l);
      if (ds) { d.dsVyzva = ds[1]; return false; }
      return true;
    });
    const ii = lines.findIndex(l => /^(IČO?:?)?\d{8}$/i.test(l.replace(/\s/g, '')));
    if (ii >= 0) d.ico = lines.splice(ii, 1)[0].replace(/\D/g, '');
    d.nazev = lines[0] || '';
    const rest = lines.slice(1);
    const di = rest.findIndex(l => /^\d{1,2}\.\s?\d{1,2}\.\s?\d{4}$/.test(l));
    if (di >= 0) d.narozeni = rest.splice(di, 1)[0].replace(/\s/g, '');
    const last = rest.pop() || '';
    const m = /^(\d{3}\s?\d{2}),?\s*(.+)$/.exec(last);
    if (m) { d.psc = m[1].replace(/\s/g, ''); d.obec = m[2].trim(); } else d.obec = last;
    d.ulice = rest.join(', ');
    if (!d.ico) { const t = d.nazev.split(' '); d.prijmeni = t.pop(); d.jmeno = t.join(' '); }
    return d;
  }
  /* přidá řádek „ID DS: …“ pod poslední řádek adresy (stejný formát odstavce i písma) */
  function vlozDs(xml, ds) {
    const m = xml.match(/<w:tc>[\s\S]*?<\/w:tc>/);
    if (!m) throw 'blok adresáta nenalezen';
    const cell = m[0];
    if (/ID DS:/.test(cell)) {
      const nc = cell.replace(/(ID DS:\s*)[^<]*/, '$1' + xmlEsc(ds));
      return xml.slice(0, m.index) + nc + xml.slice(m.index + cell.length);
    }
    const ps = cell.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || [];
    if (!ps.length) throw 'adresa ve výzvě je prázdná';
    const last = ps[ps.length - 1];
    const pPr = (last.match(/<w:pPr>[\s\S]*?<\/w:pPr>/) || [''])[0];
    const rPr = (last.match(/<w:rPr>[\s\S]*?<\/w:rPr>/) || [''])[0];
    const np = '<w:p>' + pPr + '<w:r>' + rPr + '<w:t xml:space="preserve">ID DS: ' + xmlEsc(ds) + '</w:t></w:r></w:p>';
    const at = m.index + cell.lastIndexOf(last) + last.length;
    return xml.slice(0, at) + np + xml.slice(at);
  }
  async function docxSDs(buf, ds) {
    const ents = zipRead(buf);
    const doc = ents.find(e => e.name === 'word/document.xml');
    if (!doc) throw 'v souboru chybí text dokumentu';
    const nb = new TextEncoder().encode(vlozDs(await entryText(doc), ds));
    Object.assign(doc, { method: 0, data: nb, csize: nb.length, usize: nb.length, crc: crc32(nb) });
    return zipWrite(ents);
  }
  /* DOCX-END */

  /* ---------- panel ---------- */
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;top:12px;right:12px;z-index:2147483647;width:380px;max-width:calc(100vw - 24px);padding:10px 14px;border-radius:8px;background:#1d5fbf;color:#fff;font:14px/1.4 system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.3)';
  const txt = document.createElement('div');
  const bar = document.createElement('div');
  bar.style.cssText = 'margin-top:8px;display:flex;gap:8px;flex-wrap:wrap';
  box.append(txt, bar);
  document.body.appendChild(box);
  const stav = (t, barva) => { txt.textContent = t; box.style.background = barva || '#1d5fbf'; };
  const tlacitka = defs => { bar.innerHTML = ''; defs.forEach(([t, fn]) => { const x = document.createElement('button'); x.textContent = t; x.style.cssText = 'padding:4px 10px;border:0;border-radius:4px;cursor:pointer;font:inherit;color:#222;background:#fff'; x.onclick = fn; bar.appendChild(x); }); };
  window.__ginisDavkaBezi = true;
  const konec = () => { box.remove(); window.__ginisDavkaBezi = false; };

  /* ---------- výběr složky ---------- */
  if (!window.showDirectoryPicker) { stav('Tento prohlížeč neumí pracovat se složkami (potřeba Edge/Chrome a https).', '#c62828'); setTimeout(konec, 8000); return; }
  const root = await new Promise(res => {
    const vyber = async () => { try { res(await window.showDirectoryPicker({ id: 'ginis-vyzvy', mode: 'readwrite' })); } catch (e) { res(null); } };
    stav('Vyber složku s výzvami (.docx).');
    tlacitka([['Vybrat složku', vyber], ['Zrušit', () => res(null)]]);
    if (navigator.userActivation && navigator.userActivation.isActive) vyber();
  });
  tlacitka([]);
  if (!root) { konec(); return; }

  /* ---------- načtení výzev ---------- */
  stav('Načítám výzvy…');
  const polozky = [];
  for await (const [jmeno, h] of root.entries()) {
    if (h.kind !== 'file' || !/\.docx$/i.test(jmeno) || jmeno.startsWith('~$')) continue;
    const p = { soubor: jmeno, h };
    try {
      p.buf = new Uint8Array(await (await h.getFile()).arrayBuffer());
      const doc = zipRead(p.buf).find(e => e.name === 'word/document.xml');
      if (!doc) throw 'v souboru chybí text dokumentu';
      p.D = parseVyzva(await entryText(doc));
    } catch (e) { p.chyba = 'nečitelná výzva: ' + e; }
    polozky.push(p);
  }
  polozky.sort((a, b) => a.soubor.localeCompare(b.soubor, 'cs'));
  const firmy = polozky.filter(p => p.D && p.D.ico), osoby = polozky.filter(p => p.D && !p.D.ico), necit = polozky.filter(p => !p.D);
  if (!polozky.length) { stav('Ve složce nejsou žádné výzvy .docx.', '#c62828'); setTimeout(konec, 6000); return; }
  if (!confirm('Ve složce „' + root.name + '“ je ' + polozky.length + ' výzev:\n\n'
    + '• osoby (FO) k lustraci: ' + osoby.length + '\n'
    + '• firmy (IČO) k lustraci: ' + firmy.length + '\n'
    + (necit.length ? '• nečitelné (zůstanou na místě): ' + necit.length + '\n' : '')
    + '\nSpustit dávku?')) { konec(); return; }

  /* cílové složky: najde i „Název (počet)“ z minulé dávky */
  const reEsc = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const slozky = {};
  async function slozkaH(zaklad) {
    if (slozky[zaklad]) return slozky[zaklad];
    const re = new RegExp('^' + reEsc(zaklad) + '( \\(\\d+\\))?$');
    for await (const [n, h] of root.entries()) if (h.kind === 'directory' && re.test(n)) return (slozky[zaklad] = h);
    return (slozky[zaklad] = await root.getDirectoryHandle(zaklad, { create: true }));
  }
  async function presun(p, slozka, blob) {
    const sub = await slozkaH(slozka);
    const fh = await sub.getFileHandle(p.soubor, { create: true });
    const w = await fh.createWritable();
    await w.write(blob || p.buf);
    await w.close();
    await root.removeEntry(p.soubor);
  }

  /* ---------- pomocné funkce GINIS ---------- */
  const docs = (w = window, out = []) => {
    try { out.push(w.document); } catch (e) { return out; }
    for (let i = 0; i < w.frames.length; i++) docs(w.frames[i], out);
    return out;
  };
  const visible = e => !!(e && e.isConnected && e.getClientRects().length && e.ownerDocument.defaultView.getComputedStyle(e).visibility !== 'hidden');
  const all = sel => docs().flatMap(d => [...d.querySelectorAll(sel)]);
  const find = sel => all(sel).find(e => visible(e) && !box.contains(e));
  const disabled = el => el.disabled || el.getAttribute('aria-disabled') === 'true' || !!el.closest('.js-gbutton-disabled,.ui-state-disabled');
  async function waitFor(fn, co, ms = 15000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      let r = null;
      try { r = fn(); } catch (e) {}
      if (r) return r;
      await sleep(200);
    }
    throw 'nenašel jsem ' + co;
  }
  function click(el) {
    const W = el.ownerDocument.defaultView, o = { bubbles: true, cancelable: true, view: W };
    el.dispatchEvent(new W.PointerEvent('pointerdown', o));
    el.dispatchEvent(new W.MouseEvent('mousedown', o));
    el.dispatchEvent(new W.PointerEvent('pointerup', o));
    el.dispatchEvent(new W.MouseEvent('mouseup', o));
    el.click();
  }
  function fill(inp, v) {
    const W = inp.ownerDocument.defaultView;
    inp.focus();
    Object.getOwnPropertyDescriptor(W.HTMLInputElement.prototype, 'value').set.call(inp, v);
    for (const t of ['input', 'keyup', 'change']) inp.dispatchEvent(new W.Event(t, { bubbles: true }));
    inp.blur();
  }
  const rucne = text => new Promise(res => {
    stav(text, '#b26a00');
    tlacitka([['Pokračovat', () => { tlacitka(stopBtn); res(true); }], ['Přeskočit', () => { tlacitka(stopBtn); res(false); }]]);
  });
  let zastavit = false;
  const stopBtn = [['Zastavit po této výzvě', () => { zastavit = true; stav(txt.textContent + ' (zastavím po této výzvě)'); }]];

  const S = {
    ostatni: 'li[data-param-id="_Ostatnlohy"] a',
    ext: 'a[data-param-id$="SubjektyactKartotekaEsu"]',
    okDuvod: 'button[class*="g_action_actOkPotvrzeni"]',
    nazev: '[data-field="nazev"] input',
    podminky: 'a.js-vsechny-podminky',
    datNar: '[data-field="dat_nar"] input',
    obec: '[data-field="obec"] input',
    nacist: 'button[class*="g_action_actvyhledatDet"]',
    nacistHorni: 'button[class*="g_action_actMaskaVyhledat"]',
    detail: 'button[data-param-id="actDetailEx"]',
    overit: 'button[data-param-id="_Ovit"]',
    isds: '[class*="g_action_actOveritISDS"]',
    msgOk: 'button[data-param-id="ok"]',
    neprevzit: 'button[class*="g_action_actNeprevzit"]',
    zavrit: 'button[class*="g_action_actClose_"]',
    zavritKart: 'a[class*="g_action_actCloseActivity"]'
  };

  /* zavře vše otevřené a vrátí se na úvodní stránku */
  /* křížek v drobečkové navigaci – jen u kartotéky/detailu/výsledku, NIKDY u Úvodní stránky */
  const krizekKart = () => all(S.zavritKart).find(a => {
    if (!visible(a) || box.contains(a)) return false;
    const li = a.closest('li') || a.parentElement;
    const t = norm(li.textContent);
    return !/uvodni stranka/.test(t) && /kartoteka|detail|vysledek|rejstrik/.test(t);
  });
  const nacita = () => all('body *').some(e => !e.children.length && visible(e) && /Nahrávají se data/i.test(e.textContent));
  async function pockejNaNacteni() {
    const t0 = Date.now();
    await sleep(500);
    while (nacita() && Date.now() - t0 < 30000) await sleep(300);
  }
  async function domu() {
    let zavirano = false;
    for (let i = 0; i < 10; i++) {
      const b = find(S.msgOk) || find(S.neprevzit) || find(S.zavrit) || krizekKart();
      if (!b) break;
      click(b);
      zavirano = true;
      await sleep(1200);
    }
    /* úvodní stránka po zavření kartotéky ještě načítá – počkat na data + 3 s */
    await pockejNaNacteni();
    await sleep(zavirano ? 1000 : 300);
    if (find(S.nazev) || find(S.detail)) throw 'nepodařilo se vrátit na úvodní stránku';
  }

  /* ---------- lustrace jedné osoby ---------- */
  async function lustruj(D) {
    const firma = !!D.ico;
    const nazev = firma ? D.nazev : (D.prijmeni + ' ' + D.jmeno).trim();
    if (!firma && !D.narozeni) throw 've výzvě chybí datum narození';

    /* 1–3) Ostatní úlohy → Externí subjekty → OK */
    let ext = find(S.ext);
    if (!ext) {
      click(await waitFor(() => find(S.ostatni), 'menu Ostatní úlohy'));
      ext = await waitFor(() => find(S.ext), 'odkaz Externí subjekty', 5000);
    }
    click(ext);
    const ok = await waitFor(() => find(S.okDuvod), 'tlačítko OK v okně Důvod hledání');
    await sleep(300);
    click(ok);

    /* 4–8) Název, Všechny podmínky, Datum narození, Načíst */
    const nIn = await waitFor(() => find(S.nazev), 'pole Název v kartotéce');
    await sleep(400);
    fill(nIn, nazev);
    const icoIn = await waitFor(() => find('[data-field="ico"] input'), 'pole Ičo');
    fill(icoIn, firma ? D.ico : '');
    const ob0 = find(S.obec);
    if (ob0 && ob0.value) fill(ob0, '');
    const nacistHorni = async () => {
      const b = find(S.nacistHorni) || all('button[aria-label="Načíst"]').find(e => visible(e) && !box.contains(e) && !/actvyhledatDet/.test(e.className));
      if (!b) throw 'nenašel jsem tlačítko Načíst v kartotéce';
      await sleep(300);
      click(b);
    };
    if (firma) await nacistHorni();
    else {
      click(await waitFor(() => find(S.podminky), 'odkaz Všechny podmínky'));
      fill(await waitFor(() => find(S.datNar), 'pole Datum narození'), D.narozeni);
      const ob = find(S.obec);
      if (ob && ob.value) fill(ob, '');
      await sleep(300);
      click(await waitFor(() => find(S.nacist), 'tlačítko Načíst'));
    }

    /* 9) výběr řádku (firma podle IČO, osoba podle jména) */
    await sleep(1000);
    const key = firma ? D.ico : norm(nazev);
    const hits = () => {
      const grid = all('.js-gridKartoteka').filter(visible);
      const pool = grid.length ? grid.flatMap(g => [...g.querySelectorAll('*')]) : all('body *').filter(e => !e.closest('.gform,.gcontrolbox'));
      return pool.filter(e => !e.children.length && !box.contains(e) && visible(e) && norm(e.textContent).includes(key));
    };
    let h = [];
    try { h = await waitFor(() => { const x = hits(); return x.length ? x : null; }, 'výsledek', 15000); } catch (e) {}
    if (!h.length && firma) {
      /* název firmy se v GINIS může psát jinak – zkusit jen podle IČO */
      fill(await waitFor(() => find(S.nazev), 'pole Název'), '');
      await nacistHorni();
      await sleep(1000);
      try { h = await waitFor(() => { const x = hits(); return x.length ? x : null; }, 'výsledek', 15000); } catch (e) {}
    }
    if (!h.length) throw (firma ? 'firma' : 'osoba') + ' nenalezena v kartotéce';
    const rowOf = e => e.closest('tr,[role="row"],.row') || e.parentElement;
    const rows = [...new Set(h.map(rowOf))];
    let vyber = rows[0];
    if (rows.length > 1) {
      const ul = norm((D.ulice || '').replace(/\s*\d.*$/, ''));
      const cp = ((D.ulice || '').match(/\d+/) || [''])[0];
      const obn = norm(D.obec);
      const radekText = r => {
        const b = r.getBoundingClientRect(), y0 = b.top + 2, y1 = b.bottom - 2;
        const grid = r.closest('.js-gridKartoteka') || r.ownerDocument.body;
        return norm(r.textContent + ' ' + [...grid.querySelectorAll('*')].filter(e => {
          if (e.children.length || !visible(e)) return false;
          const q = e.getBoundingClientRect(), c = (q.top + q.bottom) / 2;
          return c >= y0 && c <= y1;
        }).map(e => e.textContent).join(' '));
      };
      const sc = rows.map(r => {
        const t = radekText(r);
        let s = 0;
        if (ul && t.includes(ul)) s += 2;
        if (cp && new RegExp('(^|\\D)' + cp + '(\\D|$)').test(t)) s += 1;
        if (obn && t.includes(obn)) s += 1;
        return s;
      });
      const max = Math.max(...sc);
      vyber = max > 0 ? rows[sc.indexOf(max)] : null;
    }
    if (vyber) { click(h.find(e => vyber.contains(e)) || vyber); await sleep(400); }
    else if (!await rucne(nazev + ': ' + rows.length + ' záznamy, adresa (' + [D.ulice, D.obec].filter(Boolean).join(', ') + ') nesedí. Klikni na správný řádek a pak Pokračovat, nebo Přeskočit.')) throw 'přeskočeno – nejasný výběr osoby';

    /* 10–12) Detail → Ověřit → ISDS */
    click(await waitFor(() => { const b = find(S.detail); return b && !disabled(b) ? b : null; }, 'aktivní tlačítko Detail', 8000));
    const ov = await waitFor(() => find(S.overit), 'tlačítko Ověřit v detailu');
    await sleep(500);
    const najdi = () => { const v = all(S.isds).filter(visible); return v.find(e => e.classList.contains('item__center')) || v[0] || null; };
    let item = null;
    for (let pokus = 0; pokus < 2 && !item; pokus++) {
      click(ov);
      try { item = await waitFor(najdi, 'položku ISDS', 4000); } catch (e) {}
    }
    if (!item) throw 'nenašel jsem položku ISDS v nabídce Ověřit';
    const W = item.ownerDocument.defaultView, r = item.getBoundingClientRect();
    const xy = { bubbles: true, cancelable: true, view: W, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0 };
    for (const t of ['mouseover', 'mouseenter', 'mousemove']) item.dispatchEvent(new W.MouseEvent(t, xy));
    await sleep(150);
    for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) item.dispatchEvent(new (t.startsWith('pointer') ? W.PointerEvent : W.MouseEvent)(t, { ...xy, buttons: t.endsWith('down') ? 1 : 0 }));
    item.click();
    await sleep(800);
    if (visible(item)) { const cap = item.querySelector('.item__caption'); if (cap) cap.click(); await sleep(800); }

    /* výsledek: hláška (bez schránky) nebo tabulka s řádkem IDDS */
    const vysledek = await waitFor(() => {
      const ok = find(S.msgOk);
      if (ok) {
        const dlg = ok.closest('.ui-dialog') || ok.closest('[role="dialog"]') || ok.parentElement.parentElement;
        return { typ: 'msg', text: (dlg.textContent || '').replace(/\s+/g, ' ').replace(/\bOK\b\s*$/, '').trim() };
      }
      const bunka = all('.row .cell, [role="row"] [role="gridcell"]').find(e => visible(e) && e.textContent.trim() === 'IDDS');
      if (bunka) {
        const row = bunka.closest('.row,[role="row"]');
        const vals = [...row.querySelectorAll('.cell,[role="gridcell"]')].map(e => e.textContent.trim()).filter(Boolean);
        return { typ: 'ds', id: vals[vals.length - 1] };
      }
      if (find(S.neprevzit)) return { typ: 'tabulka' };
      return null;
    }, 'výsledek ověření v ISDS', 45000);

    if (vysledek.typ === 'msg') {
      if (/nebyl nalezen/i.test(norm(vysledek.text))) return { ds: null };
      throw 'GINIS hlásí: ' + vysledek.text.replace(/^Upozorn\S*\s*/i, '');
    }
    if (vysledek.typ === 'ds' && vysledek.id && vysledek.id !== 'IDDS' && /^[a-z0-9]{6,8}$/i.test(vysledek.id)) return { ds: vysledek.id };
    throw 'výsledek ISDS bez čitelného ID schránky';
  }

  /* ---------- dávka ---------- */
  const log = [];
  const zapis = (p, vysl, ds, pozn) => log.push({ soubor: p.soubor, osoba: p.D ? (p.D.ico ? p.D.nazev + ' (IČO ' + p.D.ico + ')' : (p.D.prijmeni + ' ' + p.D.jmeno).trim()) : '', narozeni: p.D && p.D.narozeni || '', ico: p.D && p.D.ico || '', vysl, ds: ds || '', pozn: pozn || '' });

  for (const p of necit) zapis(p, 'chyba', '', p.chyba);
  const fronta = osoby.concat(firmy);

  tlacitka(stopBtn);
  let i = 0;
  for (const p of fronta) {
    if (zastavit) { zapis(p, 'nezpracováno', '', 'dávka zastavena'); continue; }
    i++;
    const po = !!p.D.ico;
    const jm = po ? p.D.nazev + ' (IČO ' + p.D.ico + ')' : (p.D.prijmeni + ' ' + p.D.jmeno).trim();
    stav(i + '/' + fronta.length + ' – ' + jm + (zastavit ? ' (zastavím po této výzvě)' : ''));
    try {
      await domu();
      const v = await lustruj(p.D);
      const slDs = po ? SL_PO_DS : SL_DS, slBez = po ? SL_PO_BEZ : SL_BEZ;
      if (v.ds) {
        const pozn = p.D.dsVyzva && p.D.dsVyzva !== v.ds ? 'ID DS ve výzvě (' + p.D.dsVyzva + ') opraveno podle GINIS' : p.D.dsVyzva ? 'ID DS ve výzvě souhlasí' : 'ID DS doplněno';
        await presun(p, slDs, await docxSDs(p.buf, v.ds));
        zapis(p, 'má DS', v.ds, pozn + ', přesunuto do ' + slDs);
      } else {
        await presun(p, slBez);
        zapis(p, 'bez DS', '', (p.D.dsVyzva ? 'pozor: výzva uvádí ID DS ' + p.D.dsVyzva + ', ' : '') + 'přesunuto do ' + slBez);
      }
    } catch (e) {
      zapis(p, 'chyba', '', String(e));
      console.log('[GINIS dávka]', p.soubor, e);
    }
    try { await domu(); }
    catch (e) {
      stav('Nedaří se vrátit na úvodní stránku GINIS – dávku zastavuji.', '#c62828');
      zastavit = true;
      await sleep(2000);
    }
  }

  /* ---------- počty souborů do názvů složek ---------- */
  stav('Doplňuji počty souborů do názvů složek…');
  for (const zaklad of [SL_DS, SL_BEZ, SL_PO_DS, SL_PO_BEZ]) {
    const re = new RegExp('^' + reEsc(zaklad) + '( \\(\\d+\\))?$');
    let h = null;
    try { for await (const [n, x] of root.entries()) if (x.kind === 'directory' && re.test(n)) { h = x; break; } } catch (e) {}
    if (!h) continue;
    try {
      const soubory = [];
      for await (const [n, x] of h.entries()) if (x.kind === 'file') soubory.push([n, x]);
      const cil = zaklad + ' (' + soubory.length + ')';
      if (h.name === cil) continue;
      let hotovo = false;
      if (typeof h.move === 'function') { try { await h.move(cil); hotovo = true; } catch (e) {} }
      if (!hotovo) {
        const nova = await root.getDirectoryHandle(cil, { create: true });
        for (const [n, x] of soubory) {
          const w = await (await nova.getFileHandle(n, { create: true })).createWritable();
          await w.write(await x.getFile()); await w.close();
        }
        await root.removeEntry(h.name, { recursive: true });
      }
    } catch (e) { console.log('[GINIS dávka] přejmenování složky', zaklad, e); }
  }

  /* ---------- přehled ---------- */
  const ted = new Date(), dv = n => String(n).padStart(2, '0');
  const razitko = ted.getFullYear() + '-' + dv(ted.getMonth() + 1) + '-' + dv(ted.getDate()) + '_' + dv(ted.getHours()) + dv(ted.getMinutes());
  const csvB = c => '"' + String(c).replace(/"/g, '""') + '"';
  const csv = '﻿' + [['Soubor', 'Osoba / firma', 'Datum narození', 'IČO', 'Výsledek', 'ID DS', 'Poznámka']]
    .concat(log.map(l => [l.soubor, l.osoba, l.narozeni, l.ico, l.vysl, l.ds, l.pozn])).map(r => r.map(csvB).join(';')).join('\r\n');
  const csvBlob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const nazevPrehledu = 'prehled-ISDS-' + razitko + '.csv';
  let ulozeno = '';
  try {
    const fh = await root.getFileHandle(nazevPrehledu, { create: true });
    const w = await fh.createWritable(); await w.write(csvBlob); await w.close();
    ulozeno = 'Přehled je uložený ve složce jako ' + nazevPrehledu + '.';
  } catch (e) { ulozeno = 'Přehled se nepodařilo uložit do složky, stáhni ho tlačítkem.'; }

  const pocet = t => log.filter(l => l.vysl === t).length;
  box.remove();
  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:16px;font:14px/1.4 system-ui,sans-serif';
  const karta = document.createElement('div');
  karta.style.cssText = 'background:#fff;color:#222;border-radius:10px;max-width:900px;width:100%;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,.35)';
  const barvy = { 'má DS': '#2e7d32', 'bez DS': '#555', 'firma': '#1d5fbf', 'chyba': '#c62828', 'nezpracováno': '#b26a00' };
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  karta.innerHTML = '<div style="padding:16px 20px;border-bottom:1px solid #ddd"><b style="font-size:17px">Dávka ISDS dokončena</b><div style="margin-top:6px">'
    + '<b style="color:#2e7d32">má DS: ' + pocet('má DS') + '</b> · bez DS: ' + pocet('bez DS')
    + ' · <span style="color:#c62828">chyby: ' + pocet('chyba') + '</span>' + (pocet('nezpracováno') ? ' · nezpracováno: ' + pocet('nezpracováno') : '')
    + '</div><div style="margin-top:4px;color:#666">' + esc(ulozeno) + '</div></div>'
    + '<div style="overflow:auto;padding:0 20px"><table style="border-collapse:collapse;width:100%;margin:10px 0">'
    + '<tr style="text-align:left;color:#666"><th style="padding:4px 8px">Osoba / firma</th><th style="padding:4px 8px">Výsledek</th><th style="padding:4px 8px">ID DS</th><th style="padding:4px 8px">Poznámka</th></tr>'
    + log.map(l => '<tr style="border-top:1px solid #eee"><td style="padding:4px 8px">' + esc(l.osoba || l.soubor) + '</td><td style="padding:4px 8px;color:' + (barvy[l.vysl] || '#222') + ';font-weight:600;white-space:nowrap">' + esc(l.vysl) + '</td><td style="padding:4px 8px;font-family:monospace">' + esc(l.ds) + '</td><td style="padding:4px 8px;color:#555">' + esc(l.pozn) + '</td></tr>').join('')
    + '</table></div><div style="padding:12px 20px;border-top:1px solid #ddd;display:flex;gap:8px;justify-content:flex-end"></div>';
  const pata = karta.lastChild;
  const btn = (t, fn, prim) => { const b = document.createElement('button'); b.textContent = t; b.style.cssText = 'padding:6px 14px;border-radius:6px;cursor:pointer;font:inherit;border:1px solid #1d5fbf;' + (prim ? 'background:#1d5fbf;color:#fff' : 'background:#fff;color:#1d5fbf'); b.onclick = fn; pata.appendChild(b); };
  btn('Stáhnout přehled (CSV)', () => { const a = document.createElement('a'); a.href = URL.createObjectURL(csvBlob); a.download = nazevPrehledu; a.click(); });
  btn('Zavřít', () => { ov.remove(); window.__ginisDavkaBezi = false; }, true);
  ov.appendChild(karta);
  document.body.appendChild(ov);
})();
