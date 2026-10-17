import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  clipLines,
  clipProblems,
  formatTime,
  parseTime,
  parseTranscript,
  parseYouTubeUrl,
  snippetTranscript,
} from "../src/snippets.ts";

// Transcript lines are synthetic; the video id is the public sample used by
// the prototype ("Me at the zoo"), only as a well-formed id.
const ID = "jNQXAC9IVRw";

describe("parseTime", () => {
  it("reads seconds, m:ss, h:mm:ss, and cue times", () => {
    assert.equal(parseTime("95"), 95);
    assert.equal(parseTime("95.5"), 95.5);
    assert.equal(parseTime("1:35"), 95);
    assert.equal(parseTime("1:02:03"), 3723);
    assert.equal(parseTime("00:01:35.250"), 95.25);
    assert.equal(parseTime("00:01:35,250"), 95.25);
    assert.equal(parseTime("[1:35]"), 95);
    assert.equal(parseTime("75:00"), 4500);
    assert.equal(parseTime(12), 12);
    assert.equal(parseTime("abc"), null);
    assert.equal(parseTime(""), null);
    assert.equal(parseTime(null), null);
  });

  it("refuses out-of-range or ambiguous clock fields", () => {
    for (const bad of ["1:75", "1:5", "1:60:00", "1:100:00", "0:60", "1:2:3"]) {
      assert.equal(parseTime(bad), null, bad);
    }
  });
});

describe("formatTime", () => {
  it("shows minutes and seconds, hours only when needed", () => {
    assert.equal(formatTime(95.27), "1:35");
    assert.equal(formatTime(95.27, true), "1:35.3");
    assert.equal(formatTime(3723), "1:02:03");
    assert.equal(formatTime(Number.NaN), "–");
    assert.equal(formatTime(null), "–");
  });

  it("shows the stored tenth, which parses back to the same value", () => {
    assert.equal(formatTime(2.3, true), "0:02.3");
    assert.equal(formatTime(4.6, true), "0:04.6");
    assert.equal(formatTime(59.96, true), "1:00.0");
    for (let tenth = 0; tenth < 600; tenth++) {
      const value = tenth / 10;
      const roundTrip = parseTime(formatTime(value, true)) ?? Number.NaN;
      assert.ok(Math.abs(roundTrip - value) < 1e-9, `${value} -> ${roundTrip}`);
    }
  });
});

describe("parseYouTubeUrl", () => {
  it("reads common link shapes and their start time", () => {
    const cases: [string, number | null][] = [
      [`https://www.youtube.com/watch?v=${ID}`, null],
      [`https://youtu.be/${ID}?t=42`, 42],
      [`youtube.com/watch?v=${ID}&t=1m5s`, 65],
      [`https://m.youtube.com/shorts/${ID}`, null],
      [`https://www.youtube-nocookie.com/embed/${ID}?start=10`, 10],
      [`https://www.youtube.com/live/${ID}`, null],
      [ID, null],
    ];
    for (const [link, start_s] of cases) {
      assert.deepEqual(parseYouTubeUrl(link), { id: ID, start_s }, link);
    }
  });

  it("refuses other sites, other schemes, and malformed ids", () => {
    for (const bad of [
      "https://vimeo.com/123",
      "not a url",
      `javascript:alert(1)//youtube.com/watch?v=${ID}`,
      "https://www.youtube.com/watch?v=short",
      `https://youtube.com.example.org/watch?v=${ID}`,
      "",
    ]) {
      assert.equal(parseYouTubeUrl(bad), null, bad);
    }
    assert.equal(parseYouTubeUrl(42), null);
  });
});

describe("parseTranscript", () => {
  it("reads YouTube's transcript panel, skipping accessibility labels", () => {
    const { lines, skipped } = parseTranscript(
      [
        "Transcript",
        "0:01",
        "1 second",
        "First synthetic line",
        "0:05",
        "5 seconds",
        "second line",
        "and more",
        "0:12",
        "third line",
      ].join("\n"),
    );
    assert.equal(skipped, 1);
    assert.deepEqual(lines, [
      { start_s: 1, end_s: 5, text: "First synthetic line" },
      { start_s: 5, end_s: 12, text: "second line and more" },
      { start_s: 12, end_s: null, text: "third line" },
    ]);
  });

  it('reads "m:ss text" lines, with or without brackets', () => {
    const { lines } = parseTranscript(
      "1:35 A synthetic sentence\r\n[1:40] next line",
    );
    assert.deepEqual(lines, [
      { start_s: 95, end_s: 100, text: "A synthetic sentence" },
      { start_s: 100, end_s: null, text: "next line" },
    ]);
  });

  it("reads WebVTT and SRT cues, stripping inline tags", () => {
    const vtt =
      "WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nHello <c>world</c>\n\n00:00:04.000 --> 00:00:06.500\nSecond";
    assert.deepEqual(parseTranscript(vtt).lines, [
      { start_s: 1, end_s: 4, text: "Hello world" },
      { start_s: 4, end_s: 6.5, text: "Second" },
    ]);
    const srt =
      "1\n00:00:01,000 --> 00:00:02,000\nOne\ntwo\n\n2\n00:00:02,000 --> 00:00:03,000\nThree";
    assert.deepEqual(
      parseTranscript(srt).lines.map((line) => line.text),
      ["One two", "Three"],
    );
  });

  it("leaves out a line with an impossible timestamp, and its text", () => {
    const { lines } = parseTranscript("0:01 first\n1:75\nlost text\n0:09 last");
    assert.deepEqual(
      lines.map((line) => line.text),
      ["first", "last"],
    );
    assert.equal(lines[0]?.end_s, 9);
  });
});

