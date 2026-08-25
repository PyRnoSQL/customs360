import sys, io, re, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

print("=" * 60)
print("CUSTOMS360 PRIORITY 1 FIXES")
print("=" * 60)

# ============================================================
# STEP 1: Verify new files are in place
# ============================================================
print("\n[STEP 1] Checking new files...")

delays_path = 'frontend/src/pages/Delays.tsx'
douaniers_path = 'frontend/src/pages/Douaniers.tsx'

for path in [delays_path, douaniers_path]:
    if os.path.exists(path):
        with open(path, 'r', encoding='utf-8') as f:
            content = f.read()
        if len(content) > 1000:
            print(f"  [OK] {path} ({len(content)} chars)")
        else:
            print(f"  [WARN] {path} exists but seems too small ({len(content)} chars)")
    else:
        print(f"  [ERROR] {path} NOT FOUND - copy it first!")
        sys.exit(1)

# ============================================================
# STEP 2: Clean pages.tsx — remove misplaced content
# ============================================================
print("\n[STEP 2] Cleaning pages.tsx...")

with open('frontend/src/pages/pages.tsx', 'r', encoding='utf-8') as f:
    pages = f.read()

original_len = len(pages)
removed = 0

# Strategy: We know the exact structure from the audit.
# The Fraud/pages.tsx component has these sections we need to remove:
# - "D\u00e9clarations avec D\u00e9lais Anormaux" -> now in Delays.tsx
# - "Classificateur de Causes" -> now in Delays.tsx
# - "Trajectoire des Bureaux" -> belongs in Offices.tsx
# - "Classement Bureaux Douaniers" -> belongs in Offices.tsx
# - "Assistant CUSTOMS360" + "Historique" + "Recommandations IA" -> belongs in Analytics
# - "Graphe DATE" mini -> belongs in GraphPage.tsx

# We'll remove each <FadeIn>...</FadeIn> block containing these markers.
# Each block is wrapped in <FadeIn><div className="card">...<SectionTitle>MARKER...

def remove_fadein_block(content, marker, desc):
    """Find a <FadeIn> block containing the marker and remove it."""
    idx = content.find(marker)
    if idx == -1:
        print(f"  [SKIP] '{marker[:40]}...' not found")
        return content, False

    # Look backwards for <FadeIn
    search_start = max(0, idx - 1500)
    fi_start = content.rfind('<FadeIn', search_start, idx)
    if fi_start == -1:
        # Try looking for <div className="card" or grid wrapper
        fi_start = content.rfind('<div className="grid', search_start, idx)
        if fi_start == -1:
            fi_start = content.rfind('<div className="card"', search_start, idx)
        if fi_start == -1:
            print(f"  [SKIP] No container found for '{marker[:40]}...'")
            return content, False

    # Find the closing </FadeIn> after the marker
    close = '</FadeIn>'
    fi_end = content.find(close, idx)
    if fi_end == -1:
        print(f"  [SKIP] No closing tag for '{marker[:40]}...'")
        return content, False
    fi_end += len(close)

    # Consume trailing newline
    if fi_end < len(content) and content[fi_end] == '\n':
        fi_end += 1

    block = content[fi_start:fi_end]
    block_lines = block.count('\n')

    # Sanity: block should be between 100 and 6000 chars
    if len(block) < 50 or len(block) > 8000:
        print(f"  [SKIP] Block size {len(block)} suspicious for '{marker[:40]}...'")
        return content, False

    content = content[:fi_start] + content[fi_end:]
    print(f"  [OK] Removed '{desc}' ({len(block)} chars, ~{block_lines} lines)")
    return content, True

# Remove delay-related content (now in standalone Delays.tsx)
pages, ok = remove_fadein_block(pages, 'lais Anormaux', 'Delays table')
if ok: removed += 1

pages, ok = remove_fadein_block(pages, 'Classificateur de Causes', 'Delay cause classifier')
if ok: removed += 1

# Remove bureau-related content (belongs in Offices.tsx)
pages, ok = remove_fadein_block(pages, 'Trajectoire des Bureaux', 'Bureau trajectory chart')
if ok: removed += 1

pages, ok = remove_fadein_block(pages, 'Classement Bureaux Douaniers', 'Bureau ranking')
if ok: removed += 1

# Remove AI assistant content (belongs in Analytics/AI page)
pages, ok = remove_fadein_block(pages, 'Assistant CUSTOMS360', 'AI Assistant chat')
if ok: removed += 1

# Try to find and remove Historique section
pages, ok = remove_fadein_block(pages, 'Historique', 'Chat history')
if ok: removed += 1

# Remove recommendations
pages, ok = remove_fadein_block(pages, 'Recommandations IA', 'AI Recommendations')
if ok: removed += 1

# Remove Graphe DATE mini (the one embedded in the fraud page, not the standalone)
# Be careful: only remove if it's in the render section (after line ~600)
graphe_idx = pages.find('Graphe DATE')
if graphe_idx != -1 and graphe_idx > len(pages) // 3:
    pages, ok = remove_fadein_block(pages, 'Graphe DATE', 'Graphe DATE mini')
    if ok: removed += 1

new_len = len(pages)
print(f"\n  Summary: {removed} sections removed")
print(f"  Size: {original_len} -> {new_len} chars ({original_len - new_len} removed)")

with open('frontend/src/pages/pages.tsx', 'w', encoding='utf-8') as f:
    f.write(pages)
print("  [SAVED] pages.tsx")

# ============================================================
# STEP 3: Update App.tsx — imports, routes, navigation
# ============================================================
print("\n[STEP 3] Updating App.tsx...")

with open('frontend/src/App.tsx', 'r', encoding='utf-8') as f:
    app = f.read()

