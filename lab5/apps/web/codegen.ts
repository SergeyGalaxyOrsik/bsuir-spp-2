import type { CodegenConfig } from "@graphql-codegen/cli"

const config: CodegenConfig = {
  schema: "src/graphql/schema.graphql",
  documents: ["src/**/*.{ts,tsx}", "!src/graphql/gen/**"],
  ignoreNoDocuments: true,
  generates: {
    "src/graphql/gen/": {
      preset: "client",
      config: {
        documentMode: "string",
        enumsAsTypes: true,
        useTypeImports: true,
        scalars: { DateTime: "string", JSON: "unknown" },
      },
      presetConfig: { fragmentMasking: false },
    },
  },
}

export default config
