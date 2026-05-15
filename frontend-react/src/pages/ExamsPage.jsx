import { useState, useRef } from "react";
import { auditLog } from "../utils/storage";
import { catLabel, matchesPatientSearch } from "../utils/clinical";
import { initials, fmtDate } from "../utils/formatting";
import PageHero from "../components/layout/PageHero";

const EXAM_TYPES = ["Hemograma completo","Glicemia em jejum","HbA1c","Colesterol total e frações","Triglicerídeos","Creatinina","Ureia","TGO/TGP","TSH/T4 livre","Urina rotina (EAS)","Urocultura","Raio-X tórax","Ultrassonografia abdominal","Ultrassonografia obstétrica","ECG","Espirometria","Mamografia","Papanicolau","PSA","Ferritina/Ferro sérico","Vitamina D","Coagulograma","Outros"];

function examCard(exam, canManageUser, handleDelete, setPreview, isImg, fmtDateFn) {
  const isExternal = String(exam.details||"").includes("[EXAME EXTERNO");
  return (
    <div key={exam.id} style={{background:"var(--surface)",border:`1px solid ${isExternal?"var(--indigo-100)":"var(--border)"}`,borderLeft:`3px solid ${isExternal?"var(--indigo-500)":"var(--teal-400)"}`,borderRadius:"var(--r-md)",padding:".65rem .85rem",marginBottom:".4rem"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:".5rem"}}>
        <div>
          <div style={{fontWeight:600,fontSize:".84rem",color:"var(--ink)"}}>{exam.title}</div>
          <div style={{fontSize:".72rem",color:"var(--text-3)",marginTop:".1rem",fontFamily:"IBM Plex Mono"}}>{fmtDateFn(exam.date)}</div>
        </div>
        <div style={{display:"flex",gap:".3rem",alignItems:"center",flexShrink:0}}>
          {Array.isArray(exam.attachments)&&exam.attachments.length>0&&(
            <span style={{fontSize:".68rem",color:isExternal?"var(--indigo-500)":"var(--teal-700)",background:isExternal?"var(--blue-50)":"var(--teal-50)",border:`1px solid ${isExternal?"var(--indigo-200)":"var(--teal-100)"}`,padding:".1rem .4rem",borderRadius:999}}>
              {exam.attachments.length} anexo{exam.attachments.length>1?"s":""}
            </span>
          )}
          {canManageUser&&<button className="icon-btn" title="Excluir" onClick={()=>handleDelete(exam.id)}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3 4h10M5 4V3h6v1M6 7v5M10 7v5M4 4l.5 9h7L12 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>}
        </div>
      </div>
      {exam.details&&<pre style={{margin:".35rem 0 0",fontFamily:"inherit",fontSize:".78rem",color:"var(--text-2)",whiteSpace:"pre-wrap",lineHeight:1.5}}>{exam.details.replace(/^\[EXAME.*?\]\n?/,"")}</pre>}
      {Array.isArray(exam.attachments)&&exam.attachments.length>0&&(
        <div style={{display:"flex",flexWrap:"wrap",gap:".35rem",marginTop:".45rem"}}>
          {exam.attachments.map((att,i)=>(
            <button key={i} type="button" onClick={()=>setPreview(att)}
              style={{display:"flex",alignItems:"center",gap:".3rem",padding:".25rem .55rem",background:"var(--surface-2)",border:"1px solid var(--border)",borderRadius:"var(--r-md)",cursor:"pointer",fontSize:".73rem",color:"var(--text-1)"}}>
              {isImg(att.contentType)?<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3"/><circle cx="5.5" cy="6" r="1.5" stroke="currentColor" strokeWidth="1.2"/><path d="M1.5 11l3.5-3 3 3 2-2 3.5 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              :<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3 2h7l3 3v9H3V2z" stroke="currentColor" strokeWidth="1.3"/><path d="M10 2v3h3" stroke="currentColor" strokeWidth="1.3"/></svg>}
              {att.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ExamsPage({ patients, users, user, token, onNavigatePatient }) {
  const [search, setSearch]     = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [exams, setExams]       = useState([]);
  const [loading, setLoading]   = useState(false);
  const [addMode, setAddMode]   = useState(null); // null | "posto" | "externo"
  const [form, setForm]         = useState({ type:"Hemograma completo", name:"", date:"", result:"", notes:"" });
  const [files, setFiles]       = useState([]);
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState("");
  const [preview, setPreview]   = useState(null);
  const fileRef = useRef(null);
  const authHeader = { "Authorization":`Bearer ${token}` };

  const canManage = ["doctor","dentist","nurse_manager","nursing_tech"].includes(user?.role);

  const filteredPats = patients.filter(p => matchesPatientSearch(p, search)).slice(0, 60);

  const selectedPatient = patients.find(p=>p.id===selectedId)||null;

  async function loadExams(pid) {
    if (!pid) { setExams([]); return; }
    setLoading(true);
    try {
      const res = await fetch(`/patients/${pid}/exams`, { headers: authHeader });
      if (res.ok) setExams(await res.json());
    } catch {}
    finally { setLoading(false); }
  }

  function selectPatient(p) {
    if (selectedId===p.id) { setSelectedId(null); setExams([]); return; }
    setSelectedId(p.id); loadExams(p.id); setAddMode(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const title = form.type==="Outros"?form.name.trim():form.type;
    if (!title||!form.date) { setError("Preencha tipo e data."); return; }
    setBusy(true); setError("");
    try {
      const tag  = addMode==="externo"?"[EXAME EXTERNO — trazido pelo paciente]":"[EXAME REALIZADO NO POSTO]";
      const notes = [tag, form.result.trim()?`Resultado: ${form.result}`:"", form.notes.trim()?`Obs: ${form.notes}`:""].filter(Boolean).join("\n");
      const res = await fetch(`/patients/${selectedId}/exams`, {
        method:"POST", headers:{...authHeader,"Content-Type":"application/json"},
        body: JSON.stringify({title, date:form.date, notes}),
      });
      if (!res.ok) throw new Error((await res.json()).error||"Erro");
      const created = await res.json();
      for (const file of files) {
        const fd=new FormData(); fd.append("file",file);
        await fetch(`/patients/${selectedId}/exams/${created.id}/attachments`,{method:"POST",headers:authHeader,body:fd});
      }
      auditLog(addMode==="externo"?"EXAME_EXTERNO_INSERIDO":"EXAME_POSTO_REGISTRADO", { patientId:selectedId, title, date:form.date }, user);
      setForm({type:"Hemograma completo",name:"",date:"",result:"",notes:""});
      setFiles([]); if(fileRef.current) fileRef.current.value="";
      setAddMode(null); await loadExams(selectedId);
    } catch(err) { setError(err.message||"Erro."); }
    finally { setBusy(false); }
  }

  async function handleDelete(id) {
    if (!confirm("Excluir este exame?")) return;
    try {
      await fetch(`/patients/${selectedId}/exams/${id}`,{method:"DELETE",headers:authHeader});
      auditLog("EXAME_EXCLUIDO", { patientId:selectedId, examId:id }, user);
      await loadExams(selectedId);
    }
    catch { setError("Erro ao excluir."); }
  }

  function fmtSize(b) { return b>1048576?`${(b/1048576).toFixed(1)}MB`:`${Math.round(b/1024)}KB`; }
  function isImg(t)   { return String(t||"").startsWith("image/"); }

  const posto   = exams.filter(e=>!String(e.details||"").includes("[EXAME EXTERNO"));
  const externo = exams.filter(e=>String(e.details||"").includes("[EXAME EXTERNO"));

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
      <PageHero badge="Exames · Unidade" title="Exames dos Pacientes" subtitle="Exames realizados na unidade e exames externos trazidos pelos pacientes." style={{margin:"1.5rem 1.5rem .75rem"}} />

      <div style={{display:"flex",flex:1,minHeight:0}}>
        {/* Lista de pacientes */}
        <div style={{width:280,flexShrink:0,borderRight:"1px solid var(--border)",display:"flex",flexDirection:"column"}}>
          <div style={{padding:".75rem",borderBottom:"1px solid var(--border)"}}>
            <div style={{position:"relative"}}>
              <span style={{position:"absolute",left:".6rem",top:"50%",transform:"translateY(-50%)",color:"var(--text-3)"}}>
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><circle cx="6.5" cy="6.5" r="4" stroke="currentColor" strokeWidth="1.3"/><path d="M10 10l3.5 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
              </span>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar paciente..."
                style={{width:"100%",paddingLeft:"1.9rem",boxSizing:"border-box",fontSize:".8rem"}}/>
            </div>
          </div>
          <div style={{flex:1,overflowY:"auto"}}>
            {filteredPats.length===0 && <p style={{padding:"1rem",fontSize:".8rem",color:"var(--text-3)",textAlign:"center"}}>Nenhum paciente encontrado.</p>}
            {filteredPats.map(p=>{
              const isOpen = selectedId===p.id;
              return (
                <button key={p.id} onClick={()=>selectPatient(p)}
                  style={{display:"flex",alignItems:"center",gap:".5rem",width:"100%",padding:".6rem .85rem",
                    background:isOpen?"var(--teal-50)":"transparent",border:"none",
                    borderLeft:`3px solid ${isOpen?"var(--teal-500)":"transparent"}`,
                    borderBottom:"1px solid var(--border)",cursor:"pointer",textAlign:"left",color:"var(--text-1)"}}>
                  <div className="user-avatar" style={{width:30,height:30,fontSize:".72rem",flexShrink:0,
                    background:isOpen?"var(--teal-500)":"var(--slate-200)",color:isOpen?"#fff":"var(--text-2)"}}>
                    {initials(p.name)}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:600,fontSize:".82rem",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:isOpen?"var(--teal-700)":"var(--ink)"}}>{p.name}</div>
                    <div style={{fontSize:".68rem",color:"var(--text-3)"}}>{catLabel([],p.careCategory)}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Painel de exames */}
        <div style={{flex:1,overflowY:"auto",padding:"1.25rem 1.5rem"}}>
          {!selectedPatient ? (
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100%",color:"var(--text-3)",gap:".75rem"}}>
              <svg width="48" height="48" viewBox="0 0 16 16" fill="none" style={{opacity:.25}}><path d="M3 2h7l3 3v9H3V2z" stroke="currentColor" strokeWidth="1.2"/><path d="M10 2v3h3" stroke="currentColor" strokeWidth="1.2"/><circle cx="8" cy="9.5" r="2.5" stroke="currentColor" strokeWidth="1.1"/><path d="M10 11.5l1.5 1.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/></svg>
              <span style={{fontSize:".84rem"}}>Selecione um paciente para ver os exames</span>
            </div>
          ) : (
            <>
              {/* Cabeçalho do paciente */}
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1rem",gap:"1rem"}}>
                <div>
                  <h2 style={{margin:0,fontSize:"1rem",fontWeight:700}}>{selectedPatient.name}</h2>
                  <div style={{fontSize:".73rem",color:"var(--text-3)",marginTop:".1rem"}}>{catLabel([],selectedPatient.careCategory)}</div>
                </div>
                {onNavigatePatient&&(
                  <button onClick={()=>onNavigatePatient(selectedPatient.id)}
                    style={{fontSize:".75rem",padding:".3rem .7rem",background:"var(--surface-2)",border:"1px solid var(--border)",borderRadius:"var(--r-md)",cursor:"pointer",color:"var(--text-1)",flexShrink:0}}>
                    Ver ficha →
                  </button>
                )}
              </div>

              {/* Botões de inserção */}
              {canManage&&(
                <div style={{display:"flex",gap:".45rem",marginBottom:"1rem"}}>
                  <button type="button" onClick={()=>setAddMode(addMode==="posto"?null:"posto")}
                    style={{fontSize:".76rem",padding:".3rem .7rem",background:addMode==="posto"?"var(--teal-600)":"var(--surface-2)",border:"1px solid var(--border)",borderRadius:"var(--r-md)",color:addMode==="posto"?"#fff":"var(--text-1)",fontWeight:600,cursor:"pointer"}}>
                    + Exame do posto
                  </button>
                  <button type="button" onClick={()=>setAddMode(addMode==="externo"?null:"externo")}
                    style={{fontSize:".76rem",padding:".3rem .7rem",background:addMode==="externo"?"var(--indigo-500)":"var(--surface-2)",border:"1px solid var(--border)",borderRadius:"var(--r-md)",color:addMode==="externo"?"#fff":"var(--text-1)",fontWeight:600,cursor:"pointer"}}>
                    + Exame externo
                  </button>
                </div>
              )}

              {/* Formulário inline */}
              {addMode&&(
                <div style={{padding:".85rem",background:"var(--surface-2)",border:`2px solid ${addMode==="externo"?"var(--indigo-500)":"var(--teal-500)"}`,borderRadius:"var(--r-md)",marginBottom:"1rem"}}>
                  <div style={{fontSize:".71rem",fontWeight:700,color:addMode==="externo"?"var(--indigo-500)":"var(--teal-700)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:".6rem"}}>
                    {addMode==="externo"?"📎 Exame externo (trazido pelo paciente)":"🏥 Exame realizado no posto"}
                  </div>
                  <form onSubmit={handleSubmit} style={{display:"flex",flexDirection:"column",gap:".5rem"}}>
                    <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:".5rem"}}>
                      <label style={{fontSize:".75rem",fontWeight:600}}>Tipo de exame
                        <select value={form.type} onChange={e=>setForm(s=>({...s,type:e.target.value}))} style={{marginTop:".2rem"}}>
                          {EXAM_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
                        </select>
                      </label>
                      <label style={{fontSize:".75rem",fontWeight:600}}>Data *
                        <input type="date" value={form.date} onChange={e=>setForm(s=>({...s,date:e.target.value}))} style={{marginTop:".2rem"}}/>
                      </label>
                    </div>
                    {form.type==="Outros"&&<input value={form.name} onChange={e=>setForm(s=>({...s,name:e.target.value}))} placeholder="Nome do exame"/>}
                    <label style={{fontSize:".75rem",fontWeight:600}}>Resultado / laudo
                      <textarea value={form.result} onChange={e=>setForm(s=>({...s,result:e.target.value}))} placeholder="Descreva o resultado..." style={{minHeight:52,marginTop:".2rem"}}/>
                    </label>
                    <label style={{fontSize:".75rem",fontWeight:600}}>Observações
                      <input value={form.notes} onChange={e=>setForm(s=>({...s,notes:e.target.value}))} placeholder="Conduta, comparação..." style={{marginTop:".2rem"}}/>
                    </label>
                    <label style={{fontSize:".75rem",fontWeight:600}}>Anexar arquivo (imagem ou PDF, máx 15MB)
                      <input type="file" ref={fileRef} accept="image/*,application/pdf" multiple onChange={e=>{
                        const f=Array.from(e.target.files||[]);
                        if(f.some(x=>x.size>15*1024*1024)){setError("Arquivo muito grande");return;}
                        setError(""); setFiles(f);
                      }} style={{fontSize:".78rem",padding:".3rem 0",marginTop:".2rem"}}/>
                    </label>
                    {files.length>0&&<div style={{display:"flex",gap:".35rem",flexWrap:"wrap"}}>
                      {files.map((f,i)=><span key={i} style={{fontSize:".71rem",padding:".12rem .4rem",background:"var(--surface)",border:"1px solid var(--border)",borderRadius:999}}>{f.name} · {fmtSize(f.size)}</span>)}
                    </div>}
                    {error&&<p className="error" style={{margin:0}}>{error}</p>}
                    <div style={{display:"flex",gap:".4rem"}}>
                      <button type="submit" disabled={busy}>{busy?"Salvando...":"Salvar"}</button>
                      <button type="button" className="secondary" onClick={()=>setAddMode(null)}>Cancelar</button>
                    </div>
                  </form>
                </div>
              )}

              {/* Exames do posto */}
              <div style={{marginBottom:"1.25rem"}}>
                <div style={{fontSize:".7rem",fontWeight:700,color:"var(--teal-700)",textTransform:"uppercase",letterSpacing:".07em",marginBottom:".5rem",display:"flex",alignItems:"center",gap:".4rem"}}>
                  <span style={{width:8,height:8,borderRadius:"50%",background:"var(--teal-500)",display:"inline-block"}}/>
                  Realizados na unidade ({posto.length})
                </div>
                {loading?<p className="muted" style={{fontSize:".82rem"}}>Carregando...</p>
                  :!posto.length?<p className="muted" style={{fontSize:".82rem"}}>🔬 Nenhum exame registrado.</p>
                  :posto.map(exam=>examCard(exam,canManage,handleDelete,setPreview,isImg,fmtDate))}
              </div>

              {/* Exames externos */}
              <div>
                <div style={{fontSize:".7rem",fontWeight:700,color:"var(--indigo-500)",textTransform:"uppercase",letterSpacing:".07em",marginBottom:".5rem",display:"flex",alignItems:"center",gap:".4rem"}}>
                  <span style={{width:8,height:8,borderRadius:"50%",background:"var(--indigo-500)",display:"inline-block"}}/>
                  Trazidos pelo paciente ({externo.length})
                </div>
                {!externo.length?<p className="muted" style={{fontSize:".82rem"}}>Nenhum exame externo registrado.</p>
                  :externo.map(exam=>examCard(exam,canManage,handleDelete,setPreview,isImg,fmtDate))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Preview modal */}
      {preview&&(
        <div className="modal-backdrop" onClick={()=>setPreview(null)} style={{zIndex:600}}>
          <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:"90vw",maxHeight:"90vh",display:"flex",flexDirection:"column",gap:".75rem",padding:"1.25rem"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <span style={{fontWeight:600,fontSize:".88rem",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"80%"}}>{preview.name}</span>
              <div style={{display:"flex",gap:".4rem",flexShrink:0}}>
                <a href={preview.url} download={preview.name} target="_blank" rel="noreferrer"
                  style={{display:"flex",alignItems:"center",gap:".3rem",fontSize:".78rem",padding:".3rem .7rem",background:"var(--surface-2)",border:"1px solid var(--border)",borderRadius:"var(--r-md)",color:"var(--text-1)",textDecoration:"none"}}>
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M8 3v8M5 8l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/><path d="M3 13h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
                  Baixar
                </a>
                <button className="icon-btn" onClick={()=>setPreview(null)}><svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg></button>
              </div>
            </div>
            <div style={{overflow:"auto",display:"flex",justifyContent:"center",flex:1}}>
              {isImg(preview.contentType)
                ?<img src={preview.url} alt={preview.name} style={{maxWidth:"100%",maxHeight:"75vh",borderRadius:"var(--r-md)",objectFit:"contain"}}/>
                :<iframe src={preview.url} title={preview.name} style={{width:"70vw",height:"75vh",border:"none",borderRadius:"var(--r-md)"}}/>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ExamsPage;
