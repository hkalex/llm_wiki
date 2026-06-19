import { describe, it, expect } from "vitest"
import {
  RRF_K,
  applyRrfScores,
  rrfContribution,
  searchMode,
  ranksFromOrder,
} from "./rrf"

describe("rrf", () => {
  it("contribution decreases with rank", () => {
    expect(rrfContribution(0)).toBeGreaterThan(rrfContribution(1))
    expect(rrfContribution(0)).toBeCloseTo(1 / (RRF_K + 0))
    expect(rrfContribution(5, 10)).toBeCloseTo(1 / 15)
  })

  it("fuses keyword + vector ranks (both signals beat one)", () => {
    const keyword = ranksFromOrder(["a", "b", "c"]) // a@0, b@1, c@2
    const vector = ranksFromOrder(["b", "a"]) // b@0, a@1
    const scores = applyRrfScores(["a", "b", "c"], keyword, vector)

    // a present in both, b present in both, c only keyword.
    expect(scores.get("a")).toBeCloseTo(1 / 60 + 1 / 61)
    expect(scores.get("b")).toBeCloseTo(1 / 61 + 1 / 60)
    expect(scores.get("c")).toBeCloseTo(1 / 62)
    // Items in both rankings outrank the keyword-only item.
    expect(scores.get("b")!).toBeGreaterThan(scores.get("c")!)
  })

  it("missing keys contribute nothing", () => {
    const scores = applyRrfScores(["x"], new Map(), new Map())
    expect(scores.get("x")).toBe(0)
  })

  it("classifies search mode like search.rs", () => {
    expect(searchMode(true, 0)).toBe("keyword")
    expect(searchMode(false, 0)).toBe("keyword")
    expect(searchMode(true, 5)).toBe("vector")
    expect(searchMode(false, 5)).toBe("hybrid")
  })

  it("ranksFromOrder keeps first occurrence", () => {
    const ranks = ranksFromOrder(["a", "b", "a"])
    expect(ranks.get("a")).toBe(0)
    expect(ranks.get("b")).toBe(1)
  })
})
