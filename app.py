import streamlit as st
from io import BytesIO
from reportlab.platypus import SimpleDocTemplate, Paragraph
from reportlab.lib.styles import getSampleStyleSheet
import google.generativeai as genai
from pypdf import PdfReader

st.set_page_config(
    page_title="KHAN AI Office Pro",
    page_icon="🏛️",
    layout="wide"
)

genai.configure(api_key=st.secrets["GEMINI_API_KEY"])

model = genai.GenerativeModel("gemini-2.5-flash")

st.title("🏛️ KHAN AI Office Pro")
st.caption("Government Office Smart Assistant")

language = st.selectbox(
    "Language",
    ["Marathi", "English"]
)

task = st.selectbox(
    "Select Task",
    [
        "Letter Drafting",
        "GR Analysis",
        "Note Sheet",
        "WhatsApp Message",
        "Press Note",
        "Meeting Proceedings",
        "Resolution Draft",
        "Inspection Report",
        "Excel Analysis"
    ]
)

text = st.text_area("Enter Details")

uploaded_file = None
if task == "Excel Analysis":
    uploaded_file = st.file_uploader(
        "Upload Excel File",
        type=["xlsx"]
    )

if task == "GR Analysis":
    uploaded_file = st.file_uploader(
        "Upload GR PDF",
        type=["pdf"]
    )

if st.button("Generate"):

    pdf_text = ""

    if task == "GR Analysis" and uploaded_file:

        pdf = PdfReader(uploaded_file)

        for page in pdf.pages:
            page_text = page.extract_text()

            if page_text:
                pdf_text += page_text

        text = f"""
Uploaded GR Content:

{pdf_text[:15000]}

User Request:

{text}
"""

    prompt = f"""
You are KHAN AI Office Pro.

Task Type: {task}
Language: {language}

Rules:
- If Language is Marathi, generate output in official Marathi.
- If Language is English, generate output in professional official English.
- Follow Maharashtra Government drafting style.
- Generate complete output.
- For Letter Drafting include Subject, Reference and Main Letter.
- For Note Sheet generate official note format.
- For Press Note generate media-ready content.
- For Resolution Draft generate Gram Panchayat resolution.
- For WhatsApp Message generate short official message.
- For GR Analysis provide:
  1. Summary
  2. Important Instructions
  3. Action Points
  4. Responsibility of BDO
  5. Responsibility of Gram Panchayat

User Request:

{text}
"""

    try:

        response = model.generate_content(prompt)

        output_text = response.text

        st.text_area(
            "Generated Output",
            output_text,
            height=400
        )

    except Exception as e:

        st.error(f"Error: {e}")

if 'output_text' in locals():

    pdf_buffer = BytesIO()

    doc = SimpleDocTemplate(pdf_buffer)

    styles = getSampleStyleSheet()

    story = [
        Paragraph(
            output_text.replace("\n", "<br/>"),
            styles["BodyText"]
        )
    ]

    doc.build(story)

    st.download_button(
        label="📄 Download PDF",
        data=pdf_buffer.getvalue(),
        file_name="KHAN_AI_Output.pdf",
        mime="application/pdf"
    )
