'use client';

import MathRender from '@/components/ui/MathRender';
import { apiPath } from '@/lib/api/client';
import { getTaskAnswerMode } from '@/lib/answer-mode';
import { WORKSHEET_BRAND, type WorksheetTask } from '@/lib/bank-worksheet';
import { hasEmptyMcqOptionTexts, parseComparisonTask } from '@/lib/comparison-task';
import type { AnswerPiece, ConstructorLanguage } from '@/lib/constructor-answers';

export interface WorksheetAnswer {
  number: number;
  pieces: AnswerPiece[];
}

const WORDS: Record<ConstructorLanguage, { true: string; false: string; answers: string; untitled: string }> = {
  kk: { true: 'Дұрыс', false: 'Жалған', answers: 'Жауаптар', untitled: 'Есептер жинағы' },
  ru: { true: 'Верно', false: 'Неверно', answers: 'Ответы', untitled: 'Сборник задач' },
};

/**
 * The printable worksheet. `brand` is the line above the title and in the footer (the site's own
 * when omitted, none when empty); `answerKey` adds an answer page after the tasks.
 */
export default function BankWorksheetDocument({ title, tasks, brand, language = 'kk', answerKey, allowEmptyHeader = false }: {
  title: string;
  tasks: WorksheetTask[];
  brand?: string;
  language?: ConstructorLanguage;
  answerKey?: WorksheetAnswer[];
  allowEmptyHeader?: boolean;
}) {
  const brandLine = brand === undefined ? WORKSHEET_BRAND : brand.trim();
  const words = WORDS[language];
  const heading = allowEmptyHeader ? title.trim() : (title.trim() || words.untitled);
  const showHeader = Boolean(brandLine || heading);
  const options = (task: WorksheetTask) => {
    const labelOnly = hasEmptyMcqOptionTexts(task.options);
    if (labelOnly) {
      return <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(Math.max(task.options.length, 1), 4)}, minmax(0, 1fr))`, gap: '8px 12px', marginTop: 10 }}>
        {task.options.map((option) => <div key={option.label} data-pdf-part style={{ border: '1px solid #cbd5e1', borderRadius: 6, padding: '6px 0', textAlign: 'center', fontWeight: 700 }}>
          {option.label}
        </div>)}
      </div>;
    }
    return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px', marginTop: 10 }}>
      {task.options.map((option) => <div key={option.label} data-pdf-part style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
        <strong>{option.label})</strong><MathRender latex={option.text} inline />
      </div>)}
    </div>;
  };
  return <div style={{ width: 720, background: '#fff', color: '#111827', fontFamily: 'Arial, sans-serif', fontSize: 17, lineHeight: 1.55 }}>
    {showHeader && (
      <header data-pdf-header style={{ paddingBottom: heading ? 18 : 10, marginBottom: 8, borderBottom: '1px solid #cbd5e1' }}>
        {brandLine && <div style={{ fontSize: 11, color: '#64748b' }}>{brandLine}</div>}
        {heading && <h1 style={{ margin: '8px 0 16px', fontSize: 25, fontWeight: 700, overflowWrap: 'anywhere' }}>{heading}</h1>}
      </header>
    )}
    {tasks.map((task, index) => {
      const comparison = parseComparisonTask(task.text);
      const difficulty = task.difficulty?.trim().toUpperCase();
      return <article key={task.id} data-pdf-task data-task-id={task.id} style={{ padding: '12px 0 18px' }}>
      <div data-pdf-part style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
        <strong style={{ flexShrink: 0 }}>{index + 1}.{difficulty ? ` (${difficulty})` : ''}</strong>
        <div style={{ minWidth: 0, flex: 1 }}>
          {comparison ? <div>
            {comparison.condition && <div style={{ textAlign: 'center', fontWeight: 600, marginBottom: 8 }}><MathRender latex={comparison.condition} /></div>}
            <div style={{ border: '1px solid #cbd5e1', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid #cbd5e1', background: '#f8fafc', fontWeight: 700, textAlign: 'center', fontSize: 14 }}>
                <div style={{ padding: '4px 8px', borderRight: '1px solid #cbd5e1' }}>A</div>
                <div style={{ padding: '4px 8px' }}>B</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', textAlign: 'center' }}>
                <div style={{ padding: '8px 10px', borderRight: '1px solid #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><MathRender latex={comparison.columnA} /></div>
                <div style={{ padding: '8px 10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><MathRender latex={comparison.columnB} /></div>
              </div>
            </div>
          </div> : <MathRender latex={task.text} />}
        </div>
      </div>
      {task.image_filename && <div data-pdf-part style={{ padding: '12px 0 4px 28px' }}>
        {/* Intrinsic image dimensions are needed for predictable paper layout. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={apiPath(`images/${task.image_filename}`)} alt={`Есеп ${index + 1} суреті`}
          style={{ display: 'block', width: 'auto', height: 'auto', maxWidth: '100%', maxHeight: 320, objectFit: 'contain' }} />
      </div>}
      <div style={{ paddingLeft: 28 }}>
        {task.question_type === 'select' ? task.subquestions.map((subquestion, subIndex) => <div key={subIndex} data-pdf-part style={{ marginTop: 12 }}>
          <strong>{String.fromCharCode(65 + subIndex)}) </strong><MathRender latex={subquestion.text} inline />
          {getTaskAnswerMode(task) === 'choices' ? options(task) : <div style={{ height: 30, borderBottom: '1px solid #94a3b8' }} />}
        </div>) : (task.question_type === 'mcq' || task.question_type === 'mcq6' || task.question_type === 'context') && getTaskAnswerMode(task) === 'choices'
          ? <div data-pdf-part>{options(task)}</div>
          : task.question_type === 'tf'
            ? <div data-pdf-part style={{ marginTop: 12 }}>□ {words.true} <span style={{ marginLeft: 28 }}>□ {words.false}</span></div>
            : <div data-pdf-part style={{ height: 36, borderBottom: '1px solid #94a3b8', marginTop: 8 }} />}
      </div>
    </article>;
    })}
    {answerKey && answerKey.length > 0 && <section data-pdf-answers style={{ paddingTop: 4 }}>
      <h2 style={{ margin: '0 0 14px', fontSize: 22, fontWeight: 700 }}>{words.answers}</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px 20px' }}>
        {answerKey.map((entry) => <div key={entry.number} style={{ display: 'flex', gap: 6, alignItems: 'baseline', minWidth: 0 }}>
          <strong style={{ flexShrink: 0 }}>{entry.number})</strong>
          <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
            {entry.pieces.length ? entry.pieces.map((piece, index) => piece.kind === 'text'
              ? <span key={index}>{piece.text}</span>
              : <MathRender key={index} latex={piece.latex} inline />) : '—'}
          </span>
        </div>)}
      </div>
    </section>}
    <footer data-pdf-footer style={{ fontSize: 12, lineHeight: 1.4, color: '#64748b', minHeight: 17 }}>{brandLine}</footer>
  </div>;
}
