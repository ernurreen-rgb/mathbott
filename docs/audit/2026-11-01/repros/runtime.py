"""Audit evidence, not regression tests: asserts the reviewed bugs still exist.

Run with a Python environment containing bot/requirements.txt.
Only exercises pure helpers; no database or external network access.
"""
import json
from pathlib import Path
import sys

backend = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[4] / "bot"
sys.path.insert(0, str(backend))

from utils.metrics import MetricsCollector
from utils.validation import is_task_answer_correct, normalize_task_answer_for_compare


def main():
    grading = []
    for expected, submitted in [("x-x", "0"), ("x-x+1", "1"), ("0*x", "0")]:
        task = {"question_type": "input", "answer": expected}
        accepted = is_task_answer_correct(task, submitted)
        assert not accepted, "The constant-equivalence bug may have been fixed."
        grading.append({
            "expected": expected,
            "submitted": submitted,
            "accepted": accepted,
            "expected_key": normalize_task_answer_for_compare(task, expected),
            "submitted_key": normalize_task_answer_for_compare(task, submitted),
        })
    assert is_task_answer_correct({"question_type": "input", "answer": "2*x-x"}, "x")
    print(json.dumps({"constant_equivalence": grading}))

    metrics = MetricsCollector()
    for index in range(20000):
        metrics.record_request(f"GET /missing-{index}", 1.0, 404)
    assert len(metrics.events) == 10000
    assert len(metrics.endpoint_counts) == len(metrics.error_counts) == 20000
    print(json.dumps({"metric_cardinality": {
        "retained_events": len(metrics.events),
        "endpoint_keys": len(metrics.endpoint_counts),
        "error_keys": len(metrics.error_counts),
    }}))


if __name__ == "__main__":
    main()