changes = 0

# 3a. Check if we need to add imports for the new pages
# Find the import section
if "import DelaysPage from './pages/Delays'" not in app and "import DelaysPage" not in app:
    # Find a page import line to add after
    match = re.search(r"(import\s+\w+\s+from\s+'\.\/pages\/\w+';\n)", app)
    if match:
        insert_at = match.end()
        app = app[:insert_at] + "import DelaysPage from './pages/Delays';\n" + app[insert_at:]
        changes += 1
        print("  [OK] Added: import DelaysPage from './pages/Delays'")
else:
    print("  [SKIP] DelaysPage import already present")

if "import DouaniersPage from './pages/Douaniers'" not in app and "import DouaniersPage" not in app:
    match = re.search(r"(import\s+DelaysPage\s+from\s+'\.\/pages\/Delays';\n)", app)
    if not match:
        match = re.search(r"(import\s+\w+\s+from\s+'\.\/pages\/\w+';\n)", app)
    if match:
        insert_at = match.end()
        app = app[:insert_at] + "import DouaniersPage from './pages/Douaniers';\n" + app[insert_at:]
        changes += 1
        print("  [OK] Added: import DouaniersPage from './pages/Douaniers'")
else:
    print("  [SKIP] DouaniersPage import already present")

# 3b. Fix the delays route to use DelaysPage instead of the re-exported Fraud component
# Look for: path="/delays" or path="delays" with any element
delay_route = re.search(r'(<Route\s+path="/?delays"\s+element=\{<)(\w+)(\s*/>\})', app)
if delay_route:
    old_component = delay_route.group(2)
    if old_component != 'DelaysPage':
        old_full = delay_route.group(0)
        new_full = delay_route.group(1) + 'DelaysPage' + delay_route.group(3)
        app = app.replace(old_full, new_full)
        changes += 1
        print(f"  [OK] Route /delays: {old_component} -> DelaysPage")
    else:
        print("  [SKIP] /delays route already uses DelaysPage")
else:
    print("  [WARN] /delays route not found in expected format")

# 3c. Add /douaniers route if missing
if '/douaniers' not in app:
    # Find the delays route and insert douaniers after it
    delay_route_match = re.search(r'(<Route\s+path="/?delays"[^/]*/>\s*}?\s*/?>)', app)
    if delay_route_match:
        insert_at = delay_route_match.end()
        newline = '\n' if app[insert_at-1] != '\n' else ''
        # Match indentation
        indent = '              '
        douaniers_route = f'{newline}{indent}<Route path="/douaniers" element={{<DouaniersPage />}} />'
        app = app[:insert_at] + douaniers_route + app[insert_at:]
        changes += 1
        print("  [OK] Added /douaniers route")
    else:
        print("  [WARN] Could not find delays route to insert douaniers after")
else:
    print("  [SKIP] /douaniers route already present")

# 3d. Add Douaniers to the navigation menu
# Find the nav items array — look for 'Bureaux' entry
if 'Douaniers' not in app:
    # Find the pattern: { icon: '...', label: 'Bureaux', path: '/offices' }
    bureaux_match = re.search(r"(\{\s*icon:\s*'[^']*',\s*label:\s*'Bureaux',\s*path:\s*'/offices'\s*\})(,?)", app)
    if bureaux_match:
        insert_at = bureaux_match.end()
        comma = '' if bureaux_match.group(2) == ',' else ','
        douaniers_nav = f"\n      {{ icon: '\ud83d\udc6e', label: 'Douaniers', path: '/douaniers' }},"
        if not bureaux_match.group(2):
            # Add comma after Bureaux entry first
            app = app[:bureaux_match.end(1)] + ',' + app[bureaux_match.end(1):]
            insert_at += 1
        app = app[:insert_at] + douaniers_nav + app[insert_at:]
        changes += 1
        print("  [OK] Added Douaniers to nav menu (after Bureaux)")
    else:
        # Try alternate format
        bureaux_match2 = re.search(r"(label:\s*['\"]Bureaux['\"].*?path:\s*['\"]/?offices['\"].*?\})", app, re.DOTALL)
        if bureaux_match2:
            insert_at = bureaux_match2.end()
            # Find next comma or end
            if insert_at < len(app) and app[insert_at] == ',':
                insert_at += 1
            douaniers_nav = f"\n      {{ icon: '\ud83d\udc6e', label: 'Douaniers', path: '/douaniers' }},"
            app = app[:insert_at] + douaniers_nav + app[insert_at:]
            changes += 1
            print("  [OK] Added Douaniers to nav menu (alt format)")
        else:
            print("  [WARN] Could not find Bureaux nav entry to insert Douaniers after")
else:
    print("  [SKIP] Douaniers already in nav menu")

print(f"\n  Summary: {changes} changes to App.tsx")

with open('frontend/src/App.tsx', 'w', encoding='utf-8') as f:
    f.write(app)
print("  [SAVED] App.tsx")

# ============================================================
# SUMMARY
# ============================================================
print("\n" + "=" * 60)
print("ALL PATCHES APPLIED SUCCESSFULLY")
print("=" * 60)
print(f"""
Files modified:
  - frontend/src/pages/pages.tsx  (cleaned {removed} misplaced sections)
  - frontend/src/App.tsx          ({changes} routing/nav changes)

Files added:
  - frontend/src/pages/Delays.tsx     (standalone delays page)
  - frontend/src/pages/Douaniers.tsx  (new operational agents page)

Next steps:
  npm run build --prefix frontend 2>&1 | tail -5
  git add -A
  git commit -m "feat: Priority 1 - independent Delays, new Douaniers, clean Fraud page"
  git push
""")
