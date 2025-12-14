# rolldown-plugin-unocss

Add basic UnoCSS support for rolldown/tsdown.

## Install

```bash
npm install -D tsdown-plugin-unocss @unocss/core @unocss/config magic-string
```

## Usage

### Basic Setup

1. Create `uno.config.ts` in your project root:

```ts
import { defineConfig } from 'unocss'

export default defineConfig({
  // your UnoCSS config
})
```

2. Configure the plugin in `tsdown.config.ts`:

```ts
import { defineConfig } from 'tsdown'
import { unocss } from 'tsdown-plugin-unocss'

export default defineConfig({
  plugins: [unocss()]
})
```

### Configuration Options

```ts
interface UnoCSSPluginOptions {
  // Enable CSS minification (default: false)
  minify?: boolean

  // Base directory for resolving config file (default: process.cwd())
  root?: string

  // Filter for target files (default: /\.[jt]sx$/)
  filter?: HookFilter

  // Output CSS filename (default: 'uno.css')
  fileName?: string

  // Inline UnoCSS configuration
  config?: UserConfig

  // Whether to generate CSS file
  generateCSS?: boolean

  // Post-transform callback
  onTransform?: (id: string, code: MagicString, annotations: HighlightAnnotation[]) => void | Promise<void>
}
```

### Advanced Example

```ts
import { unocss } from 'tsdown-plugin-unocss'

export default {
  plugins: [
    unocss({
      minify: true,
      fileName: 'styles.css',
      config: {
        theme: {
          colors: {
            primary: '#ff0000'
          }
        }
      },
      onTransform: (id, code, annotations) => {
        console.log(`Transformed ${id} with ${annotations.length} annotations`)
      }
    })
  ]
}
```

## How It Works

1. **buildStart**: Loads UnoCSS configuration and initializes the generator
2. **transform**: For each matched file:
   - Applies UnoCSS transformers (e.g., variant group expansion)
   - Scans the transformed code for utility classes
   - Collects matched tokens
3. **generateBundle**: Generates final CSS from all collected tokens and emits it as a bundle asset

## License

MIT
