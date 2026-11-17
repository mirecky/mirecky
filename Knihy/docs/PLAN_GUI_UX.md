# Knihy – návrh GUI a UX

*Pracovný dokument, verzia 0.1 (17. 11. 2026). Slúži ako východisko pre implementáciu Android aplikácie na správu osobnej knižnice a čítanie elektronických kníh.*

---

## 1. Cieľ a rozsah

Aplikácia **Knihy** zjednocuje tri funkcie, ktoré používateľ dnes rieši v oddelených nástrojoch:

1. **Katalóg osobnej knižnice** – fyzické aj elektronické knihy, pridávané skenovaním ISBN, ručne alebo importom súboru.
2. **Plánovanie čítania** – stavy čítania, cieľové termíny a pripomienky.
3. **Čítačka s anotáciami** – PDF a EPUB s podčiarkovaním, poznámkami a záložkami, ktoré sa dajú exportovať (napr. ako citácie).

Princípy návrhu:

- **Offline-first.** Všetky údaje sú lokálne; sieť sa používa iba na doplnenie metadát a obálok.
- **Súkromie.** Žiadny povinný účet, žiadna telemetria. Synchronizácia je voliteľná a pod kontrolou používateľa.
- **Rýchlosť pridania.** Od otvorenia aplikácie po uloženú knihu má stačiť do 10 sekúnd (sken → potvrdenie).
- **Čítačka je hlavná obrazovka, nie doplnok.** Prechod „Pokračovať v čítaní“ musí byť dostupný jedným ťuknutím.

---

## 2. Odporúčaná technológia

| Oblasť | Voľba | Zdôvodnenie |
|---|---|---|
| Jazyk a UI | **Kotlin + Jetpack Compose, Material 3** (dynamické farby Material You) | Natívny výkon čítačky; Capacitor (použitý v `RekalibracnyRezim`) je pre renderovanie PDF/EPUB a gestá anotácií nevhodný. |
| Databáza | **Room** (SQLite) + FTS4 na fulltextové vyhľadávanie | Štandard, migrácie, reaktívne `Flow`. |
| Sken ISBN | **CameraX + ML Kit Barcode Scanning** (EAN-13, offline model) | Rýchly, bez Google Play Services v „bundled“ variante. |
| Metadáta | **Open Library API** (primárne), **Google Books API** (záloha) | Kombinácia zvyšuje pokrytie, najmä pri slovenských a českých tituloch. Neskôr možnosť doplniť Z39.50/SRU Slovenskej národnej knižnice. |
| Obálky | Open Library Covers / Google Books; vlastná fotografia cez CameraX | Fotografia s automatickou detekciou okrajov a korekciou perspektívy (ML Kit Document Scanner). |
| EPUB | **Readium Kotlin Toolkit** | Zrelá knižnica, `Locator` (CFI) na presné ukotvenie anotácií, podpora reflowu, tém a TTS. |
| PDF | **Readium (PDF adaptér s PdfiumAndroid)** alebo `androidx.pdf` | Jednotné API pre obe formáty; anotácie ako vlastná vrstva v databáze (nie zápis do súboru – súbor ostáva nedotknutý). |
| Pripomienky | **WorkManager** + `AlarmManager.setExactAndAllowWhileIdle` pre presný čas | Spoľahlivé aj po reštarte zariadenia. |
| Architektúra | MVVM / UDF, Hilt, moduly `core-db`, `core-meta`, `feature-library`, `feature-reader`, `feature-plan` | Oddelenie čítačky od katalógu uľahčí testovanie. |
| Min. SDK | 26 (Android 8.0) | Pokrytie >95 % zariadení. |

---

## 3. Doménový model (zjednodušene)

```
Book ──< Edition ──< File (PDF/EPUB, cesta cez SAF URI)
 │          │
 │          └─ ISBN, vydavateľ, rok, jazyk, počet strán, obálka
 │
 ├─ Author >──< Book            (M:N, s rolou: autor, prekladateľ, editor)
 ├─ Tag >──< Book               (voľné štítky)
 ├─ Shelf >──< Book             (používateľské police / kolekcie)
 ├─ ReadingStatus (1:1, aktuálny) + StatusHistory (1:N)
 ├─ ReadingSession (1:N)        (začiatok, koniec, od–do strany/pozície)
 ├─ ReadingPlan (0..1)          (cieľový dátum, dni v týždni, čas, tempo)
 ├─ Annotation (1:N)            (typ, farba, locator, text, poznámka, kapitola, strana)
 └─ Loan (0..N)                 (komu/od koho požičaná, dátum, vrátenie)
```

