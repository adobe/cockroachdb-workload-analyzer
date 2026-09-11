// Copyright 2026 Adobe. All rights reserved.
// This file is licensed to you under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may obtain a copy
// of the License at http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software distributed under
// the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
// OF ANY KIND, either express or implied. See the License for the specific language
// governing permissions and limitations under the License.

// ErrorBanner surfaces a failed fetch so a broken endpoint reads as an error
// rather than an empty view. role="alert" makes assistive tech announce it. It
// renders nothing when there is no message, so callers can pass their error
// state straight through. Pass onDismiss to show a close button.
export function ErrorBanner({
  message,
  onDismiss,
}: {
  message: string | null
  onDismiss?: () => void
}) {
  if (!message) return null

  return (
    <div className="error-banner" role="alert">
      <span className="error-banner-text">{message}</span>
      {onDismiss && (
        <button type="button" className="error-banner-close" onClick={onDismiss} aria-label="Dismiss">
          ×
        </button>
      )}
    </div>
  )
}
