"""big.json を読み続け、書き込みの途中の内容（空・短い・混ざった）が見えるかを数える。"""

import collections
import sys
import time

path, seconds = sys.argv[1], float(sys.argv[2])
n = int(sys.argv[3]) if len(sys.argv) > 3 else 3_500_000
mix = len(sys.argv) > 4 and sys.argv[4] == "1"
full = {f'{{"k":"{c * (n // 1000 if c == "b" and mix else n)}"}}\n'.encode() for c in "ab"}
cnt: collections.Counter = collections.Counter()
samples = []
end = time.time() + seconds
while time.time() < end:
    try:
        with open(path, "rb") as f:
            b = f.read()
    except FileNotFoundError:
        cnt["missing"] += 1
        continue
    if b in full:
        cnt["full-" + chr(b[6])] += 1
        continue
    kind = "empty" if not b else ("mixed" if b"a" * 8 in b and b"b" * 8 in b else ("unterminated" if not b.endswith(b"}\n") else "other"))
    cnt[kind] += 1
    if len(samples) < 5:
        samples.append((kind, len(b)))
print(dict(cnt), samples)
