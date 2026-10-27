#!/usr/bin/env python3
"""
Prova di Ponte sul simulatore iOS: tocca la barra nativa, apre schede, usa la ricerca,
registra video e screenshot. Gira su GitHub Actions (macOS) con idb.

Uso: drive.py <udid> <cartella risultati>
"""
import json
import os
import signal
import subprocess
import sys
import time

UDID, OUT = sys.argv[1], sys.argv[2]
BUNDLE = "app.ponte.officina"
os.makedirs(OUT, exist_ok=True)
report: list[str] = []
failures = 0


def sh(*args: str, check=True) -> str:
    r = subprocess.run(list(args), capture_output=True, text=True)
    if check and r.returncode != 0:
        raise RuntimeError(f"{' '.join(args)}\n{r.stdout}\n{r.stderr}")
    return r.stdout


def idb(*args: str) -> str:
    return sh("idb", *args, "--udid", UDID)


def tree() -> list[dict]:
    raw = idb("ui", "describe-all", "--json")
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        data = [json.loads(line) for line in raw.splitlines() if line.strip().startswith("{")]
    return data if isinstance(data, list) else [data]


def label(e: dict) -> str:
    return (e.get("AXLabel") or e.get("AXValue") or "") or ""


def find(text: str, exact=True, kinds: tuple[str, ...] | None = None) -> dict | None:
    for e in tree():
        lab = label(e)
        if (lab == text if exact else text.lower() in lab.lower()) and (not kinds or e.get("type") in kinds):
            f = e.get("frame") or {}
            if f.get("width", 0) > 0 and f.get("height", 0) > 0:
                return e
    return None


def center(e: dict) -> tuple[int, int]:
    f = e["frame"]
    return int(f["x"] + f["width"] / 2), int(f["y"] + f["height"] / 2)


def tap(text: str, exact=True, wait=1.0, kinds=None) -> bool:
    e = find(text, exact, kinds)
    if not e:
        check(False, f"trovo «{text}» da toccare")
        return False
    x, y = center(e)
    idb("ui", "tap", str(x), str(y))
    time.sleep(wait)
    return True


def swipe(x1, y1, x2, y2, dur=0.35):
    idb("ui", "swipe", str(x1), str(y1), str(x2), str(y2), "--duration", str(dur))


def shot(name: str):
    sh("xcrun", "simctl", "io", UDID, "screenshot", f"{OUT}/{name}.png")
    with open(f"{OUT}/{name}.json", "w") as fh:
        json.dump([{"label": label(e), "type": e.get("type"), "frame": e.get("frame")} for e in tree()], fh, ensure_ascii=False, indent=1)


def check(ok: bool, what: str):
    global failures
    report.append(f"- {'✅' if ok else '❌'} {what}")
    if not ok:
        failures += 1


def has(text: str, exact=True) -> bool:
    return find(text, exact) is not None


