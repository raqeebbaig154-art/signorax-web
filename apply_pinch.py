# Run once from the signorax-web folder: python apply_pinch.py
import py_compile, shutil, sys

S = "psl_to_joe.py"
METHOD = '    def _pinch_thumb(self, side, local, new_R, w):\n        """Pinch: bring the thumb tip and all four fingertips together at one point (a closed bud)."""\n        P = self.hand_points(side, local)\n        order = ["thumb", "f_index", "f_middle", "f_ring", "f_pinky"]\n        s_hat = unit(P[13] - P[4])\n        mid_tip, thumb_base = P[18], P[1]\n        C = 0.6 * mid_tip + 0.4 * thumb_base\n        offs = {"thumb": -0.015, "f_index": -0.009, "f_middle": -0.003, "f_ring": 0.003, "f_pinky": 0.009}\n        for fi, f in enumerate(order):\n            J = [P[1 + 3 * fi].copy(), P[2 + 3 * fi].copy(), P[3 + 3 * fi].copy(), P[16 + fi].copy()]\n            lens = [np.linalg.norm(J[i + 1] - J[i]) for i in range(3)]\n            target = C + s_hat * offs[f]\n            base = J[0].copy()\n            pts = [p.copy() for p in J]\n            for _ in range(15):\n                pts[3] = target.copy()\n                for i in (2, 1, 0):\n                    pts[i] = pts[i + 1] + unit(pts[i] - pts[i + 1]) * lens[i]\n                pts[0] = base.copy()\n                for i in (0, 1, 2):\n                    pts[i + 1] = pts[i] + unit(pts[i + 1] - pts[i]) * lens[i]\n            prev = f"DEF-hand.{side}"\n            for i, b in enumerate([f"DEF-{f}.0{k}.{side}" for k in (1, 2, 3)]):\n                d = unit((1 - w) * unit(J[i + 1] - J[i]) + w * unit(pts[i + 1] - pts[i]))\n                self._swing_child(b, new_R[prev], d, new_R, local)\n                prev = b\n'

edits = [
    ('("spread", float), ("shape", lambda', '("spread", float), ("pinch", float), ("shape", lambda'),
    ('"spread": out.get("spread")}', '"spread": out.get("spread"), "pinch": out.get("pinch")}'),
    ("        return local, new_R\n\n    def hand_points(self, side, local):",
     "        pinch = over.get(\"pinch\") or 0.0\n        if pinch > 0 and hand is not None and np.isfinite(hand).all():\n            self._pinch_thumb(side, local, new_R, float(pinch))\n        return local, new_R\n\n" + METHOD + "\n    def hand_points(self, side, local):"),
]
src = open(S, encoding="utf-8").read()
if "_pinch_thumb" in src:
    print("already patched")
    sys.exit()
for a, b in edits:
    if src.count(a) != 1:
        sys.exit("STOP: expected text not found exactly once:\n" + a[:80] + "\nNothing changed.")
shutil.copy(S, S + ".bak4")
for a, b in edits:
    src = src.replace(a, b)
open(S, "w", encoding="utf-8", newline="").write(src)
py_compile.compile(S, doraise=True)
print("patched (backup: psl_to_joe.py.bak4)")
