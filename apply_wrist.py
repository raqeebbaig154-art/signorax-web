# Run once from the signorax-web folder: python apply_wrist.py
import json, py_compile, re, shutil, sys

S, J = "psl_to_joe.py", "sign_specs.json"
A = "                    q = clamp_wrist(q, q_rest, 80)\n"
B = '                    q = clamp_wrist(q, q_rest, float((spec or {}).get("wrist_limit", 80)))\n'
src = open(S, encoding="utf-8").read()
if B in src:
    print("psl_to_joe.py already patched")
else:
    if src.count(A) != 1:
        sys.exit("STOP: expected line not found exactly once in psl_to_joe.py. Nothing changed.")
    shutil.copy(S, S + ".bak3")
    open(S, "w", encoding="utf-8", newline="").write(src.replace(A, B))
    py_compile.compile(S, doraise=True)
    print("psl_to_joe.py patched (backup: psl_to_joe.py.bak3)")

js = open(J, encoding="utf-8").read()
m = list(re.finditer(r'"Happy"\s*:\s*\{', js))
if len(m) != 1:
    sys.exit('STOP: "Happy": { not found exactly once in sign_specs.json. Nothing changed there.')
body_start = m[0].end()
depth, i = 1, body_start
while depth:
    depth += {"{": 1, "}": -1}.get(js[i], 0)
    i += 1
if '"wrist_limit"' in js[body_start:i]:
    print("sign_specs.json already has wrist_limit for Happy")
else:
    shutil.copy(J, J + ".bak3")
    new = js[:body_start] + '\n  "wrist_limit": 175,' + js[body_start:]
    json.loads(new)
    open(J, "w", encoding="utf-8", newline="").write(new)
    print("sign_specs.json patched (backup: sign_specs.json.bak3)")
