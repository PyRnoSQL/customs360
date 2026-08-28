import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

with open('frontend/src/App.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
added = []

for i, line in enumerate(lines):
    # Add DouaniersPage import after DelaysPage import (line 18)
    if "import DelaysPage from './pages/Delays'" in line:
        new_lines.append(line)
        new_lines.append("import DouaniersPage from './pages/Douaniers';\n")
        added.append("import DouaniersPage")
        continue

    # Add Predictions import after GraphPage import (line 22)
    if "import GraphPage from './pages/GraphPage'" in line:
        new_lines.append(line)
        new_lines.append("import Predictions from './pages/Predictions';\n")
        added.append("import Predictions")
        continue

    # Add /douaniers route after /offices route
    if 'path="/offices"' in line and 'ProtectedRoute' in line and 'Route' in line:
        new_lines.append(line)
        new_lines.append('            <Route path="/douaniers" element={<ProtectedRoute path="/douaniers" element={<DouaniersPage key={sgdCount} />} />} />\n')
        added.append("Route /douaniers")
        continue

    # Add /predictions route after /graph route
    if 'path="/graph"' in line and 'ProtectedRoute' in line and 'Route' in line:
        new_lines.append(line)
        new_lines.append('            <Route path="/predictions" element={<ProtectedRoute path="/predictions" element={<Predictions key={sgdCount} />} />} />\n')
        added.append("Route /predictions")
        continue

    new_lines.append(line)

with open('frontend/src/App.tsx', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print(f"Added {len(added)} items:")
for a in added:
    print(f"  [OK] {a}")

if len(added) < 4:
    print("\n[WARN] Expected 4 additions. Check manually.")
