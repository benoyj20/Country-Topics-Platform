import { describe, expect, it } from "vitest";

import {
  formatDate,
  formatFileSize,
  formatPartialDate,
  formatPeriod,
} from "@/public/format";

describe("formatDate", () => {
  it("shows the day in UTC, whatever the server's time zone", () => {
    expect(formatDate("2026-10-17T23:30:00.000Z")).toBe("17 October 2026");
    expect(formatDate("2026-01-01T00:00:00.000Z")).toBe("1 January 2026");
  });

  it("leaves a value that is not a date as it is", () => {
    expect(formatDate("not a date")).toBe("not a date");
  });
});

describe("formatPartialDate", () => {
  it("is only as precise as the stored date", () => {
    expect(formatPartialDate("2024")).toBe("2024");
    expect(formatPartialDate("2024-05")).toBe("May 2024");
    expect(formatPartialDate("2024-05-03")).toBe("3 May 2024");
  });

  it("leaves anything else as it is", () => {
    expect(formatPartialDate("Spring 2024")).toBe("Spring 2024");
  });
});

describe("formatFileSize", () => {
  it("uses KB below a megabyte and MB above", () => {
    expect(formatFileSize(10)).toBe("1 KB");
    expect(formatFileSize(840 * 1024)).toBe("840 KB");
    expect(formatFileSize(2.4 * 1024 * 1024)).toBe("2.4 MB");
  });
});

describe("formatPeriod", () => {
  it("says what is known of a period, and nothing without dates", () => {
    expect(formatPeriod("2019", "2022-03")).toBe("2019 to March 2022");
    expect(formatPeriod("2019-05", null)).toBe("from May 2019");
    expect(formatPeriod(null, "2022")).toBe("until 2022");
    expect(formatPeriod(null, null)).toBe("");
  });
});
