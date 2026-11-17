# Knihy – návrh GUI a UX

*Pracovný dokument, verzia 0.2 (17. 11. 2026). Zmeny oproti 0.1: priorita fyzickej knižnice, synchronizácia od prvej verzie, nová kapitola 4 o ukladaní dát.*

*Slúži ako východisko pre implementáciu Android aplikácie na správu osobnej knižnice a čítanie elektronických kníh.*

---

## 1. Cieľ a rozsah

Aplikácia **Knihy** zjednocuje tri funkcie, ktoré používateľ dnes rieši v oddelených nástrojoch:

1. **Katalóg osobnej knižnice** – fyzické aj elektronické knihy, pridávané skenovaním ISBN, ručne alebo importom súboru.
2. **Plánovanie čítania** – stavy čítania, cieľové termíny a pripomienky.
3. **Čítačka s anotáciami** – PDF a EPUB s podčiarkovaním, poznámkami a záložkami, ktoré sa dajú exportovať (napr. ako citácie).

Princípy návrhu:

- **Fyzická knižnica na prvom mieste.** Väčšinu fondu tvoria tlačené knihy; katalóg, umiestnenie a výpožičky majú prednosť pred čítačkou.
- **Local-first so synchronizáciou.** Aplikácia funguje plne offline. Zmeny sa synchronizujú na úložisko, ktoré si používateľ zvolí, takže reinštalácia ani výmena telefónu neznamenajú stratu dát.
- **Súkromie.** Žiadna telemetria, žiadny server prevádzkovaný autorom aplikácie. Dáta ležia výlučne na zariadeniach používateľa a v jeho vlastnom úložisku.
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
| Synchronizácia | Vlastný synchronizačný modul (žurnál zmien) s výmenným transportom; prvý transport **WebDAV** (Nextcloud a pod.) alebo **Google Drive `appDataFolder`** – pozri kap. 4 | Osvedčený model (Joplin, KOReader), nezávislý od konkrétneho poskytovateľa. |
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

Pre synchronizáciu má každá entita od začiatku tieto polia: `id` (UUID, nie autoinkrement), `updatedAt` (hybridné logické hodiny), `deviceId` a `deleted` (tombstone namiesto fyzického zmazania). Doplnenie týchto polí dodatočne by si vyžiadalo migráciu celej databázy, preto sú súčasťou etapy 1. Vznikne tiež entita **Copy** (exemplár) pod **Edition**: pri fyzických knihách sa umiestnenie, stav exemplára a výpožička viažu na konkrétny kus, nie na vydanie.

---

## 4. Ukladanie dát a obnova po reinštalácii

### 4.1 Východiskový problém

Android pri odinštalovaní aplikácie **vymaže jej súkromný priečinok** (`/data/data/…`), teda aj databázu, obálky a nastavenia. Systémová záloha *Android Auto Backup* je obmedzená na 25 MB, nie je zaručená na všetkých zariadeniach a obnovuje sa iba pri prvej inštalácii z rovnakého Google účtu. Ako jediná ochrana preto nestačí.

### 4.2 Kde budú jednotlivé dáta

| Dáta | Pracovné umiestnenie (rýchly prístup) | Trvalé umiestnenie (prežije reinštaláciu) |
|---|---|---|
| Katalóg, stavy, plány, anotácie, relácie | Room databáza v súkromnom priečinku | **Synchronizačné úložisko** (žurnál zmien + pravidelný snímok) |
| Obálky (komprimované WebP, ~50 kB) | Súkromná cache | Synchronizačné úložisko |
| Fotografie tiráže / OCR podklady | Súkromný priečinok | Synchronizačné úložisko (voliteľne) |
| Súbory PDF/EPUB | **Používateľom zvolený verejný priečinok**, napr. `Dokumenty/Knihy` (Storage Access Framework) | Rovnaký priečinok – súbory sa pri odinštalovaní nemažú; voliteľne aj synchronizačné úložisko |
| Nastavenia | DataStore | Synchronizačné úložisko + Auto Backup |

Súbory e-kníh sa identifikujú **hashom obsahu (SHA-256)**, nie cestou. Po reinštalácii alebo presune súboru sa preto anotácie a pozícia čítania znovu pripoja k správnemu súboru.

### 4.3 Synchronizácia

Model je „local-first“: zdrojom pravdy je lokálna databáza na každom zariadení; úložisko slúži ako schránka na výmenu zmien.

