import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { defineConfig, type Plugin } from "vite";

const __dirname = dirname(fileURLToPath(import.meta.url));

const vexflowPatchSrc = resolve(__dirname, "src/VexFlowPatch/src/");
const vexflowDest = resolve(__dirname, "node_modules/vexflow/src/");
if (existsSync(vexflowPatchSrc)) {
  execSync(`cp -r "${vexflowPatchSrc}"* "${vexflowDest}"`);
}

function glslPlugin(): Plugin {
  return {
    name: "glsl",
    transform(_, id) {
      if (!id.endsWith(".glsl")) return null;
      const code = readFileSync(id, "utf-8");
      return { code: `export default ${JSON.stringify(code)};`, map: null };
    },
  };
}

export default defineConfig({
  plugins: [glslPlugin()],
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "opensheetmusicdisplay",
      formats: ["es"],
      fileName: () => "opensheetmusicdisplay.min.js",
    },
    outDir: "build",
    emptyOutDir: true,
    minify: true,
    sourcemap: false,
    target: "es2020",
    rolldownOptions: {
      output: {
        codeSplitting: false,
      },
    },
  },
  define: {
    "process.env.STATIC_FILES_SUBFOLDER": "false",
    "process.env.DEBUG": "false",
    "process.env.DRAW_BOUNDING_BOX_ELEMENT": "false",
  },
});
