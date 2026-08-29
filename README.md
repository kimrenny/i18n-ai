# Localization AI

**Localization AI** is a fast, safe, and intuitive desktop application for managing, comparing, and translating JSON localization files. It automatically identifies missing and empty translation keys across multiple languages, provides direct problem navigation, and allows you to complete translations using **Generative AI** or **Free Machine Translation** services—with full placeholder safety and manual review controls.

---

## Quick Start

1. **Launch the Application**: Open Localization AI.
2. **Select Folder**: Click **"Select Folder"** and choose the directory containing your project's JSON localization files (e.g. `en.json`, `de.json`, `es.json`, `ru.json`).
3. **Compare Files**: Select the files you want to inspect and click **"Compare Selected Files"**.
4. **Identify Gaps**: Review the summary dashboard to immediately see missing keys and empty translation strings.
5. **Translate**:
   - Edit keys **manually** in-place,
   - Click **"✨ Translate with AI"** on any key, or
   - Click **"✨ Translate All"** to automatically translate all untranslated keys in optimized batches.
6. **Review & Save**: Review generated translations in the review modal and apply them safely to disk.

---

## What Problem Does It Solve?

Software localization often involves maintaining separate JSON files for each supported language:

```text
src/assets/i18n/
├── en.json      # Complete English source
├── de.json      # German (missing some new features)
├── fr.json      # French (contains empty "" strings)
└── ja.json      # Japanese (missing newly added keys)
```

As applications evolve, new keys are frequently added, renamed, or left blank across different language files. Keeping dozens of localization files synchronized manually is tedious and error-prone:
- Keys can be physically missing from one file (`[ MISSING ]`).
- Keys might exist in a file but hold an empty string value `""` (`[ EMPTY ]`).
- Placeholders like `{user_name}`, `{{count}}`, `%s`, or HTML tags `<b>...</b>` can easily get corrupted or translated incorrectly when edited manually or run through basic web translators.
- Paid AI APIs can become expensive or hit rate limits if you translate hundreds of keys one-by-one.

**Localization AI** solves these problems by comparing all files against each other using a union-of-keys model, providing instant navigation to every problem, batching translations efficiently, and strictly protecting all placeholders and markup.

---

## How It Works

Localization AI follows a safe, non-destructive workflow:

```text
┌──────────────────────────────────────────────────────────────┐
│ 1. Load & Discover JSON files from selected project folder   │
└──────────────────────────────┬───────────────────────────────┘
                               ▼
┌──────────────────────────────────────────────────────────────┐
│ 2. Compare Keys: Union-of-keys model across all files        │
└──────────────────────────────┬───────────────────────────────┘
                               ▼
┌──────────────────────────────────────────────────────────────┐
│ 3. Summary Dashboard & Problem Navigation                    │
│    • Interactive counters: Missing Keys & Empty Keys         │
│    • VS Code-style hierarchical key tree                     │
└──────────────────────────────┬───────────────────────────────┘
                               ▼
┌──────────────────────────────────────────────────────────────┐
│ 4. Choose Translation Method:                                │
│    [ Manual Inline Edit ]  [ Single-Key ]  [ Translate All ] │
└──────────────────────────────┬───────────────────────────────┘
                               ▼
┌──────────────────────────────────────────────────────────────┐
│ 5. Translation Engine Processing:                            │
│    • AI Engine (OpenAI, Gemini, Claude, Mistral, Ollama)     │
│    • Free Engine (LibreTranslate, MyMemory)                  │
│    • Strict response validation (Placeholders & HTML tags)   │
└──────────────────────────────┬───────────────────────────────┘
                               ▼
┌──────────────────────────────────────────────────────────────┐
│ 6. Review Modal (when Confirmation is enabled)               │
│    • Inspect, edit, and approve proposals                    │
└──────────────────────────────┬───────────────────────────────┘
                               ▼
┌──────────────────────────────────────────────────────────────┐
│ 7. Atomic Disk Write & Automatic Comparison Refresh          │
└──────────────────────────────────────────────────────────────┘
```

---

