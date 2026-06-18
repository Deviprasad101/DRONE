"""Run the RL Indoor Drone Navigation demo server."""

import argparse
import socket
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

import uvicorn

ROOT = Path(__file__).parent
sys.path.insert(0, str(ROOT))

HOST = "127.0.0.1"
DEFAULT_PORT = 8000


def port_in_use(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        try:
            sock.bind((host, port))
            return False
        except OSError:
            return True


def pids_on_port(port: int) -> list[int]:
    """Return process IDs listening on a TCP port (Windows)."""
    try:
        result = subprocess.run(
            ["netstat", "-ano"],
            capture_output=True,
            text=True,
            check=False,
        )
    except OSError:
        return []

    pids: set[int] = set()
    for line in result.stdout.splitlines():
        if f":{port}" not in line or "LISTENING" not in line:
            continue
        parts = line.split()
        if not parts:
            continue
        try:
            pids.add(int(parts[-1]))
        except ValueError:
            continue
    return sorted(pids)


def server_healthy(port: int) -> bool:
    try:
        with urllib.request.urlopen(
            f"http://127.0.0.1:{port}/api/state", timeout=3
        ) as resp:
            return resp.status == 200
    except (urllib.error.URLError, TimeoutError, OSError):
        return False


def stop_port_listeners(port: int) -> list[int]:
    stopped: list[int] = []
    for pid in pids_on_port(port):
        if pid <= 0:
            continue
        try:
            subprocess.run(
                ["taskkill", "/PID", str(pid), "/F"],
                capture_output=True,
                check=False,
            )
            stopped.append(pid)
        except OSError:
            pass
    return stopped


def print_banner(port: int) -> None:
    url = f"http://localhost:{port}"
    print()
    print("=" * 60)
    print("  RL BASED INDOOR DRONE NAVIGATION - Demo Server")
    print("=" * 60)
    print()
    print("  >>> OPEN THIS URL IN YOUR BROWSER:")
    print()
    print(f"       {url}")
    print()
    print(f"  (Also works: http://127.0.0.1:{port})")
    print()
    print("  NEVER use 0.0.0.0 in the browser — it will not work.")
    print("=" * 60)
    print()


def print_already_running(port: int, pids: list[int], healthy: bool) -> None:
    print()
    print("=" * 60)
    if healthy:
        print("  Demo server is ALREADY running on port", port)
        print()
        print("  >>> OPEN THIS IN YOUR BROWSER:")
        print()
        print(f"       http://localhost:{port}")
        print()
        print("  Logs appear in the terminal where the server was started.")
        print("  To restart with fresh logs in THIS terminal, run:")
        print()
        print("       python run_demo.py --restart")
    else:
        print("  Port", port, "is blocked but the server is NOT responding.")
        print("  Run this to clear the port and start again:")
        print()
        print("       python run_demo.py --restart")
    if pids:
        print()
        print("  Process(es) on port", port, ":", ", ".join(str(p) for p in pids))
    print("=" * 60)
    print()


def main():
    parser = argparse.ArgumentParser(description="Start the drone navigation demo")
    parser.add_argument(
        "--restart",
        action="store_true",
        help="Stop any old server on port 8000 and start a new one",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=DEFAULT_PORT,
        help="Port number (default: 8000)",
    )
    args = parser.parse_args()
    port = args.port

    if port_in_use(HOST, port):
        pids = pids_on_port(port)
        healthy = server_healthy(port)

        if args.restart or not healthy:
            if pids:
                print(f"Stopping old server process(es): {', '.join(map(str, pids))}")
                stop_port_listeners(port)
                import time

                time.sleep(1)
            if port_in_use(HOST, port):
                print()
                print("Could not free port", port)
                print("Close other terminals running run_demo.py, then try again.")
                sys.exit(1)
        else:
            print_already_running(port, pids, healthy=True)
            sys.exit(0)

    print_banner(port)
    print("  Controls:")
    print("    - Start Demo  : Run navigation along planned path")
    print("    - Reset       : Reset environment")
    print()
    print("  Server logs will appear below. Press Ctrl+C to stop.")
    print()

    uvicorn.run("server.app:app", host=HOST, port=port, reload=False)


if __name__ == "__main__":
    main()
