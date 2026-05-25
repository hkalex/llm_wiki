import { create } from "zustand"
import type { LintResult } from "@/lib/lint"

export interface LintItem extends LintResult {
  id: string
  resolved: boolean
  resolvedAction?: string
  createdAt: number
}

interface LintState {
  items: LintItem[]
  addItem: (item: Omit<LintItem, "id" | "resolved" | "createdAt">) => void
  addItems: (items: Omit<LintItem, "id" | "resolved" | "createdAt">[]) => void
  setItems: (items: LintItem[]) => void
  resolveItem: (id: string, action: string) => void
  dismissItem: (id: string) => void
  clearResolved: () => void
}

let counter = 0

export const useLintStore = create<LintState>((set) => ({
  items: [],

  addItem: (item) =>
    set((state) => ({
      items: [
        ...state.items,
        {
          ...item,
          id: `lint-${++counter}`,
          resolved: false,
          createdAt: Date.now(),
        },
      ],
    })),

  addItems: (items) =>
    set((state) => {
      const result = [...state.items]
      for (const incoming of items) {
        result.push({
          ...incoming,
          id: `lint-${++counter}`,
          resolved: false,
          createdAt: Date.now(),
        })
      }
      return { items: result }
    }),

  setItems: (items) => set({ items }),

  resolveItem: (id, action) =>
    set((state) => ({
      items: state.items.map((item) =>
        item.id === id ? { ...item, resolved: true, resolvedAction: action } : item
      ),
    })),

  dismissItem: (id) =>
    set((state) => ({
      items: state.items.filter((item) => item.id !== id),
    })),

  clearResolved: () =>
    set((state) => ({
      items: state.items.filter((item) => !item.resolved),
    })),
}))