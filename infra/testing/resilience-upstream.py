"""Isolated test double for downstream HTTP; faults are injected by real Toxiproxy."""
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

lock = threading.Lock()
state = {"status": 200, "eligible": True, "memberCalls": 0, "subscriptionCalls": 0, "chatCalls": 0}

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass  # Never log Authorization or question text.

    def do_GET(self):
        self.handle_request()

    def do_POST(self):
        self.rfile.read(int(self.headers.get("Content-Length", "0")))
        self.handle_request()

    def handle_request(self):
        route = urlparse(self.path)
        query = parse_qs(route.query)
        with lock:
            if route.path == "/test/reset":
                state.update(status=int(query.get("status", [200])[0]), eligible=query.get("eligible", ["true"])[0] == "true",
                             memberCalls=0, subscriptionCalls=0, chatCalls=0)
                return self.respond(200, dict(state))
            if route.path == "/test/state":
                return self.respond(200, dict(state))
            if route.path.startswith("/api/members"):
                state["memberCalls"] += 1
                if self.headers.get("Authorization") != "Bearer test-token":
                    return self.respond(401, {"detail": "Test JWT was not relayed"})
                return self.respond(200, {"id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "subject": "resilience-player",
                     "fullName": "Synthetic Player", "email": "resilience@example.invalid", "phone": "TEST", "enabled": True})
            if route.path.startswith("/api/subscriptions/eligibility"):
                state["subscriptionCalls"] += 1
                if self.headers.get("Authorization") != "Bearer test-token":
                    return self.respond(401, {"detail": "Test JWT was not relayed"})
                if state["status"] != 200:
                    return self.respond(state["status"], {"detail": "Synthetic downstream response"})
                return self.respond(200, {"eligible": state["eligible"], "reason": "ACTIVE" if state["eligible"] else "EXPIRED", "validUntil": "2026-12-31"})
            if route.path == "/api/chat":
                state["chatCalls"] += 1
                return self.respond(200, {"model": "test-chat", "created_at": "2026-10-02T12:00:00Z", "done": True,
                    "message": {"role": "assistant", "content": "{\"supported\":true}"}, "total_duration": 1000000,
                    "prompt_eval_count": 1, "eval_count": 1})
            self.respond(404, {"detail": "Unknown test route"})

    def respond(self, status, body):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        try:
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            pass

ThreadingHTTPServer(("0.0.0.0", 8080), Handler).serve_forever()
