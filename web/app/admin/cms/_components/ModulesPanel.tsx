"use client";
import type { Dispatch, SetStateAction } from "react";
import { Module } from "./model";

type Props = {
  createModule: (e: React.FormEvent) => Promise<void>;
  moduleForm: { name: string; description: string; icon: string; sort_order: number; };
  setModuleForm: Dispatch<SetStateAction<{ name: string; description: string; icon: string; sort_order: number; }>>;
  modules: Module[];
  selectedModule: number | null;
  editingModule: number | null;
  setSelectedModule: Dispatch<SetStateAction<number | null>>;
  updateModule: (e: React.FormEvent) => Promise<void>;
  editModuleForm: { name: string; description: string; icon: string; sort_order: number; };
  setEditModuleForm: Dispatch<SetStateAction<{ name: string; description: string; icon: string; sort_order: number; }>>;
  cancelEditModule: () => void;
  startEditModule: (module: Module) => void;
  deleteModule: (id: number) => Promise<void>;
};

export default function ModulesPanel({
  createModule,
  moduleForm,
  setModuleForm,
  modules,
  selectedModule,
  editingModule,
  setSelectedModule,
  updateModule,
  editModuleForm,
  setEditModuleForm,
  cancelEditModule,
  startEditModule,
  deleteModule,
}: Props) {
  return (
    <>
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-gray-800">Модульдер</h2>

        <form onSubmit={createModule} className="glass rounded-xl p-4 border border-white/20">
          <input
            type="text"
            placeholder="Модуль атауы"
            value={moduleForm.name}
            onChange={(e) => setModuleForm({ ...moduleForm, name: e.target.value })}
            className="w-full mb-2 p-2 rounded border"
            required
          />
          <textarea
            placeholder="Сипаттама"
            value={moduleForm.description}
            onChange={(e) => setModuleForm({ ...moduleForm, description: e.target.value })}
            className="w-full mb-2 p-2 rounded border"
          />
          <input
            type="text"
            placeholder="Белгіше (эмодзи)"
            value={moduleForm.icon}
            onChange={(e) => setModuleForm({ ...moduleForm, icon: e.target.value })}
            className="w-full mb-2 p-2 rounded border"
          />
          <input
            type="number"
            placeholder="Сұрыптау тәртібі"
            value={moduleForm.sort_order}
            onChange={(e) => setModuleForm({ ...moduleForm, sort_order: parseInt(e.target.value) || 0 })}
            className="w-full mb-2 p-2 rounded border"
            required
          />
          <button
            type="submit"
            className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold py-2 px-4 rounded hover:from-purple-700 hover:to-blue-700"
          >
            Модуль құру
          </button>
        </form>

        <div className="space-y-2 max-h-96 overflow-y-auto">
          {modules.map((module) => (
            <div
              key={module.id}
              className={`p-3 rounded border transition-all ${selectedModule === module.id
                ? "bg-purple-100 border-purple-500"
                : "bg-white/50 border-gray-200 hover:border-purple-300"
                } ${editingModule === module.id ? "" : "cursor-pointer"}`}
              onClick={() => {
                if (editingModule !== module.id) {
                  setSelectedModule(module.id);
                }
              }}
            >
              {editingModule === module.id ? (
                <form onSubmit={updateModule} className="space-y-2">
                  <input
                    type="text"
                    value={editModuleForm.name}
                    onChange={(e) => setEditModuleForm({ ...editModuleForm, name: e.target.value })}
                    className="w-full p-2 rounded border text-sm"
                    placeholder="Атау"
                    required
                    onClick={(e) => e.stopPropagation()}
                  />
                  <textarea
                    value={editModuleForm.description}
                    onChange={(e) => setEditModuleForm({ ...editModuleForm, description: e.target.value })}
                    className="w-full p-2 rounded border text-sm"
                    placeholder="Сипаттама"
                    rows={2}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <input
                    type="text"
                    value={editModuleForm.icon}
                    onChange={(e) => setEditModuleForm({ ...editModuleForm, icon: e.target.value })}
                    className="w-full p-2 rounded border text-sm"
                    placeholder="Белгіше"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <input
                    type="number"
                    value={editModuleForm.sort_order}
                    onChange={(e) => setEditModuleForm({ ...editModuleForm, sort_order: parseInt(e.target.value) || 0 })}
                    className="w-full p-2 rounded border text-sm"
                    placeholder="Қатар"
                    required
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white text-sm py-1 px-2 rounded"
                      onClick={(e) => e.stopPropagation()}
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        cancelEditModule();
                      }}
                      className="flex-1 bg-gray-600 hover:bg-gray-700 text-white text-sm py-1 px-2 rounded"
                    >
                      ✕
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-bold">{module.icon} {module.name}</div>
                    <div className="text-sm text-gray-600">Қатар: {module.sort_order}</div>
                    {module.description && (
                      <div className="text-xs text-gray-500 mt-1">{module.description}</div>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        startEditModule(module);
                      }}
                      className="text-blue-600 hover:text-blue-800"
                      title="Өңдеу"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteModule(module.id);
                      }}
                      className="text-red-600 hover:text-red-800"
                      title="Жою"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
