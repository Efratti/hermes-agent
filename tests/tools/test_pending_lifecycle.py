"""Pending-write queue lifecycle: TTL, stale-anchor discard, cap eviction, supersession,
and the truthful telemetry that replaced ``write_approval = off`` with the effective policy.

The queue used to be a write-only dead letter box: on this host it reached 31 records over 53
days, 27 of them impossible to apply (unpinned or anchors edited since staging), while every
background review kept staging the same consolidation again.
"""

import json
import os
import shutil
import tempfile
import time
from pathlib import Path

import pytest


@pytest.fixture
def home(monkeypatch):
    d = tempfile.mkdtemp(prefix="hermes_pending_lifecycle_")
    home = os.path.join(d, ".hermes")
    os.makedirs(os.path.join(home, "memories"))
    Path(home, "memories", "MEMORY.md").write_text("live entry one\n§\nlive entry two", encoding="utf-8")
    monkeypatch.setenv("HERMES_HOME", home)
    yield home
    shutil.rmtree(d, ignore_errors=True)


def _age(rid, days):
    from tools import write_approval as wa
    path = wa._pending_path(wa.MEMORY, rid)
    data = json.loads(path.read_text(encoding="utf-8"))
    data["created_at"] = time.time() - days * 86400
    path.write_text(json.dumps(data), encoding="utf-8")


def _stage_add(content, *, days_old=0.0):
    from tools import write_approval as wa
    rec = wa.stage_write(wa.MEMORY, {"action": "add", "target": "memory", "content": content},
                         summary=content, origin="background_review")
    if days_old:
        _age(rec["id"], days_old)
    return rec["id"]


def _stage_patch(matched_entry, *, days_old=0.0):
    from tools import write_approval as wa
    rec = wa.stage_write(wa.MEMORY, {
        "action": "patch", "target": "memory", "old_text": "live entry one",
        "content": "live entry one, rewritten", "matched_entry": matched_entry,
    }, summary="patch", origin="background_review")
    if days_old:
        _age(rec["id"], days_old)
    return rec["id"]


# --- TTL -------------------------------------------------------------------

def test_ttl_expiry_archives_the_record(home):
    from tools import write_approval as wa
    rid = _stage_add("old fact", days_old=8)
    assert wa.list_pending(wa.MEMORY) == []
    archived = json.loads((wa._discard_dir(wa.MEMORY) / f"{rid}.json").read_text(encoding="utf-8"))
    assert archived["discarded_reason"] == "expired"
    assert archived["payload"]["content"] == "old fact"


def test_fresh_record_survives_the_sweep(home):
    from tools import write_approval as wa
    rid = _stage_add("fresh fact", days_old=1)
    assert [r["id"] for r in wa.list_pending(wa.MEMORY)] == [rid]


def test_dry_run_reports_without_archiving(home):
    from tools import write_approval as wa
    rid = _stage_add("old fact", days_old=8)
    report = wa.sweep_pending(wa.MEMORY, dry_run=True)
    assert report["expired"] == [rid]
    assert wa.get_pending(wa.MEMORY, rid) is not None
    assert not (wa._discard_dir(wa.MEMORY) / f"{rid}.json").exists()


# --- Stale anchors ---------------------------------------------------------

def test_stale_anchor_is_discarded_on_read(home):
    from tools import write_approval as wa
    live = _stage_patch("live entry one")
    gone = _stage_patch("an entry that was edited away")
    ids = [r["id"] for r in wa.list_pending(wa.MEMORY)]
    assert ids == [live]
    archived = json.loads((wa._discard_dir(wa.MEMORY) / f"{gone}.json").read_text(encoding="utf-8"))
    assert archived["discarded_reason"] == "stale-anchor"


def test_unpinned_legacy_record_is_stale(home):
    from tools import write_approval as wa
    rec = wa.stage_write(wa.MEMORY, {"action": "remove", "target": "memory", "old_text": "live entry one"},
                         summary="legacy", origin="background_review")
    assert wa.record_status(wa.MEMORY, rec) == "stale"
    assert wa.list_pending(wa.MEMORY) == []


