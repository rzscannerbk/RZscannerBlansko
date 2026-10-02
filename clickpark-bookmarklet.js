javascript:(function(){
  (async function(){
    try{
      // Tělo e-mailu se hledá podle popisu z DevTools (div.body.apply-styles
      // uvnitř div.message, Seznam.cz webmail) — bere se textContent
      // celého bloku a rozparsuje po řádcích "Popisek: hodnota". Pokud
      // tenhle konkrétní selektor na tvém webmailu nenajde (Seznam
      // rozhraní se občas mění), zkusí se fallback na div.message jako
      // celek — radši širší kontejner, než aby se nenašlo vůbec nic.
      var container = document.querySelector('div.body.apply-styles')
        || document.querySelector('div.message')
        || document.body;

      var text = container.innerText || container.textContent || '';
      var lines = text.split('\n').map(function(l){ return l.trim(); }).filter(Boolean);

      var data = {};
      lines.forEach(function(line){
        var m = line.match(/^([^:]{1,40}):\s*(.+)$/);
        if(m){
          var label = m[1].trim();
          var value = m[2].trim();
          if(!(label in data)) data[label] = value;
        }
      });

      // Odkaz na mapu se hledá přímo mezi <a> uvnitř kontejneru (textový
      // řádek "Mapa: ..." samotný odkaz jako takový v textContentu
      // nemá) — souřadnice se pak z URL vytáhnou buď z parametru q=,
      // nebo z ll=.
      var lat = null, lng = null, mapaUrl = null;
      var links = container.querySelectorAll('a[href*="maps.google"], a[href*="google.com/maps"]');
      if(links.length){
        mapaUrl = links[0].href;
        var mCoords = mapaUrl.match(/[?&](?:q|ll)=(-?\d+(?:\.\d+)?)[,%2C]+(-?\d+(?:\.\d+)?)/i);
        if(mCoords){ lat = parseFloat(mCoords[1]); lng = parseFloat(mCoords[2]); }
      }

      // Příloha (fotka vozidla) — potvrzeno přímo z DevTools (Lukášův
      // screenshot, 11. 9. 2026): div.attachments > wm-attachment má
      // dva odkazy na stejnou fotku, "/download/j/..." (a.preview,
      // zřejmě náhled/wrapper) a "/download/b/..." (první odkaz
      // v div.commands, zřejmě přímo binární data) — nejdřív se zkouší
      // "/download/b/...", teprve pak se padá zpátky na a.preview.
      // Ani jeden odkaz není přímo obrázková data v HTML, takže se
      // nejdřív stáhne (fetch se stejnou session, credentials:
      // same-origin) a teprve pak zakóduje do base64.
      var photoData = null, photoMime = null;
      var previewLink = document.querySelector('div.attachments wm-attachment div.commands a[href*="/download/b/"]')
        || document.querySelector('div.attachments wm-attachment a.preview[href]')
        || document.querySelector('a.preview[href]');
      if(previewLink && previewLink.href){
        try{
          var resp = await fetch(previewLink.href, { credentials: 'same-origin' });
          if(resp.ok){
            var blob = await resp.blob();
            photoMime = blob.type || 'image/jpeg';
            photoData = await new Promise(function(resolve, reject){
              var reader = new FileReader();
              reader.onload = function(){ resolve(reader.result.split(',')[1]); };
              reader.onerror = function(){ reject(reader.error); };
              reader.readAsDataURL(blob);
            });
          }
        }catch(err){
          // Fotka je nepovinná — když se stažení nepovede (např. jiná
          // struktura přílohy, než se čekalo), pokračuje se dál bez ní
          // a jen se na to upozorní v hlášení na konci
          // (viz proměnná note níž).
        }
      }

      var payload = {
        source: 'clickpark',
        id: data['Id'] || null,
        cisloPokuty: data['Číslo pokuty'] || null,
        rz: data['RZ'] || null,
        ulice: data['Ulice'] || null,
        textPokuty: data['Text pokuty'] || null,
        typVozidla: data['Typ vozidla'] || null,
        barva: data['Barva vozidla'] || null,
        model: data['Model vozidla'] || null,
        popis: data['Popis'] || null,
        datum: data['Datum'] || null,
        lat: lat,
        lng: lng,
        mapaUrl: mapaUrl,
        photoData: photoData,
        photoMime: photoMime
      };

      if(!payload.rz && !payload.ulice){
        alert('Nepodařilo se najít žádné rozpoznatelné údaje (RZ, Ulice) na téhle stránce. Jsi na detailu ClickPark e-mailu ve Seznam webmailu?');
        return;
      }

      var full = JSON.stringify(payload);
      function done(ok){
        if(ok){
          var note = photoData ? '' : '\n\n(Fotku přílohy se nepodařilo najít/stáhnout — v RZ Scanneru ji přidej ručně přes "Přidej fotodokumentaci".)';
          alert('Zkopírováno do schránky (RZ ' + (payload.rz || '?') + ').' + note + '\n\nTeď se přepni do RZ Scanneru, zvol "Přidat událost" → "Placenky" → "Parkoviště s parkovacím poplatkem" a klikni na "Vložit z ClickParku".');
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
})();
