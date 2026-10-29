"""Local UI contract fixture; never connects to trading or sends real money.

Run with Python 3, then point the Web API proxy/native test at port 19106.
Each test bearer token owns its own enable/error state so device runs are isolated.
"""
import http.server
import json
import threading
import urllib.parse

states = {}
requests = []
screenshots = set()
lock = threading.Lock()
timestamp = "2026-10-29T01:00:00Z"


def overview(user, enabled):
    return {
        "profile": {"userId": user, "inviteCode": "A" * 32,
                    "kolEnabled": enabled, "autoSettlement": True,
                    "ratePpm": None, "createdAt": timestamp},
        "settings": {"referralRatePpm": 200000, "kolRatePpm": 200000,
                     "settlementHours": 24, "version": 1},
        "counts": {"directInviteCount": "1", "teamInviteCount": "5"},
        "rootRatePpm": 200000, "teamActive": True,
        "teamPath": [{"parentId": "9", "childId": user, "sharePpm": 500000}],
        "balances": [{"productLine": "SPOT", "asset": "USDT",
                      "receivedUnits": "200000000", "delegatedUnits": "75000000",
                      "retainedUnits": "125000000", "pendingUnits": "75000000",
                      "paidUnits": "50000000", "inFlightUnits": "0",
                      "teamFeeUnits": "1000000000", "directFeeUnits": "1000000000",
                      "tradingUsers": "1"}],
        # Deliberate old/hidden fields verify that the client gates presentation.
        "invitations": [{"code": "B" * 32, "inviterId": "1", "targetUserId": "2",
                         "cooperation": True, "sharePpm": 500000,
                         "expiresAt": "2099-01-01T00:00:00Z", "acceptedBy": None}],
    }


class Fixture(http.server.BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.respond(204, {})

    def respond(self, status, body):
        content = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Authorization,Content-Type,X-User-Id")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def do_POST(self):
        key = self.headers.get("Authorization", "")
        content = bytearray()
        if self.headers.get("Transfer-Encoding", "").lower() == "chunked":
            while True:
                length = int(self.rfile.readline().strip().split(b";")[0], 16)
                if length == 0:
                    self.rfile.readline()
                    break
                if len(content) + length > 8192:
                    return self.respond(413, {})
                content.extend(self.rfile.read(length))
                self.rfile.read(2)
        else:
            content.extend(self.rfile.read(min(int(self.headers.get("Content-Length", "0")), 8192)))
        body = json.loads(content or b"{}")
        with lock:
            if self.path == "/__qa/reset-captures":
                prefix = body["prefix"]
                screenshots.difference_update([name for name in screenshots if name.startswith(prefix)])
                return self.respond(200, {})
            if self.path == "/__qa/ack":
                screenshots.add(body["name"])
                return self.respond(200, {})
            if self.path == "/__qa/state":
                states[key] = {"enabled": body.get("enabled", False), "error": body.get("error", False)}
                return self.respond(200, states[key])
        self.respond(405, {"message": "UI fixture does not execute business writes"})

    def do_GET(self):
        url = urllib.parse.urlparse(self.path)
        query = urllib.parse.parse_qs(url.query)
        key = self.headers.get("Authorization", "")
        with lock:
            if url.path == "/__qa/ack":
                return self.respond(200 if query.get("name", [""])[0] in screenshots else 202, {})
            state = dict(states.get(key, {"enabled": False, "error": False}))
            requests.append({"path": url.path, "query": url.query, "key": key,
                             "enabled": state["enabled"]})
            if url.path == "/__qa/calls":
                return self.respond(200, [r for r in requests if r["key"] == key])
        if state["error"] and url.path.startswith("/api/v1/affiliate/"):
            return self.respond(503, {"message": "邀请资料暂不可用，请重试"})
        if url.path == "/api/v1/affiliate/me":
            body = overview("1", state["enabled"])
        elif url.path == "/api/v1/affiliate/members/2":
            body = overview("2", False)  # Viewer permission must not come from this member.
        elif url.path == "/api/v1/affiliate/members":
            parent = query.get("parentId", [None])[0]
            body = {"items": [] if parent else [{
                "userId": "2", "kolEnabled": False, "acceptedAt": timestamp,
                "sharePpm": 500000, "teamParentId": "1", "directInviteCount": "4",
                "contributions": [{"userId": "2", "productLine": "SPOT", "asset": "USDT",
                                   "feeUnits": "1000000000", "receivedUnits": "200000000",
                                   "retainedUnits": "125000000"},
                                  {"userId": "2", "productLine": "SPOT", "asset": "BTC",
                                   "feeUnits": "10", "receivedUnits": "2", "retainedUnits": "1"}],
            }], "nextCursor": None}
        elif url.path == "/api/v1/affiliate/entries":
            body = {"items": [{"commissionId": "9007199254740993", "productLine": "SPOT",
                               "asset": "USDT", "sourceUserId": "2", "orderId": "42",
                               "feeUnits": "1000000000", "receivedUnits": "200000000",
                               "delegatedUnits": "75000000", "retainedUnits": "125000000",
                               "occurredAt": timestamp, "status": "UNSETTLED", "payoutId": None}],
                    "nextCursor": None}
        elif url.path == "/api/v1/affiliate/payouts":
            body = {"items": []}
        elif url.path == "/api/v1/affiliate/preview":
            body = overview("1", False)["invitations"][0]
            if query.get("code", [""])[0] == "A" * 32:
                body = {**body, "code": "A" * 32, "targetUserId": None,
                        "cooperation": False, "sharePpm": None, "expiresAt": None}
        elif url.path.endswith("/asset-scales"):
            body = {"USDT": "100000000", "BTC": "100000000"}
        elif url.path.endswith("/runtime"):
            body = {"productLines": ["SPOT"]}
        elif url.path.endswith("/list"):
            body = {"instruments": []}
        else:
            body = {"items": []}
        self.respond(200, body)

    def log_message(self, *_):
        pass


if __name__ == "__main__":
    print("UI contract fixture: http://127.0.0.1:19106", flush=True)
    http.server.ThreadingHTTPServer(("127.0.0.1", 19106), Fixture).serve_forever()