- Každá zmena sa zapíše do **žurnálu** (záznam = entita, pole, nová hodnota, čas, zariadenie). Zariadenie posiela do úložiska vlastné súbory žurnálu a číta súbory ostatných zariadení.
- **Riešenie konfliktov:** na úrovni poľa platí posledná zmena (LWW). Anotácie a relácie čítania sa iba pridávajú, takže nekolidujú. Pri pozícii čítania vyhráva najnovšia, pri pokroku najvyššia hodnota.
- Raz za čas sa vytvorí **snímok** celej databázy, aby nové zariadenie nemuselo prehrávať celý žurnál.
- Spúšťa sa pri zmene (s oneskorením niekoľkých sekúnd), pri otvorení aplikácie a periodicky cez WorkManager; iba na Wi-Fi je voliteľné.
- **Šifrovanie end-to-end** (voliteľné, heslo používateľa): úložisko vidí iba šifrované súbory.

Možné transporty (implementuje sa spoločné rozhranie, prvý transport podľa voľby používateľa):

| Transport | Výhody | Nevýhody |
|---|---|---|
| **Google Drive – `appDataFolder`** | Bez servera, väčšina používateľov Androidu ho má; skrytý priečinok, používateľ ho omylom nezmaže | Väzba na Google; nie je F-Droid kompatibilný |
| **WebDAV (Nextcloud, ownCloud, Synology, Koofr…)** | Otvorený štandard, vlastné alebo európske úložisko | Treba mať účet alebo server |
| **Priečinok (Syncthing)** | Úplne bez cloudu, P2P | Vyžaduje ďalšiu aplikáciu a súčasne zapnuté zariadenia |
| Dropbox / OneDrive | Rozšírené | Ďalšie OAuth integrácie, neskoršia etapa |

### 4.4 Tok obnovy (nový telefón alebo reinštalácia)

1. Pri prvom spustení obrazovka **Vitaj**: *Začať novú knižnicu* · *Obnoviť zo synchronizácie* · *Obnoviť zo súboru zálohy*.
2. *Obnoviť zo synchronizácie* → prihlásenie k úložisku → (heslo k šifrovaniu) → stiahnutie snímku a žurnálu s ukazovateľom priebehu. Katalóg je použiteľný hneď, obálky sa doťahujú na pozadí.
3. Výzva **Pripojiť priečinok s e-knihami**. Oprávnenie na prístup k priečinku sa reinštaláciou stráca, preto si ho aplikácia vyžiada znovu; následne spáruje súbory podľa hashu.
4. Obnovia sa naplánované pripomienky (alarmy reinštaláciu neprežijú, preto sa vždy prepočítajú z databázy).

Nezávisle od synchronizácie zostáva **ručný export** celej knižnice do jedného súboru (ZIP: JSON + obálky) a čitateľný export katalógu do CSV ako posledná poistka.

---

## 5. Stavy čítania – návrh terminológie

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

## 6. Informačná architektúra a navigácia

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

## 7. Kľúčové obrazovky (drôtené modely)

### 7.1 Domov

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

### 7.2 Knižnica

- Prepínač zobrazenia: **mriežka obálok** / **kompaktný zoznam** / **police** (vizuálna metafora regálu).
- Čipové filtre pod vyhľadávaním; aktívne filtre sú vždy viditeľné a jedným ťuknutím zrušiteľné.
- Dlhé podržanie → hromadný výber (zmena stavu, štítku, police, odstránenie).
- Na obálke malé indikátory: stav (bodka), formát (📄 PDF / 📖 EPUB / 📚 fyzická), požičaná.

### 7.3 Detail knihy

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

### 7.4 Pridanie knihy skenom ISBN

Tok:

1. Ťuknutie na **[ + ] → Skenovať ISBN** → okamžite kamera s rámčekom (bez medzikroku).
2. Po rozpoznaní EAN-13 haptická odozva, kamera beží ďalej (režim **dávkového skenovania** – vhodné pri katalogizácii celej police).
3. Pod hľadáčikom sa zobrazuje rastúci zoznam rozpoznaných titulov s obálkou; každý riadok má stav *načítava sa / nájdené / nenájdené*.
4. **Hotovo** → obrazovka kontroly: pre každú knihu predvolený stav (napr. „bez stavu“), polica, možnosť opraviť metadáta.
5. Ak metadáta nie sú dostupné: formulár predvyplnený ISBN + ponuka **Vyfotiť obálku** a **Vyfotiť tiráž** (OCR cez ML Kit Text Recognition navrhne názov, autora a vydavateľa).

