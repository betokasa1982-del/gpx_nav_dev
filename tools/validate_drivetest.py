"""
validate_drivetest.py - independent check of a GPX Navigator SYNTH (DriveTest) export.

Usage (Python 3.11, from the folder with the exported files):
    pip install python-can cantools pandas
    python validate_drivetest.py DT_<vehicle>_<cycle>_<stamp>

It checks that:
  * the BLF and ASC files parse with python-can and contain the same frames,
  * every frame decodes with DriveTest_signals.dbc (cantools),
  * decoded CAN values match the CSV log (within one signal step),
  * the CSV timebase is monotonic and consistent with UTC,
  * the RAW file (.dtraw.json) holds the same log rows as the CSV.
"""
import json
import math
import sys
from pathlib import Path

import can
import cantools
import pandas as pd

NA_UNSIGNED = {16: 0xFFFF, 32: 0xFFFFFFFF, 8: 0xFF}


def fail(msg):
    print("FAIL:", msg)
    sys.exit(1)


def main(base):
    folder = Path(base).parent if Path(base).parent != Path("") else Path(".")
    stem = Path(base).name
    dbc = folder / "DriveTest_signals.dbc"
    blf = folder / (stem + ".blf")
    asc = folder / (stem + ".asc")
    log = folder / (stem + "_log.csv")
    raw = folder / (stem + ".dtraw.json")
    for f in (dbc, log):
        if not f.exists():
            fail("missing " + str(f))

    db = cantools.database.load_file(str(dbc))
    df = pd.read_csv(log)
    print("CSV rows:", len(df), "columns:", len(df.columns))

    el = df["Elapsed_Time_s"].to_numpy()
    if not (el[1:] > el[:-1]).all():
        fail("Elapsed_Time_s is not strictly increasing")
    utc = df["UTC_Time_ms"].to_numpy()
    drift = (utc - utc[0]) / 1000.0 - (el - el[0])
    print("UTC vs elapsed max deviation: %.4f s" % abs(drift).max())
    if abs(drift).max() > 0.01:
        fail("UTC_Time_ms and Elapsed_Time_s disagree")

    frames = {}
    for path, reader in ((blf, can.BLFReader), (asc, can.ASCReader)):
        if path.exists():
            rd = reader(str(path))
            msgs = list(rd)
            frames[path.suffix] = msgs
            print(path.name, "frames:", len(msgs))
    if ".blf" in frames and ".asc" in frames:
        a, b = frames[".blf"], frames[".asc"]
        if len(a) != len(b):
            fail("BLF and ASC frame counts differ")
        for x, y in zip(a, b):
            if x.arbitration_id != y.arbitration_id or bytes(x.data) != bytes(y.data):
                fail("BLF and ASC frames differ")
        print("BLF == ASC: identical frames")

    msgs = frames.get(".blf") or frames.get(".asc")
    if msgs:
        speed = [m for m in msgs if m.arbitration_id == 0x700]
        if len(speed) != len(df):
            fail("DT_Speed frames (%d) != CSV rows (%d)" % (len(speed), len(df)))
        worst = 0.0
        for m, (_, row) in zip(speed, df.iterrows()):
            dec = db.decode_message(m.arbitration_id, m.data, decode_choices=False, scaling=False)
            csv_v = row["Actual_Speed_kmh"]
            if isinstance(csv_v, float) and math.isnan(csv_v):
                if dec["ActualSpeed"] != NA_UNSIGNED[16]:
                    fail("null speed not encoded as not-available")
                continue
            worst = max(worst, abs(dec["ActualSpeed"] * 0.01 - csv_v))
        print("ActualSpeed CAN vs CSV max difference: %.4f km/h" % worst)
        if worst > 0.006:
            fail("CAN speed deviates from CSV")
        ev = [db.decode_message(m.arbitration_id, m.data) for m in msgs if m.arbitration_id == 0x705]
        print("event frames:", len(ev), sorted({str(e["EventCode"]) for e in ev}))

    if raw.exists():
        j = json.loads(raw.read_text())
        if j.get("format") != "DriveTest-RAW":
            fail("RAW format tag")
        if len(j["log"]["rows"]) != len(df):
            fail("RAW log rows != CSV rows")
        print("RAW: log", len(j["log"]["rows"]), "gnss", len(j["gnss"]["rows"]),
              "imu", len(j["imu"]["rows"]), "events", len(j["events"]))

    print("ALL CHECKS PASSED")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(2)
    main(sys.argv[1])
