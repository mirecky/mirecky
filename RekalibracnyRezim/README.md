# Rekalibračný režim – Android aplikácia

Šesťfázový časovač (dychový pacer, zvukové signály fáz, denník) zabalený ako natívna Android aplikácia pomocou [Capacitor](https://capacitorjs.com/). Zdrojový kód rozhrania je v `src/App.jsx`.

## Inštalácia do telefónu

1. V telefóne otvor priamy odkaz: <https://github.com/mirecky/mirecky/releases/download/rekalibracny-rezim/rekalibracny-rezim.apk>
2. Stiahnutý súbor `rekalibracny-rezim.apk` otvor. Android si vyžiada povolenie *Inštalovať neznáme aplikácie* pre prehliadač alebo správcu súborov.

Odkaz vždy ukazuje na posledný úspešný build (spúšťa sa pri každej zmene v priečinku `RekalibracnyRezim/`, prípadne ručne cez *Actions → Run workflow*).

## Správanie na Androide

| Funkcia | Riešenie |
|---|---|
| Obrazovka nezhasne počas behu | plugin `@capacitor-community/keep-awake` |
| Denník (posledných 50 záznamov) | `@capacitor/preferences` – súkromné úložisko aplikácie (`shared_prefs/CapacitorStorage.xml`), nikam sa neodosiela; záznamy sa dajú mazať jednotlivo (✕) aj naraz (*Vymazať celý denník*) |
| Systémové tlačidlo Späť | skryje podrobný postup → pozastaví časovač → minimalizuje aplikáciu |
| Orientácia | iba na výšku |

Časovač beží v rámci WebView. Pri prepnutí do inej aplikácie Android JavaScript pozastaví, preto je vhodné nechať aplikáciu na popredí (obrazovka zostáva zapnutá automaticky).

## Lokálny vývoj

```bash
npm install
npm run dev            # náhľad v prehliadači
npm run android:sync   # build + synchronizácia do android/
npm run android:open   # otvorenie v Android Studiu
```

Ikony sa generujú zo `assets/` príkazom `npx @capacitor/assets generate --android`.
