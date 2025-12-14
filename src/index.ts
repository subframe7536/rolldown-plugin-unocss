import { loadConfig } from '@unocss/config'
import {
  createGenerator,
  UnocssPluginContext,
  type UserConfig,
  type HighlightAnnotation,
} from '@unocss/core'
import MagicString from 'magic-string'
import type { Plugin, HookFilter } from 'rolldown'

export interface UnoCSSPluginOptions {
  /**
   * Enable CSS minification to reduce output file size
   * @default false
   */
  minify?: boolean
  /**
   * Base directory for resolving the UnoCSS config file (e.g., uno.config.ts)
   * @default process.cwd()
   */
  root?: string
  /**
   * Filter configuration to specify which files should be transformed.
   * Only files matching this filter will be processed by the plugin.
   * @default { id: /\.[jt]sx$/ }
   */
  filter?: HookFilter
  /**
   * Output filename for the generated CSS file in the bundle
   * @default 'uno.css'
   */
  fileName?: string
  /**
   * Inline UnoCSS configuration object to merge with loaded config
   * Allows overriding config without a separate uno.config file
   * @example { theme: { colors: { primary: '#ff0000' } } }
   */
  config?: UserConfig
  /**
   * Whether to generate CSS file
   * Useful when CSS is handled separately or injected via other means
   * @default true
   */
  generateCSS?: boolean
  /**
   * Callback hook invoked after code transformation
   * Allows post-processing of transformed code and annotations
   */
  onTransform?: (
    id: string,
    code: MagicString,
    annotations: HighlightAnnotation[],
  ) => void | Promise<void>
}

/**
 * UnoCSS plugin for rolldown/tsdown.
 *
 * Integrates UnoCSS utility-first CSS framework with Rolldown, enabling:
 * - Automatic CSS generation from utility classes found in source files
 * - Support for UnoCSS transformers (e.g., variant group expansion)
 * - Tree-shaking of unused styles
 * - CSS minification (optional)
 *
 * @param options - Plugin configuration options
 * @returns A Rolldown plugin instance
 *
 * @example
 * // uno.config.ts
 * import { defineConfig } from 'unocss'
 * export default defineConfig({
 *   // your uno config
 * })
 *
 * // tsdown.config.ts
 * import { unocss } from 'tsdown-plugin-unocss'
 * export default {
 *   plugins: [unocss({ minify: true })]
 * }
 */
export function unocss(options: UnoCSSPluginOptions = {}): Plugin {
  const {
    root = process.cwd(),
    minify,
    filter = { id: /\.[jt]sx$/ },
    fileName = 'uno.css',
    config: inlineConfig,
    generateCSS = true,
    onTransform,
  } = options
  let uno: Awaited<ReturnType<typeof createGenerator>>
  let context: UnocssPluginContext
  // Store tokens found in each file
  const tokens = new Set<string>()
  const cleanup: VoidFunction[] = []

  /**
   * Applies UnoCSS transformers to the source code.
   *
   * Transformers can modify the code before scanning for utility classes,
   * enabling features like variant group expansion (e.g., "hover:(a b)" -> "hover:a hover:b")
   *
   * @param code - MagicString instance containing the source code
   * @param id - File identifier/path for transformer filtering
   * @returns Array of highlight annotations from transformers
   */
  async function applyTransformers(code: MagicString, id: string) {
    const list = uno.config.transformers

    if (!list?.length) {
      return []
    }
    const annotations = []
    for (const { idFilter, transform } of list) {
      if (idFilter && !idFilter(id)) {
        continue
      }
      const result = await transform(code, id, context)
      const _annotations = result?.highlightAnnotations
      if (_annotations) {
        annotations.push(..._annotations)
      }
    }
    return annotations
  }

  return {
    name: 'tsdown-unocss-plugin',

    async buildStart() {
      // 1. Load your uno.config.ts
      const { config } = await loadConfig(root, inlineConfig)
      uno = await createGenerator(config)
      context = {
        uno,
        tokens,
        async getConfig() {
          return config
        },
        invalidate() {
          cleanup.forEach((c) => c())
        },
        onInvalidate(fn) {
          cleanup.push(fn)
        },
      } as UnocssPluginContext
    },

    transform: {
      filter,
      async handler(code, id) {
        const ms = new MagicString(code)
        // 2. Apply Transformers (Crucial for Variant Groups etc.)
        // This expands "hover:(a b)" into "hover:a hover:b" inside the string
        const annotations = await applyTransformers(ms, id)

        // Invoke onTransform callback if provided
        if (onTransform) {
          await onTransform(id, ms, annotations)
        }

        const finalCode = ms.toString()
        // 3. Scan the *transformed* code for utility classes
        const { matched } = await uno.generate(finalCode, { id, minify })

        // Save tokens found in this file
        if (matched.size > 0) {
          matched.forEach((t) => tokens.add(t))
        }

        // 4. Return the modified code to tsdown
        // tsdown will see the expanded classes but will still preserve the JSX syntax
        // because we haven't touched the actual AST structure, just the strings.
        return {
          code: finalCode,
          map: ms.generateMap({ hires: true }),
        }
      },
    },

    async generateBundle() {
      if (!generateCSS) {
        return
      }
      const { css } = await uno.generate(tokens)

      // Emit the CSS asset
      this.emitFile({
        type: 'asset',
        source: css,
        fileName,
      })
    },
  }
}

export default unocss
