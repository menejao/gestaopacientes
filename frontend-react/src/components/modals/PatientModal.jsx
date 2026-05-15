import Modal from "../ui/Modal";
import Button from "../ui/Button";

function PatientModal({
  open,
  editingPatient,
  form,
  setForm,
  users,
  catOpts,
  isChildCategory,
  lookupCepAndFillAddress,
  formatPhone,
  formatCep,
  formatCpf,
  formatCns,
  error,
  busy,
  onClose,
  onSubmit,
}) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={() => onClose()}>
      <div className="modal modal--xl" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <div>
            <h3>{editingPatient ? "Editar paciente" : "Novo paciente"}</h3>
            <p>Preencha os dados cadastrais do paciente</p>
          </div>
          <button type="button" className="icon-btn" onClick={() => onClose()}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>

        <form className="form patient-modal-form" onSubmit={onSubmit}>
          <section className="form__section">
            <header className="form__section-header">
              <h3>Grupo e vínculo</h3>
            </header>
            <div className="field-grid">
              <label>Grupo / Categoria *
                <select value={form.careCategory} onChange={e=>setForm(s=>({...s,careCategory:e.target.value}))}>
                  {(catOpts.length ? catOpts.filter(c=>c.value!=="chronic") : [{value:"general",label:"Geral"}]).map(c=><option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </label>
              <label>ACS responsável
                <select value={form.assignedAcsId} onChange={e=>setForm(s=>({...s,assignedAcsId:e.target.value}))}>
                  <option value="">Não atribuído</option>
                  {users.filter(u=>u.role==="acs").map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </label>
              <div className="field-span-2 patient-modal__chips">
                <span className="patient-modal__legend">Condições</span>
                {[["diabetes","Diabetes"],["hypertension","Hipertensão"]].map(([val,lbl])=>(
                  <label key={val} className="patient-modal__checkbox">
                    <input
                      type="checkbox"
                      checked={(form.chronicConditions||[]).includes(val)}
                      onChange={e=>setForm(s=>({...s,chronicConditions:e.target.checked?[...(s.chronicConditions||[]),val]:(s.chronicConditions||[]).filter(c=>c!==val)}))}
                    />
                    {lbl}
                  </label>
                ))}
                {(form.chronicConditions||[]).length>0&&(
                  <span className="patient-modal__status">
                    {String(form.careCategory||"").toLowerCase()==="elderly" ? "Regras somadas ao grupo Idoso" : "Regras de doença crônica ativas"}
                  </span>
                )}
              </div>
            </div>
          </section>

          <section className="form__section">
            <header className="form__section-header">
              <h3>Identificação pessoal</h3>
            </header>
            <div className="field-grid">
              <label className="field-span-2">Nome completo *
                <input value={form.name} onChange={e=>setForm(s=>({...s,name:e.target.value}))} placeholder="Nome completo do paciente"/>
              </label>
              <div className="field-span-2 patient-modal__stack">
                <span className="patient-modal__legend">Nome da mãe</span>
                <div className="patient-modal__inline">
                  <input
                    value={form.motherName}
                    onChange={e=>setForm(s=>({...s,motherName:e.target.value}))}
                    placeholder="Nome completo da mãe"
                    disabled={form.motherUnknown||false}
                    className={form.motherUnknown ? "is-disabled" : ""}
                  />
                  <label className="patient-modal__checkbox patient-modal__checkbox--compact">
                    <input
                      type="checkbox"
                      checked={form.motherUnknown||false}
                      onChange={e=>setForm(s=>({...s,motherUnknown:e.target.checked,motherName:e.target.checked?"Desconhecida":s.motherName==="Desconhecida"?"":s.motherName}))}
                    />
                    Mãe desconhecida
                  </label>
                </div>
              </div>
              {isChildCategory(form.careCategory)&&(
                <label className="field-span-2">Nome do responsável
                  <input value={form.guardianName||""} onChange={e=>setForm(s=>({...s,guardianName:e.target.value}))} placeholder="Nome do responsável legal"/>
                </label>
              )}
              <label>Data de nascimento
                <input type="date" value={form.birthDate} onChange={e=>setForm(s=>({...s,birthDate:e.target.value}))}/>
              </label>
              <label>Sexo biológico
                <select value={form.sex} onChange={e=>setForm(s=>({...s,sex:e.target.value}))}>
                  <option value="">Não informado</option><option value="feminino">Feminino</option><option value="masculino">Masculino</option><option value="intersexo">Intersexo</option>
                </select>
              </label>
              <label>Município de nascimento
                <input value={form.birthCity} onChange={e=>setForm(s=>({...s,birthCity:e.target.value}))}/>
              </label>
              <label>UF de nascimento
                <input value={form.birthState} maxLength={2} onChange={e=>setForm(s=>({...s,birthState:e.target.value.toUpperCase().slice(0,2)}))}/>
              </label>
              <label>Raça / Cor
                <select value={form.raceColor} onChange={e=>setForm(s=>({...s,raceColor:e.target.value}))}>
                  <option value="">Não informado</option><option value="branca">Branca</option><option value="preta">Preta</option><option value="parda">Parda</option><option value="amarela">Amarela</option><option value="indigena">Indígena</option><option value="nao_declarado">Não declarado</option>
                </select>
              </label>
              {!isChildCategory(form.careCategory)&&(
                <label>Estado civil
                  <select value={form.maritalStatus} onChange={e=>setForm(s=>({...s,maritalStatus:e.target.value}))}>
                    <option value="">Não informado</option><option value="solteiro">Solteiro(a)</option><option value="casado">Casado(a)</option><option value="uniao_estavel">União estável</option><option value="divorciado">Divorciado(a)</option><option value="separado">Separado(a)</option><option value="viuvo">Viúvo(a)</option>
                  </select>
                </label>
              )}
              <label>CPF
                <input value={form.cpf} onChange={e=>setForm(s=>({...s,cpf:formatCpf(e.target.value)}))} placeholder="000.000.000-00"/>
              </label>
              <label>CNS
                <input value={form.cns} onChange={e=>setForm(s=>({...s,cns:formatCns(e.target.value)}))} placeholder="000 0000 0000 0000"/>
              </label>
            </div>
          </section>

          <section className="form__section">
            <header className="form__section-header">
              <h3>Contato e endereço</h3>
            </header>
            <div className="field-grid">
              <label>Telefone principal *
                <input value={form.phone} onChange={e=>setForm(s=>({...s,phone:formatPhone(e.target.value)}))}/>
              </label>
              <label>Telefone alternativo
                <input value={form.phoneAlt} onChange={e=>setForm(s=>({...s,phoneAlt:formatPhone(e.target.value)}))}/>
              </label>
              <label>CEP
                <input value={form.zipCode} onBlur={lookupCepAndFillAddress} onChange={e=>setForm(s=>({...s,zipCode:formatCep(e.target.value)}))}/>
              </label>
              <label className="field-span-2">Rua / Logradouro
                <input value={form.address} onChange={e=>setForm(s=>({...s,address:e.target.value}))}/>
              </label>
              <label>Número
                <input value={form.number} onChange={e=>setForm(s=>({...s,number:e.target.value}))}/>
              </label>
              <label>Complemento
                <input value={form.complement} onChange={e=>setForm(s=>({...s,complement:e.target.value}))}/>
              </label>
              <label>Bairro
                <input value={form.neighborhood} onChange={e=>setForm(s=>({...s,neighborhood:e.target.value}))}/>
              </label>
              <label>Cidade
                <input value={form.city} onChange={e=>setForm(s=>({...s,city:e.target.value}))}/>
              </label>
              <label>Estado (UF)
                <input value={form.state} maxLength={2} onChange={e=>setForm(s=>({...s,state:e.target.value.toUpperCase().slice(0,2)}))}/>
              </label>
            </div>
          </section>

          {String(form.careCategory||"").toLowerCase()==="pregnant"&&(
            <section className="form__section">
              <header className="form__section-header">
                <h3>Dados gestacionais</h3>
              </header>
              <div className="field-grid">
                <label>DUM<input type="date" value={form.pregnancyStartDate} onChange={e=>setForm(s=>({...s,pregnancyStartDate:e.target.value}))}/></label>
                <label>DPP<input type="date" value={form.expectedDeliveryDate} onChange={e=>setForm(s=>({...s,expectedDeliveryDate:e.target.value}))}/></label>
                <label>IG DUM — Semanas<input type="number" min="0" max="45" value={form.gestationalAgeDumWeeks} onChange={e=>setForm(s=>({...s,gestationalAgeDumWeeks:e.target.value}))}/></label>
                <label>IG DUM — Dias<input type="number" min="0" max="6" value={form.gestationalAgeDumDays} onChange={e=>setForm(s=>({...s,gestationalAgeDumDays:e.target.value}))}/></label>
                <label>Data 1ª USG<input type="date" value={form.usgDate1} onChange={e=>setForm(s=>({...s,usgDate1:e.target.value}))}/></label>
                <label>IG USG — Semanas<input type="number" min="0" max="45" value={form.gestationalAgeUsgWeeks} onChange={e=>setForm(s=>({...s,gestationalAgeUsgWeeks:e.target.value}))}/></label>
                <label>IG USG — Dias<input type="number" min="0" max="6" value={form.gestationalAgeUsgDays} onChange={e=>setForm(s=>({...s,gestationalAgeUsgDays:e.target.value}))}/></label>
                <label>Data 2ª USG<input type="date" value={form.usgDate2} onChange={e=>setForm(s=>({...s,usgDate2:e.target.value}))}/></label>
                <label>Data 3ª USG<input type="date" value={form.usgDate3} onChange={e=>setForm(s=>({...s,usgDate3:e.target.value}))}/></label>
              </div>
            </section>
          )}

          <section className="form__section">
            <header className="form__section-header">
              <h3>Dados clínicos e territoriais</h3>
            </header>
            <div className="field-grid">
              <label className="field-span-2">Alergias conhecidas<textarea value={form.allergies} onChange={e=>setForm(s=>({...s,allergies:e.target.value}))}/></label>
              <label className="field-span-2">Comorbidades<textarea value={form.comorbidities} onChange={e=>setForm(s=>({...s,comorbidities:e.target.value}))}/></label>
              <label className="field-span-2">Medicamentos em uso contínuo<textarea value={form.medications} onChange={e=>setForm(s=>({...s,medications:e.target.value}))}/></label>
              <label>Microárea<input value={form.microArea||""} onChange={e=>setForm(s=>({...s,microArea:e.target.value}))}/></label>
              <label>Código de família<input value={form.familyCode||""} onChange={e=>setForm(s=>({...s,familyCode:e.target.value}))}/></label>
              <label>Frequência de visita ACS<input value={form.homeVisitFreq||""} onChange={e=>setForm(s=>({...s,homeVisitFreq:e.target.value}))}/></label>
              <label>Tipo de moradia<select value={form.housingType||""} onChange={e=>setForm(s=>({...s,housingType:e.target.value}))}><option value="">Não informado</option>{["Alvenaria","Madeira","Taipa","Improvisada","Outro"].map(o=><option key={o} value={o}>{o}</option>)}</select></label>
              <label>Abastecimento de água<select value={form.waterSupply||""} onChange={e=>setForm(s=>({...s,waterSupply:e.target.value}))}><option value="">Não informado</option>{["Rede pública","Poço/nascente","Outros"].map(o=><option key={o} value={o}>{o}</option>)}</select></label>
              <label>Esgotamento sanitário<select value={form.sewage||""} onChange={e=>setForm(s=>({...s,sewage:e.target.value}))}><option value="">Não informado</option>{["Rede pública","Fossa séptica","Fossa rudimentar","Céu aberto","Outro"].map(o=><option key={o} value={o}>{o}</option>)}</select></label>
              <label>Destino do lixo<select value={form.garbage||""} onChange={e=>setForm(s=>({...s,garbage:e.target.value}))}><option value="">Não informado</option>{["Coletado","Queimado","Enterrado","Céu aberto","Outro"].map(o=><option key={o} value={o}>{o}</option>)}</select></label>
              <label>Energia elétrica<select value={form.electricity||""} onChange={e=>setForm(s=>({...s,electricity:e.target.value}))}><option value="">Não informado</option>{["Sim","Não","Irregular"].map(o=><option key={o} value={o}>{o}</option>)}</select></label>
            </div>
          </section>

          {error&&<p className="error">{error}</p>}
          <div className="modal__footer">
            <Button type="button" variant="secondary" onClick={() => onClose()}>Cancelar</Button>
            <Button type="submit" variant="primary" disabled={busy}>{busy?"Salvando...":"Salvar paciente"}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default PatientModal;