describe("clipLines", () => {
  it("keeps the lines that overlap the clip and caps their ends", () => {
    const { lines } = parseTranscript("0:01 a\n0:05 b\n0:12 c\n0:20 d");
    assert.deepEqual(clipLines(lines, 6, 15), {
      dropped: 2,
      segments: [
        { start_s: 5, end_s: 12, text: "b" },
        { start_s: 12, end_s: 15, text: "c" },
      ],
    });
  });
});

describe("clipProblems", () => {
  it("accepts a clip inside the video", () => {
    assert.deepEqual(clipProblems({ start_s: 1, end_s: 17, duration_s: 19 }), {
      errors: [],
      warnings: [],
    });
  });

  it("refuses missing, reversed, negative, and too-late times", () => {
    const errors = (clip: Parameters<typeof clipProblems>[0]) =>
      clipProblems(clip).errors;
    assert.equal(errors({ start_s: null, end_s: 5 }).length, 1);
    assert.equal(errors({ start_s: 1, end_s: Number.NaN }).length, 1);
    assert.match(errors({ start_s: 5, end_s: 5 }).join(), /after start/);
    assert.match(errors({ start_s: -1, end_s: 5 }).join(), /0 or later/);
    assert.match(
      errors({ start_s: 1, end_s: 20, duration_s: 19 }).join(),
      /past the end of the video \(0:19\)/,
    );
    // Players report lengths to a fraction of a second.
    assert.deepEqual(errors({ start_s: 1, end_s: 19.4, duration_s: 19 }), []);
    assert.match(errors({ start_s: 0, end_s: 90_000 }).join(), /24 hours/);
  });

  it("warns about clips over ten minutes", () => {
    assert.equal(clipProblems({ start_s: 0, end_s: 601 }).warnings.length, 1);
  });
});

describe("snippetTranscript", () => {
  const clip = { start_s: 10, end_s: 20 };

  it("keeps the lines that overlap the snippet, in video time", () => {
    const result = snippetTranscript({
      ...clip,
      timebase: "video",
      text: "Transcript\n0:05 before\n0:12 inside\n0:18 also inside\n0:25 after",
    });
    assert.deepEqual(result, {
      segments: [
        // It began before the clip; the player starts it at the clip's start.
        { start_s: 5, end_s: 12, text: "before" },
        { start_s: 12, end_s: 18, text: "inside" },
        { start_s: 18, end_s: 20, text: "also inside" },
      ],
      parsed: 4,
      dropped: 1,
      skipped: 1,
      problem: null,
    });
  });

  it("moves timestamps that count from the clip's start into video time", () => {
    const { segments } = snippetTranscript({
      start_s: 10.5,
      end_s: 20,
      timebase: "clip",
      text: "0:00 first\n0:04.2 second",
    });
    assert.deepEqual(segments, [
      { start_s: 10.5, end_s: 14.7, text: "first" },
      { start_s: 14.7, end_s: 20, text: "second" },
    ]);
  });

  it("treats empty text as no transcript, which is allowed", () => {
    const result = snippetTranscript({ ...clip, timebase: "video", text: " " });
    assert.deepEqual(result.segments, []);
    assert.equal(result.problem, null);
  });

  it("explains text without timestamps and lines outside the clip", () => {
    assert.match(
      snippetTranscript({ ...clip, timebase: "video", text: "no times here" })
        .problem ?? "",
      /No timestamps found/,
    );
    assert.match(
      snippetTranscript({ ...clip, timebase: "video", text: "0:30 later" })
        .problem ?? "",
      /count from the clip's start/,
    );
    assert.match(
      snippetTranscript({ ...clip, timebase: "clip", text: "0:30 later" })
        .problem ?? "",
      /count from the start of the video/,
    );
  });

  it("refuses an overlong line", () => {
    const text = `0:11 ${"a".repeat(2_001)}`;
    assert.match(
      snippetTranscript({ ...clip, timebase: "video", text }).problem ?? "",
      /under 2000 characters/,
    );
  });
});