## Understanding the Localization Summary

When you compare localization files, the top dashboard presents five key metrics:

| Metric | What It Means | Interactivity |
| :--- | :--- | :--- |
| **Files compared** | The total number of JSON files currently analyzed. | Read-only |
| **Unique keys** | The total number of unique key paths discovered across all selected files combined. | Read-only |
| **Complete keys** | Keys that exist and contain a valid, non-empty translation in *every* compared file. | Read-only |
| **Missing keys** | Keys that exist in at least one file but are physically absent from one or more target files. | **Interactive**: Click to filter and jump directly to missing keys. |
| **Empty keys** | Keys that are present in the JSON file but have an empty string value `""`. | **Interactive**: Click to jump directly to untranslated empty keys. |

### Missing Keys vs. Empty Keys
- **Missing Key (`[ MISSING ]`)**: The key does not exist in the file's JSON tree. You can click **"Add Missing Keys"** to safely create the structure and insert the key as an empty string `""` without modifying existing keys.
- **Empty Key (`[ EMPTY ]`)**: The key exists in the file structure, but its value is empty `""`. It is ready to be translated manually or via an automated engine.

---

## Working with Translations

### 1. Manual Inline Editing
- Locate any key in the hierarchical tree.
- Click the **"Edit"** button (or click on an empty value).
- Enter your translation text directly in the input field.
- Click **"Save"** (or press `Enter`). The translation is immediately written to disk using atomic filesystem writes, and the comparison statistics refresh automatically.

### 2. Single-Key Translation ("Translate with AI / Free")
- Select any missing or empty localization key.
- The application automatically identifies the best source reference (preferring English `en.json` or any other available file with a non-empty translation).
- Click **"✨ Translate with AI"** (or **"✨ Translate with Free"**).
- When confirmation is enabled, a review modal appears showing the source language, source text, target language, selected engine, and proposed translation.
- You can review or edit the translation before clicking **"Apply Translation"**.

### 3. Batch Translation ("Translate All")
When a localization file has dozens or hundreds of missing or empty keys, translating them one-by-one is slow and prone to API rate limits. Clicking **"✨ Translate All"** runs the optimized batch translation workflow:

- **Smart Batch Planner**: Untranslated keys are grouped by language pair and file into optimized chunks (e.g. 50 items per request).
- **Significant Request Reduction**: 500 keys are processed in ~10 batch requests instead of 500 individual requests, dramatically increasing speed and reducing rate-limit pressure.
- **Dual Progress Display**: Live progress indicators show both individual key progress (`Translated: 45 / 120`) and batch progress (`Batches: 2 / 3`), along with the number of keys in the active batch.
- **Automatic Batch Splitting**: If a model returns a token limit or request size error, the batch planner automatically halves the chunk into smaller sub-batches and retries seamlessly.
- **Automatic Rate-Limit Backoff**: If an API returns HTTP 429, the application automatically pauses, displays a countdown banner (e.g. `Rate limit reached — retrying in 3.5s`), and safely retries.
- **Unified Review Modal**: Once batch translation completes, a single modal presents all proposals. You can filter by status (`All`, `Translated`, `Errors`), edit individual items, retry failed items with **"↻ Retry Failed"**, or click **"Apply All"** to write all approved translations to disk at once.

---

## Translation Engines & Providers

Localization AI supports two distinct translation engines configured in **Settings**:

```text
Settings → Translation Engine
┌────────────────────────────┐
│ ○ AI Translation           │
│ ○ Free Translator          │
└────────────────────────────┘
```

### Engine 1: AI Translation (Generative AI)
Uses modern large language models for high-quality, context-aware translations:

