/* ==========================================================================
   Fjord-Fahrt – kleines Pixel-Spiel für den Hero-Bereich (optionale Erweiterung)

   Idee wie beim Google-Dino-Spiel: Du wählst eine Route, fährst mit dem Schiff
   an den schönsten Orten Skandinaviens vorbei, weichst Hindernissen aus und
   sammelst goldene Sonnensteine. Am Ende jeder Route wartet das Ziel.

   Drei Spielmodi: Entdecken (nur ausweichen), Waljagd (Harpune) und
   Seeschlacht (Kanone gegen feindliche Kriegsschiffe).

   Ohne JavaScript bleibt der Bereich ein normales Bild (siehe CSS .spiel).
   ========================================================================== */
(function () {
  "use strict";

  const canvas = document.getElementById("fjord-canvas");
  if (!canvas || !canvas.getContext) return;

  const ctx = canvas.getContext("2d");
  const rahmen = document.getElementById("fjord-spiel");
  const overlay = document.getElementById("spiel-overlay");
  const titelEl = document.getElementById("spiel-titel");
  const textEl = document.getElementById("spiel-text");
  const startBtn = document.getElementById("spiel-start");
  const linkEl = document.getElementById("spiel-link");
  const punkteEl = document.getElementById("spiel-punkte");
  const rekordEl = document.getElementById("spiel-rekord");
  const ortEl = document.getElementById("spiel-ort");

  // Interne Auflösung: klein = Pixel-Look. CSS skaliert das Canvas hoch.
  const W = 192;
  const H = 108;
  const WASSER_Y = 74;
  canvas.width = W;
  canvas.height = H;
  ctx.imageSmoothingEnabled = false;

  // Erst jetzt das Spiel sichtbar schalten (Progressive Enhancement)
  rahmen.classList.add("spiel--aktiv");

  const wenigBewegung = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Hilfsfunktionen ---------- */

  // kleiner, wiederholbarer Zufallsgenerator (gleiche Berge bei jedem Laden)
  function zufall(seed) {
    return function () {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  }

  // fester "Zufallswert" 0…1 für eine Nummer – so sieht jede Deko-Stelle immer gleich aus
  function wert(i, s) {
    const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  // ein Rechteck auf ganze Pixel gerundet zeichnen
  function px(x, y, w, h, farbe) {
    ctx.fillStyle = farbe;
    ctx.fillRect(Math.floor(x), Math.floor(y), Math.max(0, Math.floor(w)), Math.max(0, Math.floor(h)));
  }

  function kreis(cx, cy, r, farbe) {
    for (let dy = -r; dy <= r; dy++) {
      const halb = Math.floor(Math.sqrt(r * r - dy * dy));
      px(cx - halb, cy + dy, halb * 2 + 1, 1, farbe);
    }
  }

  // Sprites als Text: jedes Zeichen = 1 Pixel, Farben über eine Palette
  function sprite(zeilen, palette) {
    const c = document.createElement("canvas");
    c.width = Math.max(...zeilen.map((z) => z.length));
    c.height = zeilen.length;
    const g = c.getContext("2d");
    zeilen.forEach((zeile, y) => {
      [...zeile].forEach((zeichen, x) => {
        if (palette[zeichen]) {
          g.fillStyle = palette[zeichen];
          g.fillRect(x, y, 1, 1);
        }
      });
    });
    return c;
  }

  /* ---------- Sprites ---------- */
  const SCHIFF = sprite(
    [
      "........rr.......",
      "........kk.......",
      "....wwwwwwwww....",
      "....wbwbwbwbw....",
      "..wwwwwwwwwwwww..",
      "kkkkkkkkkkkkkkkkkk",
      ".kkkkkkkkkkkkkkkk",
      "..rrrrrrrrrrrrrr.",
    ],
    { k: "#3a1f35", r: "#e8573a", w: "#fff6ee", b: "#ffc65c" }
  );

  const HINDERNIS = {
    eis: sprite(
      ["....ww......", "...wwwc.....", "..wwwwcc....", "..wwwwwcc...", ".wwwwwwccc..", ".wwwwwwwccc.", "wwwwwwwwcccc", "llllllllllll", ".llllllllll."],
      { w: "#fffaf4", c: "#f6c9c0", l: "#c96a86" }
    ),
    fels: sprite(
      ["....gggg....", "..gggGGGgg..", ".ggGGGGGGgg.", "gggGGGGGGggg", "dddddddddddd"],
      { g: "#7a4a5e", G: "#a8707f", d: "#4a2a40" }
    ),
    boje: sprite(["..r..", ".rwr.", ".rrr.", ".www.", ".rrr.", "kkkkk"], { r: "#e8573a", w: "#fff6ee", k: "#4a2a40" }),
    kajak: sprite(
      ["....k.......", "...kyk......", ".oooooooooo.", "oooooooooooo", ".llllllllll."],
      { k: "#3a1f35", y: "#ffc65c", o: "#ff8a5c", l: "#c96a86" }
    ),
  };

  // Wal schwimmt nach links (Kopf links, Schwanzflosse rechts)
  const WAL = sprite(
    [
      "........bbbbbbb.......",
      "....bbbbbbbbbbbbbb..tt",
      "..bbbbbbbbbbbbbbbbbbt.",
      ".bwbbbbbbbbbbbbbbbbbbt",
      "bbbbbbbbbbbbbbbbbbbbtt",
      ".llllllllllllbbbbb....",
      "..llllllll............",
    ],
    { b: "#4f4f78", t: "#3f3f66", l: "#e6dcea", w: "#fff6ee" }
  );

  // feindliches Kriegsschiff (ohne Flagge), Bug zeigt nach links
  const FEIND = sprite(
    [
      "..........kk............",
      "..........gg............",
      "......ggggggggg.........",
      "kkgg..gGGwGGwGgg..ggg...",
      "ggggggggggggggggggggggg.",
      ".DDDDDDDDDDDDDDDDDDDDDD.",
      "..DDDDDDDDDDDDDDDDDDDD..",
      "...rrrrrrrrrrrrrrrrrr...",
    ],
    { g: "#9a96a6", G: "#7a7688", w: "#ffe09a", D: "#55516a", r: "#a04848", k: "#3a1f35" }
  );

  const SONNENSTEIN = sprite(["..a..", ".aAa.", "aAAAa", ".aAa.", "..a.."], { a: "#d9731f", A: "#fff1b8" });

  /* ---------- Bausteine für die Landschaft ---------- */
  function giebelhaus(x, boden, w, h, wand, dach, fenster) {
    px(x, boden - h, w, h, wand);
    const halb = Math.ceil(w / 2);
    for (let i = 0; i < halb; i++) {
      const k = halb - 1 - i;
      px(x + k, boden - h - halb + i, w - 2 * k, 1, dach);
    }
    for (let fy = boden - h + 2; fy < boden - 2; fy += 4) {
      for (let fx = x + 2; fx < x + w - 2; fx += 3) px(fx, fy, 1, 2, fenster);
    }
  }

  function tanne(x, boden, h, farbe, schnee) {
    px(x, boden - 2, 1, 2, "#5a3a2a");
    for (let i = 0; i < h; i++) {
      const halb = Math.floor((h - i) / 2.2);
      px(x - halb, boden - 2 - i, halb * 2 + 1, 1, farbe);
      if (schnee && i % 3 === 0 && halb > 0) {
        px(x - halb, boden - 2 - i, 1, 1, schnee);
        px(x + halb, boden - 2 - i, 1, 1, schnee);
      }
    }
  }

  function spitze(x, boden, hoehe, steil, farbe, schatten, schnee, schneeTiefe) {
    const halb = Math.floor(hoehe / steil);
    for (let k = -halb; k <= halb; k++) {
      const h = Math.floor(hoehe - Math.abs(k) * steil);
      if (h <= 0) continue;
      px(x + k, boden - h, 1, h, k < 0 ? farbe : schatten);
      if (schnee) px(x + k, boden - h, 1, Math.min(h, schneeTiefe - Math.floor(Math.abs(k) * 0.3)), schnee);
    }
  }

  function zielflagge(x, boden, t) {
    px(x, boden - 16, 1, 16, "#3a1f35");
    const wehen = Math.round(Math.sin(t * 6));
    for (let fy = 0; fy < 4; fy++) {
      for (let fx = 0; fx < 6; fx++) {
        px(x + 1 + fx, boden - 16 + fy + (fx > 2 ? wehen : 0), 1, 1, (fx + fy) % 2 ? "#3a1f35" : "#fff6ee");
      }
    }
  }

  function steg(x, boden, breite) {
    px(x, boden, breite, 1, "#6a4a3a");
    for (let k = 0; k < breite; k += 4) px(x + k, boden + 1, 1, 3, "#4a3030");
  }

  /* ---------- Die Routen ----------
     Jede Route hat eigene Farben, Berge, Deko am Ufer und Sehenswürdigkeiten.
     "bei" = Position entlang der Strecke, "breite" = Breite in Pixeln. */
  const ROUTEN = [
    {
      id: "geiranger",
      name: "Geirangerfjord",
      text: "Steile Felswände, Wasserfälle und Bergbauernhöfe – Norwegens berühmtester Fjord.",
      reise: "reisen.html#geiranger",
      himmel: ["#e46f8c", "#f4857a", "#fc9f6c", "#ffbf72", "#ffe09a"],
      sonne: { x: 132, y: 50, r: 17 },
      wolke: ["#f6a1b4", "#ffd2c2"],
      berge: [
        { seed: 3, basis: 16, max: 16, steil: 0.8, farbe: "#c96c8b", schnee: "#ffd9c8", tempo: 0.35 },
        { seed: 11, basis: 22, max: 22, steil: 1.5, farbe: "#83426b", schnee: null, tempo: 0.7 },
      ],
      wasser: ["#f59c7e", "#dc768a", "#bb5e84"],
      wellen: ["#ffe09a", "#f7b2b7"],
      hindernisse: ["fels", "fels", "eis"],
      laenge: 2000,
      deko: {
        abstand: 46,
        zeichne(x, i, t) {
          if (wert(i, 1) < 0.55) {
            // kleiner Bergbauernhof auf einem Felsvorsprung
            const y = WASSER_Y - 12 - Math.floor(wert(i, 2) * 10);
            px(x, y, 14, 2, "#9bb86a");
            giebelhaus(x + 2, y, 5, 4, "#c4473a", "#4a2a30", "#fff6ee");
            giebelhaus(x + 8, y, 4, 3, "#fff6ee", "#4a2a30", "#c4473a");
          } else {
            // schmaler Wasserfall
            for (let y = WASSER_Y - 26; y < WASSER_Y; y++) {
              px(x + 6, y, 1, 1, (y + Math.floor(t * 12)) % 3 ? "#fff6ee" : "#f7c6d0");
            }
          }
        },
      },
      orte: [
        {
          name: "Sieben Schwestern",
          bei: 380,
          breite: 46,
          zeichne(x, t) {
            for (let k = 0; k < 46; k++) {
              const h = 40 - Math.floor(Math.abs(k - 23) * 0.5);
              px(x + k, WASSER_Y - h, 1, h, k < 23 ? "#7a3d64" : "#6a3158");
            }
            for (let s = 0; s < 7; s++) {
              const sx = x + 5 + s * 6;
              for (let y = WASSER_Y - 34 + (s % 2) * 3; y < WASSER_Y; y++) {
                px(sx, y, 1, 1, (y + s + Math.floor(t * 14)) % 3 ? "#fff6ee" : "#ffd8e0");
              }
              px(sx - 1, WASSER_Y - 1, 3, 1, "#fff6ee");
            }
          },
        },
        {
          name: "Aussichtspunkt Dalsnibba",
          bei: 1150,
          breite: 60,
          zeichne(x, t) {
            spitze(x + 30, WASSER_Y, 56, 1.9, "#b25a80", "#9a4a70", "#ffe8dc", 12);
            px(x + 27, WASSER_Y - 57, 7, 1, "#3a1f35");
            px(x + 33, WASSER_Y - 63, 1, 6, "#3a1f35");
            px(x + 34, WASSER_Y - 63, 3, 2, "#e8573a");
          },
        },
        {
          name: "Ziel: Hafen Geiranger",
          bei: 2000,
          breite: 56,
          ziel: true,
          zeichne(x, t) {
            px(x, WASSER_Y - 3, 56, 3, "#9bb86a");
            giebelhaus(x + 4, WASSER_Y - 2, 9, 7, "#fff6ee", "#c4473a", "#7a4a5e");
            giebelhaus(x + 15, WASSER_Y - 2, 8, 6, "#c4473a", "#4a2a30", "#fff6ee");
            // weiße Kirche mit Turm
            px(x + 27, WASSER_Y - 10, 10, 8, "#fff6ee");
            px(x + 30, WASSER_Y - 16, 4, 6, "#fff6ee");
            px(x + 31, WASSER_Y - 20, 2, 4, "#4a2a30");
            steg(x + 38, WASSER_Y, 14);
            zielflagge(x + 50, WASSER_Y, t);
          },
        },
      ],
    },
    {
      id: "lofoten",
      name: "Lofoten",
      text: "Mitternachtssonne, türkises Meer und rote Fischerhütten vor spitzen Gipfeln.",
      reise: "reisen.html#lofoten",
      himmel: ["#ff9fa0", "#ffb89a", "#ffd2a0", "#fff0c4"],
      sonne: { x: 58, y: 30, r: 12 },
      wolke: ["#ffc8c0", "#fff4e4"],
      berge: [
        { seed: 21, basis: 20, max: 18, steil: 1.4, farbe: "#b49ab8", schnee: "#fff6f2", tempo: 0.35 },
        { seed: 23, basis: 14, max: 22, steil: 1.9, farbe: "#7a7092", schnee: "#fff6f2", tempo: 0.7 },
      ],
      wasser: ["#86d0cf", "#5db3bf", "#4a95ad"],
      wellen: ["#fff3c4", "#d8f4f0"],
      hindernisse: ["fels", "boje", "boje"],
      laenge: 2000,
      deko: {
        abstand: 32,
        zeichne(x, i) {
          px(x - 2, WASSER_Y - 2, 32, 2, "#6aa86a");
          if (wert(i, 4) < 0.7) {
            // Rorbu: Fischerhütte auf Stelzen
            const farbe = wert(i, 5) < 0.7 ? "#c4473a" : "#e8a73a";
            giebelhaus(x + 2, WASSER_Y - 2, 9, 6, farbe, "#3a2a30", "#fff6ee");
            px(x + 3, WASSER_Y - 2, 1, 4, "#4a3030");
            px(x + 9, WASSER_Y - 2, 1, 4, "#4a3030");
          } else {
            // Stockfisch-Gestell
            px(x + 2, WASSER_Y - 7, 16, 1, "#7a5a40");
            for (let k = 2; k < 18; k += 5) px(x + k, WASSER_Y - 7, 1, 5, "#7a5a40");
            for (let k = 3; k < 17; k += 2) px(x + k, WASSER_Y - 6, 1, 2, "#e8d8b8");
          }
        },
      },
      orte: [
        {
          name: "Reine",
          bei: 380,
          breite: 64,
          zeichne(x) {
            spitze(x + 32, WASSER_Y, 50, 2.2, "#8a80a2", "#6e6688", "#ffffff", 14);
            px(x, WASSER_Y - 2, 64, 2, "#6aa86a");
            for (let k = 0; k < 5; k++) {
              giebelhaus(x + 4 + k * 11, WASSER_Y - 2, 9, 6, "#c4473a", "#3a2a30", "#fff6ee");
            }
            px(x + 30, WASSER_Y - 12, 6, 6, "#fff6ee");
            px(x + 32, WASSER_Y - 16, 2, 4, "#fff6ee");
          },
        },
        {
          name: "Fußballplatz Henningsvær",
          bei: 1150,
          breite: 44,
          zeichne(x) {
            for (let k = 0; k < 44; k++) {
              const h = 7 - Math.floor(Math.abs(k - 22) / 4);
              px(x + k, WASSER_Y - h, 1, h, k < 22 ? "#a89aa8" : "#8a7a8e");
            }
            px(x + 8, WASSER_Y - 9, 28, 4, "#6abf5a");
            px(x + 8, WASSER_Y - 9, 28, 1, "#fff6ee");
            px(x + 21, WASSER_Y - 9, 1, 4, "#fff6ee");
            px(x + 7, WASSER_Y - 11, 1, 3, "#fff6ee");
            px(x + 36, WASSER_Y - 11, 1, 3, "#fff6ee");
          },
        },
        {
          name: "Ziel: Å i Lofoten",
          bei: 2000,
          breite: 48,
          ziel: true,
          zeichne(x, t) {
            px(x, WASSER_Y - 2, 48, 2, "#6aa86a");
            giebelhaus(x + 3, WASSER_Y - 2, 9, 7, "#c4473a", "#3a2a30", "#fff6ee");
            giebelhaus(x + 14, WASSER_Y - 2, 9, 6, "#e8a73a", "#3a2a30", "#fff6ee");
            steg(x + 25, WASSER_Y, 14);
            zielflagge(x + 42, WASSER_Y, t);
          },
        },
      ],
    },
    {
      id: "schaeren",
      name: "Stockholmer Schären",
      text: "Tausende Inseln mit roten Holzhäusern, Kiefern und goldenem Abendlicht.",
      reise: "reisen.html#stockholm",
      himmel: ["#f59a82", "#ffb882", "#ffd59a", "#fff0c8"],
      sonne: { x: 150, y: 58, r: 14 },
      wolke: ["#ffc0a8", "#fff0dc"],
      berge: [
        { seed: 31, basis: 4, max: 6, steil: 0.3, farbe: "#dba092", schnee: null, tempo: 0.35 },
        { seed: 33, basis: 3, max: 5, steil: 0.25, farbe: "#b87a78", schnee: null, tempo: 0.7 },
      ],
      wasser: ["#f4b58c", "#e0937f", "#c87a7e"],
      wellen: ["#ffe09a", "#ffd8c8"],
      hindernisse: ["fels", "fels", "kajak"],
      laenge: 2000,
      deko: {
        abstand: 40,
        zeichne(x, i) {
          // Schäreninsel: flacher, rundgeschliffener Granitfelsen
          const breite = 20 + Math.floor(wert(i, 6) * 12);
          for (let k = 0; k < breite; k++) {
            const h = Math.max(1, Math.floor(6 - Math.abs(k - breite / 2) / (breite / 12)));
            px(x + k, WASSER_Y - h, 1, h, k < breite / 2 ? "#c99a8e" : "#a87a78");
          }
          const n = 1 + Math.floor(wert(i, 7) * 3);
          for (let k = 0; k < n; k++) tanne(x + 4 + k * 5, WASSER_Y - 4, 7 + (k % 2) * 3, "#5a5a48", null);
          if (wert(i, 8) < 0.5) {
            giebelhaus(x + breite - 10, WASSER_Y - 4, 7, 5, "#b8402f", "#3a2a30", "#fff6ee");
          }
        },
      },
      orte: [
        {
          name: "Festung Vaxholm",
          bei: 380,
          breite: 40,
          zeichne(x, t) {
            px(x, WASSER_Y - 4, 40, 4, "#a87a78");
            px(x + 8, WASSER_Y - 18, 24, 14, "#d8c8b8");
            px(x + 20, WASSER_Y - 18, 12, 14, "#c0ae9e");
            for (let k = 0; k < 24; k += 3) px(x + 8 + k, WASSER_Y - 20, 2, 2, "#d8c8b8");
            for (let k = 11; k < 30; k += 6) px(x + k, WASSER_Y - 13, 2, 3, "#5a3a4a");
            px(x + 20, WASSER_Y - 28, 1, 8, "#3a1f35");
            px(x + 21, WASSER_Y - 28, 5, 3, "#3f7ac0");
            px(x + 21, WASSER_Y - 27, 5, 1, "#ffc65c");
          },
        },
        {
          name: "Gamla Stan",
          bei: 1150,
          breite: 70,
          zeichne(x) {
            const farben = ["#e0a050", "#c8603f", "#f0c070", "#b0503a", "#d88a4a"];
            for (let k = 0; k < 10; k++) {
              const h = 10 + Math.floor(wert(k, 9) * 9);
              px(x + k * 7, WASSER_Y - h, 7, h, farben[k % 5]);
              for (let fy = WASSER_Y - h + 2; fy < WASSER_Y - 2; fy += 3) px(x + k * 7 + 2, fy, 1, 1, "#fff3c4");
            }
            // Kirchturm Riddarholmen (spitz) und Turm mit grüner Kupferkuppel
            px(x + 18, WASSER_Y - 26, 5, 12, "#7a4a4a");
            for (let k = 0; k < 10; k++) px(x + 20 - Math.floor(k / 4), WASSER_Y - 36 + k, 1 + 2 * Math.floor(k / 4), 1, "#4a3a4a");
            px(x + 50, WASSER_Y - 24, 6, 10, "#c8603f");
            px(x + 49, WASSER_Y - 27, 8, 3, "#6fae9a");
            px(x + 52, WASSER_Y - 30, 2, 3, "#ffc65c");
          },
        },
        {
          name: "Ziel: Stockholm",
          bei: 2000,
          breite: 50,
          ziel: true,
          zeichne(x, t) {
            px(x, WASSER_Y - 3, 50, 3, "#a87a78");
            giebelhaus(x + 3, WASSER_Y - 3, 9, 8, "#e0a050", "#7a3a2a", "#fff3c4");
            giebelhaus(x + 13, WASSER_Y - 3, 9, 10, "#c8603f", "#5a2a2a", "#fff3c4");
            steg(x + 24, WASSER_Y, 18);
            zielflagge(x + 44, WASSER_Y, t);
          },
        },
      ],
    },
    {
      id: "kopenhagen",
      name: "Kopenhagens Kanäle",
      text: "Bunte Giebelhäuser, Paläste und das Hafenviertel Nyhavn – Dänemark vom Wasser aus.",
      reise: "reisen.html#kopenhagen",
      himmel: ["#f08a9a", "#f8a888", "#ffc890", "#ffe6b0"],
      sonne: { x: 40, y: 48, r: 14 },
      wolke: ["#f7b0b8", "#fff0e0"],
      berge: [{ seed: 41, basis: 3, max: 4, steil: 0.4, farbe: "#d890a4", schnee: null, tempo: 0.35 }],
      wasser: ["#e9a08e", "#c98494", "#a8708f"],
      wellen: ["#ffe09a", "#f7c6d0"],
      hindernisse: ["boje", "kajak", "kajak"],
      laenge: 2000,
      deko: {
        abstand: 11,
        zeichne(x, i) {
          const farben = ["#e8574a", "#f2b134", "#5b9fd8", "#f28c3c", "#5bb36b", "#efe2c4", "#d45f8c", "#f2d34a", "#4cb3b0"];
          const h = 9 + Math.floor(wert(i, 10) * 9);
          giebelhaus(x, WASSER_Y - 2, 11, h, farben[Math.floor(wert(i, 11) * farben.length)], "#6a3328", "#fff6ee");
          px(x, WASSER_Y - 2, 11, 2, "#8a7a8a");
        },
      },
      orte: [
        {
          name: "Kopenhagener Oper",
          bei: 380,
          breite: 58,
          zeichne(x) {
            px(x, WASSER_Y - 2, 58, 2, "#8a7a8a");
            px(x + 8, WASSER_Y - 14, 40, 12, "#7a5a7a");
            for (let fx = x + 10; fx < x + 46; fx += 3) {
              for (let fy = WASSER_Y - 12; fy < WASSER_Y - 3; fy += 3) px(fx, fy, 1, 1, "#ffc65c");
            }
            px(x, WASSER_Y - 17, 58, 3, "#f6eee8");
            px(x + 16, WASSER_Y - 21, 26, 4, "#e8dcd6");
          },
        },
        {
          name: "Schloss Christiansborg",
          bei: 1150,
          breite: 52,
          zeichne(x) {
            px(x, WASSER_Y - 2, 52, 2, "#8a7a8a");
            px(x + 2, WASSER_Y - 14, 48, 12, "#ecdcc4");
            px(x + 2, WASSER_Y - 17, 48, 3, "#6fae9a");
            for (let fx = x + 4; fx < x + 48; fx += 4) px(fx, WASSER_Y - 11, 2, 3, "#7a5a6a");
            px(x + 22, WASSER_Y - 32, 8, 18, "#ecdcc4");
            px(x + 23, WASSER_Y - 38, 6, 6, "#6fae9a");
            px(x + 25, WASSER_Y - 42, 2, 4, "#6fae9a");
            px(x + 24, WASSER_Y - 44, 4, 2, "#ffc65c");
          },
        },
        {
          name: "Ziel: Nyhavn",
          bei: 2000,
          breite: 60,
          ziel: true,
          zeichne(x, t) {
            const farben = ["#e8574a", "#f2b134", "#5b9fd8", "#f28c3c", "#d45f8c"];
            for (let k = 0; k < 5; k++) giebelhaus(x + k * 10, WASSER_Y - 2, 10, 16 + (k % 2) * 3, farben[k], "#6a3328", "#fff6ee");
            px(x, WASSER_Y - 2, 60, 2, "#8a7a8a");
            // zwei alte Segelschiffe mit Masten
            for (const m of [12, 34]) {
              px(x + m - 5, WASSER_Y + 1, 12, 2, "#8a4b2a");
              px(x + m, WASSER_Y - 22, 1, 23, "#4a3528");
              px(x + m - 4, WASSER_Y - 18, 9, 1, "#4a3528");
            }
            zielflagge(x + 54, WASSER_Y - 2, t);
          },
        },
      ],
    },
    {
      id: "lappland",
      name: "Inarisee, Lappland",
      text: "Rosa Polardämmerung, sanftes Nordlicht, Rentiere und Saunahütten am Ufer.",
      reise: "reisen.html#lappland",
      himmel: ["#6a3a78", "#a2508a", "#e07a8e", "#ffb47e"],
      sonne: null,
      nordlicht: true,
      wolke: ["#c8708e", "#f0a0b0"],
      berge: [
        { seed: 51, basis: 7, max: 8, steil: 0.35, farbe: "#8a4a78", schnee: "#f8d6e0", tempo: 0.35 },
        { seed: 53, basis: 3, max: 5, steil: 0.3, farbe: "#f3d9de", schnee: null, tempo: 0.7 },
      ],
      wasser: ["#d9a8c4", "#b88ab4", "#9a76a6"],
      wellen: ["#fff6f2", "#f3c6dc"],
      hindernisse: ["eis", "eis", "eis"],
      laenge: 2000,
      deko: {
        abstand: 26,
        zeichne(x, i) {
          px(x - 1, WASSER_Y - 3, 28, 3, "#fff4f2");
          const n = 1 + Math.floor(wert(i, 12) * 3);
          for (let k = 0; k < n; k++) tanne(x + 4 + k * 7, WASSER_Y - 3, 9 + Math.floor(wert(i + k, 13) * 6), "#5a4a6a", "#fff6f2");
          if (wert(i, 14) < 0.25) giebelhaus(x + 16, WASSER_Y - 3, 8, 5, "#b8402f", "#fff6f2", "#ffc65c");
        },
      },
      orte: [
        {
          name: "Rentierherde",
          bei: 380,
          breite: 44,
          zeichne(x, t) {
            px(x, WASSER_Y - 3, 44, 3, "#fff4f2");
            for (let k = 0; k < 4; k++) {
              const rx = x + 4 + k * 10;
              const ry = WASSER_Y - 3;
              const nick = (Math.floor(t * 2) + k) % 3 === 0 ? 1 : 0;
              px(rx, ry - 4, 6, 2, "#7a5a4a");
              px(rx, ry - 2, 1, 2, "#5a3a3a");
              px(rx + 5, ry - 2, 1, 2, "#5a3a3a");
              px(rx + 6, ry - 6 + nick, 2, 2, "#7a5a4a");
              px(rx + 6, ry - 9 + nick, 1, 3, "#c8a080");
              px(rx + 8, ry - 9 + nick, 1, 2, "#c8a080");
            }
          },
        },
        {
          name: "Sauna am See",
          bei: 1150,
          breite: 34,
          zeichne(x, t) {
            px(x, WASSER_Y - 3, 34, 3, "#fff4f2");
            giebelhaus(x + 4, WASSER_Y - 3, 12, 8, "#8a4a3a", "#fff6f2", "#ffc65c");
            px(x + 12, WASSER_Y - 18, 2, 5, "#4a3030");
            for (let k = 0; k < 5; k++) {
              const dy = (t * 6 + k * 3) % 14;
              px(x + 12 + Math.round(Math.sin(t + k) * 2), WASSER_Y - 19 - dy, 2, 1, "#fff6f2");
            }
            steg(x + 18, WASSER_Y, 12);
          },
        },
        {
          name: "Ziel: Nordlicht-Camp",
          bei: 2000,
          breite: 50,
          ziel: true,
          zeichne(x, t) {
            px(x, WASSER_Y - 3, 50, 3, "#fff4f2");
            for (const k of [4, 20]) {
              for (let i = 0; i < 10; i++) px(x + k + 6 - Math.floor(i * 0.6), WASSER_Y - 13 + i, 1 + Math.floor(i * 1.2), 1, "#c8a080");
              px(x + k + 5, WASSER_Y - 6, 3, 3, Math.sin(t * 8 + k) > 0 ? "#ffc65c" : "#ff8a5c");
            }
            px(x + 37, WASSER_Y - 5, 3, 2, Math.sin(t * 10) > 0 ? "#ffc65c" : "#e8573a");
            zielflagge(x + 44, WASSER_Y - 3, t);
          },
        },
      ],
    },
  ];

  /* ---------- Hintergrund pro Route vorberechnen ---------- */
  const BAYER = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
  ];

  function himmelBild(farben) {
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const g = c.getContext("2d");
    for (let y = 0; y < WASSER_Y; y++) {
      const p = (y / (WASSER_Y - 1)) * (farben.length - 1);
      const i = Math.min(Math.floor(p), farben.length - 2);
      const t = p - i;
      for (let x = 0; x < W; x++) {
        // geordnetes Dithering = typischer Pixel-Art-Farbverlauf
        const schwelle = (BAYER[y % 4][x % 4] + 0.5) / 16;
        g.fillStyle = t > schwelle ? farben[i + 1] : farben[i];
        g.fillRect(x, y, 1, 1);
      }
    }
    return c;
  }

  // Bergkämme als Höhenwerte; doppelte Breite, damit sie endlos scrollen
  function bergkamm(seed, basis, maxH, steil) {
    const r = zufall(seed);
    const laenge = W * 2;
    const gipfel = [];
    for (let x = 0; x < laenge; x += 18 + Math.floor(r() * 22)) gipfel.push({ x: x, h: basis + r() * maxH });
    const hoehe = new Array(laenge).fill(0);
    for (let x = 0; x < laenge; x++) {
      let best = 0;
      for (const p of gipfel) {
        const d = Math.min(Math.abs(x - p.x), laenge - Math.abs(x - p.x));
        best = Math.max(best, p.h - d * steil);
      }
      hoehe[x] = Math.floor(best + (r() < 0.2 ? 1 : 0));
    }
    return hoehe;
  }

  ROUTEN.forEach(function (route) {
    route.himmelBild = himmelBild(route.himmel);
    route.berge.forEach((b) => (b.hoehe = bergkamm(b.seed, b.basis, b.max, b.steil)));
    const r = zufall(route.id.length * 13);
    route.wolken = [];
    for (let i = 0; i < 6; i++) {
      route.wolken.push({ x: r() * W * 1.5, y: 6 + Math.floor(r() * 34), w: 14 + Math.floor(r() * 24), tempo: 0.05 + r() * 0.08 });
    }
    route.sterne = [];
    for (let i = 0; i < 30; i++) route.sterne.push({ x: Math.floor(r() * W), y: Math.floor(r() * 30), p: r() * 6 });
  });

  /* ---------- Spielmodi ---------- */
  const MODI = {
    entdecken: { name: "Entdecken", text: null, hindernisFaktor: 1 },
    waljagd: {
      name: "Waljagd",
      text: "Wale tauchen auf und ab – triff sie mit der Harpune, wenn sie oben sind!",
      hindernisFaktor: 1.6,
    },
    seeschlacht: {
      name: "Seeschlacht",
      text: "Feindliche Kriegsschiffe greifen an. Versenke sie, bevor sie dich treffen!",
      hindernisFaktor: 1.7,
    },
  };
  let modus = "entdecken";

  /* ---------- Spielzustand ---------- */
  let rekord = 0;
  try {
    rekord = parseInt(localStorage.getItem("fjord-rekord") || "0", 10) || 0;
  } catch (e) {
    rekord = 0;
  }
  rekordEl.textContent = rekord;

  const tasten = { hoch: false, runter: false, links: false, rechts: false };
  let route = ROUTEN[0];
  let zustand = "bereit"; // bereit | laeuft | pause | vorbei | ziel
  let schiff, hindernisse, steine, wellen, punkte, strecke, tempo, spawnTimer, steinTimer;
  let geschosse, wale, feinde, feindGeschosse, effekte, walTimer, feindTimer, nachladen;
  let fingerZiel = null; // Zielpunkt bei Finger-Steuerung
  let wackeln = 0; // Bildschirm-Wackeln nach einer großen Explosion
  let zeit = 0;
  let vorschau = 0; // im Menü fährt die Kamera langsam die Route ab

  function neuesSpiel() {
    schiff = { x: 20, y: 86, w: 18, h: 8 };
    hindernisse = [];
    steine = [];
    punkte = 0;
    strecke = 0;
    tempo = 38;
    spawnTimer = 1.4;
    steinTimer = 2.5;
    wellen = [];
    const r = zufall(99);
    for (let i = 0; i < 26; i++) {
      wellen.push({ x: r() * W, y: WASSER_Y + 2 + Math.floor(r() * (H - WASSER_Y - 3)), w: 2 + Math.floor(r() * 5) });
    }
    geschosse = [];
    wale = [];
    feinde = [];
    feindGeschosse = [];
    effekte = [];
    walTimer = 1.5;
    wackeln = 0;
    feindTimer = 2;
    nachladen = 0;
    punkteEl.textContent = "0";
  }
  neuesSpiel();

  // "Versatz" = wie weit die Landschaft gescrollt ist
  function versatz() {
    return zustand === "bereit" ? vorschau : strecke * 0.6;
  }

  function zeigeOverlay(titel, text, knopf, mitLink) {
    titelEl.textContent = titel;
    textEl.textContent = text;
    startBtn.textContent = knopf;
    linkEl.hidden = !mitLink;
    linkEl.href = route.reise;
    overlay.hidden = false;
  }

  function menue() {
    zustand = "bereit";
    vorschau = 220; // Vorschau startet kurz vor der ersten Sehenswürdigkeit
    neuesSpiel();
    const m = MODI[modus];
    const titel = modus === "entdecken" ? "Route: " + route.name : m.name + ": " + route.name;
    zeigeOverlay(titel, m.text || route.text, "Losfahren", false);
  }

  function starten() {
    if (zustand === "vorbei" || zustand === "bereit" || zustand === "ziel") neuesSpiel();
    zustand = "laeuft";
    overlay.hidden = true;
    canvas.focus({ preventScroll: true });
  }

  function speichereRekord() {
    const p = Math.floor(punkte);
    if (p > rekord) {
      rekord = p;
      rekordEl.textContent = rekord;
      try {
        localStorage.setItem("fjord-rekord", String(rekord));
      } catch (e) {
        /* Speichern nicht möglich – egal */
      }
    }
    return p;
  }

  function spielVorbei(titel) {
    zustand = "vorbei";
    const p = speichereRekord();
    zeigeOverlay(titel || "Kollision!", "Du hast " + p + " Punkte auf der Route " + route.name + " erreicht.", "Nochmal fahren", false);
  }

  function zielErreicht() {
    punkte += 200;
    zustand = "ziel";
    const p = speichereRekord();
    punkteEl.textContent = p;
    zeigeOverlay("Ziel erreicht!", "Du hast " + route.name + " erkundet – " + p + " Punkte.", "Nochmal fahren", true);
  }

  function schiessen() {
    if (modus === "entdecken" || zustand !== "laeuft" || nachladen > 0) return;
    const harpune = modus === "waljagd";
    geschosse.push({ x: schiff.x + 17, y: schiff.y + (harpune ? 6 : 3), w: harpune ? 8 : 2, h: harpune ? 1 : 2, harpune: harpune });
    nachladen = harpune ? 0.45 : 0.35;
    effekte.push({ art: "blitz", x: schiff.x + 18, y: schiff.y + 3, t: 0 });
  }

  function pausieren() {
    if (zustand !== "laeuft") return;
    zustand = "pause";
    zeigeOverlay("Pause", "Klicke ins Spiel oder drücke den Knopf, um weiterzufahren.", "Weiterfahren", false);
  }

  /* ---------- Eingabe: Tastatur ---------- */
  const TASTEN = { ArrowUp: "hoch", ArrowDown: "runter", ArrowLeft: "links", ArrowRight: "rechts" };

  // Tasten nur abfangen, wenn das Spiel den Fokus hat – sonst scrollt die Seite normal
  canvas.addEventListener("keydown", function (e) {
    if (TASTEN[e.key]) {
      e.preventDefault();
      tasten[TASTEN[e.key]] = true;
      if (zustand !== "laeuft") starten();
    } else if (e.key === " ") {
      e.preventDefault();
      if (zustand === "laeuft") schiessen();
      else starten();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (zustand !== "laeuft") starten();
    } else if (e.key === "Escape") {
      pausieren();
    }
  });

  canvas.addEventListener("keyup", function (e) {
    if (TASTEN[e.key]) tasten[TASTEN[e.key]] = false;
  });

  canvas.addEventListener("blur", function (e) {
    // Tippen auf die Touch-Knöpfe soll das Spiel nicht pausieren
    if (e.relatedTarget && steuerung.contains(e.relatedTarget)) return;
    Object.keys(tasten).forEach((k) => (tasten[k] = false));
    pausieren();
  });

  // Finger-Steuerung: Das Schiff fährt dorthin, wo der Finger ist
  function canvasPunkt(e) {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  }
  canvas.addEventListener("pointerdown", function (e) {
    if (zustand !== "laeuft") starten();
    if (e.pointerType !== "mouse") {
      fingerZiel = canvasPunkt(e);
      canvas.setPointerCapture(e.pointerId);
    }
  });
  canvas.addEventListener("pointermove", function (e) {
    if (fingerZiel) fingerZiel = canvasPunkt(e);
  });
  ["pointerup", "pointercancel"].forEach((typ) => canvas.addEventListener(typ, () => (fingerZiel = null)));

  startBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    starten();
  });
  linkEl.addEventListener("click", (e) => e.stopPropagation());
  overlay.addEventListener("click", starten);

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) pausieren();
  });

  /* ---------- Routenauswahl (Knöpfe unter dem Spiel) ---------- */
  const auswahl = document.createElement("div");
  auswahl.className = "spiel__routen";
  auswahl.setAttribute("role", "group");
  auswahl.setAttribute("aria-label", "Route für die Fjord-Fahrt wählen");
  const beschriftung = document.createElement("span");
  beschriftung.className = "spiel__routen-titel";
  beschriftung.textContent = "Route wählen:";
  auswahl.appendChild(beschriftung);

  const routenKnoepfe = ROUTEN.map(function (r) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = r.name;
    b.setAttribute("aria-pressed", r === route ? "true" : "false");
    b.addEventListener("click", function () {
      route = r;
      routenKnoepfe.forEach((k) => k.setAttribute("aria-pressed", k === b ? "true" : "false"));
      menue();
    });
    auswahl.appendChild(b);
    return b;
  });
  rahmen.insertAdjacentElement("afterend", auswahl);

  /* ---------- Modus-Auswahl ---------- */
  const modusWahl = document.createElement("div");
  modusWahl.className = "spiel__routen";
  modusWahl.setAttribute("role", "group");
  modusWahl.setAttribute("aria-label", "Spielmodus wählen");
  const modusTitel = document.createElement("span");
  modusTitel.className = "spiel__routen-titel";
  modusTitel.textContent = "Spielmodus:";
  modusWahl.appendChild(modusTitel);

  const modusKnoepfe = Object.keys(MODI).map(function (id) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = MODI[id].name;
    b.setAttribute("aria-pressed", id === modus ? "true" : "false");
    b.addEventListener("click", function () {
      modus = id;
      modusKnoepfe.forEach((k) => k.setAttribute("aria-pressed", k === b ? "true" : "false"));
      feuerKnopf.hidden = modus === "entdecken";
      steuerung.classList.toggle("spiel__steuerung--feuer", modus !== "entdecken");
      menue();
    });
    modusWahl.appendChild(b);
    return b;
  });

  /* ---------- Eingabe: Touch-Knöpfe ---------- */
  const steuerung = document.createElement("div");
  steuerung.className = "spiel__steuerung";
  steuerung.setAttribute("aria-hidden", "true"); // Tastatur-Nutzer haben die Pfeiltasten
  [
    ["links", "←"],
    ["hoch", "↑"],
    ["runter", "↓"],
    ["rechts", "→"],
  ].forEach(function ([richtung, zeichen]) {
    const b = document.createElement("button");
    b.type = "button";
    b.tabIndex = -1;
    b.textContent = zeichen;
    const an = function (e) {
      e.preventDefault();
      tasten[richtung] = true;
      if (zustand !== "laeuft") starten();
    };
    const aus = function () {
      tasten[richtung] = false;
    };
    b.addEventListener("pointerdown", an);
    b.addEventListener("pointerup", aus);
    b.addEventListener("pointerleave", aus);
    b.addEventListener("pointercancel", aus);
    steuerung.appendChild(b);
  });

  // Feuer-Knopf (nur bei Waljagd und Seeschlacht sichtbar)
  const feuerKnopf = document.createElement("button");
  feuerKnopf.type = "button";
  feuerKnopf.tabIndex = -1;
  feuerKnopf.className = "spiel__feuer";
  feuerKnopf.textContent = "Feuer";
  feuerKnopf.hidden = true;
  feuerKnopf.addEventListener("pointerdown", function (e) {
    e.preventDefault();
    if (zustand === "laeuft") schiessen();
    else starten();
  });
  steuerung.appendChild(feuerKnopf);

  rahmen.insertAdjacentElement("afterend", steuerung);
  // Reihenfolge im HTML: Spiel → Touch-Knöpfe → Modus → Route
  steuerung.insertAdjacentElement("afterend", modusWahl);
  modusWahl.insertAdjacentElement("afterend", auswahl);

  /* ---------- Spiellogik ---------- */
  function kollision(a, b) {
    const rand = 2; // etwas Nachsicht, damit es sich fair anfühlt
    return a.x + rand < b.x + b.w - rand && a.x + a.w - rand > b.x + rand && a.y + rand < b.y + b.h - rand && a.y + a.h - rand > b.y + rand;
  }

  // Treffer für Geschosse: genaue Prüfung mit etwas Spielraum nach oben/unten
  function trifft(g, ziel) {
    return g.x < ziel.x + ziel.w && g.x + g.w > ziel.x && g.y < ziel.y + ziel.h + 2 && g.y + g.h > ziel.y - 2;
  }

  function aktualisieren(dt) {
    const geschw = 55;
    if (tasten.hoch) schiff.y -= geschw * dt;
    if (tasten.runter) schiff.y += geschw * dt;
    if (tasten.links) schiff.x -= geschw * 1.1 * dt;
    if (tasten.rechts) schiff.x += geschw * 1.1 * dt;
    if (fingerZiel) {
      // Schiffsmitte zum Finger bewegen (etwas darüber, damit der Finger nichts verdeckt)
      const dx = fingerZiel.x - (schiff.x + schiff.w / 2);
      const dy = fingerZiel.y - 8 - (schiff.y + schiff.h / 2);
      const max = geschw * 1.4 * dt;
      schiff.x += Math.max(-max, Math.min(max, dx));
      schiff.y += Math.max(-max, Math.min(max, dy));
    }
    schiff.x = Math.max(2, Math.min(W - schiff.w - 2, schiff.x));
    schiff.y = Math.max(WASSER_Y - 4, Math.min(H - schiff.h - 1, schiff.y));

    tempo = Math.min(95, 38 + strecke / 45);
    strecke += tempo * dt;
    punkte += tempo * dt * 0.1;

    // Neue Hindernisse – welche, hängt von der Route ab
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      const art = route.hindernisse[Math.floor(Math.random() * route.hindernisse.length)];
      const bild = HINDERNIS[art];
      hindernisse.push({ x: W + 2, y: WASSER_Y - 3 + Math.random() * (H - WASSER_Y - bild.height + 1), w: bild.width, h: bild.height, bild: bild });
      spawnTimer = Math.max(0.45, 1.4 - strecke / 2500) * (0.6 + Math.random() * 0.8) * MODI[modus].hindernisFaktor;
    }

    steinTimer -= dt;
    if (steinTimer <= 0) {
      steine.push({ x: W + 2, y: WASSER_Y - 2 + Math.random() * (H - WASSER_Y - 6), w: 5, h: 5 });
      steinTimer = 2 + Math.random() * 2.5;
    }

    hindernisse.forEach((o) => (o.x -= tempo * dt));
    steine.forEach((k) => (k.x -= tempo * dt));
    hindernisse = hindernisse.filter((o) => o.x > -20);
    steine = steine.filter((k) => k.x > -10 && !k.weg);

    for (const k of steine) {
      if (kollision(schiff, k)) {
        k.weg = true;
        punkte += 25;
      }
    }
    for (const o of hindernisse) {
      if (kollision(schiff, o)) {
        spielVorbei();
        return;
      }
    }
    if (modus === "waljagd") waljagd(dt);
    if (modus === "seeschlacht" && seeschlacht(dt)) return;
    bewegeGeschosse(dt);

    punkteEl.textContent = Math.floor(punkte);

    if (strecke * 0.6 >= route.laenge - 30) zielErreicht();
  }

  function punkteText(x, y, wert) {
    punkte += wert;
    effekte.push({ art: "text", x: x, y: y, t: 0, text: "+" + wert });
  }

  function waljagd(dt) {
    walTimer -= dt;
    if (walTimer <= 0) {
      wale.push({ x: W + 4, y: WASSER_Y + 5 + Math.random() * (H - WASSER_Y - 15), w: 22, h: 7, tempo: 0.45 + Math.random() * 0.3, phase: Math.random() * 6 });
      walTimer = 2 + Math.random() * 2;
    }
    for (const wal of wale) {
      wal.x -= tempo * wal.tempo * dt;
      wal.phase += dt;
      wal.oben = Math.sin(wal.phase * 1.3) > -0.35; // taucht regelmäßig ab
    }
    for (const g of geschosse) {
      for (const wal of wale) {
        if (!g.weg && !wal.weg && wal.oben && trifft(g, wal)) {
          g.weg = wal.weg = true;
          walGetroffen(wal);
          punkteText(wal.x + 6, wal.y - 2, 50);
        }
      }
    }
    wale = wale.filter((w) => w.x > -30 && !w.weg);
  }

  function walGetroffen(wal) {
    const tropfen = [];
    for (let i = 0; i < 16; i++) {
      tropfen.push({ vx: (Math.random() - 0.5) * 50, vy: -20 - Math.random() * 40 });
    }
    effekte.push({ art: "blut", x: wal.x + 10, y: wal.y + 4, t: 0, tropfen: tropfen });
    effekte.push({ art: "toterWal", x: wal.x, y: wal.y, t: 0 });
  }

  // gibt true zurück, wenn das eigene Schiff getroffen wurde
  function seeschlacht(dt) {
    feindTimer -= dt;
    if (feindTimer <= 0 && feinde.length < 2) {
      feinde.push({ x: W + 4, y: WASSER_Y - 2 + Math.random() * (H - WASSER_Y - 12), w: 24, h: 8, leben: 2, feuer: 1 + Math.random(), sinkt: 0 });
      feindTimer = 3 + Math.random() * 2.5;
    }
    for (const f of feinde) {
      // kommt schnell heran, wird dann langsamer und schießt
      f.x -= tempo * (f.x > 125 ? 1 : 0.15) * dt;
      f.feuer -= dt;
      if (f.feuer <= 0 && f.x < W - 10) {
        feindGeschosse.push({ x: f.x - 2, y: f.y + 3, w: 2, h: 2 });
        effekte.push({ art: "blitz", x: f.x - 2, y: f.y + 3, t: 0 });
        f.feuer = 1.6 + Math.random() * 1.2;
      }
    }
    for (const g of geschosse) {
      for (const f of feinde) {
        if (!g.weg && !f.weg && trifft(g, f)) {
          g.weg = true;
          f.leben -= 1;
          effekte.push({ art: "explosion", x: g.x, y: g.y, t: 0 });
          if (f.leben <= 0) {
            f.weg = true;
            feuerball(f.x + f.w / 2, f.y + 3);
            punkteText(f.x + 6, f.y - 10, 100);
          }
        }
      }
    }
    feindGeschosse.forEach((k) => (k.x -= (tempo + 70) * dt));
    feindGeschosse = feindGeschosse.filter((k) => k.x > -4);
    feinde = feinde.filter((f) => f.x > -30 && !f.weg);

    for (const k of feindGeschosse) {
      if (kollision(schiff, { x: k.x - 2, y: k.y - 2, w: 6, h: 6 })) {
        effekte.push({ art: "explosion", x: schiff.x + 8, y: schiff.y + 3, t: 0 });
        spielVorbei("Getroffen!");
        return true;
      }
    }
    for (const f of feinde) {
      if (kollision(schiff, f)) {
        spielVorbei("Zusammenstoß!");
        return true;
      }
    }
    return false;
  }

  // großer Feuerball mit herumfliegenden Trümmern
  function feuerball(x, y) {
    const truemmer = [];
    for (let i = 0; i < 18; i++) {
      const w = Math.random() * Math.PI * 2;
      const v = 25 + Math.random() * 45;
      truemmer.push({ vx: Math.cos(w) * v, vy: -Math.abs(Math.sin(w)) * v - 20, farbe: i % 3 ? "#55516a" : "#ff8a5c" });
    }
    effekte.push({ art: "feuerball", x: x, y: y, t: 0, truemmer: truemmer });
    wackeln = 0.4;
  }

  function bewegeGeschosse(dt) {
    wackeln = Math.max(0, wackeln - dt);
    nachladen = Math.max(0, nachladen - dt);
    geschosse.forEach((g) => (g.x += 150 * dt));
    geschosse = geschosse.filter((g) => g.x < W + 4 && !g.weg);
    effekte.forEach((e) => (e.t += dt));
    const dauer = { text: 1, feuerball: 1.4, blut: 3, toterWal: 3 };
    // Blutlache und toter Wal treiben mit der Strömung nach links
    effekte.forEach(function (e) {
      if (e.art === "blut" || e.art === "toterWal") e.x -= tempo * 0.6 * dt;
    });
    effekte = effekte.filter((e) => e.t < (dauer[e.art] || 0.6));
  }

  /* ---------- Zeichnen ---------- */
  function zeichneSonne(t) {
    const s = route.sonne;
    const schein = s.r + 4 + Math.round(Math.sin(t * 1.5) * 1.5);
    ctx.globalAlpha = 0.25;
    kreis(s.x, s.y, schein + 4, "#fff3c4");
    ctx.globalAlpha = 0.35;
    kreis(s.x, s.y, schein, "#fff3c4");
    ctx.globalAlpha = 1;
    // Sonnenscheibe mit Retro-Streifen in der unteren Hälfte
    for (let dy = -s.r; dy <= s.r; dy++) {
      const y = s.y + dy;
      if (dy > 2 && (y % 4 === 0 || (dy > s.r * 0.6 && y % 4 === 1))) continue;
      const halb = Math.floor(Math.sqrt(s.r * s.r - dy * dy));
      px(s.x - halb, y, halb * 2 + 1, 1, "#ffe08a");
      const innen = Math.floor(Math.sqrt(Math.max(0, (s.r - 3) * (s.r - 3) - dy * dy)));
      if (innen > 0) px(s.x - innen, y, innen * 2 + 1, 1, "#fff3c4");
    }
  }

  function zeichneNordlicht(t) {
    for (const s of route.sterne) px(s.x, s.y, 1, 1, Math.sin(t * 2 + s.p) > 0.5 ? "#fff6ee" : "#f0b8d8");
    for (let x = 0; x < W; x++) {
      const mitte = 26 + 5 * Math.sin(x * 0.05 + t * 0.5) + 3 * Math.sin(x * 0.13 - t * 0.8);
      const laenge = 12 + 8 * Math.pow(Math.sin(x * 0.07 + t * 0.35), 2);
      const flackern = 0.6 + 0.4 * Math.sin(x * 0.3 + t * 2.4);
      const y0 = Math.floor(mitte);
      ctx.globalAlpha = 0.95 * flackern;
      px(x, y0, 1, 2, "#f4fff8");
      ctx.globalAlpha = 0.7 * flackern;
      px(x, y0 - laenge * 0.5, 1, laenge * 0.5, "#86f2c0");
      ctx.globalAlpha = 0.55 * flackern;
      px(x, y0 - laenge, 1, laenge * 0.5, "#ffa6dc");
    }
    ctx.globalAlpha = 1;
  }

  function zeichneWolken(t, v) {
    const breite = W * 1.5;
    for (const w of route.wolken) {
      const x = Math.floor((((w.x - v * w.tempo - t * w.tempo * 30) % breite) + breite) % breite) - 40;
      px(x, w.y, w.w, 2, route.wolke[0]);
      px(x + 3, w.y - 1, w.w - 6, 1, route.wolke[1]);
      px(x + 6, w.y - 2, Math.max(2, w.w - 14), 1, route.wolke[1]);
    }
  }

  function zeichneBerge(b, v) {
    const laenge = b.hoehe.length;
    for (let x = 0; x < W; x++) {
      const h = b.hoehe[(((Math.floor(x + v * b.tempo)) % laenge) + laenge) % laenge];
      if (h <= 0) continue;
      px(x, WASSER_Y - h, 1, h, b.farbe);
      if (b.schnee && h > 20) px(x, WASSER_Y - h, 1, 3, b.schnee);
    }
  }

  // Deko und Sehenswürdigkeiten am Ufer
  function zeichneUfer(t, v) {
    const d = route.deko;
    const erstes = Math.floor(v / d.abstand) - 2;
    for (let i = erstes; i < erstes + Math.ceil(W / d.abstand) + 4; i++) {
      const welt = i * d.abstand;
      if (welt < -20 || welt > route.laenge - 10) continue;
      // keine Deko dort, wo eine Sehenswürdigkeit steht
      const frei = route.orte.every((o) => welt + d.abstand < o.bei - 4 || welt > o.bei + o.breite + 4);
      if (frei) d.zeichne(welt - v, i, t);
    }
    let sichtbar = "";
    for (const o of route.orte) {
      const x = o.bei - v;
      if (x > W || x + o.breite < 0) continue;
      o.zeichne(x, t);
      const mitte = x + o.breite / 2;
      if (mitte > W * 0.12 && mitte < W * 0.88) sichtbar = o.name;
    }
    return sichtbar;
  }

  function zeichneWasser(t, v) {
    const [w1, w2, w3] = route.wasser;
    px(0, WASSER_Y, W, H - WASSER_Y, w1);
    px(0, WASSER_Y + 12, W, H - WASSER_Y - 12, w2);
    px(0, WASSER_Y + 24, W, H - WASSER_Y - 24, w3);
    if (route.sonne) {
      // goldene Spiegelung der Sonne, glitzert durch zeitabhängiges Flackern
      const sx = route.sonne.x;
      for (let y = WASSER_Y + 1; y < H; y += 2) {
        const halb = Math.max(2, 16 - Math.floor((y - WASSER_Y) / 3));
        const wackeln = Math.sin(y * 1.7 + t * 3) * halb;
        px(sx + wackeln - 2, y, 4 + (y % 3), 1, (y + Math.floor(t * 6)) % 4 === 0 ? "#fff3c4" : "#ffe09a");
      }
    }
    for (const w of wellen) {
      const x = ((w.x - v * 1.5) % W + W) % W;
      px(x, w.y, w.w, 1, w.y % 3 === 0 ? route.wellen[0] : route.wellen[1]);
    }
    px(0, WASSER_Y, W, 1, route.berge[route.berge.length - 1].farbe);
  }

  function zeichneKampf(t) {
    for (const wal of wale) {
      const x = Math.floor(wal.x);
      const y = Math.floor(wal.y);
      if (wal.oben) {
        ctx.drawImage(WAL, x, y);
        // Fontäne aus dem Blasloch
        if (Math.sin(wal.phase * 4) > 0.2) {
          for (let i = 1; i < 5; i++) px(x + 4 + (i % 2 ? -1 : 1) * Math.floor(i / 2), y - i, 1, 1, "#fff6ee");
        }
      } else {
        // abgetaucht: nur Schatten und Luftblasen
        ctx.globalAlpha = 0.35;
        px(x + 2, y + 3, 18, 2, "#3a1f35");
        ctx.globalAlpha = 1;
        if (Math.sin(t * 6 + wal.phase) > 0.5) px(x + 6, y + 1, 1, 1, "#fff6ee");
      }
    }
    for (const f of feinde) {
      const x = Math.floor(f.x);
      const y = Math.floor(f.y);
      // Flagge am Mast (weiß-blau-rot), weht leicht im Wind
      const wehen = Math.round(Math.sin(t * 6 + f.y));
      px(x + 10, y - 4, 1, 4, "#3a1f35");
      ["#ffffff", "#1c3fa8", "#d52b1e"].forEach(function (farbe, i) {
        px(x + 11, y - 4 + i, 3, 1, farbe);
        px(x + 14, y - 4 + i + wehen, 2, 1, farbe);
      });
      ctx.drawImage(FEIND, x, y);
      if (f.leben < 2) {
        // angeschlagen: Rauch und kleine Flammen
        px(x + 12, y - 2 - Math.floor((t * 8) % 4), 2, 2, "#9a8a9a");
        px(x + 14, y + 2, 2, 2, Math.sin(t * 20) > 0 ? "#ffc65c" : "#ff8a5c");
      }
    }
    for (const g of geschosse) {
      if (g.harpune) {
        px(g.x, g.y, 6, 1, "#6a4a3a");
        px(g.x + 6, g.y - 1, 2, 3, "#dcdcea");
      } else {
        px(g.x, g.y, 2, 2, "#3a1f35");
      }
    }
    for (const k of feindGeschosse) {
      px(k.x, k.y, 2, 2, "#3a1f35");
      px(k.x + 2, k.y, 2, 1, "#ff8a5c");
    }
    for (const e of effekte) {
      if (e.art === "blitz") {
        px(e.x, e.y - 1, 2, 3, "#fff3c4");
      } else if (e.art === "spritzer") {
        for (let i = 0; i < 8; i++) {
          const w = (i / 8) * Math.PI * 2;
          px(e.x + Math.cos(w) * e.t * 18, e.y - Math.abs(Math.sin(w)) * e.t * 16, 1, 1, "#fff6ee");
        }
      } else if (e.art === "explosion") {
        const r = 1 + Math.floor(e.t * 10);
        for (let i = 0; i < 10; i++) {
          const w = (i / 10) * Math.PI * 2;
          px(e.x + Math.cos(w) * r, e.y + Math.sin(w) * r, 1, 1, i % 2 ? "#ffc65c" : "#ff8a5c");
        }
        if (e.t < 0.2) px(e.x - 1, e.y - 1, 3, 3, "#fff3c4");
      } else if (e.art === "blut") {
        // Blutlache breitet sich auf dem Wasser aus und verblasst
        const breite = Math.floor(8 + Math.min(1, e.t / 1.2) * 26);
        ctx.globalAlpha = Math.max(0, 0.85 - e.t * 0.28);
        px(e.x - breite / 2, e.y + 2, breite, 3, "#8a1020");
        px(e.x - breite / 3, e.y + 1, (breite * 2) / 3, 5, "#b01828");
        px(e.x - breite / 5, e.y + 2, (breite * 2) / 5, 2, "#d02a30");
        ctx.globalAlpha = 1;
        // Blutfontäne
        for (const d of e.tropfen) {
          const ty = e.y + d.vy * e.t + 70 * e.t * e.t;
          if (ty < e.y + 3) px(e.x + d.vx * e.t, ty, 1, 1, "#c0202a");
        }
      } else if (e.art === "toterWal") {
        // Wal treibt mit dem Bauch nach oben und sinkt langsam
        ctx.globalAlpha = Math.max(0, 1 - e.t / 3);
        ctx.save();
        ctx.translate(Math.floor(e.x), Math.floor(e.y + WAL.height + e.t * 3));
        ctx.scale(1, -1);
        ctx.drawImage(WAL, 0, 0);
        ctx.restore();
        ctx.globalAlpha = 1;
      } else if (e.art === "feuerball") {
        zeichneFeuerball(e);
      } else if (e.art === "text") {
        ctx.font = "bold 8px 'Pixelify Sans', monospace";
        ctx.fillStyle = "#3a1f35";
        ctx.fillText(e.text, Math.floor(e.x) + 1, Math.floor(e.y - e.t * 10) + 1);
        ctx.fillStyle = "#fff3c4";
        ctx.fillText(e.text, Math.floor(e.x), Math.floor(e.y - e.t * 10));
      }
    }
  }

  function zeichneFeuerball(e) {
    const t = e.t;
    const wachsen = Math.min(1, t / 0.35);
    const r = Math.floor(4 + 20 * (1 - Math.pow(1 - wachsen, 3)));
    const abklingen = Math.max(0, 1 - (t - 0.5) / 0.9); // ab 0,5 s verblasst der Ball
    // Rauchwolke außen, dann rot, orange, gelb und weißer Kern
    ctx.globalAlpha = 0.55 * abklingen;
    kreis(e.x, e.y - t * 10, r + 4, "#4a3a4a");
    ctx.globalAlpha = abklingen;
    kreis(e.x, e.y - t * 6, r, "#d8402a");
    kreis(e.x, e.y - t * 6, Math.floor(r * 0.75), "#ff8a3c");
    kreis(e.x, e.y - t * 6, Math.floor(r * 0.5), "#ffc65c");
    if (t < 0.45) kreis(e.x, e.y - t * 6, Math.floor(r * 0.28), "#fff3c4");
    ctx.globalAlpha = 1;
    // Druckwelle auf dem Wasser
    if (t < 0.6) {
      const w = Math.floor(t * 70);
      px(e.x - w, e.y + 6, w * 2, 1, "#fff6ee");
    }
    // Trümmer fliegen im Bogen und fallen ins Wasser
    for (const s of e.truemmer) {
      const tx = e.x + s.vx * t;
      const ty = e.y + s.vy * t + 60 * t * t;
      if (ty < H) px(tx, ty, 2, 2, s.farbe);
    }
  }

  let letzterOrt = "";
  function zeichnen(t) {
    const v = versatz();
    ctx.save();
    if (wackeln > 0 && zustand === "laeuft") ctx.translate(Math.round((Math.random() - 0.5) * 4), Math.round((Math.random() - 0.5) * 4));
    ctx.drawImage(route.himmelBild, 0, 0);
    if (route.sonne) zeichneSonne(t);
    if (route.nordlicht) zeichneNordlicht(t);
    zeichneWolken(t, v);
    route.berge.forEach((b) => zeichneBerge(b, v));
    const ort = zeichneUfer(t, v);
    zeichneWasser(t, v);

    for (const k of steine) {
      if (Math.sin(t * 8) > -0.6) ctx.drawImage(SONNENSTEIN, Math.floor(k.x), Math.floor(k.y));
    }
    for (const o of hindernisse) ctx.drawImage(o.bild, Math.floor(o.x), Math.floor(o.y));
    zeichneKampf(t);

    // Schiff mit leichtem Schaukeln und Kielwasser
    const schaukeln = zustand === "laeuft" || zustand === "bereit" ? Math.round(Math.sin(t * 4)) * 0.5 : 0;
    const sx = Math.floor(schiff.x);
    const sy = Math.floor(schiff.y + schaukeln);
    for (let i = 1; i < 6; i++) {
      if ((Math.floor(t * 10) + i) % 2) px(sx - i * 3, sy + 7 + (i % 2), 2, 1, "#fff6ee");
    }
    ctx.drawImage(SCHIFF, sx, sy);

    ctx.restore();

    // Fortschrittsbalken bis zum Ziel
    if (zustand !== "bereit") {
      px(0, H - 2, W, 2, "rgba(58, 31, 53, 0.45)");
      px(0, H - 2, W * Math.min(1, (strecke * 0.6) / route.laenge), 2, "#ffc65c");
    }

    // Name des aktuellen Ortes einblenden
    if (ort !== letzterOrt) {
      letzterOrt = ort;
      ortEl.textContent = ort ? "★ " + ort : "";
    }
  }

  /* ---------- Spielschleife ---------- */
  let letzteZeit = performance.now();
  function schleife(jetzt) {
    const dt = Math.min(0.05, (jetzt - letzteZeit) / 1000);
    letzteZeit = jetzt;
    if (zustand === "laeuft") {
      zeit += dt;
      aktualisieren(dt);
    } else if (!wenigBewegung) {
      zeit += dt * 0.6;
      if (zustand === "bereit") {
        // Vorschau: Kamera fährt die schönsten Orte der Route ab
        vorschau = (vorschau + 30 * dt) % (route.laenge + W);
      }
    }
    zeichnen(zeit);
    requestAnimationFrame(schleife);
  }

  menue();
  requestAnimationFrame(schleife);
})();
