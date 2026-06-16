"""Run the RL Indoor Drone Navigation demo server."""

import socket
import sys
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
    print("  (Also works: http://127.0.0.1:{})".format(port))
    print()
    print("  NEVER use 0.0.0.0 in the browser — it will not work.")
    print("=" * 60)
    print()


def main():
    port = DEFAULT_PORT

    if port_in_use(HOST, port):
        print()
        print("=" * 60)
        print("  Port 8000 is already in use.")
        print("  A demo server is probably ALREADY running!")
        print()
        print("  >>> OPEN THIS IN YOUR BROWSER:")
        print()
        print("       http://localhost:8000")
        print()
        print("  No need to run this script again.")
        print("=" * 60)
        print()
        sys.exit(0)

    print_banner(port)
    print("  Controls:")
    print("    - Start Demo  : Run trained/heuristic agent navigation")
    print("    - Quick Train : Train PPO agent (20k steps)")
    print("    - Reset       : Reset environment")
    print()

    uvicorn.run("server.app:app", host=HOST, port=port, reload=False)


if __name__ == "__main__":
    main()