def test_explicit_approve_still_explains_a_stale_refusal(home):
    """Sweeping on read must not turn an explicit approve into 'no such write': the applier's
    'changed since it was staged' refusal is the explanation the operator needs."""
    from hermes_cli.write_approval_commands import handle_pending_subcommand
    from tools import write_approval as wa
    from tools.memory_tool import load_on_disk_store
    rid = _stage_patch("an entry that was edited away")
    out = handle_pending_subcommand(wa.MEMORY, ["approve", rid], memory_store=load_on_disk_store())
    assert "changed since it was staged" in (out or "")


# --- Cap -------------------------------------------------------------------

def test_cap_evicts_oldest_first(home):
    from tools import write_approval as wa
    ids = [_stage_add(f"fact {i}", days_old=(12 - i) * 0.4) for i in range(1, 13)]  # 12 records, oldest first
    kept = [r["id"] for r in wa.list_pending(wa.MEMORY)]
    assert len(kept) == wa.PENDING_MAX_RECORDS
    assert kept == ids[-wa.PENDING_MAX_RECORDS:]
    for rid in ids[:-wa.PENDING_MAX_RECORDS]:
        archived = json.loads((wa._discard_dir(wa.MEMORY) / f"{rid}.json").read_text(encoding="utf-8"))
        assert archived["discarded_reason"] == "evicted-cap"


def test_cap_is_configurable(home):
    from tools import write_approval as wa
    for i in range(4):
        _stage_add(f"fact {i}", days_old=4 - i)
    assert len(wa.list_pending(wa.MEMORY)) == 4
    assert len(wa.list_pending(wa.MEMORY)) == 4  # idempotent: a sweep never eats a live record
    report = wa.sweep_pending(wa.MEMORY, max_records=2)
    assert len(report["evicted"]) == 2
    assert len(wa.list_pending(wa.MEMORY)) == 2


# --- Supersession ----------------------------------------------------------

def test_identical_proposal_supersedes_instead_of_accumulating(home):
    from tools import write_approval as wa
    first = _stage_patch("live entry one")
    second = _stage_patch("live entry one")
    records = wa.list_pending(wa.MEMORY)
    assert [r["id"] for r in records] == [second]
    archived = json.loads((wa._discard_dir(wa.MEMORY) / f"{first}.json").read_text(encoding="utf-8"))
    assert archived["discarded_reason"] == "superseded"


def test_different_anchors_are_not_collapsed(home):
    from tools import write_approval as wa
    _stage_patch("live entry one")
    _stage_patch("live entry two")
    assert len(wa.list_pending(wa.MEMORY)) == 2


def test_add_dedupe_uses_content(home):
    from tools import write_approval as wa
    _stage_add("same fact")
    _stage_add("same fact")
    _stage_add("different fact")
    assert len(wa.list_pending(wa.MEMORY)) == 2


# --- Telemetry -------------------------------------------------------------

def test_state_line_states_the_effective_policy(home):
    from hermes_cli.write_approval_commands import handle_pending_subcommand
    from tools import write_approval as wa
    out = handle_pending_subcommand(wa.MEMORY, []) or ""
    assert "memory.write_approval = off" in out
    assert "effective policy" in out
    assert "ALWAYS stages" in out


def test_pending_list_shows_age_and_status(home):
    from hermes_cli.write_approval_commands import handle_pending_subcommand
    from tools import write_approval as wa
    _stage_add("recent fact", days_old=2)
    out = handle_pending_subcommand(wa.MEMORY, ["pending"]) or ""
    assert "(2d, add-only)" in out


def test_pending_count_stops_nagging_about_dead_records(home):
    from tools import write_approval as wa
    _stage_patch("live entry one")
    _stage_patch("an entry that was edited away")
    assert wa.pending_count(wa.MEMORY) == 1