Rozlíšenie **Book** (dielo) a **Edition** (konkrétne vydanie s ISBN) je dôležité: jedno dielo môže mať tlačenú aj elektronickú verziu, pričom stav čítania a anotácie patria k dielu, kým ISBN a stránkovanie k vydaniu.

---

## 4. Stavy čítania – návrh terminológie

Pôvodné zadanie uvádza *rozčítaná*, *aktuálne čítam*, *v pláne*. Pojmy „rozčítaná“ a „aktuálne čítam“ sa čiastočne prekrývajú, preto navrhujem jednoznačné vymedzenie:

| Stav | Význam | Vizuálny kód |
|---|---|---|
| **Čítam** | Aktívne čítaná kniha; zobrazuje sa na domovskej obrazovke. Odporúčaný limit 1–5. | plná zelená bodka |
| **Rozčítaná** (pozastavená) | Začatá, ale momentálne odložená. Pamätá si pozíciu a dátum prerušenia. | polovičná oranžová bodka |
| **V pláne** | Fronta na čítanie, ručne zoraditeľná (drag & drop). | obrys modrá bodka |
| **Prečítaná** | Dokončená; zaznamenaný dátum dokončenia, voliteľne hodnotenie. | fajka |
| **Nedočítaná** | Vedome ukončená bez dočítania. | preškrtnutá bodka |
| *(bez stavu)* | Iba v knižnici. | – |

Automatika: ak sa kniha v stave *Čítam* neotvorí 14 dní (nastaviteľné), aplikácia ponúkne presun do *Rozčítaná*. Zmeny stavu sa ukladajú do histórie (podklad pre štatistiky).

---

## 5. Informačná architektúra a navigácia

Spodná navigačná lišta (na tablete navigačný rail) so štyrmi cieľmi a centrálnym tlačidlom pridania:

```
┌──────────────────────────────────────────────┐
│  Domov   Knižnica   [ + ]   Plán   Poznámky  │
└──────────────────────────────────────────────┘
```

| Cieľ | Obsah |
|---|---|
| **Domov** | Karta „Pokračovať“ (posledná kniha, % a odhad času do konca kapitoly), zoznam *Čítam*, dnešné pripomienky, krátka štatistika týždňa. |
| **Knižnica** | Mriežka/zoznam obálok, filtre (stav, formát, štítok, polica, jazyk), triedenie, vyhľadávanie. |
| **[ + ]** | Bottom sheet: *Skenovať ISBN* · *Hľadať podľa názvu* · *Importovať súbor* · *Zadať ručne*. |
| **Plán** | Fronta *V pláne*, kalendár s naplánovanými blokmi čítania, ciele (napr. 24 kníh/rok). |
| **Poznámky** | Agregované anotácie naprieč knihami; filtrovanie podľa farby, knihy, štítku; export. |

Nastavenia a záloha sú v menu profilu (ikona v hornej lište Domova).

---

## 6. Kľúčové obrazovky (drôtené modely)

### 6.1 Domov

```
┌────────────────────────────────┐
│ Knihy                     ⚙︎   │
│ ┌────────────────────────────┐ │
│ │ [obálka]  Názov knihy      │ │
│ │           Autor            │ │
│ │  ▓▓▓▓▓▓▓░░░░  58 %         │ │
│ │  kap. 7 · ~12 min do konca │ │
│ │        [ Pokračovať ▶ ]    │ │
│ └────────────────────────────┘ │
│ Čítam                          │
│ [obálka] [obálka] [obálka] →   │
│ Dnes                           │
│ ⏰ 20:30  Názov 2 · 25 strán   │
│ Tento týždeň: 3 h 40 min · 212 s│
└────────────────────────────────┘
```

### 6.2 Knižnica

- Prepínač zobrazenia: **mriežka obálok** / **kompaktný zoznam** / **police** (vizuálna metafora regálu).
- Čipové filtre pod vyhľadávaním; aktívne filtre sú vždy viditeľné a jedným ťuknutím zrušiteľné.
- Dlhé podržanie → hromadný výber (zmena stavu, štítku, police, odstránenie).
- Na obálke malé indikátory: stav (bodka), formát (📄 PDF / 📖 EPUB / 📚 fyzická), požičaná.

### 6.3 Detail knihy

```
┌────────────────────────────────┐
│ ←                         ⋮    │
│   [  veľká obálka  ]           │
│   Názov                        │
│   Autor · 2021 · 340 s.        │
│   ( Čítam ▾ )   ★★★★☆          │
│ [ Čítať ]  [ Naplánovať ]      │
│ ───────────────────────────── │
│ Pokrok   ▓▓▓▓▓▓░░░  58 %       │
│ Plán     do 30. 11. · 18 s/deň │
│ Poznámky 24  ›                 │
│ Vydania  2 (tlač, EPUB)  ›     │
│ Štítky   #filozofia #štúdium   │
│ Polica   Obývačka / 3. rad     │
│ Popis …                        │
└────────────────────────────────┘
```

