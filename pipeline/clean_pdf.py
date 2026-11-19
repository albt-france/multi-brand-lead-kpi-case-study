"""Removes all metadata from the PDF report (title, creator, producer...) before publication.

    python pipeline/clean_pdf.py report/lead-kpi-case-study.pdf
"""
import sys

from pypdf import PdfReader, PdfWriter

path = sys.argv[1]
reader = PdfReader(path)
writer = PdfWriter()
for page in reader.pages:
    writer.add_page(page)
writer.add_metadata({"/Title": "Lead KPI case study", "/Producer": "", "/Creator": ""})
with open(path, "wb") as f:
    writer.write(f)
print("metadata cleaned:", dict(PdfReader(path).metadata or {}))
