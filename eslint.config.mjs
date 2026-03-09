import typescriptEslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

export default [{
    files: ["**/*.ts"],
    ignores: ["src/config.ts"], // Allow config.ts to modify its own variables
}, {
    plugins: {
        "@typescript-eslint": typescriptEslint,
    },

    languageOptions: {
        parser: tsParser,
        ecmaVersion: 2022,
        sourceType: "module",
    },

    rules: {
        "@typescript-eslint/naming-convention": ["warn", {
            selector: "import",
            format: ["camelCase", "PascalCase"],
        }],

        curly: "warn",
        eqeqeq: "warn",
        "no-throw-literal": "warn",
        semi: "warn",

        // Prevent direct assignment to read-only config variables
        "no-restricted-syntax": ["error", {
            selector: "AssignmentExpression[left.type='Identifier'][left.name=/^(outputDirectory|compiler|buildMode|cppStandard|treatWarningsAsErrors|excludedFileExtensions|gppPath|gccDebugOptions|gccReleaseOptions|gccWarningsOptions|gccSanitizersOptions|clangppPath|clangDebugOptions|clangReleaseOptions|clangWarningsOptions|clangSanitizersOptions|msvcPath|msvcDebugOptions|msvcReleaseOptions|msvcWarningsOptions|msvcSanitizersOptions|defines|linked_libraries|programArgs|globalCompiler|globalBuildMode|globalCppStandard|compileCmd)$/]",
            message: "Direct assignment to config variables is forbidden. Use setter functions instead (e.g., setWorkspaceCompiler, setWorkspaceBuildMode)."
        }]
    },
}];
