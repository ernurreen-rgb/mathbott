"""A written answer must be the answer, not an expression equal to it.

Run from bot/: python -m pytest tests/test_answer_final_form.py
"""
import json
import unittest

from utils.validation import is_task_answer_correct


def _input(answer, accepted=()):
    return {"question_type": "input", "answer": answer, "accepted_answers": list(accepted)}


class FinalFormTests(unittest.TestCase):
    def assertAccepted(self, key, answer, task=None):
        self.assertTrue(is_task_answer_correct(task or _input(key), answer), f"{answer!r} should pass for {key!r}")

    def assertRejected(self, key, answer, task=None):
        self.assertFalse(is_task_answer_correct(task or _input(key), answer), f"{answer!r} should fail for {key!r}")

    def test_restating_the_task_is_not_an_answer(self):
        for key, answer in [
            ("110", "88+22"),
            ("110", "100+10"),
            ("110", r"\frac{220}{2}"),
            ("12", r"3\cdot4"),
            ("1024", "2^{10}"),
            ("4", r"\sqrt{16}"),
            ("8", r"\sqrt[3]{512}"),
        ]:
            self.assertRejected(key, answer)

    def test_the_same_number_in_any_notation_passes(self):
        for key, answer in [
            ("110", "110"),
            ("110", "110,0"),
            ("1/2", "0,5"),
            (r"\frac{3}{4}", "3/4"),
            ("-2,5", "-2.5"),
            ("-2,5", "-5/2"),
            ("3", "+3"),
            # A key written as an expression still takes the computed number.
            ("2^{10}", "1024"),
            ("2^{10}", "2^{10}"),
        ]:
            self.assertAccepted(key, answer)

    def test_fractions_must_be_reduced_unless_the_task_accepts_more(self):
        self.assertRejected("1/2", "2/4")
        self.assertRejected(r"\frac{2}{3}", r"\frac{4}{6}")
        self.assertAccepted("1/2", "2/4", task=_input("1/2", accepted=["2/4"]))

    def test_algebra_needs_the_simplified_form_but_not_the_same_order(self):
        for key, answer in [("5x", "3x+2x"), ("x^2+2x+1", "(x+1)^2"), ("(x+1)^2", "x^2+2x+1"), ("2(x+1)", "2x+2")]:
            self.assertRejected(key, answer)
        for key, answer in [
            ("2x+1", "1+2x"),
            ("-x+3", "3-x"),
            ("(x+1)^2", "(1+x)^2"),
            ("x/2", r"\frac{1}{2}x"),
            ("x/2", "0,5x"),
            (r"\frac{x}{y}", "x/y"),
            (r"2\sqrt{3}", r"2\sqrt{3}"),
        ]:
            self.assertAccepted(key, answer)

    def test_equations_inequalities_and_intervals_must_be_solved(self):
        for key, answer in [(r"x\ge3", r"2x\ge6"), ("x=3", "2x=6"), (r"(-\infty;5]", r"(-\infty;2+3]")]:
            self.assertRejected(key, answer)
        for key, answer in [
            (r"x\ge3", r"x\geq3"),
            (r"x\ge3", r"3\le x"),
            ("x=3", "3=x"),
            (r"(-\infty;5]", r"(-\infty; 5]"),
            (r"(-\infty;2]\cup[5;+\infty)", r"[5;+\infty)\cup(-\infty;2]"),
        ]:
            self.assertAccepted(key, answer)

    def test_forms_the_checker_cannot_read_keep_the_value_comparison(self):
        self.assertAccepted("25\\%", "0,25")

    def test_written_answers_to_choice_tasks_must_be_the_option_itself(self):
        task = {
            "question_type": "mcq",
            "answer_mode": "written",
            "answer": "A,B",
            "options": json.dumps([{"label": "A", "text": "3"}, {"label": "B", "text": "-3"}, {"label": "C", "text": "9"}]),
        }
        self.assertAccepted(None, json.dumps(["3", "-3"]), task=task)
        self.assertRejected(None, json.dumps(["1+2", "-3"]), task=task)

        matching = {
            "question_type": "select",
            "answer_mode": "written",
            "answer": '["A","B"]',
            "options": json.dumps([{"label": "A", "text": "4"}, {"label": "B", "text": "9"}]),
            "subquestions": json.dumps([{"text": "2^2", "correct": "A"}, {"text": "3^2", "correct": "B"}]),
        }
        self.assertAccepted(None, json.dumps(["4", "9"]), task=matching)
        self.assertRejected(None, json.dumps(["2^2", "3^2"]), task=matching)


if __name__ == "__main__":
    unittest.main()
