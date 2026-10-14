import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clipSegments,
  formatTime,
  parseTime,
  parseTranscript,
  parseYouTubeUrl,
} from "./transcript.js";

test("parseTime handles seconds, m:ss, h:mm:ss and cue formats", () => {
  assert.equal(parseTime("95"), 95);
  assert.equal(parseTime("95.5"), 95.5);
  assert.equal(parseTime("1:35"), 95);
  assert.equal(parseTime("1:02:03"), 3723);
  assert.equal(parseTime("00:01:35.250"), 95.25);
  assert.equal(parseTime("00:01:35,250"), 95.25);
  assert.equal(parseTime("[1:35]"), 95);
  assert.equal(parseTime("75:00"), 4500);
  assert.ok(Number.isNaN(parseTime("abc")));
  assert.ok(Number.isNaN(parseTime("")));
});

test("parseTime rejects out-of-range or ambiguous clock fields", () => {
  for (const bad of ["1:75", "1:5", "1:60:00", "1:100:00", "0:60", "1:2:3"]) {
    assert.ok(Number.isNaN(parseTime(bad)), bad);
  }
});

test("formatTime", () => {
  assert.equal(formatTime(95.27), "1:35");
  assert.equal(formatTime(95.27, true), "1:35.3");
  assert.equal(formatTime(3723), "1:02:03");
  assert.equal(formatTime(NaN), "–");
});

test("formatTime with tenths shows the stored value, not one tenth less", () => {
  assert.equal(formatTime(2.3, true), "0:02.3");
  assert.equal(formatTime(4.6, true), "0:04.6");
  assert.equal(formatTime(59.96, true), "1:00.0");
  for (let tenth = 0; tenth < 600; tenth++) {
    const value = tenth / 10;
    const roundTrip = parseTime(formatTime(value, true));
    assert.ok(Math.abs(roundTrip - value) < 1e-9, `${value} -> ${roundTrip}`);
  }
});

test("parseYouTubeUrl covers common link shapes", () => {
  const id = "jNQXAC9IVRw";
  assert.deepEqual(parseYouTubeUrl(`https://www.youtube.com/watch?v=${id}`), {
    id,
    t: NaN,
  });
  assert.deepEqual(parseYouTubeUrl(`https://youtu.be/${id}?t=42`), {
    id,
    t: 42,
  });
  assert.deepEqual(parseYouTubeUrl(`youtube.com/watch?v=${id}&t=1m5s`), {
    id,
    t: 65,
  });
  assert.deepEqual(parseYouTubeUrl(`https://m.youtube.com/shorts/${id}`), {
    id,
    t: NaN,
  });
  assert.deepEqual(
    parseYouTubeUrl(`https://www.youtube-nocookie.com/embed/${id}?start=10`),
    { id, t: 10 },
  );
  assert.deepEqual(parseYouTubeUrl(id), { id, t: NaN });
  assert.equal(parseYouTubeUrl("https://vimeo.com/123"), null);
  assert.equal(parseYouTubeUrl("not a url"), null);
});

test("parses YouTube transcript panel copy, including accessibility labels", () => {
  const { segments, skipped } = parseTranscript(
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
  assert.deepEqual(segments, [
    { start_s: 1, end_s: 5, text: "First synthetic line" },
    { start_s: 5, end_s: 12, text: "second line and more" },
    { start_s: 12, end_s: NaN, text: "third line" },
  ]);
});

test('parses inline "m:ss text" lines', () => {
  const { segments } = parseTranscript(
    "1:35 We will cut taxes\n[1:40] next line",
  );
  assert.deepEqual(
    segments.map((s) => [s.start_s, s.end_s, s.text]),
    [
      [95, 100, "We will cut taxes"],
      [100, NaN, "next line"],
    ],
  );
});

test("parses WebVTT and SRT cues, stripping inline tags", () => {
  const vtt =
    "WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nHello <c>world</c>\n\n00:00:04.000 --> 00:00:06.500\nSecond";
  assert.deepEqual(parseTranscript(vtt).segments, [
    { start_s: 1, end_s: 4, text: "Hello world" },
    { start_s: 4, end_s: 6.5, text: "Second" },
  ]);
  const srt =
    "1\n00:00:01,000 --> 00:00:02,000\nOne\ntwo\n\n2\n00:00:02,000 --> 00:00:03,000\nThree";
  assert.deepEqual(
    parseTranscript(srt).segments.map((s) => s.text),
    ["One two", "Three"],
  );
});

test("clipSegments keeps overlapping lines and caps ends", () => {
  const { segments } = parseTranscript("0:01 a\n0:05 b\n0:12 c\n0:20 d");
  const clipped = clipSegments(segments, 6, 15);
  assert.equal(clipped.dropped, 2);
  assert.deepEqual(clipped.segments, [
    { start_s: 5, end_s: 12, text: "b" },
    { start_s: 12, end_s: 15, text: "c" },
  ]);
});
