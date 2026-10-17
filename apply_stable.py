# Run once from the signorax-web folder: python apply_stable.py
import json, py_compile, shutil, sys

S, J = "psl_to_joe.py", "sign_specs.json"
A1 = "    pose = gsmooth(resample(pose, t_in, t_out), 1.6)\n"
B1 = '    pose = gsmooth(resample(pose, t_in, t_out), 3.5 if (spec or {}).get("stable") else 1.6)\n'
A2 = "                w = env[f] if b in arm else env[f] * weights[s][f]\n"
B2 = '                w = env[f] if (b in arm or (spec or {}).get("stable")) else env[f] * weights[s][f]\n'

src = open(S, encoding="utf-8").read()
if B1 in src and B2 in src:
    print("psl_to_joe.py already patched")
else:
    if src.count(A1) != 1 or src.count(A2) != 1:
        sys.exit("STOP: expected lines not found exactly once in psl_to_joe.py. Nothing changed.")
    shutil.copy(S, S + ".bak")
    open(S, "w", encoding="utf-8", newline="").write(src.replace(A1, B1).replace(A2, B2))
    py_compile.compile(S, doraise=True)
    print("psl_to_joe.py patched (backup: psl_to_joe.py.bak)")

js = open(J, encoding="utf-8").read()
if '"stable"' in js:
    print("sign_specs.json already has stable")
else:
    key = '"Come": {'
    if js.count(key) != 1:
        sys.exit("STOP: \"Come\": { not found exactly once in sign_specs.json. Nothing changed there.")
    shutil.copy(J, J + ".bak")
    new = js.replace(key, key + '\n  "stable": true,')
    json.loads(new)
    open(J, "w", encoding="utf-8", newline="").write(new)
    print("sign_specs.json patched (backup: sign_specs.json.bak)")