| Provider | Description | API Key Required? | Local / Offline Option? |
| :--- | :--- | :---: | :---: |
| **OpenAI** | GPT-4o, GPT-4o-mini, o3-mini models. | **Yes** | No (Cloud API) |
| **Google Gemini** | Gemini 3.6 Flash, Gemini 3.6 Pro, Gemini 2.5 Flash. | **Yes** | No (Cloud API) |
| **Anthropic Claude** | Claude 3.5 Sonnet, Claude 3.5 Haiku. | **Yes** | No (Cloud API) |
| **Mistral AI** | Mistral Large, Mistral Small, Codestral. | **Yes** | No (Cloud API) |
| **xAI Grok** | Grok 2, Grok 2 Vision. | **Yes** | No (Cloud API) |
| **DeepSeek** | DeepSeek-V3, DeepSeek-R1. | **Yes** | No (Cloud API) |
| **Ollama (Local)** | Self-hosted models running on your machine (e.g. `llama3.1`, `mistral`, `qwen2.5`). Default base URL: `http://localhost:11434`. | **No** | **Yes (100% Offline)** |
| **Mock / Offline** | Built-in deterministic mock provider for testing and offline development without API keys. | **No** | **Yes (100% Offline)** |

---

### Engine 2: Free Translation (Zero API Cost)
For projects where you do not wish to use paid AI subscriptions, Localization AI includes dedicated free machine translation backends:

#### 1. LibreTranslate
- **Open-Source & Self-Hostable**: Connect to your own local Docker container or any LibreTranslate-compatible public server.
- **No API Key Required**: Fully functional without credentials on local instances.
- **Native Batching**: Translates arrays of strings in a single network call.
- **Configurable Server URL**: Set custom URLs (e.g. `http://localhost:5000` or an internal company server).
- *Running a local LibreTranslate instance with Docker*:
  ```bash
  docker run -ti -p 5000:5000 libretranslate/libretranslate
  ```

#### 2. MyMemory
- **Public Collaborative Translation Memory**: Translates text using the MyMemory public service.
- **Daily Quota**: 5,000 characters/day by default (providing an optional email address in Settings increases the daily limit to 10,000 characters/day).
- **Controlled Queue**: Automatically paces requests to stay within public API usage limits.

> [!NOTE]
> Public translation endpoints may experience rate limits or temporary downtime. For guaranteed privacy and unlimited free translation, running a local LibreTranslate or Ollama instance is recommended.

---

## Settings Reference

Access the **Settings** modal via the gear icon in the top header:

- **Translation Engine**: Switch between `AI Translation` and `Free Translator`. Switching engines never deletes your saved API keys or custom endpoints.
- **AI Provider & Model**: Select your preferred AI provider and model identifier (or choose from popular presets).
- **API Key**: Enter the API key for your chosen provider. Keys are securely stored locally on your machine and are never transmitted elsewhere.
- **Server URL**: Configure the endpoint URL for local Ollama (`http://localhost:11434`) or LibreTranslate (`http://localhost:5000`).
- **Confirmation Policy ("Ask for confirmation before applying generated translations")**:
  - **Enabled (Default - Recommended)**: Generated translations open in a review modal where you can inspect, edit, or reject them before they touch your disk files.
  - **Disabled**: Generated translations are automatically validated for placeholder safety and written directly to your localization files upon completion.

---

## Translation Safety & Markup Protection

Localization strings frequently contain dynamic variables, interpolation tokens, and formatting tags. A broken placeholder can crash your production app.

Localization AI runs **strict safety validation** on every single translation returned by any AI or free engine before it can be applied:

### Protected Syntax Patterns
- **Standard Placeholders**: `{name}`, `{user_name}`, `{0}`, `{1}`
- **Double-Brace Variables**: `{{count}}`, `{{value}}`
- **Printf Format Specifiers**: `%s`, `%d`, `%1$s`, `%.2f`
- **i18next References**: `$t(common.cancel)`
- **Vue i18n Linked Messages**: `@:errors.notFound`
- **Named Variable Syntax**: `:variable`, `#tag#`
- **HTML/XML Formatting Tags**: `<b>`, `</b>`, `<span class="...">`, `</span>`, `<a href="...">`, `<br/>`, etc.
- **Escape Sequences**: `\n`, `\t`

