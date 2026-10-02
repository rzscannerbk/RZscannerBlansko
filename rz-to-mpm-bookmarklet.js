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
  if(eventId && eventId !== '0'){
    var rsvBtn = document.getElementById('tFindRSV');
    if(rsvBtn){
      rsvBtn.click();
    } else {
      alert('Událost je už uložená (RZ Scanner data byla vyplněna dřív) — tlačítko "Ověřit v RSV" jsem na téhle stránce nenašel, zkontroluj ručně.');
    }
    return;
  }

  if(window.__rzScannerMPMFilled){
    if(!confirm('Tato záložka už na tomto formuláři jednou proběhla. Spustit znovu? (Oprávnění a Způsob řešení se nepřidají podruhé, ostatní pole se přepíšou.)')){
      return;
    }
  }

  navigator.clipboard.readText().then(function(t){
    var d;
    try{ d = JSON.parse(t); } catch(e){ alert('Schránka neobsahuje platná data z RZ Scanneru.'); return; }
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
  }).catch(function(){
    alert('Nepodařilo se přečíst schránku ze zásuvky prohlížeče. Zkus to znovu nebo zkontroluj oprávnění ke schránce pro tuto stránku.');
  });
})();
