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


_container = None


def web() -> dict:
    """Elementi della pagina web scritti dall'app (UITestProbe, solo build Debug con -PonteUITest)."""
    global _container
    if not _container:
        _container = sh("xcrun", "simctl", "get_app_container", UDID, BUNDLE, "data").strip()
    try:
        with open(os.path.join(_container, "tmp", "ui.json")) as fh:
            return json.load(fh)
    except (OSError, json.JSONDecodeError):
        return {"items": []}


def tree() -> list[dict]:
    raw = "[]"
    for _ in range(8):  # appena avviata l'app il servizio di accessibilità può non vederla ancora
        try:
            raw = idb("ui", "describe-all", "--json")
            break
        except RuntimeError as e:
            if "frontmost" not in str(e):
                raise
            time.sleep(2)
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        data = [json.loads(line) for line in raw.splitlines() if line.strip().startswith("{")]
    native = data if isinstance(data, list) else [data]
    time.sleep(0.7)  # la sonda si aggiorna ogni 0,6 s
    w = [{"AXLabel": i["label"], "type": "web:" + i["tag"], "frame": {"x": i["x"], "y": i["y"], "width": i["w"], "height": i["h"]}} for i in web().get("items", [])]
    return native + w


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


NATIVE = ("Button",)


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


def has(text: str, exact=True, kinds=None) -> bool:
    return find(text, exact, kinds) is not None


