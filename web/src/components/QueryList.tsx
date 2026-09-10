// Copyright 2026 Adobe. All rights reserved.
// This file is licensed to you under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may obtain a copy
// of the License at http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software distributed under
// the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
// OF ANY KIND, either express or implied. See the License for the specific language
// governing permissions and limitations under the License.

import type { QueryDef } from '../api'

interface Props {
  queries: QueryDef[]
  activeId: string | null
  onSelect: (id: string) => void
}

export function QueryList({ queries, activeId, onSelect }: Props) {
  const categories = [...new Set(queries.map(q => q.category))]

  return (
    <nav className="query-list">
      {categories.map(cat => (
        <div key={cat} className="query-category">
          <div className="query-category-label">{cat}</div>
          {queries.filter(q => q.category === cat).map(q => (
            <button
              key={q.id}
              className={`query-item${activeId === q.id ? ' active' : ''}`}
              onClick={() => onSelect(q.id)}
            >
              {q.name}
            </button>
          ))}
        </div>
      ))}
    </nav>
  )
}