Duplicity: ak ISBN už v knižnici je, riadok sa označí „už máš“ s možnosťou pridať ďalší exemplár.

### 7.5 Obálka

- Automaticky: stiahnutie z Open Library → Google Books (najvyššie dostupné rozlíšenie).
- Ručne: **Vyfotiť** (detekcia okrajov, korekcia perspektívy, orez na pomer 2:3), **Vybrať z galérie**, **Vygenerovať zástupnú** (typografická obálka z názvu a autora vo farbe odvodenej od žánru).
- Pri EPUB/PDF: extrakcia obálky zo súboru (EPUB `cover-image`, PDF prvá strana).

### 7.6 Čítačka

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

### 7.7 Anotácie

Typy: **zvýraznenie**, **podčiarknutie**, **poznámka** (k výberu alebo k strane), **záložka**, **kresba** (PDF).

Odporúčanie: farbám priradiť **význam**, ktorý si používateľ pomenuje (napr. žltá = kľúčová myšlienka, zelená = definícia, červená = nesúhlas, modrá = na citovanie, fialová = otázka). Význam sa potom používa vo filtroch a exporte.

Obrazovka **Poznámky**: časová os alebo zoskupenie podľa knihy/kapitoly; každá karta obsahuje citát, poznámku, stranu, odkaz „otvoriť v knihe“.

Export:

- **Markdown** (vhodné pre Obsidian / Zettelkasten), **PDF**, **CSV**.
- **Citácia** podľa ISO 690 / APA / Chicago s číslom strany.
- **BibTeX / RIS** záznam knihy (Zotero, Citavi).
- Pri PDF voliteľne „vypáliť“ anotácie do kópie súboru.

### 7.8 Plán a pripomienky

Pri **Naplánovať** sa používateľ rozhodne medzi dvoma režimami:

1. **Termín dočítania** – zadá dátum; aplikácia vypočíta denný cieľ (strany alebo percentá) a priebežne ho prepočítava podľa skutočného pokroku.
2. **Pravidelné čítanie** – dni v týždni + čas (napr. Po–Pi 20:30, 30 min).

Notifikácia obsahuje akcie **Čítať teraz** (otvorí čítačku na poslednej pozícii), **O 30 min**, **Dnes vynechať**. Tiché hodiny a súhrnná notifikácia, ak sa zhoduje viac plánov. Voliteľne export plánu do systémového kalendára (CalendarContract) – bez potreby Google účtu.

---

## 8. Vizuálny jazyk

- **Material 3** s dynamickými farbami; obálky kníh sú dominantný vizuálny prvok, UI okolo nich má byť tlmené.
- Typografia: rozhranie v systémovom bezpätkovom písme; čítačka ponúka kvalitné pätkové písmo s podporou slovenskej diakritiky (napr. *Literata*, *Source Serif 4*) a bezpätkové (*Inter*), plus podporu **OpenDyslexic**.
- Plynulé prechody (shared element transition) obálky z mriežky do detailu a z detailu do čítačky.
- Prístupnosť: TalkBack popisy, kontrast min. 4,5 : 1, dotykové ciele min. 48 dp, podpora systémovej veľkosti písma.
- Jazyk rozhrania: slovenčina (primárne), angličtina; pripravené na češtinu.

---

## 9. Profesionálne odporúčania nad rámec zadania

Body 1–3 sú vzhľadom na prevahu fyzickej knižnice zaradené priamo do MVP (etapa 1).