class Video:
    def __init__(self, name: str):
        self.p = subprocess.Popen(["xcrun", "simctl", "io", UDID, "recordVideo", "--codec=h264", "--force", f"{OUT}/{name}.mp4"], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        time.sleep(1.5)

    def stop(self):
        self.p.send_signal(signal.SIGINT)
        self.p.wait(timeout=30)


def js(code: str):
    """Esegue JavaScript nella pagina attraverso la sonda (file tmp/cmd.js)."""
    global _container
    if not _container:
        _container = sh("xcrun", "simctl", "get_app_container", UDID, BUNDLE, "data").strip()
    with open(os.path.join(_container, "tmp", "cmd.js"), "w") as fh:
        fh.write(code)
    time.sleep(0.9)


def say(text: str, wait=1.6):
    js(f"window.ponteVoice && window.ponteVoice.say({json.dumps(text)})")
    time.sleep(wait)


def enter_as_owner():
    """Benvenuto all'apertura: si entra come titolare (vede anche Oggi)."""
    # il primo avvio sul simulatore può metterci parecchio: si aspetta il benvenuto fino a 40 s
    for _ in range(20):
        if has("Titolare", exact=False, kinds=("web:button",)):
            break
        time.sleep(2)
    tap("Titolare", exact=False, wait=2.5, kinds=("web:button",))


def launch(wait=6.0):
    sh("xcrun", "simctl", "terminate", UDID, BUNDLE, check=False)
    n = len([f for f in os.listdir(OUT) if f.startswith("stdout")])
    # stdout dell'app: Capacitor ci scrive la console JavaScript (⚡️ [log] / [error])
    sh("xcrun", "simctl", "launch", "--terminate-running-process", f"--stdout={OUT}/stdout-{n}.txt", f"--stderr={OUT}/stderr-{n}.txt", UDID, BUNDLE, "-PonteUITest", "-PonteVoiceSim")
    time.sleep(wait)


W = 402  # larghezza logica dell'iPhone 17 Pro, in punti

try:
    # ------------------------------------------------------------------ scenario
    launch(8)
    shot("00-benvenuto")
    for _ in range(20):
        if has("Titolare", exact=False, kinds=("web:button",)):
            break
        time.sleep(2)
    shot("00b-benvenuto")
    check(has("Titolare", exact=False) and has("Dipendente", exact=False), "benvenuto: scelta titolare / dipendente")
    check(not has("Oggi"), "sul benvenuto la barra nativa non c'è")
    enter_as_owner()
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
        tap(t, wait=1.0, kinds=NATIVE)
    swipe(W // 2, 640, W // 2, 200)
    time.sleep(0.8)
    swipe(W // 2, 200, W // 2, 700)
    time.sleep(1.0)
    v.stop()
    shot("03-schede")

    # ricerca nativa
    field = find("Targa, telaio", exact=False, kinds=("web:input",))
    check(field is not None, "campo di ricerca in Schede")
    if field:
        x, y = center(field)
        idb("ui", "tap", str(x), str(y))
        time.sleep(1.6)
        shot("04-ricerca-aperta")
        check(has("Annulla", kinds=NATIVE), "ricerca nativa agganciata in alto, con Annulla")
        check(not has("Oggi", kinds=NATIVE), "durante la ricerca la barra in basso si fa da parte")
        idb("ui", "text", "golf")
        time.sleep(1.2)
        shot("05-ricerca-golf")
        check(has("Volkswagen Golf 2.0 TDI", exact=False), "risultato «Volkswagen Golf» mentre scrivo")
        check(not has("Peugeot 208", exact=False), "le altre schede spariscono")
        tap("Annulla", wait=1.2, kinds=NATIVE)
        shot("06-ricerca-chiusa")
        check(has("Peugeot 208", exact=False), "chiudendo torna l'elenco completo")

    # scheda: azioni native
    tap("Volkswagen Golf 2.0 TDI", exact=False, wait=1.8, kinds=("web:a",))
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
        check(has("Incassa", exact=False, kinds=NATIVE), "a pronto la barra propone «Incassa»")
        check(has("Pronto da ritirare"), "a pronto il pagamento è in primo piano")
    if tap("Avvisa", wait=1.4, kinds=NATIVE):
        shot("09-whatsapp")
        check(not has("Incassa", exact=False, kinds=NATIVE), "con il foglio aperto la barra si fa da parte")
        tap("Chiudi", wait=1.2, kinds=("web:button",))
        shot("10-whatsapp-chiuso")
        check(has("Incassa", exact=False, kinds=NATIVE), "chiuso il foglio la barra torna")
    if tap("Contanti", kinds=("web:button",), wait=0.8):
        tap("Incassa", exact=False, kinds=NATIVE, wait=1.6)
        shot("10b-consegnato")
        check(has("Invia il conto", exact=False, kinds=NATIVE), "incassato: consegnato, la barra propone «Invia il conto»")

    # indietro e nuova accettazione
    tap("Schede", wait=1.4, kinds=("web:button",))  # indietro dalla scheda
    tap("Nuova accettazione", wait=1.2, kinds=NATIVE)
    shot("11a-chi-porta")
    check(has("Privato", exact=False) and has("Azienda", exact=False), "+: prima la scelta privato / azienda")
    check(has("A voce", exact=False, kinds=("web:button",)), "+: accettazione a voce come prima scelta")

    # accettazione a voce (microfono simulato: il simulatore non ha voce da riconoscere)
    if tap("A voce", exact=False, wait=2.0, kinds=("web:button",)):
        shot("12a-voce")
        check(has("Accettazione a voce", exact=False), "a voce: schermata aperta")
        check(not has("Oggi", kinds=NATIVE), "a voce: la barra nativa si fa da parte")
        if not has("Metti in pausa l’ascolto", exact=False):
            tap("Inizia a dettare", exact=False, wait=1.0, kinds=("web:button",))
        say("Golf grigia targa GK 482 TR, è di Marco Bianchi, telefono 335 812 4471")
        shot("12b-voce-golf")
        check(has("Marco Bianchi", exact=False), "a voce: proprietario scritto nella scheda")
        check(has("335 812 4471", exact=False), "a voce: telefono scritto e formattato")
        say("fa rumore ai freni e c'è un graffio sul paraurti, la vuole venerdì")
        shot("12c-voce-lavori")
        check(has("Fa rumore ai freni", exact=False), "a voce: lavori richiesti")
        check(has("graffio sul paraurti", exact=False), "a voce: note all'arrivo separate")
        say("annulla")
        check(not has("graffio sul paraurti", exact=False), "a voce: «annulla» toglie l'ultima modifica")
        shot("12d-voce-annulla")
        tap("Modulo", exact=False, wait=1.4, kinds=("web:button",))
        shot("12e-voce-modulo")
        check(has("Registra accettazione"), "dalla voce al modulo: stessa bozza, pronta da registrare")
        sh("xcrun", "simctl", "ui", UDID, "appearance", "dark")
        time.sleep(1.0)
        tap("Detta a voce", exact=False, wait=1.6)
        shot("12f-voce-scuro")
        sh("xcrun", "simctl", "ui", UDID, "appearance", "light")
        tap("Chiudi", exact=False, wait=1.2, kinds=("web:button",))
        tap("Annulla", wait=1.4, kinds=("web:button",))  # esce dal modulo: la bozza resta salvata
        tap("Nuova accettazione", wait=1.2, kinds=NATIVE)
    tap("Privato", exact=False, wait=0.9, kinds=("web:button",))
    check(has("Cliente che torna", exact=False), "poi cliente nuovo o che torna")
    tap("Cliente nuovo", exact=False, wait=1.8, kinds=("web:button",))
    shot("11-nuova")
    check(has("Registra accettazione"), "modulo: «Registra accettazione» nella barra nativa")
    check(not has("Leggi la targa con la fotocamera"), "sul simulatore (senza fotocamera) il pulsante della targa non compare")

    # tema scuro
    sh("xcrun", "simctl", "ui", UDID, "appearance", "dark")
    launch(6)
    enter_as_owner()
    shot("20-scuro-oggi")
    tap("Schede", wait=1.2, kinds=NATIVE)
    shot("21-scuro-schede")
    tap("Peugeot 208", exact=False, wait=1.8, kinds=("web:a",))  # la Golf è già consegnata e archiviata
    shot("22-scuro-scheda")
    sh("xcrun", "simctl", "ui", UDID, "appearance", "light")

    # testo grande (Dimensioni testo)
    sh("xcrun", "simctl", "ui", UDID, "content_size", "extra-extra-large")
    launch(6)
    enter_as_owner()
    shot("30-testo-grande-oggi")
    tap("Schede", wait=1.2, kinds=NATIVE)
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
