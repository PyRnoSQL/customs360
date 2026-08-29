import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

with open('backend/src/server.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the static serving block with cache-controlled version
old_static = "app.use(express.static(frontendDist));"
new_static = """app.use(express.static(frontendDist, {
  maxAge: '1y',
  immutable: true,
  setHeaders: (res, filePath) => {
    // Hashed assets (index-BnyescDm.js) can be cached forever
    // But index.html must NEVER be cached — it references the bundle filenames
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));"""

if old_static in content:
    content = content.replace(old_static, new_static, 1)
    print("[OK] Added cache-control headers to static serving")
else:
    print("[WARN] Could not find exact static serving line")
    print("  Looking for:", repr(old_static))
    sys.exit(1)

# Also fix the SPA fallback to send no-cache on index.html
old_fallback = "res.sendFile(path.join(frontendDist, 'index.html'));"
new_fallback = """res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile(path.join(frontendDist, 'index.html'));"""

if old_fallback in content:
    content = content.replace(old_fallback, new_fallback, 1)
    print("[OK] Added no-cache to SPA fallback")
else:
    print("[WARN] Could not find SPA fallback line")

with open('backend/src/server.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print("\nDone. index.html will never be cached again.")
print("Hashed assets (.js, .css) get 1-year cache (they have unique filenames).")
