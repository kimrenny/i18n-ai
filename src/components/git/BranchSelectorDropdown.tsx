import React, { useState, useEffect, useRef } from 'react'
import type { GitBranchInfo } from '../../types/git'
import { useTranslation } from '../../i18n/useTranslation'
import { filterBranches } from '../../services/git/gitService'

interface BranchSelectorDropdownProps {
  branches: GitBranchInfo[]
  currentBranch: string
  isDetachedHead: boolean
  isOpen: boolean
  isLoading?: boolean
  onClose: () => void
  onSelectBranch: (branchName: string) => void
  onOpenCreateModal: () => void
}

export const BranchSelectorDropdown: React.FC<BranchSelectorDropdownProps> = ({
  branches,
  currentBranch,
  isDetachedHead,
  isOpen,
  isLoading = false,
  onClose,
  onSelectBranch,
  onOpenCreateModal,
}) => {
  const { t } = useTranslation()
  const [searchQuery, setSearchQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      setSearchQuery('')
      setTimeout(() => {
        searchInputRef.current?.focus()
      }, 50)
    }
  }, [isOpen])

  // Handle click outside & Escape key
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const filtered = filterBranches(branches, searchQuery)

  return (
    <div
      ref={containerRef}
      className="git-branch-dropdown-menu"
      role="dialog"
      aria-label={t('git.switchBranch')}
      data-testid="git-branch-dropdown"
    >
      {/* Search Header */}
      <div className="git-branch-search-box">
        <input
          ref={searchInputRef}
          type="text"
          className="app-input git-branch-search-input"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t('git.searchBranches')}
          data-testid="branch-search-input"
        />
        {searchQuery && (
          <button
            type="button"
            className="git-branch-search-clear"
            onClick={() => setSearchQuery('')}
            aria-label="Clear search"
          >
            ✕
          </button>
        )}
      </div>

      {/* Detached HEAD Notice if detached */}
      {isDetachedHead && (
        <div className="git-branch-detached-banner" title={t('git.detachedHeadTooltip')}>
          <span className="git-branch-detached-icon">⚠️</span>
          <span className="git-branch-detached-text">
            {t('git.detachedHeadTitle')} ({currentBranch})
          </span>
        </div>
      )}

      {/* Branch List */}
      <div className="git-branch-list" role="listbox">
        {isLoading ? (
          <div className="git-branch-empty">
            <span className="git-spinner"></span>
            <span>{t('git.loadingRepository')}</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="git-branch-empty" data-testid="no-branches-found">
            {t('git.noBranchesFound')}
          </div>
        ) : (
          filtered.map((branch) => {
            const isCurrent = branch.isCurrent
            return (
              <button
                key={branch.name}
                type="button"
                role="option"
                aria-selected={isCurrent}
                className={`git-branch-item ${isCurrent ? 'is-current' : ''}`}
                onClick={() => {
                  if (!isCurrent) {
                    onSelectBranch(branch.name)
                  }
                  onClose()
                }}
                title={branch.name}
                data-testid={`branch-item-${branch.name}`}
              >
                <span className="git-branch-check">{isCurrent ? '✓' : ''}</span>
                <span className="git-branch-item-name">{branch.name}</span>
                {branch.upstream && (
                  <span className="git-branch-upstream" title={branch.upstream}>
                    {branch.upstream}
                  </span>
                )}
              </button>
            )
          })
        )}
      </div>

      {/* Footer / Create Branch Action */}
      <div className="git-branch-dropdown-footer">
        <button
          type="button"
          className="git-create-branch-action-btn"
          onClick={() => {
            onClose()
            onOpenCreateModal()
          }}
          data-testid="open-create-branch-modal-btn"
        >
          <span className="git-create-branch-icon">➕</span>
          <span>{t('git.createNewBranch')}</span>
        </button>
      </div>
    </div>
  )
}
