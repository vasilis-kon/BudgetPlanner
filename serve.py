"""Local test server that never lets the browser cache files, so every change shows after a normal refresh.
Run:  python serve.py        then open  http://localhost:8123/
"""
import http.server
import socketserver
import sys
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8123


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()


socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("", PORT), NoCache) as httpd:
    print(f"Serving on http://localhost:{PORT}/ (no caching). Ctrl+C to stop.")
    httpd.serve_forever()
