# ──────────────────────────────────────────────────────────────
# Makefile — Whisply (Tauri 2.x + React/Vite + Rust)
#
# Quick start:
#   make windows    → Build .exe + NSIS installer for Windows (cross-compile)
#   make rpm        → Build RPM package for Fedora
#   make all        → Build all Linux bundles (RPM + DEB + AppImage)
#   make dev        → Start dev server with hot-reload
#   make setup      → Install all build deps (Linux + Windows cross)
#
# Targets:
#   all             Build all Linux bundles (RPM + DEB + AppImage)
#   linux           Alias for `all`
#   windows         Cross-compile Windows .exe + NSIS installer
#   windows-exe     Cross-compile raw Windows .exe only (no installer)
#   rpm             Build RPM package for Fedora
#   deb             Build DEB package for Debian/Ubuntu
#   appimage        Build AppImage (portable Linux)
#   dev             Start the Tauri dev server
#   setup           Install all dependencies (Linux + Windows cross)
#   setup-linux     Install Linux system deps
#   setup-windows   Install Windows cross-compilation deps
#   clean           Remove build artifacts
# ──────────────────────────────────────────────────────────────

BUN       := $(shell command -v bun 2>/dev/null || echo bun)
APP_NAME   = whisply

# Output paths
BUNDLE_DIR = src-tauri/target/release/bundle
WIN_TARGET = x86_64-pc-windows-gnu

.PHONY: all linux windows windows-exe rpm deb appimage dev dev-vps setup setup-linux setup-windows clean

# ══════════════════════════════════════════════════════════════
# BUILD TARGETS
# ══════════════════════════════════════════════════════════════

# ── Default: all Linux bundles ───────────────────────────────
all: setup-linux
	@echo ":: Building $(APP_NAME) — all Linux bundles..."
	@cd src-tauri && cargo tauri build --bundles all
	@echo "✓ Done. Artifacts in $(BUNDLE_DIR)/"
	@ls -lh $(BUNDLE_DIR)/rpm/ 2>/dev/null || true
	@ls -lh $(BUNDLE_DIR)/deb/ 2>/dev/null || true
	@ls -lh $(BUNDLE_DIR)/appimage/ 2>/dev/null || true

linux: all

# ── Windows .exe + NSIS installer (cross-compile from Linux) ─
windows: setup-windows
	@echo ":: Building $(APP_NAME) for Windows (cross-compile)..."
	@bun install
	@bun run build
	@cd src-tauri && cargo tauri build \
		--target $(WIN_TARGET) \
		--bundles nsis
	@echo "✓ Done. Windows artifacts:"
	@ls -lh $(BUNDLE_DIR)/nsis/$(WIN_TARGET)/ 2>/dev/null || true
	@# Also find the raw .exe
	@find src-tauri/target/$(WIN_TARGET)/release -maxdepth 1 -name "*.exe" -exec ls -lh {} \; 2>/dev/null || true

# ── Raw Windows .exe only (no installer) ─────────────────────
windows-exe: setup-windows
	@echo ":: Building $(APP_NAME) Windows .exe only..."
	@bun install
	@bun run build
	@cd src-tauri && cargo build --release --target $(WIN_TARGET)
	@echo "✓ Windows .exe:"
	@ls -lh src-tauri/target/$(WIN_TARGET)/release/$(APP_NAME).exe

# ── RPM package ──────────────────────────────────────────────
rpm: setup-linux
	@echo ":: Building $(APP_NAME) RPM package..."
	@cd src-tauri && cargo tauri build --bundles rpm
	@echo "✓ RPM package:"
	@ls -lh $(BUNDLE_DIR)/rpm/

# ── DEB package ──────────────────────────────────────────────
deb: setup-linux
	@echo ":: Building $(APP_NAME) DEB package..."
	@cd src-tauri && cargo tauri build --bundles deb
	@echo "✓ DEB package:"
	@ls -lh $(BUNDLE_DIR)/deb/

# ── AppImage ─────────────────────────────────────────────────
appimage: setup-linux
	@echo ":: Building $(APP_NAME) AppImage..."
	@cd src-tauri && cargo tauri build --bundles appimage
	@echo "✓ AppImage:"
	@ls -lh $(BUNDLE_DIR)/appimage/

# ── Dev server ───────────────────────────────────────────────
dev:
	@cd src-tauri && cargo tauri dev

# ── Remote frontend for a laptop Tauri shell ─────────────────
# Start this on the VPS, then forward port 1420 over SSH from the laptop.
dev-vps:
	@bun run dev:vps

# ══════════════════════════════════════════════════════════════
# DEPENDENCIES
# ══════════════════════════════════════════════════════════════

# ── Everything (Linux + Windows cross) ───────────────────────
setup: setup-linux setup-windows setup-tauri

# ── Tauri CLI ────────────────────────────────────────────────
setup-tauri:
	@if ! command -v cargo-tauri >/dev/null 2>&1 && ! cargo tauri --version >/dev/null 2>&1; then \
		echo ":: Installing Tauri CLI 2.x..."; \
		cargo install tauri-cli --version "^2"; \
		echo "✓ Tauri CLI installed"; \
	else \
		echo "✓ Tauri CLI already available"; \
	fi

# ── Linux system dependencies ────────────────────────────────
setup-linux: | setup-tauri
	@if command -v dnf >/dev/null 2>&1; then \
		echo ":: Fedora — installing Linux deps..."; \
		sudo dnf install -y \
			webkit2gtk4.1-devel \
			gtk3-devel \
			libappindicator-gtk3-devel \
			librsvg2-devel \
			patchelf \
			rpm-build \
			openssl-devel; \
	elif command -v apt-get >/dev/null 2>&1; then \
		echo ":: Debian/Ubuntu — installing Linux deps..."; \
		sudo apt-get update && sudo apt-get install -y \
			libwebkit2gtk-4.1-dev \
			libgtk-3-dev \
			libayatana-appindicator3-dev \
			librsvg2-dev \
			patchelf \
			rpm \
			libssl-dev; \
	else \
		echo ":: Unsupported PM. Install Linux deps manually."; \
	fi
	@echo "✓ Linux deps done"

# ── Windows cross-compilation deps (Fedora) ──────────────────
setup-windows: | setup-tauri
	@if command -v dnf >/dev/null 2>&1; then \
		echo ":: Fedora — installing Windows cross-compile deps..."; \
		sudo dnf install -y \
			mingw64-gcc \
			mingw64-gcc-c++ \
			mingw64-winpthreads-static; \
	elif command -v apt-get >/dev/null 2>&1; then \
		echo ":: Debian/Ubuntu — installing Windows cross-compile deps..."; \
		sudo apt-get update && sudo apt-get install -y \
			mingw-w64 \
			mingw-w64-tools; \
	else \
		echo ":: Unsupported PM. Install mingw-w64 manually."; \
	fi
	@echo ":: Adding Rust target '$(WIN_TARGET)'..."
	@rustup target add $(WIN_TARGET)
	@echo "✓ Windows cross-compile deps done"

# ══════════════════════════════════════════════════════════════
# CLEANUP
# ══════════════════════════════════════════════════════════════

clean:
	@echo ":: Cleaning build artifacts..."
	@cd src-tauri && cargo clean
	@rm -rf dist
	@rm -rf node_modules/.vite
	@echo "✓ Cleaned"
