javascript:(function(){
  try{
    // 1) Číslo jednací — hledá se v nadpisu "Událost: 2026/02395" uvnitř
    // <table id="stateindicator">. To ID je v MP Manageru pevné.
    var cj = '';
    var udalostEl = document.querySelector('#stateindicator h2');
    if(udalostEl){
      var mCj = udalostEl.textContent.match(/Ud[aá]lost:?\s*(\d{4}\/\d+)/i);
      if(mCj) cj = 'Událost: ' + mCj[1] + '\n';
    }

    // 2) Detail provozovatele — čte se podle popisků (<td class="label">
    // "Jméno Příjmení:" / "Datum narození:" / "Adresa:" u osoby, nebo
    // "Název subjektu:" / "IČO:" / "Adresa:" u firmy) uvnitř
    // <div id="tCRVdetail">. Tohle ID je ověřené jako pevné, popisky se
    // berou z hodnoty label buňky, ne z pozice v tabulce — na pořadí
    // sloupců nezáleží.
    var container = document.getElementById('tCRVdetail') || document.body;
    var labelCells = container.querySelectorAll('td.label');
    var data = {};
    for(var i = 0; i < labelCells.length; i++){
      var label = labelCells[i].textContent.replace(/:\s*$/, '').trim();
      var valueEl = labelCells[i].nextElementSibling;
      if(valueEl) data[label] = valueEl.textContent.trim();
    }

    var payload = '';

    if(data['Jméno Příjmení']){
      // Fyzická osoba — MP Manager dává "JMÉNO PŘÍJMENÍ (roz. XXX)".
      // "(roz. ...)" se odsekne (rodné jméno není potřeba, na dokument
      // patří aktuální příjmení) a pořadí se otočí na "PŘÍJMENÍ JMÉNO"
      // — to je tvar, který v RZ Scanneru čeká parseProvozovatelText.
      // Poslední slovo se bere jako příjmení — u složených příjmení
      // (dvě a víc slov) to nemusí sedět dokonale, ale pro běžná jména
      // to funguje spolehlivě.
      var jp = data['Jméno Příjmení'].replace(/\s*\(roz\..*$/i, '').trim();
      var tokens = jp.split(/\s+/).filter(Boolean);
      var jmeno = tokens.slice(0, -1).join(' ');
      var prijmeni = tokens[tokens.length - 1] || '';
      payload = (prijmeni + ' ' + jmeno).trim();
      if(data['Datum narození']) payload += ', datum narození: ' + data['Datum narození'];
      if(data['Adresa']) payload += ', ' + data['Adresa'];
    } else if(data['Název subjektu']){
      // Právnická osoba (firma) — tenhle text RZ Scanner zatím neumí
      // automaticky rozparsovat do polí Jméno/Příjmení, objeví se jen
      // jako čitelný text pro strážníka, který si klíčové údaje (název,
      // IČO, sídlo) přepíše do dokumentu ručně.
      payload = 'PRÁVNICKÁ OSOBA: ' + data['Název subjektu'];
      if(data['IČO']) payload += ', IČO ' + data['IČO'];
      if(data['Adresa']) payload += ', sídlo: ' + data['Adresa'];
    }

    // 3) Přestupce — samostatné vyhledání osoby v sekci "IDENTIFIKACE
    // OBYVATEL" (div#xKontaktS), kde se hledá podle jména/příjmení nebo
    // data narození, nezávisle na vozidle/provozovateli výš. Výsledek
    // sedí v buňce <td>, kde text (jméno/datum/adresa) je samostatný
    // textový uzel VEDLE prázdného <span id="tPersonGetXXXXX"></span>
    // (XXXXX je proměnlivé číslo osoby, stejné jako u AddPerson) — ne
    // uvnitř něj. Proto se nejdřív najde span přes id^="tPersonGet"
    // (začíná na), ale čte se textContent jeho RODIČE (celé buňky),
    // ne spanu samotného, který je prázdný. Text má tvar "PŘÍJMENÍ(S)
    // JMÉNO, DD.MM.RRRR, Ulice č.p., PSČ Město, Část obce" — pořadí
    // jméno/příjmení je tu OTOČENÉ oproti bodu 2 výš (příjmení první,
    // jméno poslední), protože takhle to vrací vyhledávací formulář
    // (pole "dle příjmení" / "dle jména").
    var prestupcePayload = '';
    var kontaktS = document.getElementById('xKontaktS');
    if(kontaktS){
      var personSpan = kontaktS.querySelector('span[id^="tPersonGet"]');
      if(personSpan && personSpan.parentElement){
        var raw = personSpan.parentElement.textContent.trim();
        var parts = raw.split(',').map(function(s){ return s.trim(); }).filter(Boolean);
        if(parts.length >= 2){
          var nameTokens = parts[0].split(/\s+/).filter(Boolean);
          var prijmeniP = nameTokens.slice(0, -1).join(' ');
          var jmenoP = nameTokens[nameTokens.length - 1] || '';
          var datumP = parts[1];
          var adresaP = parts.slice(2).join(', ');
          prestupcePayload = (prijmeniP + ' ' + jmenoP).trim();
          if(datumP) prestupcePayload += ', datum narození: ' + datumP;
          if(adresaP) prestupcePayload += ', ' + adresaP;
        }
      }
    }

    if(!payload && !prestupcePayload && !cj){
      alert('Nepodařilo se na téhle stránce najít ani detail provozovatele, ani přestupce, ani číslo jednací. Jsi na stránce detailu vozidla/subjektu (nebo aspoň události) v MP Manageru?');
      return;
    }

    var full = cj + payload;
    if(prestupcePayload) full += (payload ? '\n' : '') + 'Přestupce: ' + prestupcePayload;

    function done(ok){
      var note = (payload || prestupcePayload) ? '' : '\n\n(Detail provozovatele ani přestupce se nenašel — poslalo se jen číslo jednací.)';
      if(ok){
        alert('Zkopírováno do schránky:\n\n' + full + note + '\n\nTeď se přepni do RZ Scanneru (Přehled) a v okně Výzvy klikni na "Vlož provozovatele" (Ctrl+V) nebo na tlačítko "Vložit".');
      } else {
        window.prompt('Automatické zkopírování se nepodařilo — zkopíruj ručně (Ctrl+C, Enter):', full);
      }
    }

    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(full).then(function(){ done(true); }, function(){ done(false); });
    } else {
      done(false);
    }
  }catch(e){
    alert('Bookmarklet selhal: ' + e.message);
  }
})();
