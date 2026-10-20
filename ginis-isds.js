(async () => {
  /* GINIS – ověření datové schránky osoby z výzvy RZ Scanneru */
  if (window.__ginisIsdsBezi) return;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

  /* DOCX-START */
  async function readDocx(file) {
    const buf = new Uint8Array(await file.arrayBuffer());
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    let e = buf.length - 22;
    while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw 'soubor není docx';
    const n = dv.getUint16(e + 10, true);
    let p = dv.getUint32(e + 16, true);
    for (let i = 0; i < n; i++) {
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
      const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
      const lho = dv.getUint32(p + 42, true);
      const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nlen));
      if (name === 'word/document.xml') {
        const start = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
        const data = buf.subarray(start, start + csize);
        if (method === 0) return new TextDecoder().decode(data);
        if (method === 8) return await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
        throw 'neznámá komprese dokumentu';
      }
      p += 46 + nlen + xlen + clen;
    }
    throw 'v souboru chybí text dokumentu';
  }

  function parseVyzva(xml) {
    const ent = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
    const paras = s => (s.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || [])
      .map(p => ent((p.match(/<w:t(?: [^>]*)?>[^<]*<\/w:t>/g) || []).map(t => t.replace(/<[^>]+>/g, '')).join('')).replace(/\s+/g, ' ').trim());
    const tc = xml.match(/<w:tc>[\s\S]*?<\/w:tc>/);
    if (!tc) throw 'blok adresáta nenalezen';
    const lines = paras(tc[0]).filter(Boolean);
    const d = { nazev: lines[0] || '' };
    const rest = lines.slice(1);
    const di = rest.findIndex(l => /^\d{1,2}\.\s?\d{1,2}\.\s?\d{4}$/.test(l));
    if (di >= 0) d.narozeni = rest.splice(di, 1)[0].replace(/\s/g, '');
    const ii = rest.findIndex(l => /^(IČO?:?)?\d{8}$/i.test(l.replace(/\s/g, '')));
    if (ii >= 0) d.ico = rest.splice(ii, 1)[0].replace(/\D/g, '');
    const last = rest.pop() || '';
    const m = /^(\d{3}\s?\d{2}),?\s*(.+)$/.exec(last);
    if (m) { d.psc = m[1].replace(/\s/g, ''); d.obec = m[2].trim(); } else d.obec = last;
    d.ulice = rest.join(', ');
    if (!d.ico) { const t = d.nazev.split(' '); d.prijmeni = t.pop(); d.jmeno = t.join(' '); }
    return d;
  }
  /* DOCX-END */

  /* 0) výběr a načtení výzvy (musí být hned po kliknutí na záložku) */
  const file = await new Promise(res => {
    const i = document.createElement('input');
    i.type = 'file';
    i.accept = '.docx';
    i.onchange = () => res(i.files[0] || null);
    i.addEventListener('cancel', () => res(null));
    if (!navigator.userActivation || navigator.userActivation.isActive) { i.click(); return; }
    const b = document.createElement('button');
    b.textContent = 'GINIS ISDS: vybrat výzvu (.docx)';
    b.style.cssText = 'position:fixed;top:12px;right:12px;z-index:2147483647;padding:10px 14px;border:0;border-radius:8px;background:#1d5fbf;color:#fff;font:14px system-ui,sans-serif;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.3)';
    b.onclick = () => { b.remove(); i.click(); };
    document.body.appendChild(b);
  });
  if (!file) return;
  let D;
  try { D = parseVyzva(await readDocx(file)); }
  catch (e) { alert('Výzvu se nepodařilo přečíst: ' + e); return; }
  const firma = !!D.ico;
  const nazev = firma ? D.nazev : (D.prijmeni + ' ' + D.jmeno).trim();
  const shrnuti = (firma ? 'Firma: ' + nazev + '\nIČO: ' + D.ico : 'Název: ' + nazev + '\nNarozen(a): ' + (D.narozeni || 'CHYBÍ'))
    + '\nAdresa: ' + [D.ulice, [D.psc, D.obec].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  if (!confirm('Ověření datové schránky pro:\n\n' + shrnuti + '\n\nPokračovat?')) return;
  window.__ginisIsdsBezi = true;

  /* stavový panel vpravo nahoře */
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;top:12px;right:12px;z-index:2147483647;max-width:360px;padding:10px 14px;border-radius:8px;background:#1d5fbf;color:#fff;font:14px/1.4 system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.3)';
  document.body.appendChild(box);
  const stav = (t, barva) => { box.textContent = t; if (barva) box.style.background = barva; };
  const konec = () => { box.remove(); window.__ginisIsdsBezi = false; };

  /* pomocné funkce */
  const docs = (w = window, out = []) => {
    try { out.push(w.document); } catch (e) { return out; }
    for (let i = 0; i < w.frames.length; i++) docs(w.frames[i], out);
    return out;
  };
  const visible = e => !!(e && e.isConnected && e.getClientRects().length && e.ownerDocument.defaultView.getComputedStyle(e).visibility !== 'hidden');
  const all = sel => docs().flatMap(d => [...d.querySelectorAll(sel)]);
  const find = sel => all(sel).find(visible);
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
  function rucne(text) {
    return new Promise(res => {
      box.textContent = text;
      box.style.background = '#b26a00';
      const bar = document.createElement('div');
      bar.style.cssText = 'margin-top:8px;display:flex;gap:8px';
      const b = (t, v) => { const x = document.createElement('button'); x.textContent = t; x.style.cssText = 'padding:4px 10px;border:0;border-radius:4px;cursor:pointer;font:inherit'; x.onclick = () => { bar.remove(); box.style.background = '#1d5fbf'; res(v); }; bar.appendChild(x); };
      b('Pokračovat', true);
      b('Zrušit', false);
      box.appendChild(bar);
    });
  }

  try {
    /* 1–2) Ostatní úlohy → Externí subjekty */
    stav('Otevírám Externí subjekty…');
    const extSel = 'a[data-param-id$="SubjektyactKartotekaEsu"]';
    let ext = find(extSel);
    if (!ext) {
      click(await waitFor(() => find('li[data-param-id="_Ostatnlohy"] a'), 'menu Ostatní úlohy'));
      ext = await waitFor(() => find(extSel), 'odkaz Externí subjekty', 5000);
    }
    click(ext);

    /* 3) Důvod hledání – text je předvyplněný, jen OK */
    stav('Potvrzuji důvod hledání…');
    const ok = await waitFor(() => find('button[class*="g_action_actOkPotvrzeni"]'), 'tlačítko OK v okně Důvod hledání');
    await sleep(300);
    click(ok);

    /* 4–5) kartotéka: Název (+ Ičo u firmy) */
    stav('Vyplňuji filtr kartotéky…');
    const nIn = await waitFor(() => find('[data-field="nazev"] input'), 'pole Název v kartotéce');
    await sleep(400);
    fill(nIn, nazev);
    if (firma) fill(await waitFor(() => find('[data-field="ico"] input'), 'pole Ičo'), D.ico);

    /* 6–7) Všechny podmínky → Datum narození */
    click(await waitFor(() => find('a.js-vsechny-podminky'), 'odkaz Všechny podmínky'));
    const nacSel = 'button[class*="g_action_actvyhledatDet"]';
    if (!firma && D.narozeni) {
      const dIn = await waitFor(() => find('[data-field="dat_nar"] input'), 'pole Datum narození');
      await sleep(300);
      fill(dIn, D.narozeni);
    }

    /* 8) Načíst */
    stav('Hledám v kartotéce…');
    const nac = await waitFor(() => find(nacSel), 'tlačítko Načíst v rozšířených podmínkách');
    await sleep(300);
    click(nac);

    /* 9) výběr správného řádku */
    await sleep(800);
    const key = norm(nazev);
    const hits = () => {
      const grid = all('.js-gridKartoteka').filter(visible);
      const pool = grid.length ? grid.flatMap(g => [...g.querySelectorAll('*')]) : all('body *').filter(e => !e.closest('.gform,.gcontrolbox'));
      return pool.filter(e => !e.children.length && !box.contains(e) && visible(e) && norm(e.textContent).includes(key));
    };
    let h = [];
    try { h = await waitFor(() => { const x = hits(); return x.length ? x : null; }, 'výsledek', 15000); } catch (e) {}
    if (!h.length) throw 'osoba „' + nazev + '“ v kartotéce nenalezena';
    const rowOf = e => e.closest('tr,[role="row"]') || e.parentElement;
    const rows = [...new Set(h.map(rowOf))];
    let vyber = null;
    if (rows.length === 1) vyber = rows[0];
    else {
      const ul = norm((D.ulice || '').replace(/\s*\d.*$/, ''));
      const cp = ((D.ulice || '').match(/\d+/) || [''])[0];
      const ob = norm(D.obec);
      /* text celého řádku podle výšky na obrazovce (grid může mít sloupce v oddělených částech) */
      const radekText = r => {
        const b = r.getBoundingClientRect(), y0 = b.top + 2, y1 = b.bottom - 2;
        const grid = r.closest('.js-gridKartoteka') || r.ownerDocument.body;
        const kusy = [...grid.querySelectorAll('*')].filter(e => {
          if (e.children.length || !visible(e)) return false;
          const q = e.getBoundingClientRect(), c = (q.top + q.bottom) / 2;
          return c >= y0 && c <= y1;
        }).map(e => e.textContent);
        return norm(r.textContent + ' ' + kusy.join(' '));
      };
      const sc = rows.map(r => {
        const t = radekText(r);
        let s = 0;
        if (ul && t.includes(ul)) s += 2;
        if (cp && new RegExp('(^|\\D)' + cp + '(\\D|$)').test(t)) s += 1;
        if (ob && t.includes(ob)) s += 1;
        return s;
      });
      const max = Math.max(...sc);
      if (max > 0) vyber = rows[sc.indexOf(max)]; /* při shodě více stejných řádků bere první */
    }
    /* víc shod a adresa v řádcích není → upřesnit hledání podle obce */
    let hh = h;
    if (!vyber && rows.length > 1 && D.obec) {
      const hledej = async obec => {
        click(await waitFor(() => find('a.js-vsechny-podminky'), 'odkaz Všechny podmínky'));
        fill(await waitFor(() => find('[data-field="obec"] input'), 'pole Obec v rozšířených podmínkách'), obec);
        await sleep(200);
        click(await waitFor(() => find(nacSel), 'tlačítko Načíst'));
        await sleep(1500);
        try { return await waitFor(() => { const x = hits(); return x.length ? x : null; }, 'výsledek', 6000); } catch (e) { return []; }
      };
      try {
        stav('Našel jsem ' + rows.length + ' záznamy, upřesňuji podle obce ' + D.obec + '…');
        const h2 = await hledej(D.obec);
        const r2 = [...new Set(h2.map(rowOf))];
        if (r2.length === 1) { vyber = r2[0]; hh = h2; }
        else if (!r2.length) { stav('Podle obce nic, vracím původní hledání…'); hh = await hledej(''); }
        else hh = h2;
      } catch (e) {}
    }
    if (vyber) {
      click(hh.find(e => vyber.contains(e)) || vyber);
      await sleep(400);
    } else if (!await rucne('Našel jsem ' + rows.length + ' záznamy „' + nazev + '“ a podle adresy nepoznám, který je správný (' + (D.ulice || '') + ', ' + (D.obec || '') + '). Klikni na správný řádek a pak na Pokračovat.')) {
      konec();
      return;
    }

    /* 10) Detail */
    stav('Otevírám detail…');
    click(await waitFor(() => { const b = find('button[data-param-id="actDetailEx"]'); return b && !disabled(b) ? b : null; }, 'aktivní tlačítko Detail', 8000));

    /* 11–12) Ověřit → ISDS */
    stav('Spouštím ověření v ISDS…');
    const ov = await waitFor(() => find('button[data-param-id="_Ovit"]'), 'tlačítko Ověřit v detailu');
    await sleep(500);
    /* položka ISDS: akce je navázaná na div.item__center s třídou g_action_actOveritISDS */
    const isdsSel = '[class*="g_action_actOveritISDS"]';
    const najdi = () => {
      const v = all(isdsSel).filter(visible);
      return v.find(e => e.classList.contains('item__center')) || v[0] || null;
    };
    let item = null;
    for (let pokus = 0; pokus < 2 && !item; pokus++) {
      if (pokus) click(ov);
      try { item = await waitFor(najdi, 'položku ISDS', 4000); } catch (e) {}
    }
    if (!item) throw 'nenašel jsem položku ISDS v nabídce Ověřit';
    const W = item.ownerDocument.defaultView;
    const r = item.getBoundingClientRect();
    const xy = { bubbles: true, cancelable: true, view: W, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0 };
    for (const t of ['mouseover', 'mouseenter', 'mousemove']) item.dispatchEvent(new W.MouseEvent(t, xy));
    await sleep(150);
    for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) item.dispatchEvent(new (t.startsWith('pointer') ? W.PointerEvent : W.MouseEvent)(t, { ...xy, buttons: t.endsWith('down') ? 1 : 0 }));
    item.click();
    await sleep(800);
    if (visible(item)) {
      const cap = item.querySelector('.item__caption');
      if (cap) cap.click();
      await sleep(800);
    }
    if (visible(item)) throw 'GINIS nereaguje na ISDS – klikni na něj ručně (nabídka je otevřená)';

    stav('Hotovo – spuštěno ověření v ISDS.', '#2e7d32');
    setTimeout(konec, 4000);
  } catch (e) {
    stav('Chyba: ' + e, '#c62828');
    setTimeout(konec, 8000);
  }
})();
