import { roleLabel } from "../utils/roles";

function DocumentModal({ patient, user, type, onClose }) {
  const today = new Date().toLocaleDateString("pt-BR",{day:"2-digit",month:"long",year:"numeric"});
  const isAtestado = type === "atestado";

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{maxWidth:580}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1rem"}}>
          <h3 style={{margin:0}}>{isAtestado?"Atestado Médico":"Declaração de Comparecimento"}</h3>
          <div style={{display:"flex",gap:".5rem"}}>
            <button onClick={()=>window.print()} style={{fontSize:".78rem",padding:".3rem .65rem"}}>🖨️ Imprimir</button>
            <button className="icon-btn" onClick={onClose}><svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg></button>
          </div>
        </div>
        <div id="print-doc" style={{background:"var(--surface-2)",borderRadius:"var(--r-md)",padding:"2rem",fontFamily:"Georgia, serif",lineHeight:1.9,fontSize:".9rem"}}>
          <div style={{textAlign:"center",marginBottom:"1.5rem",borderBottom:"2px solid var(--ink)",paddingBottom:"1rem"}}>
            <div style={{fontWeight:800,fontSize:"1.15rem",textTransform:"uppercase",letterSpacing:".05em"}}>Unidade Básica de Saúde</div>
            <div style={{fontSize:".85rem",color:"var(--text-2)",marginTop:".25rem"}}>{isAtestado?"ATESTADO MÉDICO":"DECLARAÇÃO DE COMPARECIMENTO"}</div>
          </div>
          {isAtestado?(
            <p>Atesto para os devidos fins que o(a) paciente <strong>{patient?.name}</strong>{patient?.cpf&&<span>, CPF {patient.cpf}</span>}, encontra-se sob meus cuidados médicos, necessitando de <strong>____ (____) dia(s)</strong> de repouso a partir de {today}.</p>
          ):(
            <p>Declaro que o(a) Sr(a). <strong>{patient?.name}</strong>{patient?.cpf&&<span>, CPF {patient.cpf}</span>}, compareceu a esta Unidade Básica de Saúde no dia <strong>{today}</strong>, no horário das <strong>____h____min</strong> às <strong>____h____min</strong>, para fins de atendimento médico.</p>
          )}
          <p style={{marginTop:"1rem"}}>Por ser verdade, firmo o presente documento.</p>
          <div style={{marginTop:"3rem",display:"flex",justifyContent:"space-between",alignItems:"flex-end"}}>
            <div style={{fontSize:".82rem",color:"var(--text-3)"}}>Local: _______________, {today}</div>
            <div style={{textAlign:"center"}}>
              <div style={{borderTop:"1px solid var(--ink)",paddingTop:".4rem",minWidth:200,fontSize:".8rem"}}>
                {user?.name||"Profissional"}<br/>
                {roleLabel(user?.role)}{user?.councilNumber&&<span> · CRM/COREN {user.councilNumber}</span>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DocumentModal;
