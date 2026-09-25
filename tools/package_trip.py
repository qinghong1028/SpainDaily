#!/usr/bin/env python3
"""Create an encrypted package or a local-only passwordless personal package.

Use --unencrypted only for a private local output. Staging data and generated
packages should remain outside Git.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import struct
import tempfile
import zipfile
from getpass import getpass
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

MAGIC = b"SPAINDAILY1\n"
ITERATIONS = 310_000


def arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument("--trip-json", type=Path, required=True)
    parser.add_argument("--attachments-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--password-env", default="SPAINDAILY_PACKAGE_PASSWORD")
    parser.add_argument("--unencrypted", action="store_true", help="Write a local-only ZIP package without password protection")
    parser.add_argument("--traveler-id", help="Keep only this traveler and events/tasks/bookings that include them")
    return parser.parse_args()


def derive(password: str, salt: bytes) -> bytes:
    return PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=ITERATIONS).derive(password.encode("utf-8"))


def filter_traveler(trip: dict, traveler_id: str) -> dict:
    traveler = next((row for row in trip.get("travelers", []) if row.get("id") == traveler_id), None)
    if traveler is None:
        raise SystemExit(f"Traveler not found: {traveler_id}")
    days = [row for row in trip.get("dayPlans", []) if traveler_id in row.get("travelerIds", [])]
    day_ids = {row["id"] for row in days}
    events = [row for row in trip.get("events", []) if row.get("dayPlanId") in day_ids and traveler_id in row.get("travelerIds", [])]
    event_ids = {row["id"] for row in events}
    tasks = [row for row in trip.get("dailyTasks", []) if row.get("dayPlanId") in day_ids and traveler_id in row.get("travelerIds", [])]
    task_ids = {row["id"] for row in tasks}
    bookings = [row for row in trip.get("bookings", []) if traveler_id in row.get("travelerIds", [])]
    for row in days:
        row["travelerIds"] = [traveler_id]
        row["eventIds"] = [event_id for event_id in row.get("eventIds", []) if event_id in event_ids]
        row["taskIds"] = [task_id for task_id in row.get("taskIds", []) if task_id in task_ids]
        if row.get("guidance"):
            row["guidance"]["optionalEventIds"] = [event_id for event_id in row["guidance"].get("optionalEventIds", []) if event_id in event_ids]
    for row in events + tasks + bookings:
        row["travelerIds"] = [traveler_id]
    attachment_ids = set()
    for row in events + bookings + trip.get("guides", []):
        attachment_ids.update(row.get("attachmentIds", []))
    trip["travelers"] = [traveler]
    trip["dayPlans"] = days
    trip["events"] = events
    trip["dailyTasks"] = tasks
    trip["bookings"] = bookings
    trip["attachments"] = [row for row in trip.get("attachments", []) if row.get("id") in attachment_ids]
    return trip


def main():
    args = arguments()
    trip = json.loads(args.trip_json.read_text(encoding="utf-8"))
    if trip.get("schemaVersion") != 1:
        raise SystemExit("Only schemaVersion 1 is supported")
    if args.traveler_id:
        trip = filter_traveler(trip, args.traveler_id)
    attachment_rows = trip.get("attachments", [])
    with tempfile.NamedTemporaryFile(suffix=".zip") as temporary:
        with zipfile.ZipFile(temporary.name, "w", compression=zipfile.ZIP_STORED) as archive:
            archive.writestr("trip.json", json.dumps(trip, ensure_ascii=False, separators=(",", ":")))
            for row in attachment_rows:
                relative = Path(row["path"])
                if relative.is_absolute() or ".." in relative.parts or relative.parts[0] != "attachments":
                    raise SystemExit(f"Unsafe attachment path: {relative}")
                source = args.attachments_root / relative.relative_to("attachments")
                if not source.is_file():
                    raise SystemExit(f"Missing attachment: {source}")
                payload = source.read_bytes()
                digest = hashlib.sha256(payload).hexdigest()
                if digest != row["sha256"] or len(payload) != row["size"]:
                    raise SystemExit(f"Attachment manifest mismatch: {source.name}")
                archive.writestr(relative.as_posix(), payload)
        zipped = Path(temporary.name).read_bytes()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    if args.unencrypted:
        args.output.write_bytes(zipped)
        print(json.dumps({"output": str(args.output), "bytes": args.output.stat().st_size, "attachments": len(attachment_rows), "encrypted": False, "travelerId": args.traveler_id, "sha256": hashlib.sha256(args.output.read_bytes()).hexdigest()}, indent=2))
        return
    password = os.environ.get(args.password_env)
    if not password:
        password = getpass("Package password: ")
        if password != getpass("Confirm package password: "):
            raise SystemExit("Passwords do not match")
    if len(password) < 8:
        raise SystemExit("Password must contain at least 8 characters")
    salt, iv = os.urandom(16), os.urandom(12)
    header = {
        "packageFormat": 1,
        "schemaVersion": 1,
        "kdf": {"name": "PBKDF2", "hash": "SHA-256", "iterations": ITERATIONS, "salt": base64.b64encode(salt).decode("ascii")},
        "cipher": {"name": "AES-GCM", "iv": base64.b64encode(iv).decode("ascii")},
        "payloadSha256": hashlib.sha256(zipped).hexdigest(),
        "createdAt": trip.get("createdAt"),
        "kind": "trip",
    }
    header_bytes = json.dumps(header, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    ciphertext = AESGCM(derive(password, salt)).encrypt(iv, zipped, header_bytes)
    args.output.write_bytes(MAGIC + struct.pack(">I", len(header_bytes)) + header_bytes + ciphertext)
    print(json.dumps({"output": str(args.output), "bytes": args.output.stat().st_size, "attachments": len(attachment_rows), "encrypted": True, "sha256": hashlib.sha256(args.output.read_bytes()).hexdigest()}, indent=2))


if __name__ == "__main__":
    main()
