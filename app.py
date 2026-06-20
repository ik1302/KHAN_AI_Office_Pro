import streamlit as st
import google.generativeai as genai

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
        "Inspection Report"
    ]
)

text = st.text_area("Enter Details")

if st.button("Generate") and text:

    prompt = f"""
You are KHAN AI Office Pro.

Task Type: {task}
Language: {language}
Rules:
- If Language is Marathi, generate output in official Marathi.
- If Language is English, generate output in professional official English.
- Use professional Marathi language.
- Follow Maharashtra Government drafting style.
- Generate complete output.
- For Letter Drafting include Subject, Reference and Main Letter.
- For Note Sheet generate official note format.
- For Press Note generate media-ready content.
- For Resolution Draft generate Gram Panchayat resolution.
- For WhatsApp Message generate short official message.

User Request:

{text}
"""

    try:
        response = model.generate_content(prompt)
        st.text_area(
    "Generated Output",
    response.text,
    height=400
)

    except Exception:
        st.error("AI service temporarily unavailable. Please try again later.")