### 6.4 Pridanie knihy skenom ISBN

Tok:

1. Ťuknutie na **[ + ] → Skenovať ISBN** → okamžite kamera s rámčekom (bez medzikroku).
2. Po rozpoznaní EAN-13 haptická odozva, kamera beží ďalej (režim **dávkového skenovania** – vhodné pri katalogizácii celej police).
3. Pod hľadáčikom sa zobrazuje rastúci zoznam rozpoznaných titulov s obálkou; každý riadok má stav *načítava sa / nájdené / nenájdené*.
4. **Hotovo** → obrazovka kontroly: pre každú knihu predvolený stav (napr. „bez stavu“), polica, možnosť opraviť metadáta.
5. Ak metadáta nie sú dostupné: formulár predvyplnený ISBN + ponuka **Vyfotiť obálku** a **Vyfotiť tiráž** (OCR cez ML Kit Text Recognition navrhne názov, autora a vydavateľa).

Duplicity: ak ISBN už v knižnici je, riadok sa označí „už máš“ s možnosťou pridať ďalší exemplár.

### 6.5 Obálka

- Automaticky: stiahnutie z Open Library → Google Books (najvyššie dostupné rozlíšenie).
- Ručne: **Vyfotiť** (detekcia okrajov, korekcia perspektívy, orez na pomer 2:3), **Vybrať z galérie**, **Vygenerovať zástupnú** (typografická obálka z názvu a autora vo farbe odvodenej od žánru).
- Pri EPUB/PDF: extrakcia obálky zo súboru (EPUB `cover-image`, PDF prvá strana).

### 6.6 Čítačka

```
┌────────────────────────────────┐
│ ← Názov · kap. 7      Aa  🔖 ⋮ │  ← lišty sa skryjú ťuknutím do stredu
│                                │
│   Text knihy …                 │
│   ███████ zvýraznený text ███  │
│   …                            │
│                                │
│ ───────●──────────── 58 %  s.196│
└────────────────────────────────┘
```

Ovládanie:

- **Ťuknutie** do stredu: zobraziť/skryť lišty; do okrajov: listovanie.
- **Dlhé podržanie + ťahanie**: výber textu → plávajúca ponuka: 5 farieb · podčiarknuť · poznámka · kopírovať s citáciou · slovník · hľadať · zdieľať.
- **Aa** panel: písmo, veľkosť, riadkovanie, okraje, zarovnanie, téma (svetlá / sépia / tmavá / OLED čierna), stránkovanie vs. plynulé posúvanie.
- PDF navyše: prispôsobenie šírke, režim **reflow** pre textové PDF, voľné kreslenie perom (S Pen), obdĺžnikový výber pre skenované strany, ručné mapovanie čísla strany (napr. PDF strana 15 = tlačená strana 1).
- Obsah (TOC), zoznam anotácií a záložiek v bočnom paneli; fulltextové vyhľadávanie v knihe.
- Automatický záznam **čítacej relácie** (čas, rozsah) – podklad pre štatistiky a odhad tempa.

### 6.7 Anotácie

Typy: **zvýraznenie**, **podčiarknutie**, **poznámka** (k výberu alebo k strane), **záložka**, **kresba** (PDF).

Odporúčanie: farbám priradiť **význam**, ktorý si používateľ pomenuje (napr. žltá = kľúčová myšlienka, zelená = definícia, červená = nesúhlas, modrá = na citovanie, fialová = otázka). Význam sa potom používa vo filtroch a exporte.

Obrazovka **Poznámky**: časová os alebo zoskupenie podľa knihy/kapitoly; každá karta obsahuje citát, poznámku, stranu, odkaz „otvoriť v knihe“.

Export:

- **Markdown** (vhodné pre Obsidian / Zettelkasten), **PDF**, **CSV**.
- **Citácia** podľa ISO 690 / APA / Chicago s číslom strany.
- **BibTeX / RIS** záznam knihy (Zotero, Citavi).
- Pri PDF voliteľne „vypáliť“ anotácie do kópie súboru.

### 6.8 Plán a pripomienky

Pri **Naplánovať** sa používateľ rozhodne medzi dvoma režimami:

1. **Termín dočítania** – zadá dátum; aplikácia vypočíta denný cieľ (strany alebo percentá) a priebežne ho prepočítava podľa skutočného pokroku.
2. **Pravidelné čítanie** – dni v týždni + čas (napr. Po–Pi 20:30, 30 min).

