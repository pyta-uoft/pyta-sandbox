import { loadPyodide } from "https://cdn.jsdelivr.net/pyodide/v314.0.0/full/pyodide.mjs"

let pyodideReadyPromise

async function loadPyodideAndPackages() {
  self.pyodide = await loadPyodide()
  await self.pyodide.loadPackage(["micropip"])

  await self.pyodide.runPythonAsync(`
      import micropip
      mock_watchdog_modules = {
          "watchdog": "",
          "watchdog.events": "class FileSystemEventHandler: pass",
          "watchdog.observers": "class Observer: pass",
      }
      micropip.add_mock_package("watchdog", "6.0.0", modules=mock_watchdog_modules)
      await micropip.install("python-ta")
      
      import json
      import traceback
      from python_ta.debug.accumulation_table import AccumulationTable
      from python_ta.debug.recursion_table import RecursionTable

      captured_tables = []

      def mock_acc_tabulate(self):
          for i in range(len(self.loops)):
              title_suffix = f" (Loop {i+1})" if len(self.loops) > 1 else ""
              captured_tables.append({
                  "kind": "accumulation",
                  "title": f"Accumulation Table{title_suffix}",
                  "data": self._create_iteration_dict(i)
              })

      def mock_rec_tabulate(self):
          captured_tables.append({
              "kind": "recursion",
              "title": f"Recursion Table",
              "data": self.get_recursive_dict()
          })

      AccumulationTable._tabulate_data = mock_acc_tabulate
      RecursionTable._tabulate_data = mock_rec_tabulate

      def run_debug(code_input):
          captured_tables.clear()
          with open("code_input.py", "w", encoding="utf-8") as f:
              f.write(code_input)
          namespace = {"__file__": "code_input.py"}
          try:
              compiled_code = compile(code_input, "code_input.py", "exec")
              exec(compiled_code, namespace)
              return json.dumps({"success": True, "tables": captured_tables})
          except Exception as e:
              return json.dumps({"success": False, "error": traceback.format_exc()})
  `)

  self.debugCode = (codeInput) => {
    self.pyodide.globals.set("current_code", codeInput)
    return self.pyodide.runPython(`run_debug(current_code)`)
  }
}

pyodideReadyPromise = loadPyodideAndPackages()

self.onmessage = async (event) => {
  const { id, type, code: codeInput } = event.data
  if (type === "INIT") {
    try {
      await pyodideReadyPromise
      self.postMessage({ id, type: "READY" })
    } catch (error) {
      self.postMessage({ id, type: "ERROR", error: error.message })
    }
  } else if (type === "DEBUG_CODE") {
    try {
      await pyodideReadyPromise
      const jsonResponse = self.debugCode(codeInput)
      self.postMessage({ id, type: "RESULT", payload: jsonResponse })
    } catch (error) {
      self.postMessage({ id, type: "ERROR", error: error.message })
    }
  }
}
