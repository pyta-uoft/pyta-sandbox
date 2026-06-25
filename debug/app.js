const defaultCode = `from python_ta.debug.accumulation_table import AccumulationTable
from python_ta.debug.recursion_table import RecursionTable

def factorial(n):
    if n == 0:
        return 1
    return n * factorial(n - 1)

def demo(numbers):
    total = 0
    running = []
    with AccumulationTable(["total", "running"]):
        for number in numbers:
            total += number
            running.append(total)

    with RecursionTable("factorial"):
        factorial(4)

demo([10, 20, 30])
`

document.getElementById("codeblock").value = defaultCode

const submitButton = document.getElementById("submitButton")
const outputContainer = document.getElementById("output-container")
const codeblock = document.getElementById("codeblock")
const pyodideWorker = new Worker("worker.js", { type: "module" })

let lastId = 1

function requestResponse(worker, msg) {
  return new Promise((resolve) => {
    const idWorker = lastId++

    function listener(event) {
      if (event.data?.id !== idWorker) {
        return
      }
      worker.removeEventListener("message", listener)
      resolve(event.data)
    }

    worker.addEventListener("message", listener)
    worker.postMessage({ id: idWorker, ...msg })
  })
}

function buildTableNode(headers, rows) {
  const table = document.createElement("table");
  table.className = "debug-table";

  const thead = table.createTHead();
  const headRow = thead.insertRow();
  for (const headerText of headers) {
    const th = document.createElement("th");
    th.textContent = headerText; 
    headRow.appendChild(th);
  }

  const tbody = table.createTBody();
  for (const rowData of rows) {
    const tr = tbody.insertRow();
    for (const headerText of headers) {
      const td = tr.insertCell();
      td.textContent = rowData[headerText] ?? "N/A"; 
    }
  }

  return table;
}

function buildTableWrapper(titleText, tableNode) {
  const wrapper = document.createElement("div");
  wrapper.className = "table-wrapper";

  const title = document.createElement("div");
  title.className = "table-title";
  title.textContent = titleText;

  wrapper.appendChild(title);
  wrapper.appendChild(tableNode);

  return wrapper;
}

function buildAccumulationTableNode(table) {
  const columns = Object.keys(table.data).filter((k) => k !== "iteration")
  const iterations = table.data.iteration ?? []

  const rows = iterations.map((iteration, index) => {
    const row = { iteration }
    for (const column of columns) {
      row[column] = table.data[column]?.[index]
    }
    return row
  })

  const tableNode = buildTableNode(["iteration", ...columns], rows);
  return buildTableWrapper(table.title, tableNode);
}

function buildRecursionTableNode(table) {
  const headers = Object.keys(table.data)
  
  let rowCount = 0;
  if (headers.length > 0 && table.data[headers[0]]) {
    rowCount = table.data[headers[0]].length;
  }

  const rows = Array.from({ length: rowCount }, (_, index) => {
    const row = {}
    for (const header of headers) {
      row[header] = table.data[header]?.[index]
    }
    return row
  })

  const tableNode = buildTableNode(headers, rows);
  return buildTableWrapper(table.title, tableNode);
}

function renderResult(payload) {
  const result = JSON.parse(payload)
  
  outputContainer.innerHTML = ""

  if (!result.success) {
    const errorNode = document.createElement("div");
    errorNode.className = "error-text";
    errorNode.textContent = result.error;
    outputContainer.appendChild(errorNode);
    return
  }

  if (!result.tables || result.tables.length === 0) {
    const placeholder = document.createElement("div");
    placeholder.className = "placeholder-text";
    placeholder.textContent = "Code executed successfully, but no tables were captured.";
    outputContainer.appendChild(placeholder);
    return;
  }

  for (const table of result.tables) {
    const tableNode = table.kind === "accumulation" 
      ? buildAccumulationTableNode(table) 
      : buildRecursionTableNode(table);
      
    outputContainer.appendChild(tableNode);
  }
}

async function initialize() {
  submitButton.disabled = true
  const response = await requestResponse(pyodideWorker, { type: "INIT" })
  if (response.type === "READY") {
    submitButton.disabled = false
    submitButton.innerText = "Run Debugger"
  } else {
    console.error("Failed to initialize Pyodide:", response.error)
  }
}

initialize()

submitButton.addEventListener("click", async () => {
  const codeInput = codeblock.value

  submitButton.disabled = true
  submitButton.innerText = "Analyzing Code..."
  outputContainer.innerHTML = '<div class="placeholder-text">Analyzing...</div>'

  const response = await requestResponse(pyodideWorker, {
    type: "DEBUG_CODE", 
    code: codeInput,
  })

  if (response.type === "RESULT") {
    renderResult(response.payload)
  } else if (response.type === "ERROR") {
    console.error(response.error)
    outputContainer.innerHTML = `<div class="error-text">An error occurred while analyzing the code:<br><br>${response.error}</div>`
  }

  submitButton.disabled = false
  submitButton.innerText = "Run Debugger"
})