1. **Evidencia fyzického umiestnenia** (miestnosť / regál / rad) – pri väčšej knižnici rozhoduje o použiteľnosti. Režim **Inventúra**: zvolíš policu a skenuješ ISBN kníh, ktoré na nej stoja; aplikácia ich priradí k polici a upozorní na chýbajúce.
2. **Výpožičky** – komu je exemplár požičaný a od kedy, s pripomienkou vrátenia (kontakt z adresára).
3. **Rýchla poznámka k fyzickej knihe** – fotografia strany → OCR → zvýraznenie alebo poznámka s číslom strany. Anotácie tak nie sú obmedzené len na e-knihy; pokrok čítania tlačenej knihy sa zadáva číslom strany (posúvač alebo diktovanie).
4. **Séria a poradie** – automatické navrhnutie ďalšieho dielu do *V pláne*.
5. **Import priečinka** (Storage Access Framework) – aplikácia sleduje zvolený priečinok a nové PDF/EPUB automaticky zaradí; kompatibilita s knižnicou Calibre (čítanie `metadata.opf`). Neskôr OPDS katalóg.
6. **Štatistiky** – čas čítania, tempo (strany/h), séria dní, ročný cieľ, rozloženie podľa žánrov; odhad dokončenia vychádza z reálneho tempa.
7. **Poistenie a hodnota zbierky** – voliteľná nákupná cena a dátum nadobudnutia, export zoznamu pre poistenie domácnosti.
8. **Režim štúdia** – pri odbornej literatúre prepojenie anotácií s citáciami a export do Markdownu so zachovaním hierarchie kapitol.
9. **Text-to-speech** cez systémový TTS engine (Readium to podporuje) s pokračovaním na pozadí.
10. **Widget na plochu** – „Pokračovať v čítaní“ a dnešný cieľ.

---

## 10. Etapy vývoja

| Etapa | Obsah | Výstup |
|---|---|---|
| **0 – Prototyp UX** | Klikací prototyp kľúčových tokov (Figma alebo Compose preview), overenie navigácie. | Schválené obrazovky 7.1–7.5 a tok obnovy 4.4. |
| **1 – Katalóg fyzickej knižnice** | Room model so synchronizačnými poľami (UUID, `updatedAt`, tombstone), sken ISBN vrátane dávkového režimu, metadáta, obálky (stiahnutie + foto), knižnica, detail, stavy, exempláre, police a umiestnenie, výpožičky, ručný export/import. | Použiteľná evidencia kníh. |
| **2 – Synchronizácia** | Žurnál zmien, snímky, prvý transport (podľa odpovede v kap. 11), obrazovka *Vitaj* s obnovou, šifrovanie, synchronizácia obálok. | Dáta prežijú reinštaláciu; telefón + tablet. |
| **3 – Plán a pokrok** | Stavy s históriou, pokrok tlačenej knihy číslom strany, plány, notifikácie, relácie čítania, štatistiky, widget. | Pripomienky a prehľad. |
| **4 – Čítačka** | Import PDF/EPUB, Readium, párovanie súborov hashom, pozícia čítania, témy, záložky. | Čítanie e-kníh. |
| **5 – Anotácie** | Zvýraznenia, poznámky (aj OCR z fyzickej knihy), obrazovka Poznámky, export Markdown/citácie/BibTeX. | Študijné použitie. |
| **6 – Rozšírenia** | Ďalšie transporty, inventúra, séria, TTS, OPDS, poistný export. | Profesionálna verzia. |

Etapy 1 a 2 sa vyvíjajú tesne po sebe; synchronizácia sa nezapína v produkcii, kým nie je hotová obnova (4.4) – inak by hrozilo, že používateľ dôveruje neúplnej zálohe.

CI: rovnaký princíp ako pri `RekalibracnyRezim` – GitHub Actions zostaví podpísaný APK pri zmene v adresári `Knihy/**`.

---

## 11. Otvorené otázky

Zodpovedané (17. 11. 2026):

- ~~Prevažuje fyzická knižnica, alebo e-knihy?~~ → **fyzická**; poradie etáp upravené.
- ~~Synchronizácia už v prvých verziách?~~ → **áno**; doplnená kap. 4 a etapa 2.
- ~~Kde budú dáta po reinštalácii?~~ → kap. 4.2 a 4.4.

Otvorené:

1. **Ktorý synchronizačný transport ako prvý** – Google Drive, WebDAV/Nextcloud, alebo Syncthing? (Kap. 4.3.)
2. Ktorá citačná norma je primárna – ISO 690 (STN), APA, alebo iná?
3. Akceptujú sa závislosti na Google službách (Google Books API, Drive), alebo má byť aplikácia čisto open-source / F-Droid kompatibilná?
4. Je potrebná ochrana aplikácie (biometria/PIN) pre súkromné poznámky?
5. Zapnúť šifrovanie synchronizácie predvolene? (Bezpečnejšie, no zabudnuté heslo znamená nemožnosť obnovy.)
