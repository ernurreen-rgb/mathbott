import json
import unittest

from utils.validation import (
    get_task_max_score,
    grade_task_answer,
    is_six_option_mcq,
    is_task_answer_correct,
    normalize_task_answer_for_compare,
)


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


class EntScoringTests(unittest.TestCase):
    @staticmethod
    def _mcq6(answer, *, answer_mode="choices", question_type="mcq6"):
        return {
            "question_type": question_type,
            "answer_mode": answer_mode,
            "answer": answer,
            "options": json.dumps([
                {"label": label, "text": label} for label in ["A", "B", "C", "D", "E", "F"]
            ]),
        }

    def test_single_point_question_types_keep_one_point_max(self):
        tf_task = {"question_type": "tf", "answer": "true"}
        input_task = {"question_type": "input", "answer": "42"}
        mcq4_task = {
            "question_type": "mcq",
            "answer": "B",
            "options": json.dumps([{"label": l, "text": l} for l in ["A", "B", "C", "D"]]),
        }
        for task in (tf_task, input_task, mcq4_task):
            self.assertFalse(is_six_option_mcq(task))
            self.assertEqual(get_task_max_score(task), 1)
        self.assertEqual(grade_task_answer(tf_task, "true"), (1, 1))
        self.assertEqual(grade_task_answer(tf_task, "false"), (0, 1))
        self.assertEqual(grade_task_answer(mcq4_task, "B"), (1, 1))
        self.assertEqual(grade_task_answer(mcq4_task, '["B", "C"]'), (0, 1))

    def test_mcq6_with_one_correct_answer_scores_ent_two_one_zero(self):
        task = self._mcq6("C")
        self.assertEqual(get_task_max_score(task), 2)
        self.assertEqual(grade_task_answer(task, "C"), (2, 2))
        self.assertEqual(grade_task_answer(task, '["C", "E"]'), (1, 2))
        self.assertEqual(grade_task_answer(task, '["C", "E", "F"]'), (0, 2))
        self.assertEqual(grade_task_answer(task, "E"), (0, 2))
        self.assertEqual(grade_task_answer(task, '["A", "B", "E"]'), (0, 2))
        # Lesson / mistake-review strictness stays unchanged.
        self.assertFalse(is_task_answer_correct(task, '["C", "E"]'))

    def test_mcq6_with_two_correct_answers_scores_ent_two_one_zero(self):
        task = self._mcq6('["C", "D"]')
        self.assertEqual(grade_task_answer(task, '["C", "D"]'), (2, 2))
        self.assertEqual(grade_task_answer(task, '["D", "C"]'), (2, 2))
        self.assertEqual(grade_task_answer(task, "C"), (1, 2))
        self.assertEqual(grade_task_answer(task, '["C", "E"]'), (1, 2))
        self.assertEqual(grade_task_answer(task, '["C", "D", "E"]'), (1, 2))
        self.assertEqual(grade_task_answer(task, '["C", "E", "F"]'), (0, 2))
        self.assertEqual(grade_task_answer(task, "E"), (0, 2))
        self.assertEqual(grade_task_answer(task, ""), (0, 2))

    def test_mcq6_with_three_correct_answers_scores_ent_two_one_zero(self):
        task = self._mcq6('["A", "C", "D"]')
        self.assertEqual(grade_task_answer(task, '["A", "C", "D"]'), (2, 2))
        self.assertEqual(grade_task_answer(task, '["A", "C"]'), (1, 2))
        self.assertEqual(grade_task_answer(task, '["A", "C", "E"]'), (1, 2))
        self.assertEqual(grade_task_answer(task, "A"), (0, 2))
        self.assertEqual(grade_task_answer(task, '["A", "E"]'), (0, 2))
        self.assertEqual(grade_task_answer(task, '["A", "B", "E", "F"]'), (0, 2))

    def test_legacy_six_option_mcq_also_gets_two_point_ent_scoring(self):
        legacy = self._mcq6("A", question_type="mcq")
        self.assertTrue(is_six_option_mcq(legacy))
        self.assertEqual(grade_task_answer(legacy, "A"), (2, 2))
        self.assertEqual(grade_task_answer(legacy, '["A", "B"]'), (1, 2))

    def test_mcq6_written_mode_supports_partial_ent_scoring(self):
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
        self.assertEqual(grade_task_answer(task, ["1", "-0.5"]), (2, 2))
        self.assertEqual(grade_task_answer(task, ["1"]), (1, 2))
        self.assertEqual(grade_task_answer(task, ["1", "1"]), (1, 2))
        self.assertEqual(grade_task_answer(task, ["-0.5", "-1/2"]), (1, 2))
        self.assertEqual(grade_task_answer(task, ["999", "888"]), (0, 2))

    def test_select_matching_scores_two_one_zero_in_choices_and_written_modes(self):
        choices_task = {
            "question_type": "select",
            "answer_mode": "choices",
            "answer": '["C", "A"]',
            "options": json.dumps([{"label": l, "text": l} for l in ["A", "B", "C", "D"]]),
        }
        self.assertEqual(get_task_max_score(choices_task), 2)
        self.assertEqual(grade_task_answer(choices_task, '["C", "A"]'), (2, 2))
        self.assertEqual(grade_task_answer(choices_task, '["C", ""]'), (1, 2))
        self.assertEqual(grade_task_answer(choices_task, '["", "A"]'), (1, 2))
        self.assertEqual(grade_task_answer(choices_task, '["C", "B"]'), (1, 2))
        self.assertEqual(grade_task_answer(choices_task, '["A", "C"]'), (0, 2))

        written_task = {
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
        self.assertEqual(grade_task_answer(written_task, ["-1", "1/2"]), (2, 2))
        self.assertEqual(grade_task_answer(written_task, ["-1", "2"]), (1, 2))
        self.assertEqual(grade_task_answer(written_task, ["99", "0.5"]), (1, 2))
        self.assertEqual(grade_task_answer(written_task, ["0.5", "-1"]), (0, 2))


if __name__ == "__main__":
    unittest.main()
