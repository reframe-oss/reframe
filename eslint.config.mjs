import { defineConfig } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import jsxA11Y from "eslint-plugin-jsx-a11y";

// jsx-a11y ships a native flat-config export, so no FlatCompat/.eslintrc
// bridge is needed here. That bridge (compat.extends("plugin:jsx-a11y/recommended"))
// pulls in @eslint/eslintrc's legacy config loader, which is incompatible
// with ESLint 10's minimatch resolution and crashes on startup.
//
// nextCoreWebVitals already registers the jsx-a11y plugin itself (with a
// 6-rule subset), so extending flatConfigs.recommended wholesale re-registers
// the same plugin and errors ("Cannot redefine plugin"). Merging just its
// `rules` gets the full 34-rule recommended set without the collision.
export default defineConfig([
  // `next lint` used to exclude build output automatically; plain `eslint`
  // doesn't, so this has to be explicit or it lints into bundled/minified
  // output (storybook-static, out, .next) as if it were source.
  {
    ignores: [".next/**", "out/**", "storybook-static/**", "coverage/**"],
  },
  {
    extends: [...nextCoreWebVitals],
    rules: {
      ...jsxA11Y.flatConfigs.recommended.rules,
    },
  },
]);
