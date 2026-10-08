import React, { useState, useEffect, useRef, useCallback } from "react";
import { App as CapApp } from "@capacitor/app";
import { storage, keepScreenOn, allowScreenOff } from "./platform.js";

// ─── Rekalibračný režim v2 – riadený telom, nie hodinami ───────
// TEST_MODE = true → časované fázy trvajú 10 s
const TEST_MODE = false;

const ACCENT = "#D9A05B";

// type: "timed" = pevný čas (auto prechod) | "open" = variabilná,
// prechod až tlačidlom "Ďalšia fáza" (poslúchať telo, nie hodiny)
const PHASES = [
  {
    name: "Príprava a kotvenie",
    type: "timed",
    slow: 5,
    fast: 2,
    tone: 349,
    breathe: true,
    ukony: [
      "Oči zatvorené, uvoľnená čeľusť, jazyk voľne",
      "Nádych nosom 4 s → výdych ústami 6 s",
      "Skener tela: nohy, zadok, brucho",
    ],
    detail: `Nájdi si súkromné a pohodlné miesto. Zvoľ polohu, v ktorej sa cítiš bezpečne. Kedykoľvek môžeš dať pauzu, fázu preskočiť alebo program ukončiť.

Poloha: ľah na chrbte alebo sed s rovnou chrbticou. Oči zatvorené.

Dych: 3 hlboké nádychy nosom (4 sekundy), výdych ústami (6 sekúnd). Pokračuj v tomto rytme.

Uvoľnenie čeľuste: mierne otvor ústa, jazyk uvoľnený na spodku úst.

Skener tela: postupne prejdi pozornosťou pocity v nohách, zadku, bruchu. Cieľ je odpojiť zrak, pripojiť telo, nastaviť dych.

„Zatvor oči. Uvoľni čeľusť. Dýchaj hlboko do brucha. Pociťuj váhu tela na posteli."`,
  },
  {
    name: "Somatické budenie",
    type: "timed",
    slow: 10,
    fast: 5,
    tone: 392,
    ukony: [
      "Brucho: kruhy dlaňou okolo pupka",
      "Stehná vonkajšou stranou dole, vnútornou hore; zadok",
      "Hrudník a bradavky – voliteľné, iba ak je to príjemné",
      "Hrádza – voliteľné, iba ak je to príjemné",
      "Penisu sa nedotýkať",
    ],
    detail: `Cieľ: prebudiť nervové zakončenia bez stimulácie penisu. Dotyk je vždy voliteľný – pokračuj iba v tom, čo je príjemné; ktorýkoľvek krok môžeš vynechať.

Brucho: jemné kruhové pohyby dlaňou okolo pupka – cítiť teplo.

Stehná a zadok: hladenie vonkajšej strany stehien smerom nadol, potom vnútornej strany smerom nahor.

Hrudník a bradavky (voliteľné): jemný dotyk, iba ak je to príjemné – pokojne vynechaj.

Hrádza (voliteľné): oblasť medzi genitáliami a konečníkom. Jemný tlak prstami, iba ak je to príjemné.

„Nedotýkaj sa penisu ešte. Hlaď brucho, stehná, zadok. Cítiš teplo? Dýchaj do tých miest."`,
  },
  {
    name: "Primárna stimulácia – Hladenie",
    type: "open",
    target: "orientačne 5/10",
    tone: 440,
    ukony: [
      "Jemné hladenie po celom povrchu",
      "Jeden pohyb 5–10 sekúnd",
      "Fokus: textúra, teplota, vlhkosť",
      "Žiadne rýchle ťahy, žiadne stláčanie",
    ],
    detail: `Cieľ: budovať vzrušenie pomaly, bez tlaku na rýchly výsledok. Fáza nemá pevný čas – pokračuješ, kým sa sám nerozhodneš. Úroveň 5/10 je tvoje vlastné orientačné sebahodnotenie, nie presný prah; číslo je len pomôcka.

Ruka: lubrikant alebo suchá ruka, podľa preferencie.

Pohyb: jemné hladenie po celom povrchu penisu (hlavička, stopka, kožka).

Tempo: veľmi pomalé – jeden pohyb trvá 5 až 10 sekúnd.

Fokus: sústreď sa na textúru, teplotu a vlhkosť. Vzrušenie má prameniť z pocitov, nie z obrazov.

Zákaz: žiadne rýchle ťahy, žiadne stláčanie.

„Pomaly hlaď. Sústreď sa na textúru. Ak cítiš teplo, spomaľ ešte viac."

Ďalšiu fázu spusti tlačidlom, až keď telo samo žiada intenzívnejší pohyb.`,
  },
  {
    name: "Intenzifikácia – Vedomé ťahy",
    type: "open",
    target: "orientačne 7/10",
    tone: 494,
    breathe: true,
    ukony: [
      "Pomalé ťahy hore–dole",
      "Nádych = ťah nahor · výdych = ťah nadol",
      "Vedome uvoľniť zadok a stehná",
      "Pri silnom napätí → spomaliť na polovicu, uvoľniť svaly",
    ],
    detail: `Cieľ: zvýšiť intenzitu a pritom udržať kontrolu a uvoľnené telo. Bez pevného času. Úroveň 7/10 je orientačné sebahodnotenie, nie presný prah.

Pohyb: prechod na ťahy (hore–dole), ale pomalé a vedomé.

Rytmus: synchronizuj s dychom podľa pacera na kruhu – nádych = ťah nahor, výdych = ťah nadol.

Uvoľnenie: vedome uvoľni zadok a stehná, nesmršťuj sa.

Kontrola: ak napätie rastie príliš rýchlo (subjektívne okolo 8/10), spomaľ pohyb na polovicu a vedome uvoľni svaly – nezastavuj úplne.

„Pomalé ťahy. Dýchaj do brucha. Uvoľni zadok. Blížiš sa k vrcholu? Spomaľ pohyb."`,
  },
  {
    name: "Integrácia a uvoľnenie",
    type: "open",
    target: "vrchol voliteľný",
    tone: 523,
    breathe: true,
    ukony: [
      "Ústa úplne otvorené, pustiť zvuk",
      "Maximálne uvoľnenie všetkých svalov",
      "Spomaliť / zastaviť – nič netlačiť",
      "Vnímať pocity v tele – u každého iné",
    ],
    detail: `Cieľ: uvoľniť celé telo a nechať zážitok prebehnúť bez tlaku na výsledok. Orgazmus je možnosť, nie podmienka dokončenia – kedykoľvek môžeš prejsť rovno na Regeneráciu alebo program ukončiť.

Pri blížiacom sa vrchole (8/10 a viac):

Ústa: úplne otvorené, pusti zvuk – ston, výdych.

Telo: maximálne uvoľnenie všetkých svalov.

Pohyb: ďalšie spomalenie alebo úplné zastavenie. Ak vrchol prichádza, nechaj ho prebehnúť bez tlačenia; ak neprichádza, je to v poriadku.

Počas vrcholu si môžeš všímať pocity aj v iných častiach tela – brucho, nohy, prsty. Prežívanie sa medzi ľuďmi líši; nič konkrétne nie je „správny“ výsledok.

„Otvor ústa. Uvoľni všetko. Nič netlač. Všímaj si, čo telo cíti."

Po doznení stlač Ďalšia fáza.`,
  },
  {
    name: "Regenerácia",
    type: "timed",
    slow: 3,
    fast: 2,
    tone: 294,
    breathe: true,
    ukony: [
      "Zostať v polohe, nehybne",
      "Sledovať ustupovanie vzrušenia a teplo",
      "Pomalý dych",
    ],
    detail: `Cieľ: udržať spojenie s telom, neustať okamžite.

Zostaň v polohe, nehybne. Sústreď sa na postupné ustupovanie vzrušenia a pocit tepla.

Pomalý dych.

„Nevstávaj. Lež a všímaj si, ako sa telo upokojuje. Dýchaj."`,
  },
];

