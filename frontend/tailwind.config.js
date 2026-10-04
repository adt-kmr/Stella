/**
 * STELLA — "The Survey Sheet"
 * Tailwind is configured to read the CSS custom properties in
 * index.css. Colour and type are never duplicated here: the
 * stylesheet is the single source of truth, so the enforcement
 * greps only ever have one file to check.
 */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        /* Paper ground & surfaces */
        vellum: 'var(--vellum)',
        'vellum-deep': 'var(--vellum-deep)',
        graphite: 'var(--graphite)',
        ink: 'var(--ink)',
        'ink-muted': 'var(--ink-muted)',
        rule: 'var(--rule)',

        /* Depth ramp: far / mid / near / refused */
        far: 'var(--far)',
        mid: 'var(--mid)',
        near: 'var(--near)',
        refused: 'var(--refused)',

        /* Text-safe signal inks (Hot Ink Rule) */
        'near-ink': 'var(--near-ink)',
        'mid-ink': 'var(--mid-ink)',
        'far-ink': 'var(--far-ink)',

        /* Alpha tints: elevation without shadow */
        'tint-far': 'var(--tint-far)',
        'tint-near': 'var(--tint-near)',
        'tint-mid': 'var(--tint-mid)',
        'tint-refused': 'var(--tint-refused)',
        'tint-ink': 'var(--tint-ink)',
      },
      fontFamily: {
        sans: ['Archivo', 'Helvetica Neue', 'Arial', 'sans-serif'],
        display: ['Archivo', 'Helvetica Neue', 'Arial', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SF Mono', 'Menlo', 'monospace'],
      },
      borderRadius: {
        /* Square Rule: no rounded box exists in this system.
           `.dot` / `.beacon` use an inline `border-radius: 50%`
           in index.css, which is a literal point in space. */
        none: '0',
      },
      boxShadow: {
        /* No Shadow Rule, made un-overridable from a class. */
        none: 'none',
      },
      extend: {},
    },
  },
  corePlugins: {
    // The Square Rule and the No Shadow Rule are structural, not
    // advisory: strip the utilities that could violate them so a
    // stray `rounded-xl` or `shadow-lg` fails at build time.
    boxShadow: false,
    boxShadowColor: false,
  },
  plugins: [],
};