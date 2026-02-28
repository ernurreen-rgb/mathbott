"use client";

interface Section {
  id: number;
  module_id: number;
  name: string;
  sort_order: number;
  description?: string | null;
  guide?: string | null;
}

interface SectionFormProps {
  sections: Section[];
  form: { name: string; description: string; sort_order: number };
  setForm: (form: { name: string; description: string; sort_order: number }) => void;
  onSubmit: (e: React.FormEvent) => Promise<void>;
  editingSection: number | null;
  editForm: { name: string; description: string; sort_order: number };
  setEditForm: (form: { name: string; description: string; sort_order: number }) => void;
  onUpdate: (id: number, e: React.FormEvent) => Promise<void>;
  onCancelEdit: () => void;
  onStartEdit?: (section: Section) => void;
  onDelete: (id: number) => Promise<void>;
  onSelect: (id: number) => void;
  selectedSection: number | null;
}

export default function SectionForm({
  sections,
  form,
  setForm,
  onSubmit,
  editingSection,
  editForm,
  setEditForm,
  onUpdate,
  onCancelEdit,
  onStartEdit,
  onDelete,
  onSelect,
  selectedSection,
}: SectionFormProps) {
  if (sections.length === 0 && !editingSection) {
    return null;
  }

  return (
    <div className="bg-white p-4 rounded-lg shadow">
      <h2 className="text-xl font-bold mb-4">Бөлімдер</h2>
      
      {/* Create Section Form */}
      <form onSubmit={onSubmit} className="mb-4 space-y-2">
        <input
          type="text"
          placeholder="Бөлім атауы"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="w-full p-2 border rounded"
          required
        />
        <textarea
          placeholder="Сипаттамасы (міндетті емес)"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          className="w-full p-2 border rounded"
          rows={2}
        />
        <input
          type="number"
          placeholder="Сұрыптау реті"
          value={form.sort_order}
          onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })}
          className="w-full p-2 border rounded"
        />
        <button type="submit" className="w-full bg-blue-500 text-white p-2 rounded hover:bg-blue-600">
          Бөлім құру
        </button>
      </form>

      {/* Sections List */}
      <div className="space-y-2">
        {sections.map((section) => (
          <div
            key={section.id}
            className={`p-3 border rounded cursor-pointer ${
              selectedSection === section.id ? "bg-blue-50 border-blue-500" : ""
            }`}
            onClick={() => onSelect(section.id)}
          >
            {editingSection === section.id ? (
              <form
                onSubmit={(e) => onUpdate(section.id, e)}
                className="space-y-2"
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full p-2 border rounded"
                  required
                />
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  className="w-full p-2 border rounded"
                  rows={2}
                />
                <input
                  type="number"
                  value={editForm.sort_order}
                  onChange={(e) => setEditForm({ ...editForm, sort_order: parseInt(e.target.value) || 0 })}
                  className="w-full p-2 border rounded"
                />
                <div className="flex gap-2">
                  <button type="submit" className="flex-1 bg-green-500 text-white p-2 rounded hover:bg-green-600">
                    Сақтау
                  </button>
                  <button
                    type="button"
                    onClick={onCancelEdit}
                    className="flex-1 bg-gray-500 text-white p-2 rounded hover:bg-gray-600"
                  >
                    Бас тарту
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex justify-between items-center">
                <div>
                  <div className="font-bold">{section.name}</div>
                  {section.description && <div className="text-sm text-gray-600">{section.description}</div>}
                  <div className="text-xs text-gray-500">Реті: {section.sort_order}</div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditForm({
                        name: section.name,
                        description: section.description || "",
                        sort_order: section.sort_order,
                      });
                      onStartEdit?.(section);
                    }}
                    className="px-3 py-1 bg-yellow-500 text-white rounded hover:bg-yellow-600"
                  >
                    Өңдеу
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(section.id);
                    }}
                    className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600"
                  >
                    Жою
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