const AUTO_ADVANCE = 10;
const COOLDOWN_SEC = 120;

const fmt = (s) => {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
};

// ─── Zvuk ───────────────────────────────────────────────────────
let audioCtx = null;
function getCtx() {
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {}
  }
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}
function playTone(freq, when = 0, dur = 0.9, vol = 0.25) {
  const ctx = getCtx();
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "sine";
  o.frequency.value = freq;
  o.connect(g);
  g.connect(ctx.destination);
  const t = ctx.currentTime + when;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.start(t);
  o.stop(t + dur + 0.05);
}
function phaseGong(freq) {
  playTone(196, 0, 1.4, 0.28);
  playTone(freq, 0.5, 1.6, 0.22);
}
function midChime(freq) {
  playTone(freq, 0, 0.5, 0.07);
}
function finishChime() {
  const ctx = getCtx();
  if (!ctx) return;
  const t0 = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.value = 0.9;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(1200, t0);
  lp.frequency.linearRampToValueAtTime(500, t0 + 6);
  master.connect(lp);
  lp.connect(ctx.destination);
  const delay = ctx.createDelay(1.0);
  delay.delayTime.value = 0.38;
  const fb = ctx.createGain();
  fb.gain.value = 0.35;
  delay.connect(fb);
  fb.connect(delay);
  master.connect(delay);
  delay.connect(lp);
  [87.31, 130.81, 196.0, 293.66].forEach((f, i) => {
    [f * 0.997, f * 1.003].forEach((ff) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = i < 2 ? "sine" : "triangle";
      o.frequency.value = ff;
      o.connect(g);
      g.connect(master);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(0.06, t0 + 1.8);
      g.gain.setValueAtTime(0.06, t0 + 3.2);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 7);
      o.start(t0);
      o.stop(t0 + 7.2);
    });
  });
  [[1174.66, 0.9], [880.0, 2.1]].forEach(([f, when]) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(f, t0 + when);
    o.frequency.exponentialRampToValueAtTime(f * 0.985, t0 + when + 3);
    o.connect(g);
    g.connect(master);
    g.gain.setValueAtTime(0.0001, t0 + when);
    g.gain.exponentialRampToValueAtTime(0.05, t0 + when + 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + when + 3.5);
    o.start(t0 + when);
    o.stop(t0 + when + 3.6);
  });
}

