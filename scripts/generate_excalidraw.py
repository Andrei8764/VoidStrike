"""
Generează docs/VoidStrike-Diagrame.excalidraw — format valid Excalidraw v2.
Schema: https://docs.excalidraw.com/docs/codebase/json-schema
Rulează: python scripts/generate_excalidraw.py
"""
import json
import os
import random
import time

OUTPUT = os.path.join(
    os.path.dirname(os.path.dirname(__file__)),
    "docs",
    "VoidStrike-Diagrame.excalidraw",
)

PAGE_W = 1400
COL_L = 80
MARGIN = 60


class ExcalidrawBuilder:
    """Construiește elemente în ordinea corectă: shapes → arrows → text."""

    def __init__(self):
        self.shapes = []
        self.arrows = []
        self.texts = []
        self._counter = 0
        self._ts = int(time.time() * 1000)

    def _id(self):
        return f"id{self._counter:05d}{random.randint(1000, 9999)}"

    def _index(self):
        self._counter += 1
        return f"a{self._counter}"

    def _base(self, etype, x, y, w, h, **kw):
        el = {
            "id": kw.pop("id", self._id()),
            "type": etype,
            "x": float(x),
            "y": float(y),
            "width": float(max(w, 1)),
            "height": float(max(h, 1)),
            "angle": 0,
            "strokeColor": kw.pop("strokeColor", "#1e1e1e"),
            "backgroundColor": kw.pop("backgroundColor", "transparent"),
            "fillStyle": kw.pop("fillStyle", "solid"),
            "strokeWidth": kw.pop("strokeWidth", 2),
            "strokeStyle": kw.pop("strokeStyle", "solid"),
            "roughness": kw.pop("roughness", 1),
            "opacity": 100,
            "groupIds": [],
            "frameId": None,
            "roundness": kw.pop("roundness", None),
            "seed": random.randint(1, 2_147_483_647),
            "version": 1,
            "versionNonce": random.randint(1, 2_147_483_647),
            "isDeleted": False,
            "boundElements": kw.pop("boundElements", None),
            "updated": self._ts,
            "link": None,
            "locked": False,
            "index": self._index(),
        }
        el.update(kw)
        return el

    def add_shape(self, el):
        self.shapes.append(el)

    def add_arrow_el(self, el):
        self.arrows.append(el)

    def add_text_el(self, el):
        self.texts.append(el)

    def rectangle(self, x, y, w, h, bg="#a5d8ff", stroke="#1e1e1e", dashed=False):
        rid = self._id()
        el = self._base(
            "rectangle", x, y, w, h,
            id=rid,
            backgroundColor=bg,
            strokeColor=stroke,
            roundness={"type": 3},
            strokeStyle="dashed" if dashed else "solid",
            boundElements=None,
        )
        self.add_shape(el)
        return rid, el

    def frame_box(self, x, y, w, h, title):
        rid, el = self.rectangle(x, y, w, h, bg="transparent", stroke="#868e96", dashed=True)
        tid = self._id()
        self.add_text_el(self._base(
            "text", x + 12, y + 8, w - 24, 28,
            id=tid,
            text=title,
            originalText=title,
            fontSize=18,
            fontFamily=5,
            textAlign="left",
            verticalAlign="top",
            baseline=16,
            containerId=None,
            lineHeight=1.25,
            strokeWidth=1,
            roughness=0,
            autoResize=True,
        ))
        return rid

    def box(self, x, y, w, h, content, bg="#a5d8ff", stroke="#1e1e1e", size=14):
        rid, el = self.rectangle(x, y, w, h, bg=bg, stroke=stroke)
        if not content:
            return rid
        tid = self._id()
        lines = content.split("\n")
        th = max(20, len(lines) * size * 1.25)
        el["boundElements"] = [{"type": "text", "id": tid}]
        self.add_text_el(self._base(
            "text", x + 12, y + (h - th) / 2, w - 24, th,
            id=tid,
            text=content,
            originalText=content,
            fontSize=size,
            fontFamily=5,
            textAlign="center",
            verticalAlign="middle",
            baseline=size - 2,
            containerId=rid,
            lineHeight=1.25,
            strokeWidth=1,
            roughness=0,
            autoResize=True,
        ))
        return rid

    def label(self, x, y, content, size=16, color="#1e1e1e", bold=False, w=None):
        lines = content.split("\n")
        width = w or max(100, len(max(lines, key=len)) * size * 0.55)
        height = max(20, len(lines) * size * 1.3 + 8)
        self.add_text_el(self._base(
            "text", x, y, width, height,
            text=content,
            originalText=content,
            fontSize=size,
            fontFamily=3 if bold else 5,
            textAlign="left",
            verticalAlign="top",
            baseline=size - 2,
            containerId=None,
            lineHeight=1.25,
            strokeWidth=1,
            roughness=0,
            autoResize=True,
            strokeColor=color,
        ))

    def arrow(self, x1, y1, x2, y2, color="#1e1e1e", label=""):
        w = x2 - x1
        h = y2 - y1
        aid = self._id()
        bound = []
        if label:
            tid = self._id()
            bound = [{"type": "text", "id": tid}]
            self.add_text_el(self._base(
                "text", (x1 + x2) / 2 - 40, (y1 + y2) / 2 - 18, 80, 18,
                id=tid,
                text=label,
                originalText=label,
                fontSize=12,
                fontFamily=5,
                textAlign="center",
                verticalAlign="middle",
                baseline=10,
                containerId=aid,
                lineHeight=1.25,
                strokeWidth=1,
                roughness=0,
                autoResize=True,
                strokeColor=color,
            ))
        self.add_arrow_el(self._base(
            "arrow", x1, y1, abs(w) or 1, abs(h) or 1,
            id=aid,
            strokeColor=color,
            roundness={"type": 2},
            points=[[0, 0], [w, h]],
            lastCommittedPoint=None,
            startBinding=None,
            endBinding=None,
            startArrowhead=None,
            endArrowhead="arrow",
            boundElements=bound or None,
        ))

    def line_graph(self, points, color="#e03131", sw=3):
        xs = [p[0] for p in points]
        ys = [p[1] for p in points]
        x0, y0 = min(xs), min(ys)
        rel = [[p[0] - x0, p[1] - y0] for p in points]
        self.add_shape(self._base(
            "line", x0, y0, max(xs) - x0 or 1, max(ys) - y0 or 1,
            strokeColor=color,
            strokeWidth=sw,
            roughness=0,
            points=rel,
            lastCommittedPoint=None,
            startBinding=None,
            endBinding=None,
            startArrowhead=None,
            endArrowhead=None,
        ))

    def flow_chain(self, x, y, items, w=130, h=64, gap=24):
        boxes = []
        for i, (label, bg) in enumerate(items):
            bx = x + i * (w + gap)
            rid = self.box(bx, y, w, h, label, bg, size=12)
            boxes.append((bx, y, w, h, rid))
            if i > 0:
                prev = boxes[i - 1]
                self.arrow(prev[0] + prev[2], prev[1] + prev[3] // 2, bx, y + h // 2)

    def section(self, y, num, title, description, height=520):
        self.frame_box(MARGIN, y, PAGE_W, height, f"{num}. {title}")
        self.label(COL_L, y + 36, title, size=26, bold=True, color="#1971c2")
        self.box(COL_L, y + 72, PAGE_W - 120, 64, description, "#f8f9fa", "#dee2e6", size=13)
        return y + 148

    def build(self):
        elements = self.shapes + self.arrows + self.texts
        # index trebuie sa creasca in ordinea din array (z-order Excalidraw)
        for i, el in enumerate(elements):
            el["index"] = f"a{i}"
        return elements


def build_diagrams(b: ExcalidrawBuilder):
    y = 40

    # Copertă
    b.frame_box(MARGIN, y, PAGE_W, 200, "Coperta")
    b.label(COL_L, y + 24, "VoidStrike", size=44, bold=True, color="#1971c2")
    b.label(COL_L, y + 78, "Shooter multiplayer browser - Diagrame pentru prezentare", size=18)
    b.label(COL_L, y + 112, "Java 21 + Spring Boot + WebSocket | Three.js + ES Modules", size=14, color="#495057")
    b.box(COL_L, y + 148, 520, 36, "excalidraw.com -> Open -> VoidStrike-Diagrame.excalidraw", "#fff3bf", size=12)
    y += 240

    # Cuprins
    b.frame_box(MARGIN, y, PAGE_W, 320, "Cuprins")
    b.label(COL_L, y + 20, "Cuprins (scroll in jos)", size=22, bold=True)
    toc = (
        "01 Arhitectura  02 Conectare  03 Networking  04 Scenariu W\n"
        "05 Game Loop  06 GameRoom  07 Predictie  08 Reconciliere\n"
        "09 Interpolare  10 Fizica formule  11 Grafice fizica\n"
        "12 Hit detection  13 Coliziuni  14 Arme  15 World Editor\n"
        "16 Randare Three.js  17 Java backend"
    )
    b.label(COL_L, y + 56, toc, size=14, w=PAGE_W - 100)
    y += 360

    # 01 Arhitectura
    cy = b.section(y, "01", "Arhitectura Generala",
        "Client-server autoritativ. Browserul trimite INPUT; serverul Java calculeaza tot. "
        "Harta = JSON editabil in data/world/.", 560)
    b.box(COL_L, cy, 280, 380,
        "CLIENT\n\ninput.js - taste\nwebsocket.js - WS\nprediction.js - instant\n"
        "interpolation.js - smooth\nnetworkClock.js\nsceneCollision.js\n"
        "renderer3d.js - Three.js\nmain.js - 60 FPS\nhud.js / audio.js", "#d3f9d8", size=12)
    b.box(400, cy + 140, 200, 100, "WebSocket\n/ws/game\nJSON", "#fff3bf", size=13)
    b.arrow(360, cy + 190, 400, cy + 190, label="60Hz")
    b.arrow(600, cy + 190, 640, cy + 190, label="30/s")
    b.box(640, cy, 300, 380,
        "SERVER Java\n\nGameWebSocketHandler\nGameRoomManager\nGameRoom\n"
        "GameLoop 30 TPS\nWorldStorageService\nWorldSceneController REST", "#ffe3e3", size=12)
    b.box(980, cy + 60, 340, 300,
        "DATE\n\nscene.json\ncollision-profiles.json\nmodels/ GLB+OBJ\ndata/world/", "#e5dbff", size=12)
    b.arrow(940, cy + 210, 980, cy + 210)
    b.box(COL_L, cy + 400, 500, 90,
        "Verde=Client | Rosu=Server | Galben=Retea | Violet=Date", "#f8f9fa", size=12)
    y += 600

    # 02 Conectare
    cy = b.section(y, "02", "Conectare si Join",
        "WebSocket connect -> join cu nume validat -> GameRoom cu echipa si spawn sigur.", 460)
    steps = [
        ("1.Connect\n/ws/game", "#e7f5ff"),
        ("2.connected", "#fff3bf"),
        ("3.join+name", "#e7f5ff"),
        ("4.Validare", "#ffe3e3"),
        ("5.joinRoom", "#ffe3e3"),
        ("6.spawn", "#ffe3e3"),
        ("7.joined", "#d3f9d8"),
        ("8.input 60Hz", "#d3f9d8"),
    ]
    for i, (lbl, bg) in enumerate(steps):
        bx = COL_L + i * 158
        b.box(bx, cy, 145, 95, lbl, bg, size=11)
        if i > 0:
            b.arrow(bx - 13, cy + 47, bx, cy + 47)
    b.box(COL_L, cy + 120, 1240, 90,
        "Validari: nume 3-16 chars [a-zA-Z0-9_-] | character whitelist | nume unic | max 32 jucatori | "
        "disconnect -> leaveRoom + reconnect 1.5s", "#f8f9fa", size=12)
    y += 500

    # 03 Networking
    cy = b.section(y, "03", "Networking si Anti-Cheat",
        "Client trimite intentii (taste). Server trimite starea completa. Nu poti modifica HP din browser.", 580)
    b.label(COL_L, cy, "Client -> Server (60/s)", size=16, bold=True, color="#1971c2")
    for i, lbl in enumerate(["join", "input+seq", "buyWeapon", "chat", "admin"]):
        b.box(COL_L + i * 250, cy + 28, 230, 75, lbl, "#a5d8ff", size=13)
    b.label(COL_L, cy + 120, "Server -> Client (30/s) GameSnapshot:", size=16, bold=True, color="#c92a2a")
    b.box(COL_L, cy + 148, 1240, 170,
        "serverTime | players[] (x,y,z,hp,ammo,lastProcessedInputSequence) | bullets[]\n"
        "killFeed[] | chatMessages[] | round (timer, scor RED/BLUE)\n\n"
        "ConcurrentWebSocketSessionDecorator: client lent nu blocheaza broadcast", "#ffc9c9", size=12)
    b.box(COL_L, cy + 340, 400, 70, "Client: 60 Hz input | Server: 30 TPS", "#e7f5ff", size=12)
    b.box(440, cy + 340, 400, 70, "sequence: 1,2,3... pentru reconciliere", "#d3f9d8", size=12)
    b.box(880, cy + 340, 400, 70, "WS buffer 512KB, send limit 15ms", "#fff3bf", size=12)
    y += 620

    # 04 Scenariu W
    cy = b.section(y, "04", "Scenariu: Tii W apasat 2 secunde",
        "Timeline concret - ce se intampla pe wire si pe ecran.", 480)
    b.box(COL_L, cy, 600, 310,
        "T=0ms: W apasat, predictie x=120, trimite seq=1\n"
        "T=16ms: seq=2, predictie x=124\n"
        "T=33ms: SERVER TICK -> x=128 autoritate, snapshot seq=3\n"
        "T=33ms: reconcile - sterge pending <=3, re-simuleaza rest\n"
        "T=66ms: TICK #2 -> x=143\n"
        "...\n"
        "T=2000ms: eliberezi W, friction opreste gradual", "#f8f9fa", size=12)
    b.box(680, cy, 580, 145,
        "TU: predictie 60 FPS + reconciliere\n"
        "Eroare <2.5px ignorata\n"
        "Eroare mare -> corectie 12-40%", "#d3f9d8", size=13)
    b.box(680, cy + 165, 580, 145,
        "ALTIILOR: interpolare intre snapshot-uri\n"
        "Delay ~80ms = miscare lina\n"
        "Nu ghicesc pozitia - doar serverul stie", "#fff3bf", size=13)
    y += 520

    # 05 Game Loop
    cy = b.section(y, "05", "Game Loop Server",
        "GameLoop.java - ScheduledExecutorService, thread dedicat, 30 tick/s.", 360)
    b.flow_chain(COL_L, cy, [
        ("start", "#e5dbff"), ("33ms tick", "#fff3bf"),
        ("room.tick()", "#ffc9c9"), ("broadcast", "#d3f9d8"),
    ], w=200, h=75, gap=28)
    b.box(COL_L, cy + 100, 1240, 120,
        "1.updateRound  2.updatePlayers  3.updateBullets  4.handleBulletHits  5.broadcastSnapshot\n"
        "deltaSeconds = 1/30 = 0.0333s", "#ffe3e3", size=12)
    y += 400

    # 06 GameRoom
    cy = b.section(y, "06", "GameRoom",
        "O instanta de meci: players, bullets, killFeed, chat, coliziuni, scor.", 440)
    b.box(COL_L, cy, 380, 180,
        "Echipe: RED/BLUE auto-balance\nSpawn safe: 48 incercari\nMAX 32 jucatori\nHarta 3800x3400", "#d3f9d8", size=12)
    b.box(480, cy, 380, 180,
        "Runda: 180 sec (3 min)\nPauza daca <2 jucatori\nENDING: 10s display\nReset scor + respawn", "#fff3bf", size=12)
    b.box(880, cy, 420, 180,
        "Admin: freeze, money, fly, tp\nrespawn, reloadcollision", "#ffe3e3", size=12)
    b.box(COL_L, cy + 200, 1240, 55, "Kill inamic -> +150$ | Headshot = HP 0 instant | Respawn safe", "#f8f9fa", size=12)
    y += 480

    # 07 Predictie
    cy = b.section(y, "07", "Predictie Client",
        "prediction.js - aceeasi fizica ca serverul, 60 FPS, tickLocalPrediction().", 380)
    b.flow_chain(COL_L, cy, [
        ("keys.up", "#d3f9d8"), ("buildInput", "#a5d8ff"),
        ("simulate", "#d3f9d8"), ("render", "#e5dbff"),
    ], w=155, h=70, gap=22)
    b.box(COL_L, cy + 95, 1240, 100,
        "friction -> wishDirection -> accelerate -> move+collision -> gravity/jump -> depenetration\n"
        "Constante identice in config.js si GameRoom.java", "#e7f5ff", size=12)
    y += 420

    # 08 Reconciliere
    cy = b.section(y, "08", "Reconciliere",
        "La fiecare snapshot: reset server, filtreaza pending, re-simuleaza, corecteaza.", 400)
    for i, (t, body) in enumerate([
        ("Reset", "predictedSelf = pozitia server"),
        ("Filtreaza", "pendingInputs > lastProcessedSeq"),
        ("Re-simuleaza", "input ramase cu DT=1/60"),
        ("Corectie XY", "daca >2.5px: strength 12-40%"),
        ("Corectie Z", "errorZ * 0.28"),
    ]):
        b.box(COL_L + i * 250, cy, 230, 100, f"Pas {i+1}: {t}\n{body}", "#e7f5ff", size=12)
    y += 440

    # 09 Interpolare
    cy = b.section(y, "09", "Interpolare si Network Clock",
        "Buffer snapshot-uri + lerp. estimatedServerTime sincronizat cu serverTime.", 440)
    b.box(COL_L, cy, 580, 150,
        "clockOffset += (serverTime-now-offset)*0.12\n"
        "renderTime = estimatedServerTime - 80ms - latency*0.5\n"
        "x = lerp(x_old, x_new, progress)", "#e7f5ff", size=12)
    b.box(680, cy, 580, 150,
        "Buffer max 8 snapshot/player\n"
        "Salt >220px -> snap direct\n"
        "Gloanțe: fade 120ms la disparitie", "#d3f9d8", size=12)
    b.line_graph([(COL_L + 40, cy + 250), (COL_L + 200, cy + 230), (COL_L + 400, cy + 215),
                  (COL_L + 600, cy + 205)], "#868e96", 2)
    b.line_graph([(COL_L + 40, cy + 290), (COL_L + 200, cy + 275), (COL_L + 400, cy + 265),
                  (COL_L + 600, cy + 258)], "#1971c2", 2)
    b.label(COL_L + 40, cy + 310, "trepte server (gri) vs interpolat (albastru)", size=11, color="#495057")
    y += 480

    # 10 Fizica
    cy = b.section(y, "10", "Fizica - Formule",
        "Quake/Source style. Identic server + client.", 580)
    b.box(COL_L, cy, 620, 420,
        "FRICȚIUNE:\n"
        "speed = sqrt(vx^2+vy^2)\n"
        "control = max(speed, 82)\n"
        "drop = control * 7.4 * dt\n"
        "newSpeed = max(speed-drop, 0)\n\n"
        "ACCELERARE:\n"
        "wishX = cos(a)*fwd - sin(a)*strafe\n"
        "currentSpeed = vx*wishX + vy*wishY\n"
        "accSpeed = min(2550*dt, v_max-current)\n"
        "vx += accSpeed*wishX\n\n"
        "JUMP: vz=520, vx*=1.09 (bunnyhop)\n"
        "AIR: vz -= 1350*dt", "#f8f9fa", size=12)
    b.box(720, cy, 580, 420,
        "CONSTANTE:\n"
        "v_max normal = 460\n"
        "v_max sprint = 667 (x1.45)\n"
        "v_max crouch = 239 (x0.52)\n"
        "accel aer = x0.45\n"
        "dt server = 1/30\n"
        "dt client = 1/60\n\n"
        "t_peak jump = 0.39s\n"
        "h_max jump = 100 unitati\n\n"
        "Glonț:\n"
        "vx = lookDirX * bulletSpeed\n"
        "t = clamp(dot/|seg|^2, 0, 1)", "#e7f5ff", size=12)
    y += 620

    # 11 Grafice
    cy = b.section(y, "11", "Grafice Fizica", "Vizualizare comportament viteza si inaltime.", 420)
    gx, gy = COL_L, cy
    b.label(gx, gy, "A) Frecțiune", size=14, bold=True)
    b.line_graph([(gx + 30, gy + 150), (gx + 30, gy + 40), (gx + 280, gy + 150)], "#495057", 2)
    pts = [(gx + 30, gy + 150)]
    for i in range(1, 20):
        t = i / 19
        v = 667 * (1 - t) ** 1.8
        pts.append((gx + 30 + t * 250, gy + 150 - (v / 667) * 110))
    b.line_graph(pts, "#e03131", 3)

    gx = 400
    b.label(gx, gy, "B) Accelerare sprint", size=14, bold=True)
    b.line_graph([(gx + 30, gy + 150), (gx + 30, gy + 40), (gx + 280, gy + 150)], "#495057", 2)
    pts2 = [(gx + 30, gy + 150)]
    for i in range(1, 16):
        t = i / 15
        v = 667 * (1 - 2.718 ** (-5 * t))
        pts2.append((gx + 30 + t * 250, gy + 150 - (v / 667) * 110))
    b.line_graph(pts2, "#1971c2", 3)

    gx = 720
    b.label(gx, gy, "C) Saritura z(t)", size=14, bold=True)
    b.line_graph([(gx + 30, gy + 150), (gx + 30, gy + 40), (gx + 280, gy + 150)], "#495057", 2)
    pts3 = []
    for i in range(25):
        t = i / 24 * 0.76
        z = max(0, 520 * t - 0.5 * 1350 * t * t)
        pts3.append((gx + 30 + t / 0.76 * 250, gy + 150 - (z / 100) * 110))
    b.line_graph(pts3, "#2f9e44", 3)
    y += 460

    # 12 Hit detection
    cy = b.section(y, "12", "Hit Detection 3D",
        "Segment glonț vs cilindru. Headshot = kill instant. Doar pe server.", 460)
    b.box(COL_L + 40, cy + 30, 120, 70, "HEAD r=10\nz:42-64\nKILL", "#ff6b6b", size=12)
    b.box(COL_L + 30, cy + 120, 140, 90, "BODY r=14\nz:0-64\n-damage", "#ffc9c9", size=12)
    b.box(320, cy, 520, 230,
        "closest = P0 + t*(P1-P0)\n"
        "t = clamp(dot(P-P0,dP)/|dP|^2, 0, 1)\n"
        "d_h = dist(closest, playerXY)\n\n"
        "HEAD: d<=10 AND z in [42,64]\n"
        "BODY: d<=14 AND z in [0,64]", "#f8f9fa", size=12)
    b.box(880, cy, 420, 230,
        "Shotgun: 6 pellet, spread 0.22\n"
        "Sniper: dmg 90, spread 0.01\n"
        "Rifle: dmg 22, cooldown 120ms\n"
        "Glonț expira 1200ms", "#fff3bf", size=12)
    y += 500

    # 13 Coliziuni
    cy = b.section(y, "13", "Coliziuni",
        "Box-uri AABB rotite din scene.json + profiles. Fara physics engine.", 400)
    b.flow_chain(COL_L, cy, [
        ("scene.json", "#e5dbff"), ("profiles", "#e5dbff"),
        ("CollisionBox", "#fff3bf"), ("solid?", "#ffc9c9"), ("walkable", "#d3f9d8"),
    ], w=145, h=70, gap=16)
    b.box(COL_L, cy + 95, 600, 120,
        "localX = (x-cx)*cos(yaw) + (y-cy)*sin(yaw)\n"
        "Pasi de 6 unitati | step-up <=20 | resolvePenetration max 4 treceri", "#e7f5ff", size=12)
    b.box(680, cy + 95, 600, 120,
        "Profile: exact path -> prefix (/models/wall-) -> default\n"
        "admin reloadcollision = fara restart", "#fff3bf", size=12)
    y += 440

    # 14 Arme
    cy = b.section(y, "14", "Arme si Economie", "5 arme, kill +150$, shop cu B.", 360)
    for i, (lbl, bg) in enumerate([
        ("Pistol 0$\n25dmg 420ms", "#ced4da"),
        ("Rifle 0$\n22dmg 120ms", "#a5d8ff"),
        ("SMG 250$\n16dmg 85ms", "#b2f2bb"),
        ("Shotgun 400$\n14x6", "#fff3bf"),
        ("Sniper 650$\n90dmg", "#ffc9c9"),
    ]):
        b.box(COL_L + i * 250, cy, 230, 110, lbl, bg, size=12)
    b.box(COL_L, cy + 130, 1240, 55,
        "DPS: Pistol 59 | Rifle 183 | SMG 188 | Shotgun 112 | Sniper 75", "#f8f9fa", size=12)
    y += 400

    # 15 World Editor
    cy = b.section(y, "15", "World Editor", "Harta editabila live, data/world/ extern JAR.", 340)
    b.flow_chain(COL_L, cy, [
        ("editor ON", "#d3f9d8"), ("plaseaza", "#d3f9d8"),
        ("POST scene", "#fff3bf"), ("salveaza", "#e5dbff"), ("reload col", "#ffe3e3"),
    ], w=155, h=70, gap=18)
    b.box(COL_L, cy + 95, 1240, 70,
        "GET/POST /api/world/scene | GET /api/world/models | POST /api/world/collision-profile", "#e7f5ff", size=12)
    y += 380

    # 16 Randare
    cy = b.section(y, "16", "Randare Three.js", "renderer3d.js - 60 FPS, nu afecteaza gameplay.", 360)
    b.flow_chain(COL_L, cy, [
        ("predictie", "#a5d8ff"), ("interpolare", "#d3f9d8"),
        ("camera", "#fff3bf"), ("render", "#e5dbff"),
    ], w=155, h=70, gap=22)
    b.box(COL_L, cy + 95, 1240, 80,
        "GLB personaje/arme | OBJ harta | viewmodel | remote animatie | FOV 75/62 ADS | performance mode", "#f8f9fa", size=12)
    y += 400

    # 17 Java
    cy = b.section(y, "17", "Java Backend", "20 fisiere Java, Spring Boot 4, Java 21.", 420)
    b.box(COL_L, cy, 380, 250,
        "config/\nWebSocketConfig\nGameProperties\nJacksonConfig\n\nwebsocket/\nGameWebSocketHandler", "#ffe3e3", size=12)
    b.box(480, cy, 380, 250,
        "game/\nGameLoop\nGameRoomManager\nGameRoom (~1900 linii)\n\nmodel/\nPlayerState\nGameSnapshot\nWeaponType", "#ffc9c9", size=12)
    b.box(880, cy, 420, 250,
        "world/WorldStorageService\nweb/WorldSceneController\n\napplication.properties\nport 8080, 30 TPS, compression", "#e5dbff", size=12)
    b.label(COL_L, cy + 270, "- Sfarsit diagrame VoidStrike -", size=16, color="#868e96")


def main():
    b = ExcalidrawBuilder()
    build_diagrams(b)
    elements = b.build()

    doc = {
        "type": "excalidraw",
        "version": 2,
        "source": "https://excalidraw.com",
        "elements": elements,
        "appState": {
            "gridSize": 20,
            "viewBackgroundColor": "#ffffff",
            "currentItemStrokeColor": "#1e1e1e",
            "currentItemBackgroundColor": "transparent",
            "currentItemFillStyle": "solid",
            "currentItemStrokeWidth": 2,
            "currentItemStrokeStyle": "solid",
            "currentItemRoughness": 1,
            "currentItemOpacity": 100,
            "currentItemFontFamily": 5,
            "currentItemFontSize": 20,
            "currentItemTextAlign": "left",
            "currentItemStartArrowhead": None,
            "currentItemEndArrowhead": "arrow",
            "scrollX": 0,
            "scrollY": 0,
            "zoom": {"value": 0.3},
            "theme": "light",
            "collaborators": [],
        },
        "files": {},
    }

    os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
    with open(OUTPUT, "w", encoding="utf-8", newline="\n") as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print(f"Created: {OUTPUT}")
    print(f"Elements: {len(elements)}")
    print(f"Order: {len(b.shapes)} shapes + {len(b.arrows)} arrows + {len(b.texts)} texts")


if __name__ == "__main__":
    main()
