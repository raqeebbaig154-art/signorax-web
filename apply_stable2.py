# Run once from the signorax-web folder (after apply_stable.py): python apply_stable2.py
import py_compile, shutil, sys

S = "psl_to_joe.py"
A = "        fbs[s] = gsmooth(fb, 2.0) * 1.1\n"
B = '        fbs[s] = gsmooth(fb, 8.0 if (spec or {}).get("stable") else 2.0) * 1.1\n'
src = open(S, encoding="utf-8").read()
if B in src:
    print("already patched")
else:
    if src.count(A) != 1:
        sys.exit("STOP: expected line not found exactly once. Nothing changed.")
    shutil.copy(S, S + ".bak2")
    open(S, "w", encoding="utf-8", newline="").write(src.replace(A, B))
    py_compile.compile(S, doraise=True)
    print("patched (backup: psl_to_joe.py.bak2)")
