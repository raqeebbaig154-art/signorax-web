# Run from signorax-web:  python check_word.py Happy
import json, os, sys, time
w = sys.argv[1] if len(sys.argv) > 1 else "Happy"
raw = open("sign_specs.json", encoding="utf-8").read()
print(f'"{w}" appears {raw.count(chr(34) + w + chr(34) + ": {") + raw.count(chr(34) + w + chr(34) + ":{")} time(s) in sign_specs.json (must be 1)')
spec = json.loads(raw).get(w)
if spec is None:
    print("no spec loaded for this word")
else:
    L = spec.get("L", {})
    print("stable:", spec.get("stable"), "| L has spread:", "spread" in L, "| touch x offset:", (spec.get("touch") or [{}])[0].get("offset"))
lk = json.load(open("locked_words.json")) if os.path.exists("locked_words.json") else []
print("locked:", w in lk)
p = os.path.join("public", "animations", "Sign_" + w.lower() + ".json")
if not os.path.exists(p):
    print("clip file missing:", p)
else:
    c = json.load(open(p))
    print("clip file:", os.path.abspath(p))
    print("saved:", time.ctime(os.path.getmtime(p)), "| now:", time.ctime(), "| duration:", c["duration"], "| source:", c.get("source"))
    q = c["bones"]["DEF-f_index.02.L"]
    n = c["frames"]
    for fr in (0.20, 0.35, 0.60):
        i = int(fr * (n - 1)) * 4
        print(f"  index finger quat at {fr}:", q[i:i + 4])