### Example
| Source English String | Valid Translation | Rejected Translation (Validation Error) |
| :--- | :--- | :--- |
| `"Hello, {name}! You have {{count}} unread messages."` | `"Hallo, {name}! Sie haben {{count}} ungelesene Nachrichten."` | `"Hallo, Name! Sie haben 0 ungelesene Nachrichten."` *(Placeholders corrupted/missing)* |
| `"Click <b>here</b> to reset your password."` | `"Cliquez <b>ici</b> pour réinitialiser votre mot de passe."` | `"Cliquez ici pour réinitialiser votre mot de passe."` *(HTML tag stripped)* |

If any placeholder or HTML tag is modified, missing, or corrupted in the translation, the application **rejects the item**, marks it as an error, and prevents corrupted data from being written to your files.

---

## Rate Limits, Retries & Error Handling

When communicating with external AI or free translation APIs, unexpected errors can occur. Localization AI handles these gracefully:

- **HTTP 429 (Rate Limits / Too Many Requests)**: Automatically captures `Retry-After` headers and executes bounded exponential backoff with jitter (retrying after ~1s, ~2s, ~4s, ~8s). The UI shows a live countdown banner.
- **HTTP 500 / 502 / 503 / 504 & Network Timeouts**: Automatically retries transient server errors up to the configured retry limit.
- **HTTP 401 / 403 (Invalid API Key)**: Stops retries immediately and displays a clear message instructing you to check your API key in Settings.
- **Connection Refused (Local Ollama / LibreTranslate)**: Provides actionable guidance (e.g. `Unable to connect to LibreTranslate at http://localhost:5000. Ensure your local server is running.`).
- **Partial Batch Failures**: If 2 out of 50 keys fail in a batch, the 48 successful translations are preserved. You can click **"↻ Retry Failed"** to retry only the 2 failed entries without re-translating the rest.

---

## File Safety & Atomic Writes

- **Safe Atomic Writes**: When applying translations, the application writes to a temporary file (`.tmp`) first and replaces the original file only after the write succeeds. If writing fails, your original file remains completely untouched.
- **No Unintended Changes**: Localization files remain 100% read-only until you explicitly click **"Save"**, **"Apply Translation"**, or **"Apply All"**.
- **Formatted JSON**: Output JSON files are formatted with clean indentation (2 spaces) and standard UTF-8 encoding.

---

## Privacy & Security

- **Local File Processing**: Localization files are parsed and compared entirely on your local machine.
- **Zero Startup Network Calls**: Launching the application or opening settings makes zero network requests. Network calls occur **only** when you explicitly initiate a translation.
- **Secure Electron Architecture**: All file operations and network requests run strictly in Electron's main process with `contextIsolation: true`, `nodeIntegration: false`, and sandboxing enabled. API keys are never exposed in DOM or browser environments.
- **Private Offline Mode**: By selecting **Ollama** or **LibreTranslate (localhost)**, all translation processing remains 100% on your local machine without sending data to third-party cloud servers.

---

## Troubleshooting

### "My translation request returned HTTP 429"
- **Cause**: You have hit the rate limit or free tier quota of your chosen provider (e.g. Gemini free tier allows 20 requests/minute).
- **Solution**: Localization AI will automatically retry after the backoff countdown. Alternatively, use batch **"Translate All"** (which drastically reduces request count) or switch to a local provider (Ollama/LibreTranslate).

### "Gemini model is no longer available"
- **Cause**: Google occasionally retires older model identifiers (e.g. `gemini-2.0-flash`).
- **Solution**: Open **Settings** and set the model to `gemini-3.6-flash` (or `gemini-3.6-pro`). Localization AI automatically upgrades deprecated model names upon loading.

### "LibreTranslate connection refused"
- **Cause**: The application is configured to connect to `http://localhost:5000`, but no local LibreTranslate server is running.
- **Solution**: Start your local LibreTranslate container (`docker run -p 5000:5000 libretranslate/libretranslate`) or update the Server URL in Settings to a reachable endpoint.

### "My translation was not applied to the file"
- **Cause**: The confirmation policy is enabled (`requireEditConfirmation = true`), which requires approving the translation in the review modal before saving.
- **Solution**: In the review modal, click **"Apply Translation"** (for single keys) or **"Apply All"** (for batch translations).

