(function(){
  // DOČASNĚ VYPNUTO (na žádost) — po vyplnění formuláře se už sama
  // nekliká na "Uložit a pokračovat", jen se nechá formulář vyplněný k ruční
  // kontrole a uložení. Až budeš chtít vrátit původní chování (rovnou
  // uložit), stačí přepnout zpátky na true.
  var AUTO_SAVE = false;

  // Krok 2 (nebo jakékoliv další kliknutí): pozná se podle skrytého pole
  // EventID, které MP Manager sám vyplní po prvním uložení. Na čerstvém,
  // ještě neuloženém "Událost - nová" má EventID hodnotu "0". Jakmile má
  // libovolnou jinou hodnotu, event je uložený — pak se UŽ NIKDY
  // znovu nevyplňuje (aby nevznikaly duplicitní záznamy strážníků apod.),
  // jen zkusí kliknout na "Ověřit v RSV". Tohle je spolehlivější než
  // dřívější odhad podle sessionStorage/porovnávání RZ, který mohl
  // selhat kvůli přesměrování na URL s ?ID=... po uložení.
  var eventIdEl = document.getElementById('EventID');
  var eventId = eventIdEl ? eventIdEl.value : '0';

  // Výběr role strážníka podle textu volby (bez diakritiky, přesná shoda
  // — "řešil" se nesplete s "dořešil"); u hlídky záloha value="6".
  var roleLabels = { doresil: 'dořešil', resil: 'řešil', hlidka: 'hlídka' };
  function normTxt(x){ return (x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase(); }
  function setRole(sel, wanted){
    var val = null;
    for(var ri = 0; ri < sel.options.length; ri++){
      if(normTxt(sel.options[ri].text) === wanted){ val = sel.options[ri].value; break; }
    }
    if(val === null && wanted === 'hlidka') val = '6';
    if(val === null) return false;
    sel.value = val;
    var idx = parseInt((sel.name || '').replace(/\D+/g, ''), 10) || 0;
    try{ SetHiddenTypy(sel.value, 'tTypyStr', idx); }catch(e){}
    return true;
  }

  if(eventId && eventId !== '0'){
    // Uložená událost: když je ve schránce JSON z MPM s dořešením (role
    // jiná než hlídka a známý strážník), přepne se do DOPLŇOVACÍHO
    // režimu (doplnitUlozenou). Jinak jako dřív jen "Ověřit v RSV".
    navigator.clipboard.readText().then(function(t){
      var dd = null;
      try{ dd = JSON.parse(t); }catch(e){}
      if(dd && typeof dd === 'object' && dd.straznikRole && dd.straznikRole !== 'hlidka' && dd.resolverCislo){
        doplnitUlozenou(dd);
      } else {
        overitRsv();
      }
    }, overitRsv);
    return;
  }

  function overitRsv(){
    var rsvBtn = document.getElementById('tFindRSV');
    if(rsvBtn){
      rsvBtn.click();
    } else {
      alert('Událost je už uložená (RZ Scanner data byla vyplněna dřív) — tlačítko "Ověřit v RSV" jsem na téhle stránce nenašel, zkontroluj ručně.');
    }
  }

  // Doplnění uložené události o dořešení z RZ Scanneru:
  //  1) strážník, který dořešil (dle sl. čísla) — je-li už u události,
  //     jen se mu změní role; jinak se vyhledá (tStraznikSC + Najít),
  //     přidá kliknutím na nalezený záznam "1255 - Příjmení Jméno"
  //     a nastaví se mu role. Ostatní strážníci zůstávají.
  //     Strážník jde PRVNÍ: kdyby "Najít" stránku znovu načetl, druhé
  //     spuštění záložky už nalezený záznam jen přidá a doplní zbytek.
  //  2) Způsob řešení (jen pokud ještě není), pokuta, způsob platby.
  function doplnitUlozenou(d){
    var cislo = String(d.resolverCislo);
    var role = d.straznikRole;
    var roleNazev = roleLabels[role] || role;
    var reRow = new RegExp('(^|\\D)' + cislo + '\\s*-');

    function najdiRadekStraznika(){
      var sels = document.querySelectorAll('select[name^="tTypyStrL"]');
      for(var i = 0; i < sels.length; i++){
        var tr = sels[i].closest('tr');
        if(tr && reRow.test(tr.textContent)) return sels[i];
      }
      return null;
    }
    function najdiVysledekHledani(){
      var all = document.querySelectorAll('a, span, td, div, li, font');
      var best = null;
      for(var i = 0; i < all.length; i++){
        var el = all[i];
        if(el.closest('tr') && el.closest('tr').querySelector('select[name^="tTypyStrL"]')) continue;
        var txt = (el.textContent || '').trim();
        if(!new RegExp('^' + cislo + '\\s*-\\s*\\S').test(txt) || txt.length > 80) continue;
        var clickable = el.closest('a, [onclick]') || el.querySelector('a, [onclick]');
        if(clickable) return clickable;
        if(!best) best = el;
      }
      return best;
    }
    function pockej(test, ms, done){
      var start = Date.now();
      (function tick(){
        var r = test();
        if(r) return done(r);
        if(Date.now() - start > ms) return done(null);
        setTimeout(tick, 250);
      })();
    }

    var zprava = [];
    function zbytek(){
      // Způsob řešení — přidat jen ID, které u události ještě není (pozná
      // se podle skrytých polí se seznamem ID oddělených čárkou).
      var hiddenVals = Array.prototype.map.call(document.querySelectorAll('input[type="hidden"]'), function(h){ return ',' + (h.value || '') + ','; }).join('|');
      (d.methodSolutionIds || []).forEach(function(id){
        if(hiddenVals.indexOf(',' + id + ',') !== -1){ zprava.push('Způsob řešení ' + id + ' už u události je.'); return; }
        try{ AddItem(id, 'Rej'); zprava.push('Přidán způsob řešení.'); }catch(e){ zprava.push('Způsob řešení se nepodařilo přidat — doplň ručně.'); }
      });
      var pen = document.getElementById('tPenalty');
      if(pen && d.penalty){ pen.value = d.penalty; zprava.push('Pokuta: ' + d.penalty + ' Kč.'); }
      var pay = document.getElementById('tPayType');
      if(pay && d.payType){ pay.value = d.payType; zprava.push('Způsob platby: ' + (d.payType === 'H' ? 'hotově' : 'kartou') + '.'); }
      window.__rzScannerMPMFilled = true;
      alert('Doplněno z RZ Scanneru:\n\n' + zprava.join('\n') + '\n\nZkontroluj formulář a ulož ho.');
    }

    var existujici = najdiRadekStraznika();
    if(existujici){
      zprava.push(setRole(existujici, role)
        ? 'Strážník ' + cislo + ' už u události byl — role změněna na "' + roleNazev + '".'
        : 'Roli "' + roleNazev + '" jsem v nabídce nenašel — nastav ji strážníkovi ' + cislo + ' ručně.');
      return zbytek();
    }

    function pridejZVysledku(vysledek){
      vysledek.click();
      pockej(najdiRadekStraznika, 6000, function(sel){
        if(!sel){
          zprava.push('Strážníka ' + cislo + ' se nepodařilo přidat — přidej ho ručně a nastav mu roli "' + roleNazev + '".');
        } else {
          zprava.push(setRole(sel, role)
            ? 'Přidán strážník ' + cislo + (d.resolverJmeno ? ' (' + d.resolverJmeno + ')' : '') + ' s rolí "' + roleNazev + '".'
            : 'Strážník ' + cislo + ' přidán, ale roli "' + roleNazev + '" nastav ručně.');
        }
        zbytek();
      });
    }

    var uzNalezeny = najdiVysledekHledani();
    if(uzNalezeny) return pridejZVysledku(uzNalezeny);

    var sc = document.getElementById('tStraznikSC');
    if(!sc){
      zprava.push('Pole pro hledání strážníka jsem nenašel — přidej strážníka ' + cislo + ' ručně s rolí "' + roleNazev + '".');
      return zbytek();
    }
    sc.value = cislo;
    var tab = sc.closest('table') || document;
    var najit = null;
    Array.prototype.forEach.call(tab.querySelectorAll('input[type="button"], input[type="submit"], button'), function(b){
      if(!najit && /naj[ií]t/i.test(b.value || b.textContent || '')) najit = b;
    });
    if(!najit){
      zprava.push('Tlačítko "Najít" u strážníků jsem nenašel — vyhledej strážníka ' + cislo + ' ručně a nastav mu roli "' + roleNazev + '".');
      return zbytek();
    }
    najit.click();
    pockej(najdiVysledekHledani, 8000, function(vysledek){
      if(!vysledek){
        zprava.push('Po hledání jsem nenašel strážníka ' + cislo + ' — přidej ho ručně s rolí "' + roleNazev + '".');
        return zbytek();
      }
      pridejZVysledku(vysledek);
    });
  }

  if(window.__rzScannerMPMFilled){
    if(!confirm('Tato záložka už na tomto formuláři jednou proběhla. Spustit znovu? (Oprávnění a Způsob řešení se nepřidají podruhé, ostatní pole se přepíšou.)')){
      return;
    }
  }

  navigator.clipboard.readText().then(function(t){
    var d;
    try{ d = JSON.parse(t); } catch(e){ d = null; }
    // Ve schránce musí být JSON z tlačítka MPM v RZ Scanneru. Typicky ho
    // přepíše cokoliv zkopírovaného mezitím (třeba kód bookmarkletu při
    // úpravě záložky) — hláška proto ukáže začátek toho, co ve schránce
    // doopravdy je.
    if(!d || typeof d !== 'object' || !('rz' in d)){
      alert('Ve schránce nejsou data z RZ Scanneru.\n\nV přehledu RZ Scanneru nejdřív klikni na tlačítko MPM a hned potom spusť tuhle záložku.\n\nZačátek schránky: ' + (t ? String(t).slice(0, 60) : '(prázdná)'));
      return;
    }
    function set(id,v){ var el=document.getElementById(id); if(el&&v){ el.value=v; } }
    set('tSPZ', d.rz);
    set('tCarSubType', d.carSubType);
    set('tStreet', d.street);
    set('tAnnouncement', d.desc);
    set('tEventDate1', d.dateStart);
    set('tEventTime1', d.timeStart);
    set('tEventDate2', d.dateEnd);
    set('tEventTime2', d.timeEnd);
    // Údaje o pachateli (jen jméno/příjmení/datum narození/číslo dokladu —
    // adresu do MP Manageru zatím neposílá, nebylo potřeba).
    set('tKontaktJM', d.pachatelJmeno);
    set('tKontaktPR', d.pachatelPrijmeni);
    set('tKontaktDN', d.pachatelDatumNarozeni);
    set('tKontaktPapers', d.pachatelCisloDokladu);
    // Částka pokuty (jen u "Příkaz na místě" — jinde se pole vůbec neposílá).
    set('tPenalty', d.penalty);
    // Způsob platby (Hotově/Kartou — BPN v MP Manageru možnost nemá).
    set('tPayType', d.payType);
    var sel = document.getElementById('tTown');
    if(sel && d.town){
      for(var i=0;i<sel.options.length;i++){
        if(sel.options[i].value === d.town){ sel.selectedIndex = i; break; }
      }
    }
    if(d.department){ set('tDepartment', d.department.name); set('tDepartmentN', d.department.id); }
    if(d.eventTypeRadioId){ var r = document.getElementById(d.eventTypeRadioId); if(r) r.click(); }

    // "Oznámení přijal" — vždy strážník.
    var oznamPrijalS = document.getElementById('tOznameniPrijalS');
    if(oznamPrijalS) oznamPrijalS.checked = true;

    if(d.udalostId && d.udalostText){
      set('tUdalost', d.udalostText);
      set('tUdalostN', d.udalostId);
      var tree = document.getElementById('tUdalostRKUP');
      if(tree) tree.style.display = 'none';
      var btn = document.getElementById('tUdalostBtn');
      if(btn) btn.innerHTML = 'Vybrat';
    } else {
      ['br53534','br51938','br51975'].forEach(function(id){
        var el = document.getElementById(id);
        if(el) el.style.display = '';
      });
    }

    if(!window.__rzScannerAddedIds){ window.__rzScannerAddedIds = { Opr:{}, Rej:{} }; }
    function addOnce(id, type){
      if(window.__rzScannerAddedIds[type][id]) return;
      window.__rzScannerAddedIds[type][id] = true;
      try{ AddItem(id, type); }catch(e){}
    }
    if(d.authorizationIds){ d.authorizationIds.forEach(function(id){ addOnce(id,'Opr'); }); }
    if(d.solutionIds){ d.solutionIds.forEach(function(id){ addOnce(id,'Rej'); }); }

    // Přidat aktuálně přihlášeného strážníka jedním kliknutím (stejné
    // tlačítko, jaké má formulář sám u seznamu STRÁŽNÍCI).
    var addStraznikBtn = document.getElementById('tAddS');
    if(addStraznikBtn) addStraznikBtn.click();

    // Nastavit povinnou "Roli strážníka" na první přidaný řádek (index 0)
    // — select se jmenuje tTypyStrL0 a jeho onchange volá globální
    // SetHiddenTypy(), kterou zavoláme rovnou, ať se nemusíme spoléhat
    // na dispatchování change eventu. Role přichází z RZ Scanneru
    // (d.straznikRole): "doresil" u Domluvy/Příkazu na místě/Oznámení,
    // "resil" u Výzvy, jinak "hlidka". Volba se hledá podle textu
    // (bez diakritiky, přesná shoda — "řešil" se nesplete s "dořešil"),
    // u hlídky se jako záloha použije value="6".
    var roleWanted = d.straznikRole || 'hlidka';
    var roleLabels = { doresil: 'dořešil', resil: 'řešil', hlidka: 'hlídka' };
    var roleWarning = '';
    var straznikRoleSel = document.getElementsByName('tTypyStrL0')[0];
    if(straznikRoleSel){
      var norm = function(x){ return (x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase(); };
      var roleValue = null;
      for(var ri = 0; ri < straznikRoleSel.options.length; ri++){
        if(norm(straznikRoleSel.options[ri].text) === roleWanted){ roleValue = straznikRoleSel.options[ri].value; break; }
      }
      if(roleValue === null && roleWanted === 'hlidka') roleValue = '6';
      if(roleValue !== null){
        straznikRoleSel.value = roleValue;
        try{ SetHiddenTypy(straznikRoleSel.value, 'tTypyStr', 0); }catch(e){}
      } else {
        roleWarning = 'Roli strážníka "' + (roleLabels[roleWanted] || roleWanted) + '" jsem v nabídce nenašel — nastav ji ručně.';
      }
    }

    window.__rzScannerMPMFilled = true;
    if(roleWarning) alert(roleWarning);

    if(AUTO_SAVE){
      // Rovnou uložit a pokračovat — jakmile se stránka po uložení
      // přenačte a dostane reálné EventID, klepni na tuhle záložku znovu:
      // pozná se podle EventID (viz začátek souboru) a rovnou klikne na
      // "Ověřit v RSV".
      var saveBtn = document.getElementById('tSubmitContinue');
      if(saveBtn){
        saveBtn.click();
      } else {
        alert(d.udalostId
          ? 'Vyplněno z RZ Scanneru včetně konkrétní kvalifikace, ale nenašel jsem tlačítko "Uložit a pokračovat" — ulož formulář ručně.'
          : 'Vyplněno z RZ Scanneru, ale nenašel jsem tlačítko "Uložit a pokračovat" — ulož formulář ručně.');
      }
    }
    // AUTO_SAVE === false: formulář se jen vyplní a nechá ho ke
    // kontrole — uložení (a tím i druhý krok s "Ověřit v RSV") je teď
    // na tobě, ručně.
  }).catch(function(err){
    // Sem se dostane jak odmítnuté čtení schránky, tak jakákoliv chyba
    // při vyplňování — hláška ukáže skutečnou příčinu.
    alert('Záložka RZ to MP selhala: ' + ((err && err.message) ? err.message : String(err)) + '\n\nPokud jde o schránku, povol pro mp.blansko.cz přístup ke schránce (ikona zámku vlevo v adresním řádku).');
  });
})();
