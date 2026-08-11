"""Tests for alternative_finder's three-tier rerank fallback (``_rerank_chunks``).

Each tier is forced independently:

  * tier 1 — the in-database ``$rerank`` succeeds.
  * tier 2 — tier 1 raises ``OperationFailure`` code 40324, the external reranker succeeds.
  * tier 3 — tier 1 raises 40324 AND the external reranker fails.

Plus the guard that matters most: an ``OperationFailure`` that is NOT 40324 must propagate
rather than silently degrade the run.

No network and no database are touched. Every credential used here is a fictitious test
value; nothing in this file reads a real environment or a real key.
"""

import sys
from pathlib import Path

import pytest
from pymongo.errors import OperationFailure

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from alternative_finder import nodes  # noqa: E402

# Obviously-fake credential, used only so the tier-2 code path is reachable in tests.
_FAKE_KEY = "test-not-a-real-key"

FUSED = [
    {"chunk_id": "CHUNK-A", "supplier_id": "SUP-1", "doc_type": "certificate"},
    {"chunk_id": "CHUNK-B", "supplier_id": "SUP-2", "doc_type": "audit_report"},
    {"chunk_id": "CHUNK-C", "supplier_id": "SUP-3", "doc_type": "contract"},
]

TEXTS = {
    "CHUNK-A": "ISO 9001 quality management certificate, packaging materials scope.",
    "CHUNK-B": "Audit report: trade compliance programme and HS classification review.",
    "CHUNK-C": "Contract article 8: tariff contingency and impact assessment.",
}


# --------------------------------------------------------------------------- fakes
class _FakeCursor:
    def __init__(self, rows):
        self._rows = rows

    async def to_list(self, length=None):
        return self._rows


class _FakeCollection:
    """Only implements what ``_rerank_external_voyage`` needs: the chunk_text lookup."""

    def __init__(self, texts):
        self._texts = texts

    def find(self, query, projection=None):
        ids = query["chunk_id"]["$in"]
        return _FakeCursor(
            [{"chunk_id": cid, "chunk_text": self._texts.get(cid, "")} for cid in ids]
        )


class _FakeDB:
    def __init__(self, texts=None):
        self._coll = _FakeCollection(texts if texts is not None else TEXTS)

    def __getitem__(self, name):
        assert name == "supplier_documents"
        return self._coll


def _settings_with(monkeypatch, key):
    class _S:
        voyage_api_key_fallback = key

    monkeypatch.setattr(nodes, "get_settings", lambda: _S())


def _unsupported_stage_error():
    """The exact server error this fallback exists for."""
    return OperationFailure(
        "Unrecognized pipeline stage name: '$rerank'",
        code=nodes._RERANK_UNSUPPORTED_CODE,
    )


# --------------------------------------------------------------------------- tier 1
@pytest.mark.asyncio
async def test_tier1_native_rerank_used(monkeypatch):
    native_order = [FUSED[2], FUSED[0], FUSED[1]]

    async def fake_native(db, stage, query_text, num_docs):
        assert num_docs == len(FUSED)
        return native_order

    monkeypatch.setattr(nodes, "_rerank_native", fake_native)

    async def must_not_run(*a, **k):
        raise AssertionError("tier 2 must not be reached when tier 1 succeeds")

    monkeypatch.setattr(nodes, "_rerank_external_voyage", must_not_run)

    ordered, mode = await nodes._rerank_chunks(_FakeDB(), FUSED, {}, "query")
    assert mode == nodes._RERANK_MODE_NATIVE
    assert ordered == native_order


# --------------------------------------------------------------------------- tier 2
@pytest.mark.asyncio
async def test_tier2_external_used_when_native_unsupported(monkeypatch):
    async def fake_native(*a, **k):
        raise _unsupported_stage_error()

    monkeypatch.setattr(nodes, "_rerank_native", fake_native)
    _settings_with(monkeypatch, _FAKE_KEY)

    captured = {}

    class _Resp:
        status_code = 200

        def raise_for_status(self):
            return None

        def json(self):
            # Deliberately unsorted, to prove the code sorts by relevance_score.
            return {"data": [
                {"index": 0, "relevance_score": 0.11},
                {"index": 2, "relevance_score": 0.93},
                {"index": 1, "relevance_score": 0.42},
            ]}

    class _FakeClient:
        def __init__(self, timeout=None):
            captured["timeout"] = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, url, headers=None, json=None):
            captured["url"] = url
            captured["headers"] = headers
            captured["payload"] = json
            return _Resp()

    monkeypatch.setattr(nodes.httpx, "AsyncClient", _FakeClient)

    ordered, mode = await nodes._rerank_chunks(_FakeDB(), FUSED, {}, "the query")

    assert mode == nodes._RERANK_MODE_EXTERNAL
    # Sorted by relevance_score desc: C (0.93), B (0.42), A (0.11)
    assert [c["chunk_id"] for c in ordered] == ["CHUNK-C", "CHUNK-B", "CHUNK-A"]
    assert captured["url"] == nodes._VOYAGE_RERANK_URL
    assert captured["payload"]["model"] == nodes._RERANK_MODEL
    assert captured["payload"]["query"] == "the query"
    assert len(captured["payload"]["documents"]) == 3
    # The key travels in the header only, and only the configured one.
    assert captured["headers"]["Authorization"] == f"Bearer {_FAKE_KEY}"
    assert captured["timeout"] == nodes._VOYAGE_RERANK_TIMEOUT_S


