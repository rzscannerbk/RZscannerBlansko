(function(){
  // Krok 2 (nebo jakékoliv další kliknutí): pozná se podle skrytého pole
  // EventID, které MP Manager sám vyplní po prvním uložení. Na čerstvém,
  // ještě neuloženém "Událost - nová" má EventID hodnotu "0". Jakmile má
  // libovolnou jinou hodnotu, event je uložený — appka pak UŽ NIKDY
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
    // na dispatchování change eventu. value="6" = "hlídka".
    var straznikRoleSel = document.getElementsByName('tTypyStrL0')[0];
    if(straznikRoleSel){
      straznikRoleSel.value = '6';
      try{ SetHiddenTypy(straznikRoleSel.value, 'tTypyStr', 0); }catch(e){}
    }

    window.__rzScannerMPMFilled = true;

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
  }).catch(function(){
    alert('Nepodařilo se přečíst schránku ze zásuvky prohlížeče. Zkus to znovu nebo zkontroluj oprávnění ke schránce pro tuto stránku.');
  });
})();