Notifikácia obsahuje akcie **Čítať teraz** (otvorí čítačku na poslednej pozícii), **O 30 min**, **Dnes vynechať**. Tiché hodiny a súhrnná notifikácia, ak sa zhoduje viac plánov. Voliteľne export plánu do systémového kalendára (CalendarContract) – bez potreby Google účtu.

---

## 7. Vizuálny jazyk

- **Material 3** s dynamickými farbami; obálky kníh sú dominantný vizuálny prvok, UI okolo nich má byť tlmené.
- Typografia: rozhranie v systémovom bezpätkovom písme; čítačka ponúka kvalitné pätkové písmo s podporou slovenskej diakritiky (napr. *Literata*, *Source Serif 4*) a bezpätkové (*Inter*), plus podporu **OpenDyslexic**.
- Plynulé prechody (shared element transition) obálky z mriežky do detailu a z detailu do čítačky.
- Prístupnosť: TalkBack popisy, kontrast min. 4,5 : 1, dotykové ciele min. 48 dp, podpora systémovej veľkosti písma.
- Jazyk rozhrania: slovenčina (primárne), angličtina; pripravené na češtinu.

---

## 8. Profesionálne odporúčania nad rámec zadania

1. **Evidencia fyzického umiestnenia** (miestnosť / regál / rad) – pri väčšej knižnici rozhoduje o použiteľnosti.
2. **Výpožičky** – komu je kniha požičaná a od kedy, s pripomienkou vrátenia.
3. **Séria a poradie** – automatické navrhnutie ďalšieho dielu do *V pláne*.
4. **Import priečinka** (Storage Access Framework) – aplikácia sleduje zvolený priečinok a nové PDF/EPUB automaticky zaradí; kompatibilita s knižnicou Calibre (čítanie `metadata.opf`).
5. **Záloha a synchronizácia bez cloudu** – export celej databázy + anotácií do jedného súboru (ZIP s JSON), voliteľne automaticky do priečinka synchronizovaného cez Syncthing/Nextcloud/Google Drive. Neskôr OPDS katalóg.
6. **Štatistiky** – čas čítania, tempo (strany/h), séria dní, ročný cieľ, rozloženie podľa žánrov; odhad dokončenia vychádza z reálneho tempa.
7. **Rýchla poznámka k fyzickej knihe** – fotografia strany → OCR → poznámka s číslom strany. Anotácie tak nie sú obmedzené len na e-knihy.
8. **Režim štúdia** – pri odbornej literatúre prepojenie anotácií s citáciami a export do Markdownu so zachovaním hierarchie kapitol.
9. **Text-to-speech** cez systémový TTS engine (Readium to podporuje) s pokračovaním na pozadí.
10. **Widget na plochu** – „Pokračovať v čítaní“ a dnešný cieľ.

---

## 9. Etapy vývoja

| Etapa | Obsah | Výstup |
|---|---|---|
| **0 – Prototyp UX** | Klikací prototyp kľúčových tokov (Figma alebo Compose preview), overenie navigácie. | Schválené obrazovky 6.1–6.4, 6.6. |
| **1 – MVP katalóg** | Room model, sken ISBN, metadáta, obálky (stiahnutie + foto), knižnica, detail, stavy. | Použiteľná evidencia kníh. |
| **2 – Čítačka** | Import PDF/EPUB, Readium, pozícia čítania, témy, záložky. | Čítanie s pamäťou pozície. |
| **3 – Anotácie** | Zvýraznenia, poznámky, obrazovka Poznámky, export Markdown/citácie. | Študijné použitie. |
| **4 – Plán** | Plány, notifikácie, relácie čítania, štatistiky, widget. | Pripomienky a prehľad. |
| **5 – Rozšírenia** | Záloha/sync, výpožičky, police, OCR poznámky, TTS, OPDS. | Profesionálna verzia. |

CI: rovnaký princíp ako pri `RekalibracnyRezim` – GitHub Actions zostaví podpísaný APK pri zmene v adresári `Knihy/**`.

---

## 10. Otvorené otázky

1. Prevažuje fyzická knižnica, alebo e-knihy? (Ovplyvní poradie etáp 1 a 2.)
2. Má byť synchronizácia medzi viacerými zariadeniami (telefón + tablet) už v prvých verziách?
3. Ktorá citačná norma je primárna – ISO 690 (STN), APA, alebo iná?
4. Akceptujú sa „pevné“ prepojenia na Google služby (Google Books API), alebo má byť aplikácia čisto open-source / F-Droid kompatibilná?
5. Je potrebná ochrana aplikácie (biometria/PIN) pre súkromné poznámky?
