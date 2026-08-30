import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: [
      ".output/",
      ".wxt/",
      "dist/",
      "build/",
      "coverage/",
      "node_modules/",
      "companion/.venv/",
      "companion/__pycache__/",
      ".claude/**",
      "shared/contracts/*.json",
    ],
  },
);
