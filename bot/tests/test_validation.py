import json
import unittest

from utils.validation import is_task_answer_correct, normalize_task_answer_for_compare


class WrittenModeChoiceValidationTests(unittest.TestCase):
    def setUp(self):
        self.mcq6_equivalent_task = {
            "question_type": "mcq6",
            "answer_mode": "written",
            "answer": '["C", "E"]',
            "options": json.dumps([
                {"label": "A", "text": r"-0,5\sqrt{3}"},
                {"label": "B", "text": r"\frac{1}{2}"},
                {"label": "C", "text": r"-\frac{1}{2}"},
                {"label": "D", "text": r"-\frac{\sqrt{3}}{2}"},
                {"label": "E", "text": "-0,5"},
                {"label": "F", "text": "0,5"},
            ]),
        }

    def test_mcq6_written_accepts_equivalent_option_values_in_either_order(self):
        self.assertTrue(is_task_answer_correct(self.mcq6_equivalent_task, [r"-\frac{1}{2}", "-0,5"]))
        self.assertTrue(is_task_answer_correct(self.mcq6_equivalent_task, ["-0.5", "-1/2"]))

    def test_mcq6_written_rejects_partial_or_wrong_equivalent_values(self):
        self.assertFalse(is_task_answer_correct(self.mcq6_equivalent_task, ["-0,5", "0,5"]))
        self.assertFalse(is_task_answer_correct(self.mcq6_equivalent_task, ["-0,5"]))

    def test_mcq6_written_does_not_accept_repeated_value_when_only_one_correct_matches(self):
        task = {
            "question_type": "mcq6",
            "answer_mode": "written",
            "answer": '["A", "C"]',
            "options": json.dumps([
                {"label": "A", "text": "1"},
                {"label": "B", "text": "0"},
                {"label": "C", "text": r"-\frac{1}{2}"},
                {"label": "D", "text": "2"},
                {"label": "E", "text": "-0,5"},
                {"label": "F", "text": "3"},
            ]),
        }
        self.assertTrue(is_task_answer_correct(task, ["1", "-0.5"]))
        self.assertFalse(is_task_answer_correct(task, ["-0.5", "-1/2"]))
        self.assertFalse(is_task_answer_correct(task, ["1", "1"]))

    def test_select_written_preserves_order(self):
        task = {
            "question_type": "select",
            "answer_mode": "written",
            "answer": '["C", "A"]',
            "options": json.dumps([
                {"label": "A", "text": "0,5"},
                {"label": "B", "text": "1"},
                {"label": "C", "text": "-1"},
                {"label": "D", "text": "2"},
            ]),
        }
        self.assertTrue(is_task_answer_correct(task, ["-1", "1/2"]))
        self.assertFalse(is_task_answer_correct(task, ["0.5", "-1"]))
        self.assertEqual(normalize_task_answer_for_compare(task, ["C", "A"]), '["C", "A"]')


class PartialAndEmptyAnswerValidationTests(unittest.TestCase):
    def test_mcq6_choices_rejects_partial_or_empty_answers_without_error(self):
        task = {
            "question_type": "mcq6",
            "answer_mode": "choices",
            "answer": '["A", "C"]',
            "options": json.dumps([
                {"label": label, "text": label} for label in ["A", "B", "C", "D", "E", "F"]
            ]),
        }
        self.assertTrue(is_task_answer_correct(task, '["C", "A"]'))
        self.assertFalse(is_task_answer_correct(task, "A"))
        self.assertFalse(is_task_answer_correct(task, '["A"]'))
        self.assertFalse(is_task_answer_correct(task, ""))

    def test_select_choices_rejects_partial_or_empty_answers_without_error(self):
        task = {
            "question_type": "select",
            "answer_mode": "choices",
            "answer": '["C", "A"]',
            "options": json.dumps([
                {"label": label, "text": label} for label in ["A", "B", "C", "D"]
            ]),
        }
        self.assertTrue(is_task_answer_correct(task, '["C", "A"]'))
        self.assertFalse(is_task_answer_correct(task, '["C", ""]'))
        self.assertFalse(is_task_answer_correct(task, '["", "A"]'))
        self.assertFalse(is_task_answer_correct(task, ""))


if __name__ == "__main__":
    unittest.main()
