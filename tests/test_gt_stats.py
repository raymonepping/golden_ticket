"""Unit tests for the gt_stats callback (run by scripts/check.sh)."""

import datetime
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "ansible", "plugins", "callback"))
import gt_stats  # noqa: E402


class FakeStats:
    def __init__(self, data):
        self.processed = {host: 1 for host in data}
        self._data = data

    def summarize(self, host):
        return self._data[host]


class GtStatsTest(unittest.TestCase):
    def test_counts_only(self):
        stats = FakeStats({
            "gt-vault-1": {"ok": 10, "changed": 2, "failures": 0, "unreachable": 0, "skipped": 3, "rescued": 0, "ignored": 0},
            "localhost": {"ok": 4, "changed": 0, "failures": 1, "unreachable": 0, "skipped": 0, "rescued": 0, "ignored": 0},
        })
        hosts = gt_stats.summarize(stats)
        self.assertEqual(list(hosts), ["gt-vault-1", "localhost"])
        self.assertEqual(set(hosts["gt-vault-1"]), set(gt_stats.COUNTERS))

        with tempfile.TemporaryDirectory() as tmp:
            when = datetime.datetime(2026, 10, 8, 12, 0, tzinfo=datetime.timezone.utc)
            path = gt_stats.write_stats(tmp, "converge", hosts, check_mode=False, now=when)
            self.assertTrue(path.endswith("converge.json"))
            doc = json.load(open(path, encoding="utf-8"))
            self.assertEqual(doc["changed_total"], 2)
            self.assertEqual(doc["failed_total"], 1)
            self.assertEqual(doc["finished_at"], "2026-10-08T12:00:00Z")
            self.assertFalse(doc["check_mode"])
            self.assertEqual(set(doc), {"phase", "check_mode", "finished_at", "hosts", "changed_total", "failed_total"})

    def test_check_mode_file_name(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = gt_stats.write_stats(tmp, "agent", {}, check_mode=True)
            self.assertTrue(path.endswith("agent.check.json"))
            self.assertEqual(json.load(open(path, encoding="utf-8"))["changed_total"], 0)


if __name__ == "__main__":
    unittest.main()
