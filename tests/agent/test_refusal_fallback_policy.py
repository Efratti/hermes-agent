"""Refusal fallback: the switch carries content_policy_blocked, the native cause is logged before the
switch, and ``agent.fallback_on_refusal: false`` surfaces the refusal instead (#124874)."""
import logging
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from agent.error_classifier import FailoverReason
from agent.turn_retry_state import TurnRetryState
from agent import turn_truncation
from agent.turn_truncation import handle_content_policy_refusal


def _agent(pending=True, activates=True):
    import agent.transports.anthropic  # registers the transport
    from agent.transports import get_transport

    agent = MagicMock()
    agent.api_mode, agent.provider, agent.model, agent.log_prefix = "anthropic_messages", "anthropic", "claude", ""
    agent._is_anthropic_oauth = False
    agent._get_transport.return_value = get_transport("anthropic_messages")
    agent._has_pending_fallback.return_value = pending
    agent._try_activate_fallback.return_value = activates
    agent._extract_reasoning.return_value = ""
    return agent


def _refusal():
    return SimpleNamespace(
        content=[], stop_reason="refusal", usage=None, model="claude",
        stop_details={"type": "refusal", "category": "cyber", "explanation": "Cyber safeguards flagged this message."},
    )


def _run(agent):
    with patch("agent.conversation_loop._arm_fallback_restart", return_value="sys"):
        return handle_content_policy_refusal(
            agent, _refusal(), TurnRetryState(), thinking_spinner=None, messages=[], api_messages=[], api_kwargs={},
            active_system_prompt=None, conversation_history=[], api_call_count=1, effective_task_id="t",
            turn_id="u", api_request_id="r", api_start_time=0.0, retry_count=0, max_retries=0,
        )


def _cfg(value):
    agent_cfg = {} if value is None else {"fallback_on_refusal": value}
    return patch("hermes_cli.config.load_config_readonly", return_value={"agent": agent_cfg})


@pytest.mark.parametrize("value", [None, True])
def test_default_falls_back_with_content_policy_reason_and_logs_cause_first(value, caplog):
    agent = _agent()
    with _cfg(value), caplog.at_level(logging.WARNING, logger="agent.conversation_loop"):
        verdict = _run(agent)
    assert verdict.action == "break"
    agent._try_activate_fallback.assert_called_once_with(reason=FailoverReason.content_policy_blocked)
    assert "native_stop_reason=refusal" in caplog.text
    assert "'category': 'cyber'" in caplog.text


def test_disabled_surfaces_refusal_without_switching(caplog):
    agent = _agent()
    with _cfg(False), caplog.at_level(logging.WARNING, logger="agent.conversation_loop"):
        verdict = _run(agent)
    assert verdict.action == "return"
    agent._try_activate_fallback.assert_not_called()
    assert "Cyber safeguards flagged" in verdict.result["error"]
    assert "fallback_on_refusal=false" in caplog.text


def test_config_read_failure_keeps_upstream_behaviour():
    with patch("hermes_cli.config.load_config_readonly", side_effect=RuntimeError("boom")):
        assert turn_truncation._refusal_fallback_enabled() is True
