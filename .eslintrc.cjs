module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    node: true
  },
  parser: "vue-eslint-parser",
  parserOptions: {
    ecmaVersion: "latest",
    parser: "@typescript-eslint/parser",
    sourceType: "module"
  },
  plugins: [
    "@typescript-eslint",
    "vue"
  ],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:vue/vue3-recommended"
  ],
  ignorePatterns: [
    "dist/",
    "node_modules/",
    "*.config.*"
  ],
  rules: {
    "vue/max-attributes-per-line": "off",
    "vue/multi-word-component-names": "off",
    "vue/singleline-html-element-content-newline": "off"
  },
  overrides: [
    {
      files: ["tests/**/*.cjs"],
      rules: {
        "@typescript-eslint/no-var-requires": "off"
      }
    }
  ]
};
