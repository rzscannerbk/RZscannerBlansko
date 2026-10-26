/* RZ Scanner → MP Manager: lustrace osoby v Základních registrech.
 *
 * V RZ Scanneru (Služební záležitosti > Osoby) tlačítko "Kopírovat do MP
 * Manageru" uloží do schránky blok začínající řádkem "#RZS-OSOBA". Tenhle
 * bookmarklet ho přečte, otevře Osoby > Základní registry (MZRE05F.asp)
 * a vyplní formulář:
 *   - jméno + příjmení + datum narození → hledání "podle data narození",
 *   - jinak číslo dokladu → hledání "podle čísla dokladu".
 * Potvrdit nechává na strážníkovi (zkontroluje důvod lustrace a typ dokladu).
 *
 * Spouští se odkudkoliv v MP Manageru (typicky z úvodní obrazovky
 * Default.asp). Mimo MZRE05F.asp se formulář otevře v celoobrazovkovém
 * okně uvnitř stránky, takže se bookmarklet nemusí spouštět dvakrát.
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
  panel.querySelector('[data-x]').onclick = function(){
    panel.remove();
    var f = document.getElementById(ID + 'Frame');
    if(f) f.remove();
  };

  // ---------- Parsování schránky ----------
  function parse(text){
    text = String(text || '');
    var i = text.indexOf(MARK);
    if(i === -1) return null;
    var out = { jmeno: '', prijmeni: '', narozeni: '', doklad: '' };
    text.slice(i + MARK.length).split(/\r?\n/).forEach(function(line){
      var k = line.indexOf(':');
      if(k === -1) return;
      var key = line.slice(0, k).trim().toLowerCase();
      var val = line.slice(k + 1).trim();
      if(key === 'jméno' || key === 'jmeno') out.jmeno = val;
      else if(key === 'příjmení' || key === 'prijmeni') out.prijmeni = val;
      else if(key.indexOf('narozen') === 0 || key.indexOf('datum') === 0) out.narozeni = val;
      else if(key.indexOf('doklad') !== -1) out.doklad = val;
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
  function fill(doc, win, d){
    var mode = (d.jmeno && d.prijmeni && d.narozeni) ? 'Birth' : (d.doklad ? 'Paper' : 'Birth');
    var radio = doc.querySelector('input[name="tFindBy"][value="' + mode + '"]');
    if(!radio || !doc.getElementById('tFirstName')){
      msg('Formulář lustrace se nepodařilo najít. Jsi přihlášený v MP Manageru?', '#FF6058');
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
      '). Zkontroluj důvod' + (mode === 'Paper' ? ' a typ dokladu' : '') + ' a klepni na Potvrdit.', '#33D399');
    pasteBtn.style.display = 'none';
    ta.style.display = 'none';
    // Panel dolů, ať nezakrývá formulář ani výsledek lustrace (× zavře vše).
    panel.style.top = 'auto';
    panel.style.bottom = '10px';
  }

  function go(d){
    var onForm = /\/MZRE05F\.asp$/i.test(location.pathname);
    if(onForm){ fill(document, window, d); return; }
    // Formulář v okně přes celou stránku — po Potvrdit se v něm ukáže i výsledek.
    msg('Otevírám Základní registry…');
    var frame = document.createElement('iframe');
    frame.id = ID + 'Frame';
    frame.src = FORM_PATH;
    frame.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;border:0;z-index:2147483646;background:#fff;';
    var first = true;
    frame.onload = function(){
      if(!first) return; // další načtení = výsledek lustrace, nic nevyplňovat
      first = false;
      try{ fill(frame.contentDocument, frame.contentWindow, d); }
      catch(e){
        frame.remove();
        msg('Formulář nejde otevřít uvnitř stránky. Otevři Osoby > Základní registry a spusť bookmarklet znovu tam.', '#FF6058');
      }
    };
    document.body.appendChild(frame);
  }

  var handled = false;
  function handle(text){
    if(handled) return;
    var d = parse(text);
    if(!d){
      msg('Ve schránce nejsou údaje z RZ Scanneru. V RZ Scanneru klepni na „Kopírovat do MP Manageru“ a zkus to znovu.', '#FF6058');
      pasteBtn.style.display = 'block';
      ta.style.display = 'block';
      return;
    }
    handled = true;
    go(d);
  }

  ta.addEventListener('input', function(){ if(ta.value.indexOf(MARK) !== -1) handle(ta.value); });
  pasteBtn.onclick = function(){
    if(!navigator.clipboard || !navigator.clipboard.readText){ msg('Prohlížeč neumí číst schránku — vlož údaje do pole níže.', '#FF6058'); ta.style.display = 'block'; return; }
    navigator.clipboard.readText().then(handle, function(){
      msg('Schránku se nepodařilo přečíst — vlož údaje do pole níže.', '#FF6058');
      ta.style.display = 'block';
    });
  };

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