export default function RecalibrationTimer() {
  // stavy: idle | running | paused | asking | waiting | cooldown | journal | done
  const [status, setStatus] = useState("idle");
  const [speed, setSpeed] = useState("slow");
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [phaseTime, setPhaseTime] = useState(0); // timed: zostáva ↓ · open: uplynulo ↑
  const [totalElapsed, setTotalElapsed] = useState(0);
  const [decideLeft, setDecideLeft] = useState(AUTO_ADVANCE);
  const [cooldownLeft, setCooldownLeft] = useState(COOLDOWN_SEC);
  const [manualMode, setManualMode] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [breathPhase, setBreathPhase] = useState("in");
  const midFiredRef = useRef(false);
  // denník
  const [tags, setTags] = useState([]);
  const [note, setNote] = useState("");
  const [entries, setEntries] = useState([]);
  const [showLog, setShowLog] = useState(false);

  const phase = PHASES[phaseIdx];
  const isTimed = phase.type === "timed";
  const isLast = phaseIdx === PHASES.length - 1;
  const timedLen = useCallback(
    (i) => (TEST_MODE ? 10 : (speed === "fast" ? PHASES[i].fast : PHASES[i].slow) * 60),
    [speed]
  );

  // ── denník ──
  useEffect(() => {
    (async () => {
      try {
        const v = await storage.get("rekalibracia-dennik");
        if (v) setEntries(JSON.parse(v));
      } catch (e) {}
    })();
  }, []);
  const saveEntry = async () => {
    const entry = {
      date: new Date().toISOString().slice(0, 16).replace("T", " "),
      tags,
      note: note.trim(),
      duration: fmt(totalElapsed),
    };
    const next = [entry, ...entries].slice(0, 50);
    setEntries(next);
    try {
      await storage.set("rekalibracia-dennik", JSON.stringify(next));
    } catch (e) {}
    setTags([]);
    setNote("");
    setStatus("done");
  };

  // ── Wake Lock ──
  const acquireWakeLock = useCallback(() => {
    keepScreenOn();
  }, []);
  const releaseWakeLock = useCallback(() => {
    allowScreenOff();
  }, []);
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible" && (status === "running" || status === "asking"))
        acquireWakeLock();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [status, acquireWakeLock]);

  // ── systémové tlačidlo Späť (Android) ──
  const backRef = useRef(() => false);
  backRef.current = () => {
    if (showDetail) {
      setShowDetail(false);
      return true;
    }
    if (status === "running") {
      setStatus("paused");
      allowScreenOff();
      return true;
    }
    return false;
  };
  useEffect(() => {
    let handle;
    CapApp.addListener("backButton", () => {
      if (!backRef.current()) CapApp.minimizeApp();
    })
      .then((h) => (handle = h))
      .catch(() => {});
    return () => handle?.remove();
  }, []);

  // ── hlavný tik ──
  useEffect(() => {
    if (status !== "running") return;
    const id = setInterval(() => {
      setPhaseTime((t) => (isTimed ? t - 1 : t + 1));
      setTotalElapsed((t) => t + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [status, isTimed]);

  // ── polovica časovanej fázy ──
  useEffect(() => {
    if (status !== "running" || !isTimed) return;
    const half = Math.floor(timedLen(phaseIdx) / 2);
    if (!midFiredRef.current && phaseTime === half && phaseTime > 3) {
      midFiredRef.current = true;
      midChime(phase.tone);
    }
  }, [phaseTime, status, isTimed, phase, phaseIdx, timedLen]);

  // ── koniec časovanej fázy ──
  useEffect(() => {
    if (!isTimed || phaseTime > 0 || status !== "running") return;
    if (isLast) {
      finishChime();
      releaseWakeLock();
      setCooldownLeft(TEST_MODE ? 10 : COOLDOWN_SEC);
      setStatus("cooldown");
    } else if (manualMode) {
      phaseGong(PHASES[phaseIdx + 1].tone);
      setStatus("asking");
      setDecideLeft(AUTO_ADVANCE);
    } else {
      advance();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phaseTime, status]);

  // ── cooldown ──
  useEffect(() => {
    if (status !== "cooldown") return;
    if (cooldownLeft <= 0) {
      setStatus("journal");
      return;
    }
    const id = setTimeout(() => setCooldownLeft((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [status, cooldownLeft]);

  // ── odpočet rozhodnutia ──
  useEffect(() => {
    if (status !== "asking") return;
    if (decideLeft <= 0) {
      advance();
      return;
    }
    const id = setTimeout(() => setDecideLeft((d) => d - 1), 1000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, decideLeft]);

  const advance = useCallback(() => {
    const next = phaseIdx + 1;
    const np = PHASES[next];
    phaseGong(np.tone);
    midFiredRef.current = false;
    setPhaseIdx(next);
    setPhaseTime(np.type === "timed" ? timedLen(next) : 0);
    setStatus("running");
  }, [phaseIdx, timedLen]);

  // otvorená fáza → tlačidlo Ďalšia fáza
  const nextOpenPhase = () => {
    if (isLast) return;
    advance();
  };

  // každý krok je dobrovoľný → preskočenie ktorejkoľvek fázy
  const skipPhase = () => {
    if (isLast) {
      finishChime();
      releaseWakeLock();
      setCooldownLeft(TEST_MODE ? 10 : COOLDOWN_SEC);
      setStatus("cooldown");
    } else {
      advance();
    }
  };

  const start = () => {
    getCtx();
    acquireWakeLock();
    midFiredRef.current = false;
    phaseGong(PHASES[0].tone);
    setPhaseTime(PHASES[0].type === "timed" ? timedLen(0) : 0);
    setTotalElapsed(0);
    setStatus("running");
  };
  const pause = () => {
    setStatus("paused");
    releaseWakeLock();
  };
  const resume = () => {
    acquireWakeLock();
    setStatus("running");
  };
  const reset = () => {
    releaseWakeLock();
    setStatus("idle");
    setPhaseIdx(0);
    setPhaseTime(PHASES[0].type === "timed" ? timedLen(0) : 0);
    setTotalElapsed(0);
    midFiredRef.current = false;
  };

  // ── dychový pacer ──
  useEffect(() => {
    if (status !== "running" || !phase.breathe) return;
    let mounted = true;
    let t;
    const cycle = (ph) => {
      if (!mounted) return;
      setBreathPhase(ph);
      t = setTimeout(() => cycle(ph === "in" ? "out" : "in"), ph === "in" ? 4000 : 6000);
    };
    cycle("in");
    return () => {
      mounted = false;
      clearTimeout(t);
    };
  }, [status, phaseIdx, phase.breathe]);

  // ── geometria ──
  const ringSize = showDetail ? 170 : 280;
  const R = ringSize / 2 - 20;
  const C = 2 * Math.PI * R;
  const phaseFrac = isTimed ? Math.max(0, phaseTime) / timedLen(phaseIdx) : 1;
  const breatheScale = phase.breathe && status === "running" ? (breathPhase === "in" ? 1.05 : 0.95) : 1;

  const S = {
    root: {
      minHeight: "100vh",
      background: "#191512",
      color: "#EFE6D8",
      fontFamily: "'Segoe UI', system-ui, sans-serif",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "24px 16px",
      boxSizing: "border-box",
      userSelect: "none",
    },
    header: { width: "100%", maxWidth: 420, display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 },
    title: { fontSize: 14, letterSpacing: 3, textTransform: "uppercase", opacity: 0.5 },
    total: { fontVariantNumeric: "tabular-nums", fontSize: 22, fontWeight: 600, color: "#B9AA93" },
    segBar: { width: "100%", maxWidth: 420, display: "flex", gap: 4, marginBottom: 22 },
    segItem: (done, active) => ({ flex: 1, height: 5, borderRadius: 3, background: done ? "#B9AA93" : active ? ACCENT : "#332B24", transition: "background .4s" }),
    phaseName: { fontSize: showDetail ? 22 : 26, fontWeight: 700, color: ACCENT, letterSpacing: 0.5, marginBottom: 4, textAlign: "center" },
    phaseStep: { fontSize: 13, opacity: 0.5, marginBottom: 12, letterSpacing: 2 },
    ringWrap: { position: "relative", width: ringSize, height: ringSize, marginBottom: 14, transform: `scale(${breatheScale})`, transition: `transform ${breathPhase === "in" ? 4 : 6}s ease-in-out, width .3s, height .3s`, cursor: "pointer" },
    ringTime: { position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontVariantNumeric: "tabular-nums", fontSize: showDetail ? 34 : 54, fontWeight: 700 },
    breathLabel: { fontSize: showDetail ? 11 : 14, letterSpacing: 3, textTransform: "uppercase", opacity: 0.55, marginTop: 2 },
    targetLabel: { fontSize: showDetail ? 11 : 13, letterSpacing: 2, textTransform: "uppercase", color: ACCENT, opacity: 0.8, marginTop: 2 },
    detailHint: { fontSize: 12, opacity: 0.4, marginBottom: 12, letterSpacing: 1 },
    ukony: { width: "100%", maxWidth: 420, background: "#241E19", borderRadius: 14, padding: "13px 18px", marginBottom: 14, boxSizing: "border-box" },
    ukonyTitle: { fontSize: 12, letterSpacing: 2, textTransform: "uppercase", opacity: 0.5, marginBottom: 8 },
    ukon: { fontSize: 15.5, padding: "5px 0", borderBottom: "1px solid #332B24", lineHeight: 1.35 },
    detailBox: {
      width: "100%",
      maxWidth: 420,
      background: "#241E19",
      borderRadius: 14,
      padding: "14px 18px",
      marginBottom: 14,
      boxSizing: "border-box",
      maxHeight: "38vh",
      overflowY: "auto",
      fontSize: 15.5,
      lineHeight: 1.55,
      whiteSpace: "pre-wrap",
      textAlign: "left",
      userSelect: "text",
    },
    controls: { display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" },
    btn: (bg, fg = "#191512") => ({ border: "none", borderRadius: 12, padding: "14px 30px", fontSize: 17, fontWeight: 700, cursor: "pointer", background: bg, color: fg }),
    bigNext: { border: "none", borderRadius: 14, padding: "16px 36px", fontSize: 18, fontWeight: 700, cursor: "pointer", background: ACCENT, color: "#191512", marginBottom: 14, width: "100%", maxWidth: 420 },
    settings: { width: "100%", maxWidth: 420, background: "#241E19", borderRadius: 14, padding: "6px 18px", marginBottom: 18, boxSizing: "border-box" },
    settingRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 0", fontSize: 15.5, cursor: "pointer" },
    toggle: (on) => ({ width: 46, height: 26, borderRadius: 13, background: on ? "#7FA98E" : "#3A322B", position: "relative", transition: "background .2s", flexShrink: 0 }),
    knob: (on) => ({ position: "absolute", top: 3, left: on ? 23 : 3, width: 20, height: 20, borderRadius: "50%", background: "#EFE6D8", transition: "left .2s" }),
    seg: (active) => ({ flex: 1, border: "none", borderRadius: 10, padding: "10px 0", fontSize: 15, fontWeight: 600, cursor: "pointer", background: active ? ACCENT : "#332B24", color: active ? "#191512" : "#8A7D6C" }),
    overlay: { position: "fixed", inset: 0, background: "rgba(15,12,10,0.9)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10 },
    modal: { background: "#241E19", borderRadius: 18, padding: "28px 26px", maxWidth: 340, width: "88%", textAlign: "center" },
    tag: (on) => ({ border: "1px solid " + (on ? "#7FA98E" : "#3A322B"), background: on ? "rgba(127,169,142,.15)" : "transparent", color: on ? "#A8CBB5" : "#8A7D6C", borderRadius: 20, padding: "8px 14px", fontSize: 14, cursor: "pointer" }),
    textarea: { width: "100%", boxSizing: "border-box", background: "#191512", border: "1px solid #3A322B", borderRadius: 10, color: "#EFE6D8", padding: 12, fontSize: 15, minHeight: 80, fontFamily: "inherit", resize: "vertical" },
    entry: { textAlign: "left", padding: "10px 0", borderBottom: "1px solid #332B24", fontSize: 14 },
  };

  const nextPhase = PHASES[phaseIdx + 1];
  const QUICK_TAGS = ["Podarilo sa rozprestrieť", "Prítomný v tele", "Zrýchlil som", "Tlak na výkon", "Kľudný záver"];

  const Toggle = ({ on, set, label }) => (
    <div style={S.settingRow} onClick={() => set(!on)}>
      <span>{label}</span>
      <div style={S.toggle(on)}>
        <div style={S.knob(on)} />
      </div>
    </div>
  );

  return (
    <div style={S.root}>
      <div style={S.header}>
        <div style={S.title}>Rekalibračný režim</div>
        <div style={S.total}>{fmt(totalElapsed)}</div>
      </div>
      <div style={S.segBar}>
        {PHASES.map((_, i) => (
          <div key={i} style={S.segItem(i < phaseIdx, i === phaseIdx && status !== "idle")} />
        ))}
      </div>

      {status === "cooldown" ? (
        <div style={{ textAlign: "center", marginTop: 70 }}>
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 10 }}>Pauza bez mobilu</div>
          <div style={{ opacity: 0.6, marginBottom: 24, maxWidth: 300 }}>Zostaň ležať. Dych. Mobil odlož – denník počká.</div>
          <div style={{ fontSize: 52, fontVariantNumeric: "tabular-nums", fontWeight: 700, color: "#B9AA93" }}>{fmt(cooldownLeft)}</div>
        </div>
      ) : status === "journal" ? (
        <div style={{ width: "100%", maxWidth: 420 }}>
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 14, textAlign: "center" }}>Denník</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14, justifyContent: "center" }}>
            {QUICK_TAGS.map((t) => (
              <button key={t} style={S.tag(tags.includes(t))} onClick={() => setTags((c) => (c.includes(t) ? c.filter((x) => x !== t) : [...c, t]))}>
                {t}
              </button>
            ))}
          </div>
          <textarea style={S.textarea} placeholder="Cítil som… / podarilo sa… / nabudúce…" value={note} onChange={(e) => setNote(e.target.value)} />
          <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 16 }}>
            <button style={S.btn("#7FA98E")} onClick={saveEntry}>Uložiť</button>
            <button style={S.btn("transparent", "#8A7D6C")} onClick={() => setStatus("done")}>Preskočiť</button>
          </div>
        </div>
      ) : status === "done" ? (
        <div style={{ textAlign: "center", marginTop: 60 }}>
          <div style={{ fontSize: 46, marginBottom: 12 }}>✓</div>
          <div style={{ fontSize: 26, fontWeight: 700, marginBottom: 8 }}>Ukončené</div>
          <div style={{ opacity: 0.6, marginBottom: 30 }}>Pozornosť telu, nie výkonu.</div>
          <button style={S.btn("#B9AA93")} onClick={reset}>Nový program</button>
        </div>
      ) : (
        <>
          <div style={S.phaseName}>{phase.name}</div>
          <div style={S.phaseStep}>
            FÁZA {phaseIdx + 1} / {PHASES.length} ·{" "}
            {isTimed ? (TEST_MODE ? "10 S" : `${speed === "fast" ? phase.fast : phase.slow} MIN`) : "PODĽA TELA"}
          </div>

          <div style={S.ringWrap} onClick={() => setShowDetail((d) => !d)} title="Klik = detail">
            <svg width={ringSize} height={ringSize} viewBox={`0 0 ${ringSize} ${ringSize}`}>
              <circle cx={ringSize / 2} cy={ringSize / 2} r={R} fill="none" stroke="#332B24" strokeWidth="12" />
              <circle
                cx={ringSize / 2}
                cy={ringSize / 2}
                r={R}
                fill="none"
                stroke={ACCENT}
                strokeWidth="12"
                strokeLinecap="round"
                strokeDasharray={C}
                strokeDashoffset={isTimed ? C * (1 - phaseFrac) : 0}
                strokeOpacity={isTimed ? 1 : 0.45}
                transform={`rotate(-90 ${ringSize / 2} ${ringSize / 2})`}
                style={{ transition: "stroke-dashoffset 1s linear" }}
              />
            </svg>
            <div style={S.ringTime}>
              {fmt(Math.max(0, phaseTime))}
              {!isTimed && <div style={S.targetLabel}>{phase.target}</div>}
              {phase.breathe && status === "running" && (
                <div style={S.breathLabel}>{breathPhase === "in" ? "Nádych" : "Výdych"}</div>
              )}
            </div>
          </div>
          <div style={S.detailHint}>{showDetail ? "klik na kruh = skryť detail" : "klik na kruh = podrobný postup"}</div>

          {!isTimed && status === "running" && (
            <button style={S.bigNext} onClick={nextOpenPhase}>
              Ďalšia fáza →
            </button>
          )}

          {showDetail ? (
            <div style={S.detailBox}>{phase.detail}</div>
          ) : (
            <div style={S.ukony}>
              <div style={S.ukonyTitle}>Úkony fázy</div>
              {phase.ukony.map((u, i) => (
                <div key={i} style={{ ...S.ukon, borderBottom: i === phase.ukony.length - 1 ? "none" : S.ukon.borderBottom }}>
                  {u}
                </div>
              ))}
            </div>
          )}

          {status === "idle" && (
            <div style={{ ...S.ukony, fontSize: 14.5, lineHeight: 1.5, opacity: 0.85 }}>
              Časovač so šiestimi fázami: pokojné dýchanie, vnímanie tela, postupné
              uvoľnenie. Niektoré fázy majú nastavené trvanie, iné pokračujú, kým sa
              sám nerozhodneš prejsť ďalej. Každý krok je dobrovoľný – môžeš ho
              upraviť, preskočiť alebo program kedykoľvek ukončiť. Cieľom nie je
              dosiahnuť konkrétny výsledok, ale venovať pozornosť vlastným pocitom
              bez časového tlaku. Číselné hodnotenia (5/10, 7/10) sú len orientačná
              sebapomôcka, nie stanovené prahy.
            </div>
          )}

          {status === "idle" && (
            <div style={S.settings}>
              <div style={{ display: "flex", gap: 8, padding: "12px 0", borderBottom: "1px solid #332B24" }}>
                <button style={S.seg(speed === "slow")} onClick={() => setSpeed("slow")}>Pomalý štandard</button>
                <button style={S.seg(speed === "fast")} onClick={() => setSpeed("fast")}>Rýchly · núdzový</button>
              </div>
              <Toggle on={manualMode} set={setManualMode} label="Potvrdzovať aj časované fázy" />
            </div>
          )}

          {status === "idle" && entries.length > 0 && (
            <div style={{ ...S.settings, padding: "12px 18px" }}>
              <div style={{ fontSize: 13, letterSpacing: 2, textTransform: "uppercase", opacity: 0.5, cursor: "pointer" }} onClick={() => setShowLog((s) => !s)}>
                Denník ({entries.length}) {showLog ? "▲" : "▼"}
              </div>
              {showLog &&
                entries.slice(0, 5).map((en, i) => (
                  <div key={i} style={S.entry}>
                    <div style={{ opacity: 0.5, fontSize: 12, marginBottom: 2 }}>
                      {en.date}
                      {en.duration ? ` · ${en.duration}` : ""}
                    </div>
                    {en.tags?.length > 0 && <div style={{ color: "#A8CBB5", marginBottom: 2 }}>{en.tags.join(" · ")}</div>}
                    {en.note && <div>{en.note}</div>}
                  </div>
                ))}
            </div>
          )}

          <div style={S.controls}>
            {status === "idle" && <button style={S.btn(ACCENT)} onClick={start}>Spustiť</button>}
            {status === "running" && <button style={S.btn("#332B24", "#EFE6D8")} onClick={pause}>Pauza</button>}
            {status === "running" && (
              <button style={S.btn("transparent", "#8A7D6C")} onClick={skipPhase}>Preskočiť fázu</button>
            )}
            {status === "paused" && <button style={S.btn(ACCENT)} onClick={resume}>Pokračovať</button>}
            {status !== "idle" && <button style={S.btn("transparent", "#8A7D6C")} onClick={reset}>Reset</button>}
          </div>
        </>
      )}

      {(status === "asking" || status === "waiting") && nextPhase && (
        <div style={S.overlay}>
          <div style={S.modal}>
            <div style={{ fontSize: 14, letterSpacing: 2, textTransform: "uppercase", opacity: 0.5, marginBottom: 6 }}>
              Fáza {phase.name} skončila
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 18 }}>
              Prejsť na fázu <span style={{ color: ACCENT }}>{nextPhase.name}</span>?
            </div>
            {status === "asking" ? (
              <div style={{ fontSize: 14, opacity: 0.6, marginBottom: 18 }}>
                Automatický posun o <b style={{ fontVariantNumeric: "tabular-nums" }}>{decideLeft}</b> s
              </div>
            ) : (
              <div style={{ fontSize: 14, opacity: 0.6, marginBottom: 18 }}>Časovač čaká. Pokračuj stlačením Áno.</div>
            )}
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <button style={S.btn(ACCENT)} onClick={advance}>Áno</button>
              {status === "asking" && (
                <button style={S.btn("#332B24", "#EFE6D8")} onClick={() => setStatus("waiting")}>Nie</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
