"use client";

import { useState } from "react";

interface Module {
  id: number;
  name: string;
  description?: string;
  icon?: string;
  sort_order: number;
}

interface ModuleFormProps {
  modules: Module[];
  form: { name: string; description: string; icon: string; sort_order: number };
  setForm: (form: { name: string; description: string; icon: string; sort_order: number }) => void;
  onSubmit: (e: React.FormEvent) => Promise<void>;
  editingModule: number | null;
  editForm: { name: string; description: string; icon: string; sort_order: number };
  setEditForm: (form: { name: string; description: string; icon: string; sort_order: number }) => void;
  onUpdate: (id: number, e: React.FormEvent) => Promise<void>;
  onCancelEdit: () => void;
  onStartEdit?: (module: Module) => void;
  onDelete: (id: number) => Promise<void>;
  onSelect: (id: number) => void;
  selectedModule: number | null;
}

export default function ModuleForm({
  modules,
  form,
  setForm,
  onSubmit,
  editingModule,
  editForm,
  setEditForm,
  onUpdate,
  onCancelEdit,
  onStartEdit,
  onDelete,
  onSelect,
  selectedModule,
}: ModuleFormProps) {
  return (
    <div className="bg-white p-4 rounded-lg shadow">
      <h2 className="text-xl font-bold mb-4">Модульдер</h2>
      
      {/* Create Module Form */}
      <form onSubmit={onSubmit} className="mb-4 space-y-2">
        <input
          type="text"
          placeholder="Модуль атауы"
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
          type="text"
          placeholder="Белгіше (эмодзи немесе мәтін)"
          value={form.icon}
          onChange={(e) => setForm({ ...form, icon: e.target.value })}
          className="w-full p-2 border rounded"
        />
        <input
          type="number"
          placeholder="Сұрыптау реті"
          value={form.sort_order}
          onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })}
          className="w-full p-2 border rounded"
        />
        <button type="submit" className="w-full bg-blue-500 text-white p-2 rounded hover:bg-blue-600">
          Модуль құру
        </button>
      </form>

      {/* Modules List */}
      <div className="space-y-2">
        {modules.map((module) => (
          <div
            key={module.id}
            className={`p-3 border rounded cursor-pointer ${
              selectedModule === module.id ? "bg-blue-50 border-blue-500" : ""
            }`}
            onClick={() => onSelect(module.id)}
          >
            {editingModule === module.id ? (
              <form
                onSubmit={(e) => onUpdate(module.id, e)}
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
                  type="text"
                  value={editForm.icon}
                  onChange={(e) => setEditForm({ ...editForm, icon: e.target.value })}
                  className="w-full p-2 border rounded"
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
                  <div className="font-bold">
                    {module.icon && <span className="mr-2">{module.icon}</span>}
                    {module.name}
                  </div>
                  {module.description && <div className="text-sm text-gray-600">{module.description}</div>}
                  <div className="text-xs text-gray-500">Реті: {module.sort_order}</div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditForm({
                        name: module.name,
                        description: module.description || "",
                        icon: module.icon || "",
                        sort_order: module.sort_order,
                      });
                      onStartEdit?.(module);
                    }}
                    className="px-3 py-1 bg-yellow-500 text-white rounded hover:bg-yellow-600"
                  >
                    Өңдеу
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(module.id);
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

