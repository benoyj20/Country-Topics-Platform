import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isPartialDate,
  isPartialDateRangeValid,
} from "../src/partial-dates.ts";

describe("isPartialDate", () => {
  it("accepts a year, a month, or a day", () => {
    assert.equal(isPartialDate("2019"), true);
    assert.equal(isPartialDate("2019-05"), true);
    assert.equal(isPartialDate("2019-05-14"), true);
    assert.equal(isPartialDate("2024-02-29"), true);
  });

  it("refuses impossible dates and other formats", () => {
    for (const value of [
      "2023-02-29",
      "2019-13",
      "2019-00",
      "2019-04-31",
      "2019-05-00",
      "19",
      "2019/05",
      "May 2019",
      "2019-5",
      " 2019",
      "",
    ]) {
      assert.equal(isPartialDate(value), false, value);
    }
  });
});

describe("isPartialDateRangeValid", () => {
  it("compares at the coarser precision", () => {
    assert.equal(isPartialDateRangeValid("2019", "2019-03"), true);
    assert.equal(isPartialDateRangeValid("2019-03-10", "2019"), true);
    assert.equal(isPartialDateRangeValid("2019-03", "2021"), true);
    assert.equal(isPartialDateRangeValid("2019-03-10", "2019-03-10"), true);
  });

  it("refuses an end before the start", () => {
    assert.equal(isPartialDateRangeValid("2020", "2019-12-31"), false);
    assert.equal(isPartialDateRangeValid("2019-05", "2019-04"), false);
  });
});
