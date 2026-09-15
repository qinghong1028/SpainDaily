#!/usr/bin/env python3
"""Decrypt and verify a SpainDaily package to a temporary directory."""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import struct
import zipfile
from io import BytesIO
from pathlib import Path

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

MAGIC = b"SPAINDAILY1\n"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("package", type=Path)
    parser.add_argument("--password-env", default="SPAINDAILY_PACKAGE_PASSWORD")
    args = parser.parse_args()
    password = os.environ.get(args.password_env)
    if not password: raise SystemExit(f"Missing password environment variable: {args.password_env}")
    envelope = args.package.read_bytes()
    if not envelope.startswith(MAGIC): raise SystemExit("Wrong package magic")
    header_length = struct.unpack(">I", envelope[len(MAGIC):len(MAGIC)+4])[0]
    start = len(MAGIC) + 4
    header_bytes = envelope[start:start+header_length]
    header = json.loads(header_bytes)
    salt = base64.b64decode(header["kdf"]["salt"])
    iv = base64.b64decode(header["cipher"]["iv"])
    key = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=header["kdf"]["iterations"]).derive(password.encode())
    zipped = AESGCM(key).decrypt(iv, envelope[start+header_length:], header_bytes)
    if hashlib.sha256(zipped).hexdigest() != header["payloadSha256"]: raise SystemExit("Payload hash mismatch")
    with zipfile.ZipFile(BytesIO(zipped)) as archive:
        trip = json.loads(archive.read("trip.json"))
        for row in trip.get("attachments", []):
            payload = archive.read(row["path"])
            if hashlib.sha256(payload).hexdigest() != row["sha256"] or len(payload) != row["size"]:
                raise SystemExit(f"Attachment mismatch: {row['id']}")
        print(json.dumps({"valid": True, "kind": header["kind"], "packageId": trip["packageId"], "files": len(archive.namelist()), "attachments": len(trip.get("attachments", []))}, indent=2))


if __name__ == "__main__":
    main()
