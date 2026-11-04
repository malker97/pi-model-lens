"""Exercise real Pi TUI loading, history badges, expansion, and clean exit without inference."""
import fcntl
import json
import os
from pathlib import Path
import pty
import re
import select
import struct
import subprocess
import tempfile
import termios
import time
import uuid

REPO = Path(__file__).resolve().parent.parent
CLI = REPO / "node_modules/.bin/pi"


def fixture(work):
    stamp = "2026-11-04T12:00:00.000Z"
    rows = [{"type": "session", "version": 3, "id": str(uuid.uuid4()), "timestamp": stamp, "cwd": str(work)}]
    parent = None

    def add(kind, **fields):
        nonlocal parent
        ident = f"{len(rows):08x}"
        rows.append({"type": kind, "id": ident, "parentId": parent, "timestamp": stamp, **fields})
        parent = ident

    add("model_change", provider="openai-codex", modelId="gpt-6-astra")
    body = {"source": "response.model", "field": "model", "model": "gpt-6-astra"}
    server = {"source": "event.headers", "field": "openai-model", "model": "gpt-6.2-astra"}
    cross_family = {"source": "response.model", "field": "model", "model": "gpt-6.1-sol"}
    for index, evidence in enumerate([[body], [server], [cross_family], [], [body, server]], 1):
        add("message", message={"role": "user", "content": "OFFLINE SYNTHETIC PREVIEW", "timestamp": 1})
        add("custom", customType="openusage.model-routing", data={
            "schemaVersion": 1, "provider": "openai-codex", "api": "openai-codex-responses",
            "requestedModel": "gpt-6-astra", "responseID": f"resp-preview-{index}", "completedAt": stamp,
            "status": "completed", "evidence": evidence, "evidenceIncomplete": False})
        add("message", message={"role": "assistant", "api": "openai-codex-responses", "provider": "openai-codex",
            "model": "gpt-6-astra", "responseId": f"resp-preview-{index}", "stopReason": "stop", "timestamp": 1,
            "content": [{"type": "text", "text": "Synthetic answer. No provider call was made."}],
            "usage": {"input": 1, "output": 1, "cacheRead": 0, "cacheWrite": 0, "totalTokens": 2,
                      "cost": {"input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0, "total": 0}}})
    return rows


def check(mode):
    with tempfile.TemporaryDirectory(prefix="pi-model-lens-tui-") as temp:
        work = Path(temp)
        agent = work / "agent"
        agent.mkdir()
        (agent / "settings.json").write_text(json.dumps({"packages": [], "cacheWarming": "off", "quietStartup": True,
            "theme": "dark", "enableAnalytics": False, "enableInstallTelemetry": False}))
        # Even an accidental model call could only reach a closed local port, never a real provider.
        (agent / "models.json").write_text(json.dumps({"providers": {"openai-codex": {"baseUrl": "http://127.0.0.1:9"}}}))
        session = work / "preview.jsonl"
        original = fixture(work)
        session.write_text("\n".join(json.dumps(row) for row in original) + "\n")
        master, slave = pty.openpty()
        fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 50, 120, 0, 0))
        env = {key: value for key, value in os.environ.items()
               if key not in ("PI_SESSION_FILE", "PI_SESSION_ID", "PI_MANAGED_INSTALL_ROOT", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY")}
        env.update(PI_CODING_AGENT_DIR=str(agent), PI_CODING_AGENT_SESSION_DIR=str(agent / "sessions"),
                   PI_OFFLINE="1", TERM="xterm-256color", COLORTERM="truecolor", NO_PROXY="localhost,127.0.0.1")
        command = [str(CLI), "--offline", "--no-extensions", "-e", str(REPO), "--no-skills", "--no-prompt-templates",
                   "--no-context-files", "--no-mcp", "--no-tools", "--session", str(session),
                   "--model", "openai-codex/gpt-6-astra", "--api-key", "offline-invalid-preview-key", "--tui-mode", mode]
        process = subprocess.Popen(command, cwd=work, env=env, stdin=slave, stdout=slave, stderr=slave, start_new_session=True)
        os.close(slave)
        output = bytearray()
        ready_at = expanded_at = None
        expand_sent = quit_sent = False
        deadline = time.monotonic() + 20
        try:
            while time.monotonic() < deadline and process.poll() is None:
                if ready_at and not expand_sent and time.monotonic() - ready_at > 0.7:
                    os.write(master, b"\x0f")  # Pi's default Ctrl+O expansion shortcut.
                    expand_sent = True
                if expanded_at and not quit_sent and time.monotonic() - expanded_at > 0.3:
                    os.write(master, b"\x04")
                    quit_sent = True
                if not select.select([master], [], [], 0.1)[0]:
                    continue
                try:
                    chunk = os.read(master, 65536)
                except OSError:
                    break
                output.extend(chunk)
                if b"\x1b[6n" in chunk:
                    os.write(master, b"\x1b[1;1R")
                if b"\x1b[c" in chunk:
                    os.write(master, b"\x1b[?1;2c")
                text = output.decode("utf8", "replace")
                plain = re.sub(r"\x1b\[[0-9;?]*[A-Za-z]", "", text)
                dot_colors = set(re.findall(r"(\x1b\[[0-9;]*m)●", text))
                if ready_at is None and len(dot_colors) >= 4 and all(label in plain for label in
                        ["gpt-6-astra ●", "gpt-6.2-astra ●", "gpt-6.1-sol ●", "Unknown ●"]):
                    ready_at = time.monotonic()
                if expand_sent and expanded_at is None and b"resp-preview-5" in output:
                    expanded_at = time.monotonic()
            if process.poll() is None:
                process.wait(timeout=2)
        finally:
            os.close(master)
            if process.poll() is None:
                process.kill()
                process.wait()
        assert ready_at and expanded_at and process.returncode == 0, (mode, output.decode("utf8", "replace")[-3000:])
        # Pi may record an initial thinking-level preference; conversation content must stay unchanged.
        after = [json.loads(line) for line in session.read_text().splitlines()]
        content = lambda rows: [row for row in rows if row.get("type") in ("message", "custom")]
        assert content(after) == content(original), "TUI preview must not change conversation or routing entries"
        print(f"PASS {mode}: five compact badges, four lamp colors, expanded evidence, clean exit; no prompts submitted")


for mode in ("regular", "fullscreen"):
    check(mode)
