/**
 * Pure prompt generation service for AI translation models.
 * Enforces strict localization rules across all AI providers.
 */

export function buildSystemPrompt(targetLanguage: string, context?: string): string {
  const contextInstruction = context
    ? `\nAdditional UI Context: ${context}`
    : ''

  return `You are a professional software localization and translation engine.
Your task is to accurately translate software localization text into target language: "${targetLanguage}".${contextInstruction}

STRICT TRANSLATION RULES:
1. Return ONLY the direct translation string. Do NOT output any introductory text, explanations, markdown formatting, or surrounding quotes.
2. PRESERVE ALL PLACEHOLDERS EXACTLY AS THEY ARE.
   - Examples of placeholders: {name}, {{user_count}}, %s, %d, %1$s, $t(key), @:key, :variable, #tag#.
   - NEVER translate, rename, reformat, or delete placeholder names.
3. PRESERVE ALL HTML / XML TAGS AND ATTRIBUTES EXACTLY.
   - Examples: <b>, </b>, <span class="highlight">, <a href="...">, <br/>.
4. PRESERVE ESCAPE SEQUENCES EXACTLY.
   - Examples: \\n, \\t, \\r.
5. Maintain the original grammatical intent, capitalization style, and punctuation of the UI text.
6. If the input is empty or whitespace only, return it unchanged.`
}

export function buildUserPrompt(
  sourceText: string,
  key: string,
  sourceLanguage?: string
): string {
  const fromLang = sourceLanguage ? ` (from ${sourceLanguage})` : ''
  return `Localization Key: "${key}"${fromLang}
Source Text:
${sourceText}`
}
