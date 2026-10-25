#!/usr/bin/env python3
"""Isolated Firestore rules qualification using genuine Auth Emulator-issued ID tokens.
No production Firebase credentials, projects, or network endpoints are used.
The native Android FirebaseAuth A->B test is independent and not replaced here.
"""
import json
import os
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

PROJECT = "demo-miaad-v1r7"
AUTH_URL = "http://127.0.0.1:9098"
DB_URL = "http://127.0.0.1:8081"
checks = 0


def api(method, url, payload=None, token=None):
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    headers = {"Content-Type": "application/json"}
    if token is not None:
        headers["Authorization"] = "Bearer " + token
    req = Request(url, data=body, method=method, headers=headers)
    try:
        with urlopen(req, timeout=10) as res:
            return res.status, res.read(16384)
    except HTTPError as exc:
        exc.read(16384)
        return exc.code, b""


def issue_emulator_user():
    status, body = api(
        "POST",
        AUTH_URL + "/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-only",
        {"returnSecureToken": True},
    )
    assert status == 200, "Auth Emulator anonymous signup failed: HTTP " + str(status)
    obj = json.loads(body)
    assert obj.get("idToken") and obj.get("localId"), "Incomplete Auth Emulator response"
    return obj["localId"], obj["idToken"]


def doc(owner, nested=False):
    base = DB_URL + "/v1/projects/" + PROJECT + "/databases/(default)/documents/users/"
    path = quote(owner, safe="") + "/state/main"
    if nested:
        path += "/snapshots/part0"
    return base + path


def verify(label, method, url, token, should_allow, value=None):
    global checks
    data = {"fields": {"payload": {"stringValue": value}}} if value is not None else None
    status, response = api(method, url, data, token)
    if should_allow:
        assert 200 <= status < 300, label + ": expected ALLOW, HTTP " + str(status)
    else:
        assert status in (401, 403), label + ": expected DENY, HTTP " + str(status)
    checks += 1
    print(("ALLOW" if should_allow else "DENY") + " PASS: " + label)
    return response


def main():
    a, token_a = issue_emulator_user()
    b, token_b = issue_emulator_user()
    assert a != b, "Auth emulator did not issue distinct users"

    # Write owned documents before read checks; denied operations may not alter them.
    verify("A write A", "PATCH", doc(a), token_a, True, "A-only")
    verify("B write B", "PATCH", doc(b), token_b, True, "B-only")
    verify("A read A", "GET", doc(a), token_a, True)
    verify("B read B", "GET", doc(b), token_b, True)
    verify("A read B", "GET", doc(b), token_a, False)
    verify("A write B", "PATCH", doc(b), token_a, False, "illegal-A")
    verify("B read A", "GET", doc(a), token_b, False)
    verify("B write A", "PATCH", doc(a), token_b, False, "illegal-B")
    verify("Unauthenticated read A", "GET", doc(a), None, False)
    verify("Unauthenticated write A", "PATCH", doc(a), None, False, "illegal-guest")
    verify("A write nested academic state", "PATCH", doc(a, True), token_a, True, "A-nested")
    verify("B read A nested academic state", "GET", doc(a, True), token_b, False)
    verify("A read nested academic state", "GET", doc(a, True), token_a, True)
    verify("Unauthenticated nested write", "PATCH", doc(a, True), None, False, "illegal-guest")
    a_doc = json.loads(verify("A unchanged after rejected B write", "GET", doc(a), token_a, True))
    b_doc = json.loads(verify("B unchanged after rejected A write", "GET", doc(b), token_b, True))
    assert a_doc["fields"]["payload"]["stringValue"] == "A-only", "A owner content changed"
    assert b_doc["fields"]["payload"]["stringValue"] == "B-only", "B owner content changed"
    print("Firestore rules qualification: PASS " + str(checks) +
          " requests, genuine isolated Auth Emulator users, owner isolation intact")


if __name__ == "__main__":
    main()