### "Some batch translations failed"
- **Cause**: A temporary network glitch or strict placeholder validation failure occurred on specific keys.
- **Solution**: Filter by `Errors` in the batch modal to inspect the error messages, then click **"↻ Retry Failed"**.

---

## Frequently Asked Questions (FAQ)

#### Can I use Localization AI completely free without an AI API key?
Yes! Select **Free Translator** in Settings to use **LibreTranslate** (self-hosted or public) or **MyMemory**. You can also use **Ollama** to run local AI models completely free offline.

#### Does "Translate All" send a separate API request for every key?
No. Localization AI groups keys into optimized batch chunks (up to 50 keys / 4,000 characters per request), reducing hundreds of network requests to just a few batch calls.

#### Can I review translations before they are written to my files?
Yes. By default, the confirmation policy is enabled. You can inspect, edit, or discard any proposed translation before it is written to disk.

#### Can I automatically apply translations without reviewing them?
Yes. In **Settings**, uncheck *"Ask for confirmation before applying generated translations"*. Batch and single-key translations will be validated and applied directly to files.

#### Are placeholders and HTML tags protected?
Yes. The application strictly validates that `{name}`, `{{count}}`, `%s`, `%d`, `<b>`, `<a>`, and custom placeholders are present and intact in every translation. Corrupted translations are rejected automatically.

#### Are my settings preserved when switching translation engines?
Yes. Switching between AI Translation and Free Translation retains all your configured API keys, model choices, and custom URLs in local settings.

---

## Developer / Technical Reference

For developers contributing to or building Localization AI from source:

### Tech Stack
- **Desktop Framework**: Electron (Sandbox: true, Context Isolation: true)
- **Frontend**: React 19, TypeScript 5, Vite 6
- **Testing**: Vitest, React Testing Library, jsdom
- **Linting & Quality**: ESLint, TypeScript Strict Typechecking

### Project Structure
```text
├── electron/
│   ├── main/
│   │   ├── index.ts                  # Main Electron entry, IPC handlers, window lifecycle
│   │   ├── aiService.ts              # AI translation provider integrations & prompts
│   │   └── freeTranslationService.ts # LibreTranslate & MyMemory services
│   └── preload/
│       └── index.ts                  # Secure typed context bridge (window.electronAPI)
├── src/
│   ├── components/
│   │   ├── localization/             # Tree view, Diff viewer, Batch modal, Confirm modal
│   │   └── settings/                 # Multi-engine settings modal
│   ├── services/
│   │   ├── aiBatchPlanner.ts         # Dynamic chunking & auto-splitting logic
│   │   ├── aiBatchTranslation.ts     # Batch execution, retries & backoff
│   │   ├── aiResponseValidator.ts    # Placeholder, HTML tag & token validation
│   │   ├── localizationComparator.ts # Union-of-keys multi-file comparison engine
│   │   ├── localizationParser.ts     # JSON parsing and flattened key mapping
│   │   ├── localizationWriter.ts     # Safe atomic JSON file writer
│   │   ├── languageNormalizer.ts     # Dialect and locale tag normalizer
│   │   ├── aiProviderRegistry.ts     # AI provider definitions & presets
│   │   └── freeProviderRegistry.ts   # Free provider definitions
│   ├── types/
│   │   ├── localization.ts           # Localization domain models
│   │   ├── settings.ts               # Settings schema & migration functions
│   │   └── electron.d.ts             # IPC bridge interfaces
│   ├── App.tsx                       # Root React application
│   └── main.tsx                      # Renderer entry point
└── package.json
```

### Build & Test Scripts

```bash
# Run unit and integration tests
npm run test

# Run TypeScript type check
npm run typecheck

# Run ESLint
npm run lint

# Build production bundles
npm run build

# Start local development server with Electron
npm run dev
```

### Continuous Integration (CI)
GitHub Actions workflow (`.github/workflows/ci.yml`) runs on all PRs and pushes to `main`, validating tests, TypeScript type checking, ESLint, and production builds.
