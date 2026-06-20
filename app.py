import streamlit as st

st.set_page_config(
    page_title="KHAN AI Office Pro",
    page_icon="🏛️",
    layout="wide"
)

st.title("🏛️ KHAN AI Office Pro")
st.subheader("Government Office Smart Assistant")

st.info("KHAN AI Office Pro Setup Successful")

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

details = st.text_area("Enter Details")

if st.button("Generate"):
    st.success("AI Module Coming Next Step")