@pytest.mark.asyncio
async def test_tier2_skipped_when_no_key_configured(monkeypatch):
    async def fake_native(*a, **k):
        raise _unsupported_stage_error()

    monkeypatch.setattr(nodes, "_rerank_native", fake_native)
    _settings_with(monkeypatch, None)

    def must_not_construct(*a, **k):
        raise AssertionError("no HTTP client may be built without a configured key")

    monkeypatch.setattr(nodes.httpx, "AsyncClient", must_not_construct)

    ordered, mode = await nodes._rerank_chunks(_FakeDB(), FUSED, {}, "query")
    assert mode == nodes._RERANK_MODE_NONE
    assert ordered == FUSED


# --------------------------------------------------------------------------- tier 3
@pytest.mark.parametrize(
    "failure",
    [
        pytest.param("timeout", id="network_timeout"),
        pytest.param("rate_limit", id="rate_limit_429"),
        pytest.param("invalid_key", id="invalid_key_401"),
        pytest.param("bad_shape", id="unexpected_payload"),
    ],
)
@pytest.mark.asyncio
async def test_tier3_fused_order_when_external_fails(monkeypatch, failure):
    async def fake_native(*a, **k):
        raise _unsupported_stage_error()

    monkeypatch.setattr(nodes, "_rerank_native", fake_native)
    _settings_with(monkeypatch, _FAKE_KEY)

    class _Resp:
        def __init__(self, status):
            self.status_code = status

        def raise_for_status(self):
            if self.status_code >= 400:
                raise nodes.httpx.HTTPStatusError(
                    "error", request=None, response=self
                )

        def json(self):
            return {"data": [{"no_index_field": True}]}

    class _FakeClient:
        def __init__(self, timeout=None):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, url, headers=None, json=None):
            if failure == "timeout":
                raise nodes.httpx.ReadTimeout("timed out")
            if failure == "rate_limit":
                return _Resp(429)
            if failure == "invalid_key":
                return _Resp(401)
            return _Resp(200)  # bad_shape

    monkeypatch.setattr(nodes.httpx, "AsyncClient", _FakeClient)

    ordered, mode = await nodes._rerank_chunks(_FakeDB(), FUSED, {}, "query")
    assert mode == nodes._RERANK_MODE_NONE
    assert ordered == FUSED, "tier 3 must serve the fused order unchanged"


# ------------------------------------------------------- the guard that must not regress
@pytest.mark.asyncio
async def test_other_operation_failure_propagates(monkeypatch):
    """A non-40324 OperationFailure is a real problem and must NOT be swallowed."""

    async def fake_native(*a, **k):
        raise OperationFailure("PlanExecutor error: path missing", code=8000)

    monkeypatch.setattr(nodes, "_rerank_native", fake_native)

    def must_not_construct(*a, **k):
        raise AssertionError("tier 2 must not be reached for a non-40324 failure")

    monkeypatch.setattr(nodes.httpx, "AsyncClient", must_not_construct)

    with pytest.raises(OperationFailure) as excinfo:
        await nodes._rerank_chunks(_FakeDB(), FUSED, {}, "query")
    assert excinfo.value.code == 8000


# ------------------------------------------------------------------------- edge cases
@pytest.mark.asyncio
async def test_empty_fused_short_circuits(monkeypatch):
    def must_not_construct(*a, **k):
        raise AssertionError("nothing to rerank; no client should be built")

    monkeypatch.setattr(nodes.httpx, "AsyncClient", must_not_construct)
    ordered, mode = await nodes._rerank_chunks(_FakeDB(), [], {}, "query")
    assert ordered == []
    assert mode == nodes._RERANK_MODE_NONE


@pytest.mark.asyncio
async def test_chunks_without_text_are_appended_not_dropped(monkeypatch):
    """A chunk with empty chunk_text is not sent to the API but must survive in the output."""

    async def fake_native(*a, **k):
        raise _unsupported_stage_error()

    monkeypatch.setattr(nodes, "_rerank_native", fake_native)
    _settings_with(monkeypatch, _FAKE_KEY)

    texts = {"CHUNK-A": TEXTS["CHUNK-A"], "CHUNK-B": "", "CHUNK-C": TEXTS["CHUNK-C"]}

    class _Resp:
        status_code = 200

        def raise_for_status(self):
            return None

        def json(self):
            # Only two documents were sent (A and C).
            return {"data": [
                {"index": 1, "relevance_score": 0.9},
                {"index": 0, "relevance_score": 0.2},
            ]}

    class _FakeClient:
        def __init__(self, timeout=None):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, url, headers=None, json=None):
            assert len(json["documents"]) == 2, "empty-text chunk must not be sent"
            return _Resp()

    monkeypatch.setattr(nodes.httpx, "AsyncClient", _FakeClient)

    ordered, mode = await nodes._rerank_chunks(_FakeDB(texts), FUSED, {}, "query")
    assert mode == nodes._RERANK_MODE_EXTERNAL
    assert [c["chunk_id"] for c in ordered] == ["CHUNK-C", "CHUNK-A", "CHUNK-B"]
    assert len(ordered) == len(FUSED), "no chunk may be lost by the fallback"
