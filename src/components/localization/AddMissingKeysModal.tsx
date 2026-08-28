import React, { useState } from 'react'
import type { MissingKeysAdditionPlan } from '../../types/localization'

interface AddMissingKeysModalProps {
  plan: MissingKeysAdditionPlan
  isWriting: boolean
  onConfirm: () => void
  onClose: () => void
}

export const AddMissingKeysModal: React.FC<AddMissingKeysModalProps> = ({
  plan,
  isWriting,
  onConfirm,
  onClose,
}) => {
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(
    new Set(plan.filesToModify.map((f) => f.filename))
  )

  const toggleFileExpanded = (filename: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev)
      if (next.has(filename)) {
        next.delete(filename)
      } else {
        next.add(filename)
      }
      return next
    })
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Add Missing Keys Preview">
      <div className="modal-container">
        <div className="modal-header">
          <div className="modal-title-group">
            <h2 className="modal-title">Preview: Add Missing Keys</h2>
            <p className="modal-subtitle">
              The following missing keys will be added with empty values (<code>""</code>).
              Existing values and hierarchy will be preserved.
            </p>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            disabled={isWriting}
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        <div className="modal-stats-bar">
          <div className="modal-stat">
            <span className="modal-stat-label">Files to modify:</span>
            <span className="modal-stat-value">{plan.filesToModify.length}</span>
          </div>
          <div className="modal-stat">
            <span className="modal-stat-label">Total keys to add:</span>
            <span className="modal-stat-value modal-stat-highlight">
              {plan.totalKeysToAdd}
            </span>
          </div>
        </div>

        {plan.hasConflicts && (
          <div className="modal-conflicts-box" role="alert">
            <div className="conflict-header">
              <span className="conflict-icon">⚠️</span>
              <strong>Structural Conflicts Detected:</strong>
            </div>
            <ul className="conflict-list">
              {plan.conflictMessages.map((msg, idx) => (
                <li key={idx}>{msg}</li>
              ))}
            </ul>
            <p className="conflict-note">
              To prevent data loss, conflicting keys will be skipped and will not overwrite existing values.
            </p>
          </div>
        )}

        <div className="modal-files-list">
          {plan.filesToModify.map((file) => {
            const isExpanded = expandedFiles.has(file.filename)
            return (
              <div key={file.path} className="modal-file-card" data-testid={`preview-file-${file.filename}`}>
                <button
                  type="button"
                  className="modal-file-header"
                  onClick={() => toggleFileExpanded(file.filename)}
                  aria-expanded={isExpanded}
                >
                  <div className="modal-file-info">
                    <span className="modal-file-arrow">{isExpanded ? '▼' : '▶'}</span>
                    <span className="modal-file-name">{file.filename}</span>
                    <span className="modal-file-path">{file.path}</span>
                  </div>
                  <span className="modal-file-badge">
                    +{file.keysToAdd.length} keys
                  </span>
                </button>

                {isExpanded && (
                  <div className="modal-keys-table">
                    {file.keysToAdd.map((k) => (
                      <div key={k.key} className="modal-key-row">
                        <span className="modal-key-name">{k.key}</span>
                        <span className="modal-key-arrow">→</span>
                        <span className="modal-key-val"><code>""</code></span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="modal-actions">
          <button
            type="button"
            className="modal-cancel-btn"
            onClick={onClose}
            disabled={isWriting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="modal-confirm-btn"
            onClick={onConfirm}
            disabled={isWriting || plan.totalKeysToAdd === 0}
          >
            {isWriting ? 'Writing to disk...' : 'Confirm & Write to Disk'}
          </button>
        </div>
      </div>
    </div>
  )
}
