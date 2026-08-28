(function(){
  var AWAIT_KEY = 'rzScannerAwaitingRsv';

  // Krok 2: záložka spuštěná podruhé po přenačtení stránky (událost už je
  // uložená a má číslo jednací) — jen klikne na "Ověřit v RSV" a končí.
  if(sessionStorage.getItem(AWAIT_KEY)){
    sessionStorage.removeItem(AWAIT_KEY);
    var rsvBtn = document.getElementById('tFindRSV');
    if(rsvBtn){
      rsvBtn.click();
    } else {
      alert('Nenašel jsem tlačítko "Ověřit v RSV" na téhle stránce.');
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

    window.__rzScannerMPMFilled = true;

    // Rovnou uložit a pokračovat — jakmile se stránka po uložení
    // přenačte a událost dostane číslo jednací, klepni na tuhle
    // záložku znovu: pozná se podle sessionStorage značky a rovnou
    // klikne na "Ověřit v RSV".
    var saveBtn = document.getElementById('tSubmitContinue');
    if(saveBtn){
      sessionStorage.setItem(AWAIT_KEY, '1');
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
