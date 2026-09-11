// Copyright 2026 Adobe. All rights reserved.
// This file is licensed to you under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may obtain a copy
// of the License at http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software distributed under
// the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
// OF ANY KIND, either express or implied. See the License for the specific language
// governing permissions and limitations under the License.

import { describe, expect, it } from 'vitest'
import { formatCell, formatDurationSec, formatBytes, formatTimeRange } from './format'

describe('formatDurationSec', () => {
  it('renders sub-millisecond as µs', () => {
    expect(formatDurationSec(0.0001)).toBe('100 µs')
  })
  it('renders sub-second as ms', () => {
    expect(formatDurationSec(0.5)).toBe('500 ms')
    expect(formatDurationSec(0.0208)).toBe('20.8 ms')
  })
  it('renders >= 1s as s', () => {
    expect(formatDurationSec(2.5)).toBe('2.5 s')
    expect(formatDurationSec(133.9)).toBe('133.9 s')
  })
  it('renders zero plainly', () => {
    expect(formatDurationSec(0)).toBe('0')
  })
})

describe('formatBytes', () => {
  it('renders bytes under 1 KiB', () => {
    expect(formatBytes(512)).toBe('512 B')
  })
  it('scales to KiB/MiB/GiB', () => {
    expect(formatBytes(2048)).toBe('2 KiB')
    expect(formatBytes(20 * 1024 * 1024)).toBe('20 MiB')
    expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe('3 GiB')
  })
})

describe('formatCell', () => {
  it('formats _sec columns as durations', () => {
    expect(formatCell('weighted_mean_run_lat_sec', 0.5)).toBe('500 ms')
    expect(formatCell('total_run_sec', 2.5)).toBe('2.5 s')
  })
  it('formats _mib columns', () => {
    expect(formatCell('max_mem_mib', 20)).toBe('20 MiB')
  })
  it('formats _pct columns', () => {
    expect(formatCell('failure_rate_pct', 12.3)).toBe('12.3%')
  })
  it('formats byte columns', () => {
    expect(formatCell('bytes_read', 2048)).toBe('2 KiB')
    expect(formatCell('avg_bytes', 512)).toBe('512 B')
  })
  it('passes through plain numbers and strings', () => {
    expect(formatCell('total_executions', 12345)).toBe('12345')
    expect(formatCell('query_text', 'SELECT 1')).toBe('SELECT 1')
    expect(formatCell('database', 'appdb')).toBe('appdb')
  })
  it('returns empty string for null/undefined', () => {
    expect(formatCell('x_sec', null)).toBe('')
    expect(formatCell('x_sec', undefined)).toBe('')
  })
  it('formats a numeric string in a unit column', () => {
    expect(formatCell('mean_run_lat_sec', '0.5')).toBe('500 ms')
  })
  it('does not coerce a non-numeric string in a unit column', () => {
    expect(formatCell('mean_run_lat_sec', 'n/a')).toBe('n/a')
  })
})

describe('formatTimeRange', () => {
  it('renders a multi-day window in UTC with its length', () => {
    expect(formatTimeRange('2026-05-28T19:00:00Z', '2026-05-29T18:48:00Z')).toBe(
      '2026-05-28 19:00 – 2026-05-29 18:48 UTC (23h 48m)',
    )
  })
  it('collapses the date when both ends fall on the same UTC day', () => {
    expect(formatTimeRange('2026-05-28T19:00:00Z', '2026-05-28T21:00:00Z')).toBe(
      '2026-05-28 19:00 – 21:00 UTC (2h)',
    )
  })
  it('normalizes zoned timestamps to UTC', () => {
    expect(formatTimeRange('2026-05-28T21:00:00+02:00', '2026-05-29T00:00:00+02:00')).toBe(
      '2026-05-28 19:00 – 22:00 UTC (3h)',
    )
  })
  it('reports windows of several days in days and hours', () => {
    expect(formatTimeRange('2026-05-01T00:00:00Z', '2026-05-04T06:00:00Z')).toBe(
      '2026-05-01 00:00 – 2026-05-04 06:00 UTC (3d 6h)',
    )
  })
  it('reports a window shorter than a minute as such', () => {
    expect(formatTimeRange('2026-05-01T00:00:00Z', '2026-05-01T00:00:30Z')).toBe(
      '2026-05-01 00:00 – 00:00 UTC (<1m)',
    )
  })
  it('falls back to the raw strings when a timestamp does not parse', () => {
    expect(formatTimeRange('yesterday', 'now')).toBe('yesterday – now')
  })
})
