import asyncio
import js
from js import document, FileReader
from pyodide.ffi import create_proxy

def csvtext_to_list(text):
    """
    Convert CSV text to a list of lists.
    Each inner list represents a row in the CSV.
    Trailing empty cells are removed from each row.
    Lines that are empty or contain only commas are ignored.
    """
    lines = text.strip().split('\n')
    result = []
    for line in lines:
        # Skip lines that are empty or contain only commas/whitespace
        if not line.strip() or all(cell.strip() == '' for cell in line.split(',')):
            continue
        row = line.split(',')
        # Remove trailing empty strings
        while row and row[-1].strip() == '':
            row.pop()
        result.append(row)
    return result


def read_complete(event):
    # event is ProgressEvent

    content = document.getElementById("output");
    #content.innerText = event.target.result
    data  = csvtext_to_list(event.target.result)
    for row in data:
        print(len(row))
        content.innerHTML += "<p>" + ", ".join(row) + "</p>"


async def process_file(x):
    fileList = document.getElementById('csv-file').files

    for f in fileList:
        # reader is a pyodide.JsProxy
        reader = FileReader.new()

        # Create a Python proxy for the callback function
        onload_event = create_proxy(read_complete)

        #console.log("done")

        reader.onload = onload_event

        reader.readAsText(f)

    return

def main():
    # Create a Python proxy for the callback function
    file_event = create_proxy(process_file)

    # Set the listener to the callback
    e = document.getElementById("csv-file")
    e.addEventListener("change", file_event, False)

main()