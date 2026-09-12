// Copyright 2026 Adobe. All rights reserved.
// This file is licensed to you under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may obtain a copy
// of the License at http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software distributed under
// the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
// OF ANY KIND, either express or implied. See the License for the specific language
// governing permissions and limitations under the License.

import { ErrorBanner } from '../ErrorBanner'

interface Props {
  ddl: string | null
  error: string | null
  onDismissError: () => void
}

// The schema fetch and the database picker live in App (see useSchema), so
// the picker sits in the tab bar where the other tabs' picker is. This
// component only renders the selected database's DDL.
export function SchemaTab({ ddl, error, onDismissError }: Props) {
  return (
    <div className="schema-tab">
      <ErrorBanner message={error} onDismiss={onDismissError} />
      <pre className="schema-content">{ddl ?? 'Loading...'}</pre>
    </div>
  )
}
