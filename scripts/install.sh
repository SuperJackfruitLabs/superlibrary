#!/usr/bin/env bash
# install.sh — curl-based installer for suli, Superlibrary's CLI.
#
#   curl -fsSL https://github.com/SuperJackfruitLabs/superlibrary/releases/latest/download/install.sh | bash
#
# Optional env:
#   VERSION           pin a release tag (e.g. v0.0.1); default: the latest release
#   BIN_DIR           where to install; default: ~/.local/bin
#   SULI_RELEASE_BASE TEST-ONLY: replaces the release download URL, so the installer can be
#                     exercised against a local server. Not for users.
#   SKILL_DIR         also install the agent skill there (`suli skill install --dir "$SKILL_DIR"`),
#                     e.g. ~/.claude/skills; omitted by default
#
# Installs one binary under two names, `suli` and `superlibrary`. Never asks for sudo. A different
# program already at either name is refused, never overwritten; an earlier suli install is replaced.

set -euo pipefail

REPO="SuperJackfruitLabs/superlibrary"
BIN_DIR="${BIN_DIR:-$HOME/.local/bin}"

err() { printf '%s\n' "$*" >&2; exit 1; }

# --- platform ---------------------------------------------------------------
os="$(uname -s)"
arch="$(uname -m)"
case "$os" in
  Darwin) os="darwin" ;;
  Linux)  os="linux" ;;
  *) err "suli publishes no binary for ${os}." ;;
esac
case "$arch" in
  arm64|aarch64) arch="arm64" ;;
  x86_64|amd64)  arch="x64" ;;
  *) err "suli publishes no binary for ${arch}." ;;
esac
asset="suli-${os}-${arch}"

# --- refuse to clobber a stranger ----------------------------------------------
# Ours = a symlink to our own suli, or a program that identifies itself as `suli <version> ...`.
is_ours() {
  [ -L "$1" ] && [ "$(readlink "$1")" = "${BIN_DIR}/suli" ] && return 0
  [ -f "$1" ] && [ -x "$1" ] && case "$("$1" version 2>/dev/null || true)" in "suli "*) return 0 ;; esac
  return 1
}
for name in suli superlibrary; do
  if [ -e "${BIN_DIR}/${name}" ] || [ -L "${BIN_DIR}/${name}" ]; then
    is_ours "${BIN_DIR}/${name}" \
      || err "${BIN_DIR}/${name} already exists and is not a suli install; refusing to overwrite it. Move it aside or choose another BIN_DIR."
  fi
done

# --- release ----------------------------------------------------------------
if [ -n "${SULI_RELEASE_BASE:-}" ]; then
  base="$SULI_RELEASE_BASE"
  tag="${VERSION:-test}"
elif [ -n "${VERSION:-}" ]; then
  base="https://github.com/${REPO}/releases/download/${VERSION}"
  tag="$VERSION"
else
  base="https://github.com/${REPO}/releases/latest/download"
  tag="latest"
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

printf 'Downloading %s (%s)...\n' "$asset" "$tag"
curl -fsSL "${base}/${asset}" -o "${tmp}/${asset}" \
  || err "Could not download ${base}/${asset}"

# --- verify -----------------------------------------------------------------
# A download that cannot be verified is not installed.
curl -fsSL "${base}/SHA256SUMS" -o "${tmp}/SHA256SUMS" \
  || err "That release publishes no SHA256SUMS; refusing to install unverified."

expected="$(awk -v a="$asset" '$2 == a || $2 == "*" a { print $1 }' "${tmp}/SHA256SUMS")"
[ -n "$expected" ] || err "${asset} has no digest in SHA256SUMS; refusing to install it."

if command -v sha256sum >/dev/null 2>&1; then
  actual="$(sha256sum "${tmp}/${asset}" | awk '{print $1}')"
elif command -v shasum >/dev/null 2>&1; then
  actual="$(shasum -a 256 "${tmp}/${asset}" | awk '{print $1}')"
else
  err "Neither sha256sum nor shasum is available; cannot verify the download."
fi
[ "$actual" = "$expected" ] || err "${asset} failed its checksum; nothing was installed."

# --- install ----------------------------------------------------------------
mkdir -p "$BIN_DIR"
chmod 0755 "${tmp}/${asset}"
# Stage in the SAME directory, then rename: atomic, so a running suli never sees a half-written
# binary (mktemp -d may be on another filesystem, hence the copy first).
cp "${tmp}/${asset}" "${BIN_DIR}/.suli.incoming.$$"
mv -f "${BIN_DIR}/.suli.incoming.$$" "${BIN_DIR}/suli"
ln -sf "${BIN_DIR}/suli" "${BIN_DIR}/superlibrary"

printf 'Installed %s\n' "$("${BIN_DIR}/suli" version)"

if [ -n "${SKILL_DIR:-}" ]; then
  if "${BIN_DIR}/suli" skill install --dir "$SKILL_DIR" 2>/dev/null; then
    :
  else
    printf 'Note: this suli (%s) has no skill verb, so the skill was not installed. The CLI is fine; install a newer release for the skill.\n' "$tag" >&2
  fi
fi

# shellcheck disable=SC2016  # $PATH here is literal text for the reader to type
case ":${PATH}:" in
  *":${BIN_DIR}:"*) ;;
  *) printf '\n%s is not on your PATH. Add it:\n  export PATH="%s:$PATH"\n' "$BIN_DIR" "$BIN_DIR" ;;
esac

printf '\nNext: suli login (one sign-in; approve the code in any browser, works over SSH)\n'
