import { describe, it, expect, beforeEach } from "vitest"
import { useLintStore, type LintItem } from "./lint-store"

function makeInput(overrides: Partial<Omit<LintItem, "id" | "resolved" | "createdAt">> = {}) {
  return {
    type: "broken-link" as LintItem["type"],
    severity: "warning" as LintItem["severity"],
    page: "test.md",
    detail: "broken link detail",
    ...overrides,
  }
}

beforeEach(() => {
  useLintStore.setState({ items: [] })
})

describe("lint-store addItem", () => {
  it("adds a single item with generated id and resolved=false", () => {
    useLintStore.getState().addItem(makeInput())
    const items = useLintStore.getState().items
    expect(items).toHaveLength(1)
    expect(items[0].id).toMatch(/^lint-\d+$/)
    expect(items[0].resolved).toBe(false)
    expect(items[0].createdAt).toBeTypeOf("number")
  })

  it("preserves all LintResult fields on addItem", () => {
    useLintStore.getState().addItem(makeInput({ type: "orphan", page: "foo.md", detail: "no inbound" }))
    const item = useLintStore.getState().items[0]
    expect(item.type).toBe("orphan")
    expect(item.page).toBe("foo.md")
    expect(item.detail).toBe("no inbound")
    expect(item.severity).toBe("warning")
  })

  it("adds multiple items with unique ids", () => {
    const store = useLintStore.getState()
    store.addItem(makeInput({ page: "a.md" }))
    store.addItem(makeInput({ page: "b.md" }))
    store.addItem(makeInput({ page: "c.md" }))
    const items = useLintStore.getState().items
    expect(items).toHaveLength(3)
    const ids = items.map((i) => i.id)
    expect(new Set(ids).size).toBe(3)
  })
})

describe("lint-store addItems", () => {
  it("adds multiple items in a single call", () => {
    useLintStore.getState().addItems([
      makeInput({ page: "a.md" }),
      makeInput({ page: "b.md" }),
    ])
    expect(useLintStore.getState().items).toHaveLength(2)
  })

  it("assigns unique ids to each item in addItems", () => {
    useLintStore.getState().addItems([
      makeInput({ page: "a.md" }),
      makeInput({ page: "b.md" }),
      makeInput({ page: "c.md" }),
    ])
    const ids = useLintStore.getState().items.map((i) => i.id)
    expect(new Set(ids).size).toBe(3)
  })
})

describe("lint-store setItems", () => {
  it("replaces all items with the provided set", () => {
    useLintStore.getState().addItem(makeInput({ page: "old.md" }))
    const newItems: LintItem[] = [
      { id: "lint-manual-1", type: "broken-link", severity: "warning", page: "x.md", detail: "d", resolved: false, createdAt: 100 },
      { id: "lint-manual-2", type: "orphan", severity: "info", page: "y.md", detail: "d", resolved: true, createdAt: 200 },
    ]
    useLintStore.getState().setItems(newItems)
    const items = useLintStore.getState().items
    expect(items).toHaveLength(2)
    expect(items[0].id).toBe("lint-manual-1")
    expect(items[1].id).toBe("lint-manual-2")
  })
})

describe("lint-store resolveItem", () => {
  it("resolveItem flips resolved=true and stores resolvedAction", () => {
    useLintStore.getState().addItem(makeInput())
    const id = useLintStore.getState().items[0].id
    useLintStore.getState().resolveItem(id, "auto-fixed: added to index.md")
    const resolved = useLintStore.getState().items.find((i) => i.id === id)
    expect(resolved?.resolved).toBe(true)
    expect(resolved?.resolvedAction).toBe("auto-fixed: added to index.md")
  })

  it("resolveItem on missing id is a no-op", () => {
    useLintStore.getState().addItem(makeInput())
    expect(() => useLintStore.getState().resolveItem("nonexistent", "x")).not.toThrow()
    expect(useLintStore.getState().items[0].resolved).toBe(false)
  })

  it("resolved item still has correct page/type fields", () => {
    useLintStore.getState().addItem(makeInput({ type: "no-outlinks", page: "isolated.md" }))
    const id = useLintStore.getState().items[0].id
    useLintStore.getState().resolveItem(id, "acknowledged")
    const item = useLintStore.getState().items[0]
    expect(item.page).toBe("isolated.md")
    expect(item.type).toBe("no-outlinks")
    expect(item.resolved).toBe(true)
  })
})

describe("lint-store dismissItem", () => {
  it("removes the item entirely", () => {
    useLintStore.getState().addItem(makeInput())
    useLintStore.getState().addItem(makeInput({ page: "keep.md" }))
    const id = useLintStore.getState().items[0].id
    useLintStore.getState().dismissItem(id)
    const items = useLintStore.getState().items
    expect(items).toHaveLength(1)
    expect(items[0].page).toBe("keep.md")
  })

  it("dismissItem on missing id is a no-op", () => {
    useLintStore.getState().addItem(makeInput())
    expect(() => useLintStore.getState().dismissItem("nonexistent")).not.toThrow()
    expect(useLintStore.getState().items).toHaveLength(1)
  })
})

describe("lint-store clearResolved", () => {
  it("keeps only unresolved items", () => {
    useLintStore.getState().addItems([
      makeInput({ page: "a.md" }),
      makeInput({ page: "b.md" }),
      makeInput({ page: "c.md" }),
    ])
    const items = useLintStore.getState().items
    useLintStore.getState().resolveItem(items[0].id, "done")
    useLintStore.getState().resolveItem(items[2].id, "done")
    useLintStore.getState().clearResolved()
    const remaining = useLintStore.getState().items
    expect(remaining).toHaveLength(1)
    expect(remaining[0].page).toBe("b.md")
  })

  it("clearResolved on all-resolved store returns empty", () => {
    useLintStore.getState().addItems([makeInput({ page: "a.md" }), makeInput({ page: "b.md" })])
    const items = useLintStore.getState().items
    useLintStore.getState().resolveItem(items[0].id, "x")
    useLintStore.getState().resolveItem(items[1].id, "y")
    useLintStore.getState().clearResolved()
    expect(useLintStore.getState().items).toHaveLength(0)
  })

  it("clearResolved when nothing is resolved is a no-op", () => {
    useLintStore.getState().addItems([makeInput({ page: "a.md" })])
    useLintStore.getState().clearResolved()
    expect(useLintStore.getState().items).toHaveLength(1)
  })
})

describe("lint-store all types are supported", () => {
  it("covers orphan type", () => {
    useLintStore.getState().addItem(makeInput({ type: "orphan", page: "orphan.md" }))
    expect(useLintStore.getState().items[0].type).toBe("orphan")
  })

  it("covers broken-link type", () => {
    useLintStore.getState().addItem(makeInput({ type: "broken-link", page: "broken.md" }))
    expect(useLintStore.getState().items[0].type).toBe("broken-link")
  })

  it("covers no-outlinks type", () => {
    useLintStore.getState().addItem(makeInput({ type: "no-outlinks", page: "isolated.md" }))
    expect(useLintStore.getState().items[0].type).toBe("no-outlinks")
  })

  it("covers semantic type", () => {
    useLintStore.getState().addItem(makeInput({ type: "semantic", page: "semantic.md" }))
    expect(useLintStore.getState().items[0].type).toBe("semantic")
  })

  it("covers both severity levels", () => {
    useLintStore.getState().addItem(makeInput({ severity: "warning" }))
    useLintStore.getState().addItem(makeInput({ severity: "info" }))
    const items = useLintStore.getState().items
    expect(items[0].severity).toBe("warning")
    expect(items[1].severity).toBe("info")
  })
})