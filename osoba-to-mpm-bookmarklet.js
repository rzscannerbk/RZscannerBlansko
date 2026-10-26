/* RZ Scanner → MP Manager: lustrace osoby v Základních registrech.
 *
 * V RZ Scanneru (Služební záležitosti > Osoby) tlačítko "Kopírovat do MP
 * Manageru" uloží do schránky blok začínající řádkem "#RZS-OSOBA". Tenhle
 * bookmarklet ho přečte, otevře Osoby > Základní registry (MZRE05F.asp)
 * a vyplní formulář:
 *   - jméno + příjmení + datum narození → hledání "podle data narození",
 *   - jinak číslo dokladu → hledání "podle čísla dokladu".
 * Potom sám klikne na Potvrdit (důvod zůstává výchozí z MP Manageru),
 * při jediném výsledku otevře detail osoby (MZRE05R.asp) a rozklikne
 * Fotografie.
 *
 * Spouští se odkudkoliv v MP Manageru (typicky z úvodní obrazovky
 * Default.asp). Celá lustrace běží v okně přes stránku (tlačítko
 * "Zavřít lustraci" vlevo dole), aby mohl bookmarklet pokračovat
 * i po odeslání formuláře.
 */
(function(){
  'use strict';
  var MARK = '#RZS-OSOBA';
  var FORM_PATH = '/Mobile/MZRE05F.asp';
  var ID = 'rzsOsobaPanel';

  var old = document.getElementById(ID);
  if(old) old.remove();
  var oldFrame = document.getElementById(ID + 'Frame');
  if(oldFrame) oldFrame.remove();
  var oldClose = document.getElementById(ID + 'Close');
  if(oldClose) oldClose.remove();

  // ---------- Panel ----------
  var panel = document.createElement('div');
  panel.id = ID;
  panel.style.cssText = 'position:fixed;left:10px;right:10px;top:10px;z-index:2147483647;background:#14171D;color:#ECEDEF;' +
    'border:1px solid #FFB020;border-radius:14px;padding:14px 16px;font:14px/1.45 Arial,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.45);max-width:520px;margin:0 auto;';
  panel.innerHTML =
    '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">' +
      '<b style="color:#FFB020;font-size:15px">RZ Scanner → lustrace osoby</b>' +
      '<button type="button" data-x style="margin-left:auto;background:none;border:0;color:#8B92A0;font-size:22px;line-height:1;cursor:pointer">×</button>' +
    '</div>' +
    '<div data-msg>Klepni na tlačítko a pak na „Vložit“.</div>' +
    '<button type="button" data-paste style="display:none;margin-top:10px;width:100%;height:44px;border:0;border-radius:10px;background:#FFB020;color:#241a00;font:bold 15px Arial,sans-serif;cursor:pointer">Vložit ze schránky</button>' +
    '<textarea data-ta placeholder="…nebo sem údaje vlož ručně (dlouhé podržení → Vložit)" style="display:none;margin-top:10px;width:100%;box-sizing:border-box;height:70px;border-radius:10px;border:1px solid #262B33;background:#0A0C10;color:#ECEDEF;padding:8px;font:13px Arial,sans-serif"></textarea>';
  document.body.appendChild(panel);
  var msgEl = panel.querySelector('[data-msg]');
  var pasteBtn = panel.querySelector('[data-paste]');
  var ta = panel.querySelector('[data-ta]');
  function msg(t, color){ msgEl.textContent = t; msgEl.style.color = color || '#ECEDEF'; }
  var filled = false;
  // × zavře jen panel. Okno s lustrací zavře jen tehdy, když se vyplnění
  // nepovedlo (jinak by strážník přišel o vyplněný formulář).
  panel.querySelector('[data-x]').onclick = function(){
    panel.remove();
    if(!filled){
      var f = document.getElementById(ID + 'Frame');
      if(f) f.remove();
      var c = document.getElementById(ID + 'Close');
      if(c) c.remove();
    }
  };

  // ---------- Parsování schránky ----------
  function parse(text){
    text = String(text || '');
    var i = text.indexOf(MARK);
    if(i === -1) return null;
    var out = { jmeno: '', prijmeni: '', narozeni: '', doklad: '', duvod: '' };
    text.slice(i + MARK.length).split(/\r?\n/).forEach(function(line){
      var k = line.indexOf(':');
      if(k === -1) return;
      var key = line.slice(0, k).trim().toLowerCase();
      var val = line.slice(k + 1).trim();
      if(key === 'jméno' || key === 'jmeno') out.jmeno = val;
      else if(key === 'příjmení' || key === 'prijmeni') out.prijmeni = val;
      else if(key.indexOf('narozen') === 0 || key.indexOf('datum') === 0) out.narozeni = val;
      else if(key.indexOf('doklad') !== -1) out.doklad = val;
      else if(key === 'důvod' || key === 'duvod') out.duvod = val;
    });
    return out;
  }

  // ---------- Vyplnění formuláře MZRE05F.asp ----------
  function setVal(doc, id, value){
    var el = doc.getElementById(id);
    if(!el) return false;
    el.value = value || '';
    try{
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }catch(e){}
    return true;
  }
  // "Upřesnění důvodu" — id pole neznáme, najde se jako první textové
  // pole za popiskem "Upřesnění důvodu".
  function fillUpresneni(doc, text){
    try{
      var walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, null);
      var label = null, n;
      while((n = walker.nextNode())){ if(/Up[řr]esn[ěe]n[íi]\s+d[ůu]vodu/i.test(n.nodeValue)){ label = n; break; } }
      if(!label) return false;
      var fields = doc.querySelectorAll('input[type="text"], input:not([type]), textarea');
      for(var i = 0; i < fields.length; i++){
        if(label.compareDocumentPosition(fields[i]) & Node.DOCUMENT_POSITION_FOLLOWING){
          var el = fields[i];
          if(el.maxLength > 0 && text.length > el.maxLength) text = text.slice(0, el.maxLength);
          el.value = text;
          try{ el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }catch(e){}
          return true;
        }
      }
    }catch(e){}
    return false;
  }
  function fill(doc, win, d){
    var mode = (d.jmeno && d.prijmeni && d.narozeni) ? 'Birth' : (d.doklad ? 'Paper' : 'Birth');
    var radio = doc.querySelector('input[name="tFindBy"][value="' + mode + '"]');
    if(!radio || !doc.getElementById('tFirstName')){
      var where = '';
      try{ where = doc.location.pathname.split('/').pop() || doc.location.pathname; }catch(e){}
      msg('Formulář lustrace se nepodařilo najít (stránka: ' + (where || '?') + '). Jsi přihlášený v MP Manageru? Zkus otevřít Osoby › Základní registry a spustit bookmarklet tam.', '#FF6058');
      return;
    }
    radio.checked = true;
    try{
      if(win && typeof win.E05FindBy === 'function') win.E05FindBy(mode);
      else radio.click();
    }catch(e){ try{ radio.click(); }catch(e2){} }
    setVal(doc, 'tFirstName', d.jmeno);
    setVal(doc, 'tLastName', d.prijmeni);
    setVal(doc, 'tBirthDtm', d.narozeni);
    setVal(doc, 'tPapers', d.doklad);
    if(d.duvod) fillUpresneni(doc, d.duvod);

    var btn = doc.getElementById('ButtonSaveEvent');
    if(btn){
      btn.style.outline = '3px solid #FFB020';
      btn.style.outlineOffset = '3px';
      try{ btn.scrollIntoView({ block: 'center' }); }catch(e){}
    }
    var who = [d.jmeno, d.prijmeni].filter(Boolean).join(' ');
    msg('✓ Vyplněno (' + (mode === 'Birth'
      ? 'podle data narození: ' + who + ', ' + d.narozeni
      : 'podle čísla dokladu: ' + d.doklad) +
      '). Odesílám lustraci…', '#33D399');
    pasteBtn.style.display = 'none';
    ta.style.display = 'none';
    filled = true;
    compactPanel();
    // Automatické Potvrdit — krátká pauza, ať se formulář po přepnutí
    // způsobu hledání (E05FindBy) stihne překreslit.
    if(btn){
      setTimeout(function(){
        try{ btn.click(); }
        catch(e){ msg('Potvrdit se nepodařilo stisknout — klepni na něj prosím sám.', '#FF6058'); }
      }, 400);
    }
  }

  // Malý panel nahoře přes hlavičku MP Manageru (nezakrývá formulář).
  function compactPanel(){
    panel.style.top = '10px';
    panel.style.bottom = 'auto';
    panel.style.padding = '8px 12px';
    panel.style.fontSize = '13px';
  }
  function fadePanel(ms){
    panel.style.transition = 'opacity .5s';
    setTimeout(function(){
      panel.style.opacity = '0';
      setTimeout(function(){ if(panel.parentNode) panel.remove(); }, 600);
    }, ms || 4000);
  }

  // Výsledky hledání (MZRE05.asp): jedna osoba → rovnou ji otevřít.
  function onResults(doc, win){
    var links = [];
    var seen = {};
    Array.prototype.forEach.call(doc.querySelectorAll('a[href*="MZRE05R.asp"]'), function(a){
      if(!seen[a.href]){ seen[a.href] = 1; links.push(a); }
    });
    if(links.length === 1){
      msg('✓ Nalezena 1 osoba — otevírám detail…', '#33D399');
      setTimeout(function(){ win.location.href = links[0].href; }, 300);
    } else if(links.length === 0){
      msg('Osoba nebyla v Základních registrech nalezena.', '#FF6058');
    } else {
      msg('Nalezeno ' + links.length + (links.length < 5 ? ' osoby' : ' osob') + ' — vyber tu správnou.', '#FFB020');
      fadePanel(5000);
    }
  }

  // Detail osoby (MZRE05R.asp): rozkliknout Fotografie.
  function onDetail(doc){
    var foto = doc.getElementById('name-foto');
    if(!foto){
      Array.prototype.some.call(doc.querySelectorAll('.title, div'), function(el){
        if(/^\s*Fotografie\s*$/i.test(el.textContent || '')){ foto = el; return true; }
        return false;
      });
    }
    if(foto){
      msg('✓ Detail osoby — otevírám fotografii…', '#33D399');
      setTimeout(function(){
        try{ foto.click(); }catch(e){}
        try{ foto.scrollIntoView({ block: 'center' }); }catch(e){}
      }, 300);
    } else {
      msg('✓ Detail osoby otevřen (fotografie není k dispozici).', '#33D399');
    }
    fadePanel(3500);
  }

  // Celá lustrace běží v okně přes stránku — bookmarklet tak může po
  // odeslání formuláře pokračovat (otevřít výsledek a fotografii).
  function go(d){
    msg('Otevírám Základní registry…');
    var frame = document.createElement('iframe');
    frame.id = ID + 'Frame';
    frame.src = FORM_PATH;
    frame.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;border:0;z-index:2147483645;background:#fff;';
    var closeBtn = document.createElement('button');
    closeBtn.id = ID + 'Close';
    closeBtn.type = 'button';
    closeBtn.textContent = '✕ Zavřít lustraci';
    closeBtn.style.cssText = 'position:fixed;left:12px;bottom:calc(env(safe-area-inset-bottom,0px) + 12px);z-index:2147483646;' +
      'background:#14171D;color:#FFB020;border:1px solid #FFB020;border-radius:20px;padding:9px 14px;font:bold 13px Arial,sans-serif;box-shadow:0 6px 18px rgba(0,0,0,.35);cursor:pointer;';
    closeBtn.onclick = function(){
      frame.remove(); closeBtn.remove();
      if(panel.parentNode) panel.remove();
    };
    var formLoads = 0, done = false;
    frame.onload = function(){
      if(done) return;
      var doc, win, page = '';
      try{ doc = frame.contentDocument; win = frame.contentWindow; page = (win.location.pathname.split('/').pop() || '').toLowerCase(); }
      catch(e){
        msg('Formulář nejde otevřít uvnitř stránky. Otevři Osoby › Základní registry a spusť bookmarklet znovu tam.', '#FF6058');
        return;
      }
      if(page === 'mzre05f.asp'){
        formLoads++;
        if(formLoads === 1){ fill(doc, win, d); }
        else { msg('MP Manager vrátil formulář — zkontroluj údaje a klepni na Potvrdit.', '#FFB020'); done = true; }
      } else if(page === 'mzre05.asp'){
        onResults(doc, win);
      } else if(page === 'mzre05r.asp'){
        done = true;
        onDetail(doc);
      } else {
        // Jiná stránka (např. přihlášení) — dál už nic automaticky nedělat.
        done = true;
        if(!filled) fill(doc, win, d);
      }
    };
    document.body.appendChild(frame);
    document.body.appendChild(closeBtn);
  }

  var handled = false;
  function handle(text){
    if(handled) return;
    var d = parse(text);
    if(!d){
      msg('Ve schránce nejsou údaje z RZ Scanneru (je v ní: „' + String(text || '').slice(0, 30) + (String(text || '').length > 30 ? '…' : '') + '“). V RZ Scanneru klepni znovu na „Kopírovat do MP Manageru“.', '#FF6058');
      pasteBtn.style.display = 'block';
      ta.style.display = 'block';
      return;
    }
    handled = true;
    go(d);
  }

  ta.addEventListener('input', function(){ if(ta.value.trim()) handle(ta.value); });
  pasteBtn.onclick = function(){
    if(!navigator.clipboard || !navigator.clipboard.readText){ msg('Prohlížeč neumí číst schránku — vlož údaje do pole níže.', '#FF6058'); ta.style.display = 'block'; return; }
    navigator.clipboard.readText().then(handle, function(){
      msg('Prohlížeč nedovolil přečíst schránku. Podrž prst v poli níže a dej „Vložit“.', '#FF6058');
      ta.style.display = 'block';
    });
  };

  // Údaje v odkazu (RZ Scanner otevírá MZRE05F.asp#<údaje>) — bez schránky.
  // Po přečtení se z adresy hned smažou.
  var fromHash = '';
  try{ fromHash = decodeURIComponent((location.hash || '').slice(1)); }catch(e){}
  if(fromHash.indexOf(MARK) !== -1){
    try{ history.replaceState(null, '', location.pathname + location.search); }catch(e){}
    handle(fromHash);
    if(handled) return;
  }

  // Tlačítko i ruční pole jsou vidět hned — Chrome na iPhonu při čtení
  // schránky bez klepnutí ukáže "Povolit vložení", ale text pak nemusí
  // vrátit a bookmarklet by zůstal viset. Na počítači (povolená schránka)
  // to automatické čtení na pozadí obvykle projde rovnou.
  pasteBtn.style.display = 'block';
  ta.style.display = 'block';
  var isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  if(!isTouch && navigator.clipboard && navigator.clipboard.readText){
    try{ navigator.clipboard.readText().then(function(t){ if(t && t.indexOf(MARK) !== -1) handle(t); }, function(){}); }catch(e){}
  }
})();
