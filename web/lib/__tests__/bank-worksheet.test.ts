import { worksheetFilename, worksheetTask } from '../bank-worksheet';
import type { BankTask } from '@/types';

it('exports only student fields, including nested options/subquestions without answer keys', () => {
  const task = { id: 4, text: 'Есеп', question_type: 'select', answer_mode: 'choices',
    answer: 'SECRET', accepted_answers: ['SECRET'], solution_filename: 'private-solution.png',
    options: [{ label: 'A', text: 'Нұсқа', correct: true, answer: 'SECRET' }],
    subquestions: [{ text: 'Сұрақ', correct: 'SECRET' }], image_filename: 'diagram.png',
    difficulty: 'B', topics: ['Тақырып'], created_at: '', updated_at: '', deleted_at: null } as unknown as BankTask;
  expect(worksheetTask(task)).toEqual({ id: 4, text: 'Есеп', question_type: 'select', answer_mode: 'choices',
    options: [{ label: 'A', text: 'Нұсқа' }], subquestions: [{ text: 'Сұрақ' }], image_filename: 'diagram.png' });
  expect(JSON.stringify(worksheetTask(task))).not.toContain('SECRET');
  expect(() => worksheetTask({ ...task, deleted_at: '2026-11-04' })).toThrow('себетте');
});

it('produces a usable Unicode PDF filename without path/control characters', () => {
  expect(worksheetFilename('  Теңдеулер: 20/есеп?  ')).toBe('Теңдеулер 20есеп.pdf');
  expect(worksheetFilename('../')).toBe('QazMath-esepter.pdf');
});
