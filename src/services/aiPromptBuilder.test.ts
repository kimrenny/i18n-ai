import { describe, it, expect } from 'vitest'
import { buildSystemPrompt, buildUserPrompt } from './aiPromptBuilder'

describe('aiPromptBuilder', () => {
  it('includes strict placeholder and formatting rules in the system prompt', () => {
    const prompt = buildSystemPrompt('Spanish', 'Settings / Authentication modal')

    expect(prompt).toContain('Spanish')
    expect(prompt).toContain('Settings / Authentication modal')
    expect(prompt).toContain('PRESERVE ALL PLACEHOLDERS EXACTLY AS THEY ARE')
    expect(prompt).toContain('{name}')
    expect(prompt).toContain('{{user_count}}')
    expect(prompt).toContain('%s')
    expect(prompt).toContain('PRESERVE ALL HTML / XML TAGS')
    expect(prompt).toContain('Return ONLY the direct translation string')
  })

  it('builds a clean user prompt with key, source language, and source text', () => {
    const userPrompt = buildUserPrompt('Welcome back, {user}!', 'AUTH.WELCOME', 'en')

    expect(userPrompt).toContain('Localization Key: "AUTH.WELCOME" (from en)')
    expect(userPrompt).toContain('Source Text:\nWelcome back, {user}!')
  })
})
