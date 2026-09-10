// Copyright 2026 Adobe. All rights reserved.
// This file is licensed to you under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may obtain a copy
// of the License at http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software distributed under
// the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
// OF ANY KIND, either express or implied. See the License for the specific language
// governing permissions and limitations under the License.

// Serialize a result grid (columns + row arrays) to downloadable text.

function csvField(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  // RFC 4180: quote fields containing a comma, quote, CR, or LF; double quotes.
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCSV(columns: string[], rows: unknown[][]): string {
  const header = columns.map(csvField).join(',')
  if (rows.length === 0) return header
  const body = rows.map(row => row.map(csvField).join(',')).join('\n')
  return `${header}\n${body}`
}

export function toJSON(columns: string[], rows: unknown[][]): string {
  const objects = rows.map(row => {
    const o: Record<string, unknown> = {}
    columns.forEach((c, i) => {
      o[c] = row[i] === undefined ? null : row[i]
    })
    return o
  })
  return JSON.stringify(objects, null, 2)
}

// downloadText triggers a browser download of the given text.
export function downloadText(filename: string, text: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
