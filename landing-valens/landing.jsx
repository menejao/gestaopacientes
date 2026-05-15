// landing.jsx — Composição final da landing institucional

function App() {
  return (
    <div style={{ background: "var(--bg)", color: "var(--text)" }}>
      <LNav/>
      <LHero/>
      <LValueProp/>
      <LTransformation/>
      <LModules/>
      <LSecurity/>
      <LInterop/>
      <LImplantation/>
      <LBenefits/>
      <LCTA/>
      <LFooter/>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
