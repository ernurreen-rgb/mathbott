'use client';

import MathRender from '@/components/ui/MathRender';
import { apiPath } from '@/lib/api/client';
import { getTaskAnswerMode } from '@/lib/answer-mode';
import { WORKSHEET_BRAND, type WorksheetTask } from '@/lib/bank-worksheet';

export default function BankWorksheetDocument({ title, tasks }: { title: string; tasks: WorksheetTask[] }) {
  const options = (task: WorksheetTask) => <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px', marginTop: 10 }}>
    {task.options.map((option) => <div key={option.label} data-pdf-part style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
      <strong>{option.label})</strong><MathRender latex={option.text} inline />
    </div>)}
  </div>;
  return <div style={{ width: 720, background: '#fff', color: '#111827', fontFamily: 'Arial, sans-serif', fontSize: 17, lineHeight: 1.55 }}>
    <header data-pdf-header style={{ paddingBottom: 18, marginBottom: 8, borderBottom: '1px solid #cbd5e1' }}>
      <div style={{ fontSize: 11, color: '#64748b' }}>{WORKSHEET_BRAND}</div>
      <h1 style={{ margin: '8px 0 16px', fontSize: 25, fontWeight: 700, overflowWrap: 'anywhere' }}>{title.trim() || 'Есептер жинағы'}</h1>
    </header>
    {tasks.map((task, index) => <article key={task.id} data-pdf-task data-task-id={task.id} style={{ padding: '12px 0 18px' }}>
      <div data-pdf-part style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
        <strong style={{ flexShrink: 0 }}>{index + 1}.</strong>
        <div style={{ minWidth: 0, flex: 1 }}><MathRender latex={task.text} /></div>
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
        </div>) : (task.question_type === 'mcq' || task.question_type === 'mcq6') && getTaskAnswerMode(task) === 'choices'
          ? <div data-pdf-part>{options(task)}</div>
          : task.question_type === 'tf'
            ? <div data-pdf-part style={{ marginTop: 12 }}>□ Дұрыс <span style={{ marginLeft: 28 }}>□ Жалған</span></div>
            : <div data-pdf-part style={{ height: 36, borderBottom: '1px solid #94a3b8', marginTop: 8 }} />}
      </div>
    </article>)}
    <footer data-pdf-footer style={{ fontSize: 12, lineHeight: 1.4, color: '#64748b' }}>{WORKSHEET_BRAND}</footer>
  </div>;
}