class Video:
    def __init__(self, name: str):
        self.p = subprocess.Popen(["xcrun", "simctl", "io", UDID, "recordVideo", "--codec=h264", "--force", f"{OUT}/{name}.mp4"], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        time.sleep(1.5)

    def stop(self):
        self.p.send_signal(signal.SIGINT)
        self.p.wait(timeout=30)


def launch(wait=6.0):
    sh("xcrun", "simctl", "terminate", UDID, BUNDLE, check=False)
    sh("xcrun", "simctl", "launch", UDID, BUNDLE)
    time.sleep(wait)


W = 402  # larghezza logica dell'iPhone 17 Pro, in punti

try:
    # ------------------------------------------------------------------ scenario
    launch(8)
    shot("01-avvio")
    if has("Prova con dati di esempio"):
        tap("Prova con dati di esempio", wait=2.5)
    shot("02-oggi")
    for t in ["Oggi", "Schede", "Fatture", "Impostazioni", "Nuova accettazione"]:
        check(has(t), f"barra nativa: «{t}»")

    # lampeggio dell'intestazione: scorrimento su Oggi e cambi di sezione, a video
    v = Video("v1-oggi-sezioni")
    swipe(W // 2, 640, W // 2, 220)
    time.sleep(0.8)
    swipe(W // 2, 220, W // 2, 700)
    time.sleep(0.8)
    for t in ["Schede", "Fatture", "Impostazioni", "Oggi", "Schede"]:
        tap(t, wait=1.0)
    swipe(W // 2, 640, W // 2, 200)
    time.sleep(0.8)
    swipe(W // 2, 200, W // 2, 700)
    time.sleep(1.0)
    v.stop()
    shot("03-schede")

    # ricerca nativa
    field = find("Targa, telaio", exact=False)
    check(field is not None, "campo di ricerca in Schede")
    if field:
        x, y = center(field)
        idb("ui", "tap", str(x), str(y))
        time.sleep(1.6)
        shot("04-ricerca-aperta")
        check(has("Chiudi la ricerca"), "ricerca nativa aperta sopra la tastiera")
        idb("ui", "text", "golf")
        time.sleep(1.2)
        shot("05-ricerca-golf")
        check(has("Volkswagen Golf 2.0 TDI", exact=False), "risultato «Volkswagen Golf» mentre scrivo")
        check(not has("Peugeot 208", exact=False), "le altre schede spariscono")
        tap("Chiudi la ricerca", wait=1.2)
        shot("06-ricerca-chiusa")
        check(has("Peugeot 208", exact=False), "chiudendo torna l'elenco completo")

    # scheda: azioni native
    tap("Volkswagen Golf 2.0 TDI", exact=False, wait=1.8)
    shot("07-scheda")
    check(has("Avvisa"), "scheda: «Avvisa» nella barra nativa")
    check(has("Segna: Pronto"), "scheda: «Segna: Pronto» nella barra nativa")
    v = Video("v2-scheda")
    swipe(W // 2, 680, W // 2, 200)
    time.sleep(0.8)
    swipe(W // 2, 680, W // 2, 200)
    time.sleep(0.8)
    swipe(W // 2, 200, W // 2, 760)
    time.sleep(0.8)
    swipe(W // 2, 200, W // 2, 760)
    time.sleep(1.0)
    v.stop()
    if tap("Segna: Pronto", wait=1.4):
        shot("08-pronto")
        check(has("Segna: Consegnato"), "dopo il tocco diventa «Segna: Consegnato»")
    if tap("Avvisa", wait=1.4):
        shot("09-whatsapp")
        check(not has("Segna: Consegnato"), "con il foglio aperto la barra si fa da parte")
        tap("Chiudi", wait=1.2)
        shot("10-whatsapp-chiuso")
        check(has("Segna: Consegnato"), "chiuso il foglio la barra torna")

    # indietro e nuova accettazione
    tap("Schede", wait=1.4)
    tap("Nuova accettazione", wait=1.8)
    shot("11-nuova")
    check(has("Registra accettazione"), "modulo: «Registra accettazione» nella barra nativa")
    check(not has("Leggi la targa con la fotocamera"), "sul simulatore (senza fotocamera) il pulsante della targa non compare")

    # tema scuro
    sh("xcrun", "simctl", "ui", UDID, "appearance", "dark")
    launch(6)
    shot("20-scuro-oggi")
    tap("Schede", wait=1.2)
    shot("21-scuro-schede")
    tap("Volkswagen Golf 2.0 TDI", exact=False, wait=1.8)
    shot("22-scuro-scheda")
    sh("xcrun", "simctl", "ui", UDID, "appearance", "light")

    # testo grande (Dimensioni testo)
    sh("xcrun", "simctl", "ui", UDID, "content_size", "extra-extra-large")
    launch(6)
    shot("30-testo-grande-oggi")
    tap("Schede", wait=1.2)
    shot("31-testo-grande-schede")
    sh("xcrun", "simctl", "ui", UDID, "content_size", "large")

except Exception as e:  # noqa: BLE001
    check(False, f"lo scenario si è interrotto: {e}".replace('\n', ' ')[:600])
    try:
        shot('99-errore')
    except Exception:  # noqa: BLE001
        pass

with open(f"{OUT}/risultati.md", "w") as fh:
    fh.write(f"# Prova sul simulatore\n\n{len(report) - failures} di {len(report)} controlli superati\n\n" + "\n".join(report) + "\n")
print("\n".join(report))
sys.exit(0)
